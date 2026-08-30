import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const existing = await db.service.findFirst({ where: { id, artistId: artist.id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  const updated = await db.service.update({
    where: { id },
    data: {
      nameAr: typeof body.nameAr === "string" ? body.nameAr : undefined,
      nameEn: typeof body.nameEn === "string" ? body.nameEn : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      kind: typeof body.kind === "string" ? body.kind : undefined,
      durationMin: typeof body.durationMin === "number" ? body.durationMin : undefined,
      priceLyd: typeof body.priceLyd === "number" ? body.priceLyd : undefined,
      active: typeof body.active === "boolean" ? body.active : undefined,
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await ctx.params;
  const existing = await db.service.findFirst({ where: { id, artistId: artist.id } });
  if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  await db.service.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
