import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const businesses = await db.business.findMany({
    where: { owner: { onboardingComplete: true } },
    include: {
      owner: true,
      services: { where: { active: true }, take: 1, orderBy: { priceLyd: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  });

  const covers = await db.portfolioImage.findMany({
    where: { artistId: { in: businesses.map((row) => row.ownerId) } },
    orderBy: { createdAt: "desc" },
  });
  const coverByOwner = new Map<string, string>();
  for (const image of covers) {
    if (!coverByOwner.has(image.artistId)) coverByOwner.set(image.artistId, image.url);
  }

  return NextResponse.json(
    businesses.map((row) => ({
      name: row.name,
      slug: row.slug,
      specialty: row.owner.specialty,
      neighborhood: row.neighborhood || row.owner.neighborhood,
      bio: row.bio || row.owner.bio,
      avatarUrl: row.owner.avatarUrl,
      cover: row.owner.coverUrl || coverByOwner.get(row.ownerId) || "",
      fromPrice: row.services[0]?.priceLyd ?? null,
    })),
  );
}
