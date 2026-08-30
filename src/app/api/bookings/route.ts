import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentArtist } from "@/lib/auth";
import { SlotTakenError, bookingTxOptions, createGuardedBooking, isUniqueConstraint } from "@/lib/booking";
import { FeeError } from "@/lib/fees";
import { normalizeBookingSource } from "@/lib/constants";
import { db } from "@/lib/db";
import { isLibyaPhone, normalizePhone } from "@/lib/utils";

const schema = z.object({
  brideName: z.string().min(2).max(80),
  bridePhone: z.string().min(8).max(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startMin: z.number().int().min(0).max(24 * 60 - 1),
  endMin: z.number().int().min(1).max(24 * 60).optional(),
  durationMin: z.number().int().min(15).max(12 * 60).optional(),
  serviceIds: z.array(z.string()).min(1).max(8),
  notes: z.string().max(500).optional().default(""),
  artistNotes: z.string().max(500).optional().default(""),
  source: z.string(),
});

export async function POST(req: Request) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  const source = normalizeBookingSource(parsed.data.source);
  const phone = normalizePhone(parsed.data.bridePhone);
  if (!isLibyaPhone(phone)) return NextResponse.json({ error: "PHONE" }, { status: 400 });

  const uniqueIds = [...new Set(parsed.data.serviceIds)];
  const services = await db.service.findMany({
    where: { artistId: artist.id, id: { in: uniqueIds }, active: true },
  });
  if (services.length !== uniqueIds.length) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const durationMin = parsed.data.durationMin || services.reduce((sum, s) => sum + s.durationMin, 0);
  const endMin = parsed.data.endMin && parsed.data.endMin > parsed.data.startMin ? parsed.data.endMin : parsed.data.startMin + durationMin;
  if (endMin <= parsed.data.startMin) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  try {
    const booking = await db.$transaction(
      (tx) =>
        createGuardedBooking(
          tx,
          {
            artist: { connect: { id: artist.id } },
            service: { connect: { id: services[0].id } },
            origin: "manual",
            source,
            brideName: parsed.data.brideName.trim(),
            bridePhone: phone,
            notes: parsed.data.notes,
            artistNotes: parsed.data.artistNotes,
            date: parsed.data.date,
            startMin: parsed.data.startMin,
            endMin,
            status: "CONFIRMED",
            confirmedAt: new Date(),
            items: {
              create: services.map((service) => ({
                serviceId: service.id,
                nameAr: service.nameAr,
                nameEn: service.nameEn,
                durationMin: service.durationMin,
                priceLyd: service.priceLyd,
              })),
            },
          },
          { artistId: artist.id, date: parsed.data.date, startMin: parsed.data.startMin, endMin },
        ),
      bookingTxOptions,
    );
    return NextResponse.json(booking);
  } catch (error) {
    if (error instanceof SlotTakenError || isUniqueConstraint(error)) {
      return NextResponse.json({ error: "UNAVAILABLE" }, { status: 409 });
    }
    if (error instanceof FeeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
