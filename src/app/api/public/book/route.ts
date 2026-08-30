import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SlotTakenError,
  bookingTxOptions,
  createGuardedBooking,
  expireOverdue,
  holdExpiresAt,
  isUniqueConstraint,
  nowMinutesTripoli,
  uniqueTrackCode,
} from "@/lib/booking";
import { FeeError } from "@/lib/fees";
import { db } from "@/lib/db";
import { generateSlots } from "@/lib/slots";
import { addDaysISO, isLibyaPhone, normalizePhone, todayISO } from "@/lib/utils";

const schema = z.object({
  slug: z.string(),
  serviceIds: z.array(z.string()).min(1).max(8),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMin: z.number().int().min(0).max(24 * 60 - 1),
  brideName: z.string().min(2).max(80),
  bridePhone: z.string().min(8).max(20),
  notes: z.string().max(500).optional().default(""),
  requestId: z.string().uuid().optional(),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  const phone = normalizePhone(parsed.data.bridePhone);
  if (!isLibyaPhone(phone)) return NextResponse.json({ error: "PHONE" }, { status: 400 });

  if (parsed.data.requestId) {
    const existing = await db.booking.findUnique({
      where: { requestId: parsed.data.requestId },
      select: { id: true, trackCode: true, origin: true },
    });
    if (existing?.origin === "public") {
      return NextResponse.json({ id: existing.id, trackCode: existing.trackCode });
    }
  }

  const uniqueIds = [...new Set(parsed.data.serviceIds)];
  const artist = await db.artist.findUnique({
    where: { slug: parsed.data.slug },
    include: {
      hours: true,
      blocked: true,
      services: { where: { id: { in: uniqueIds }, active: true } },
    },
  });
  if (!artist || !artist.onboardingComplete || artist.services.length !== uniqueIds.length) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const lastDay = addDaysISO(todayISO(), artist.bookingHorizonDays - 1);
  if (parsed.data.date < todayISO() || parsed.data.date > lastDay) {
    return NextResponse.json({ error: "UNAVAILABLE" }, { status: 409 });
  }

  const durationMin = artist.services.reduce((sum, s) => sum + s.durationMin, 0);
  const endMin = parsed.data.startMin + durationMin;
  await expireOverdue(db, artist.id);
  const bookings = await db.booking.findMany({
    where: { artistId: artist.id, date: parsed.data.date },
    select: { startMin: true, endMin: true, status: true, expiresAt: true },
  });
  const minStartMin = parsed.data.date === todayISO() ? nowMinutesTripoli() + artist.minNoticeHours * 60 : 0;
  const slots = generateSlots(
    parsed.data.date,
    durationMin,
    artist.hours,
    bookings,
    artist.blocked.map((b) => b.date),
    minStartMin,
  );
  if (!slots.includes(parsed.data.startMin)) {
    return NextResponse.json({ error: "UNAVAILABLE" }, { status: 409 });
  }

  try {
    const booking = await db.$transaction(async (tx) => {
      const trackCode = await uniqueTrackCode(tx);
      return createGuardedBooking(
        tx,
        {
          artist: { connect: { id: artist.id } },
          service: { connect: { id: artist.services[0].id } },
          trackCode,
          origin: "public",
          source: "bridey",
          brideName: parsed.data.brideName.trim(),
          bridePhone: phone,
          notes: parsed.data.notes,
          date: parsed.data.date,
          startMin: parsed.data.startMin,
          endMin,
          status: "PENDING",
          expiresAt: holdExpiresAt(),
          requestId: parsed.data.requestId,
          items: {
            create: artist.services.map((service) => ({
              serviceId: service.id,
              nameAr: service.nameAr,
              nameEn: service.nameEn,
              durationMin: service.durationMin,
              priceLyd: service.priceLyd,
            })),
          },
        },
        { artistId: artist.id, date: parsed.data.date, startMin: parsed.data.startMin, endMin },
      );
    }, bookingTxOptions);

    return NextResponse.json({ id: booking.id, trackCode: booking.trackCode });
  } catch (error) {
    if (parsed.data.requestId && isUniqueConstraint(error, "requestId")) {
      const existing = await db.booking.findUnique({
        where: { requestId: parsed.data.requestId },
        select: { id: true, trackCode: true },
      });
      if (existing) return NextResponse.json({ id: existing.id, trackCode: existing.trackCode });
    }
    if (error instanceof SlotTakenError || isUniqueConstraint(error)) {
      return NextResponse.json({ error: "UNAVAILABLE" }, { status: 409 });
    }
    if (error instanceof FeeError) {
      return NextResponse.json({ error: "ARTIST_UNAVAILABLE" }, { status: 403 });
    }
    throw error;
  }
}
