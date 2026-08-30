import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import { db } from "@/lib/db";
import { savePublicImage } from "@/lib/media";

export async function POST(req: Request) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const caption = String(form.get("caption") || "");
  if (!(file instanceof File)) return NextResponse.json({ error: "FILE" }, { status: 400 });

  try {
    const url = await savePublicImage(artist.id, file);
    const image = await db.portfolioImage.create({
      data: { artistId: artist.id, url, caption },
    });
    return NextResponse.json(image);
  } catch (error) {
    const code = error instanceof Error ? error.message : "FILE";
    return NextResponse.json({ error: code }, { status: 400 });
  }
}
