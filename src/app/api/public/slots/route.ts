import { NextResponse } from "next/server";
import { expireOverdue, nowMinutesTripoli } from "@/lib/booking";
import { db } from "@/lib/db";
import { generateSlotStates } from "@/lib/slots";
import { todayISO } from "@/lib/utils";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  const date = url.searchParams.get("date");
  const ids = [
    ...new Set([
      ...url.searchParams.getAll("serviceId"),
      ...(url.searchParams.get("serviceIds") || "").split(","),
    ]),
  ]
    .map((id) => id.trim())
    .filter(Boolean);

  if (!slug || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || ids.length === 0) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const artist = await db.artist.findUnique({
    where: { slug },
    include: {
      hours: true,
      blocked: true,
      services: { where: { id: { in: ids }, active: true } },
    },
  });
  if (!artist || artist.services.length !== ids.length) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  await expireOverdue(db, artist.id);

  const durationMin = artist.services.reduce((sum, s) => sum + s.durationMin, 0);
  const bookings = await db.booking.findMany({
    where: { artistId: artist.id, date },
    select: { startMin: true, endMin: true, status: true, expiresAt: true },
  });

  const minStartMin = date === todayISO() ? nowMinutesTripoli() + artist.minNoticeHours * 60 : 0;
  const { available, held } = generateSlotStates(
    date,
    durationMin,
    artist.hours,
    bookings,
    artist.blocked.map((b) => b.date),
    minStartMin,
  );

  return NextResponse.json({ slots: available, held, durationMin });
}
