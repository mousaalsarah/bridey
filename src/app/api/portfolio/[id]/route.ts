import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await ctx.params;
  await db.portfolioImage.deleteMany({ where: { id, artistId: artist.id } });
  return NextResponse.json({ ok: true });
}
