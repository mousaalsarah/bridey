import { NextResponse } from "next/server";
import { expireOverdue, normalizeTrackCode, runBookingTransaction } from "@/lib/booking";
import { ensurePassToken, passIsAvailable } from "@/lib/bridey-pass";
import { db } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code: raw } = await ctx.params;
  const trackCode = normalizeTrackCode(raw);
  if (trackCode.length < 6) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  await expireOverdue(db);

  let booking = await db.booking.findUnique({
    where: { trackCode },
    include: {
      artist: { select: { name: true, slug: true } },
      business: { select: { name: true, slug: true } },
      items: true,
      service: true,
      shift: true,
      assignments: { include: { teamMember: { select: { name: true } }, service: { select: { nameAr: true, nameEn: true } } } },
    },
  });
  if (!booking || booking.origin !== "public") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  if (!booking.brideyPassToken && booking.confirmedAt && !["PENDING", "DECLINED", "EXPIRED"].includes(booking.status)) {
    const current = booking;
    await runBookingTransaction((tx) => ensurePassToken(tx, current));
    const fresh = await db.booking.findUnique({
      where: { trackCode },
      include: {
        artist: { select: { name: true, slug: true } },
        business: { select: { name: true, slug: true } },
        items: true,
        service: true,
        shift: true,
        assignments: { include: { teamMember: { select: { name: true } }, service: { select: { nameAr: true, nameEn: true } } } },
      },
    });
    if (fresh) booking = fresh;
  }

  const services = booking.items.length
    ? booking.items
    : [
        {
          nameAr: booking.service.nameAr,
          nameEn: booking.service.nameEn,
          durationMin: booking.service.durationMin,
          priceLyd: booking.service.priceLyd,
        },
      ];

  const passAvailable = passIsAvailable(booking);
  return NextResponse.json({
    trackCode: booking.trackCode,
    status: booking.status,
    date: booking.date,
    startMin: booking.startMin,
    endMin: booking.endMin,
    expiresAt: booking.expiresAt,
    scheduleMode: booking.scheduleMode,
    shift: booking.shift
      ? { nameAr: booking.shift.nameAr, nameEn: booking.shift.nameEn, startMin: booking.shift.startMin, endMin: booking.shift.endMin }
      : null,
    artistName: booking.business?.name || booking.artist.name,
    artistSlug: booking.business?.slug || booking.artist.slug,
    assignments: booking.assignments.map((row) => ({
      serviceAr: row.service.nameAr,
      serviceEn: row.service.nameEn,
      staffName: row.teamMember.name,
    })),
    services: services.map((s) => ({
      nameAr: s.nameAr,
      nameEn: s.nameEn,
      durationMin: s.durationMin,
      priceLyd: s.priceLyd,
    })),
    passAvailable,
    ...(passAvailable
      ? {
          brideName: booking.brideName,
          passToken: booking.brideyPassToken,
        }
      : {}),
  });
}
