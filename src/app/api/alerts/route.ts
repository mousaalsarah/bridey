import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import { expireOverdue } from "@/lib/booking";
import { db } from "@/lib/db";
import { bookingScopeWhere, requireWorkspace } from "@/lib/workspace";

export async function GET() {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const workspace = await requireWorkspace(artist);
  await expireOverdue(db, workspace.business.ownerId);

  const where = { ...bookingScopeWhere(workspace), status: "PENDING" };
  const [pendingBookings, latest] = await Promise.all([
    db.booking.count({ where }),
    db.booking.findMany({
      where,
      select: { id: true, brideName: true, date: true },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      take: 3,
    }),
  ]);

  return NextResponse.json({ pendingBookings, latest });
}
