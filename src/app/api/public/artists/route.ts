import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const artists = await db.artist.findMany({
    where: { onboardingComplete: true },
    include: {
      services: { where: { active: true }, take: 1, orderBy: { priceLyd: "asc" } },
      portfolio: { take: 1, orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    artists.map((a) => ({
      name: a.name,
      slug: a.slug,
      specialty: a.specialty,
      neighborhood: a.neighborhood,
      bio: a.bio,
      avatarUrl: a.avatarUrl,
      cover: a.portfolio[0]?.url || "",
      fromPrice: a.services[0]?.priceLyd ?? null,
    })),
  );
}
