import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { date, reason } = await req.json().catch(() => ({}));
  if (typeof date !== "string") return NextResponse.json({ error: "INVALID" }, { status: 400 });

  const row = await db.blockedDate.upsert({
    where: { artistId_date: { artistId: artist.id, date } },
    update: { reason: typeof reason === "string" ? reason : "" },
    create: { artistId: artist.id, date, reason: typeof reason === "string" ? reason : "" },
  });
  return NextResponse.json(row);
}

export async function DELETE(req: Request) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { date } = await req.json().catch(() => ({}));
  if (typeof date !== "string") return NextResponse.json({ error: "INVALID" }, { status: 400 });
  await db.blockedDate.deleteMany({ where: { artistId: artist.id, date } });
  return NextResponse.json({ ok: true });
}
