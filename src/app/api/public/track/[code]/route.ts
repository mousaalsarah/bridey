import { NextResponse } from "next/server";
import { expireOverdue, normalizeTrackCode } from "@/lib/booking";
import { db } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ code: string }> }) {
  const { code: raw } = await ctx.params;
  const trackCode = normalizeTrackCode(raw);
  if (trackCode.length < 6) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  await expireOverdue(db);

  const booking = await db.booking.findUnique({
    where: { trackCode },
    include: {
      artist: { select: { name: true, slug: true } },
      items: true,
      service: true,
    },
  });
  if (!booking || booking.origin !== "public") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
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

  return NextResponse.json({
    trackCode: booking.trackCode,
    status: booking.status,
    date: booking.date,
    startMin: booking.startMin,
    endMin: booking.endMin,
    expiresAt: booking.expiresAt,
    artistName: booking.artist.name,
    artistSlug: booking.artist.slug,
    services: services.map((s) => ({
      nameAr: s.nameAr,
      nameEn: s.nameEn,
      durationMin: s.durationMin,
      priceLyd: s.priceLyd,
    })),
  });
}
