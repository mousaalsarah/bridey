import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import { feeSnapshot } from "@/lib/fees";

export async function GET() {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.json(await feeSnapshot(artist.id));
}
