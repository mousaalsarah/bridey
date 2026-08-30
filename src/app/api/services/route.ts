import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentArtist } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({
  nameAr: z.string().min(2),
  nameEn: z.string().optional().default(""),
  description: z.string().optional().default(""),
  kind: z.string().optional().default("other"),
  durationMin: z.number().min(30).max(480),
  priceLyd: z.number().min(1),
});

export async function POST(req: Request) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  const service = await db.service.create({
    data: {
      artistId: artist.id,
      nameAr: parsed.data.nameAr,
      nameEn: parsed.data.nameEn || parsed.data.nameAr,
      description: parsed.data.description,
      kind: parsed.data.kind,
      durationMin: parsed.data.durationMin,
      priceLyd: parsed.data.priceLyd,
    },
  });
  return NextResponse.json(service);
}
