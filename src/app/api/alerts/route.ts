import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import { expireOverdue } from "@/lib/booking";
import { db } from "@/lib/db";

export async function GET() {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  await expireOverdue(db, artist.id);

  const [pendingBookings, latest] = await Promise.all([
    db.booking.count({ where: { artistId: artist.id, status: "PENDING" } }),
    db.booking.findMany({
      where: { artistId: artist.id, status: "PENDING" },
      select: { id: true, brideName: true, date: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      take: 3,
    }),
  ]);

  return NextResponse.json({ pendingBookings, latest });
}
