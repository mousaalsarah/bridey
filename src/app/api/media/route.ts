import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import { db } from "@/lib/db";
import { savePublicImage } from "@/lib/media";

export async function POST(req: Request) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  const kind = String(form.get("kind") || "portfolio");
  const caption = String(form.get("caption") || "");
  if (!(file instanceof File)) return NextResponse.json({ error: "FILE" }, { status: 400 });

  try {
    const url = await savePublicImage(artist.id, file);
    if (kind === "avatar") {
      const updated = await db.artist.update({ where: { id: artist.id }, data: { avatarUrl: url } });
      return NextResponse.json({ url: updated.avatarUrl, kind });
    }
    if (kind === "cover") {
      const updated = await db.artist.update({ where: { id: artist.id }, data: { coverUrl: url } });
      return NextResponse.json({ url: updated.coverUrl, kind });
    }
    const image = await db.portfolioImage.create({
      data: { artistId: artist.id, url, caption },
    });
    return NextResponse.json(image);
  } catch (error) {
    const code = error instanceof Error ? error.message : "FILE";
    return NextResponse.json({ error: code }, { status: 400 });
  }
}
