import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import { db } from "@/lib/db";
import { HOUR_PRESETS } from "@/lib/constants";

export async function PUT(req: Request) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  if (typeof body.preset === "string") {
    const preset = HOUR_PRESETS.find((p) => p.id === body.preset);
    if (!preset) return NextResponse.json({ error: "INVALID" }, { status: 400 });
    await db.weeklyHour.deleteMany({ where: { artistId: artist.id } });
    await db.weeklyHour.createMany({
      data: preset.days.map((dayOfWeek) => ({
        artistId: artist.id,
        dayOfWeek,
        startMin: preset.startMin,
        endMin: preset.endMin,
      })),
    });
    return NextResponse.json({ ok: true });
  }

  if (Array.isArray(body.hours)) {
    await db.weeklyHour.deleteMany({ where: { artistId: artist.id } });
    const rows = body.hours
      .filter((h: { dayOfWeek: number; startMin: number; endMin: number }) => h.endMin > h.startMin)
      .map((h: { dayOfWeek: number; startMin: number; endMin: number }) => ({
        artistId: artist.id,
        dayOfWeek: h.dayOfWeek,
        startMin: h.startMin,
        endMin: h.endMin,
      }));
    if (rows.length) await db.weeklyHour.createMany({ data: rows });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "INVALID" }, { status: 400 });
}
