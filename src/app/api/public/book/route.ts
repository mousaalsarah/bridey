import { NextResponse } from "next/server";
import { z } from "zod";
import {
  CapacityFullError,
  NotesContactError,
  PreferredUnavailableError,
  SlotTakenError,
  createBusinessBooking,
  holdExpiresAt,
  isUniqueConstraint,
  uniqueTrackCode,
  runBookingTransaction,
} from "@/lib/booking";
import { notesContainContact } from "@/lib/booking-privacy";
import { FeeError } from "@/lib/fees";
import { db } from "@/lib/db";
import { addDaysISO, isLibyaPhone, normalizePhone, todayISO } from "@/lib/utils";
import { findBusinessBySlug } from "@/lib/workspace";

const schema = z.object({
  slug: z.string(),
  serviceIds: z.array(z.string()).min(1).max(8),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftId: z.string().optional(),
  startMin: z.number().int().min(0).max(24 * 60 - 1).optional(),
  preferredMemberId: z.string().optional(),
  preferredByService: z.record(z.string(), z.string()).optional(),
  brideName: z.string().min(2).max(80),
  bridePhone: z.string().min(8).max(20),
  notes: z.string().max(500).optional().default(""),
  requestId: z.string().uuid().optional(),
});

export const maxDuration = 30;

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  const phone = normalizePhone(parsed.data.bridePhone);
  if (!isLibyaPhone(phone)) return NextResponse.json({ error: "PHONE" }, { status: 400 });
  if (notesContainContact(parsed.data.notes)) {
    return NextResponse.json({ error: "NOTES_CONTACT" }, { status: 400 });
  }

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
  const business = await findBusinessBySlug(parsed.data.slug);
  if (!business || !business.owner.onboardingComplete) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const services = await db.service.findMany({
    where: { businessId: business.id, id: { in: uniqueIds }, active: true },
  });
  if (services.length !== uniqueIds.length) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const lastDay = addDaysISO(todayISO(), business.bookingHorizonDays - 1);
  if (parsed.data.date < todayISO() || parsed.data.date > lastDay) {
    return NextResponse.json({ error: "UNAVAILABLE" }, { status: 409 });
  }

  if (business.scheduleMode === "SHIFT" && !parsed.data.shiftId) {
    const only = business.shifts.filter((row) => row.active);
    if (only.length !== 1) return NextResponse.json({ error: "SHIFT_REQUIRED" }, { status: 400 });
    parsed.data.shiftId = only[0].id;
  }

  try {
    const booking = await runBookingTransaction(async (tx) => {
      const trackCode = await uniqueTrackCode(tx);
      return createBusinessBooking(tx, {
        business,
        services,
        date: parsed.data.date,
        shiftId: parsed.data.shiftId,
        startMin: parsed.data.startMin,
        preferredMemberId: parsed.data.preferredMemberId,
        preferredByService: parsed.data.preferredByService,
        brideName: parsed.data.brideName.trim(),
        bridePhone: phone,
        notes: parsed.data.notes,
        origin: "public",
        source: "bridey",
        status: "PENDING",
        expiresAt: holdExpiresAt(),
        requestId: parsed.data.requestId,
        trackCode,
      });
    });

    return NextResponse.json({ id: booking.id, trackCode: booking.trackCode });
  } catch (error) {
    if (parsed.data.requestId && isUniqueConstraint(error, "requestId")) {
      const existing = await db.booking.findUnique({
        where: { requestId: parsed.data.requestId },
        select: { id: true, trackCode: true },
      });
      if (existing) return NextResponse.json({ id: existing.id, trackCode: existing.trackCode });
    }
    if (error instanceof NotesContactError) {
      return NextResponse.json({ error: "NOTES_CONTACT" }, { status: 400 });
    }
    if (error instanceof PreferredUnavailableError) {
      return NextResponse.json({ error: "PREFERRED_UNAVAILABLE" }, { status: 409 });
    }
    if (error instanceof CapacityFullError || error instanceof SlotTakenError || isUniqueConstraint(error)) {
      return NextResponse.json({ error: "UNAVAILABLE" }, { status: 409 });
    }
    if (error instanceof FeeError) {
      return NextResponse.json({ error: "ARTIST_UNAVAILABLE" }, { status: 403 });
    }
    throw error;
  }
}
