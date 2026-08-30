import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canCreateNewBookings, refreshFeeAccount } from "@/lib/fees";
import { db } from "@/lib/db";
import { neighborhoodLabel } from "@/lib/utils";
import { ArtistPublic } from "./public-view";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const artist = await db.artist.findUnique({ where: { slug } });
  if (!artist) return { title: "Bridey" };
  const area = neighborhoodLabel(artist.neighborhood, "ar");
  return {
    title: `${artist.name}${area ? ` · ${area}` : ""}`,
    description: artist.tagline || artist.bio || `احجزي موعدك مع ${artist.name}`,
    openGraph: {
      title: artist.name,
      description: artist.tagline || artist.bio || "احجزي إطلالة فرحك",
    },
  };
}

export default async function ArtistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const artist = await db.artist.findUnique({
    where: { slug },
    include: {
      services: { where: { active: true }, orderBy: { priceLyd: "asc" } },
      portfolio: { orderBy: { createdAt: "desc" } },
      hours: true,
    },
  });
  if (!artist || !artist.onboardingComplete) notFound();

  const account = await refreshFeeAccount(artist.id);

  return (
    <ArtistPublic
      bookingOpen={canCreateNewBookings(account)}
      artist={{
        name: artist.name,
        slug: artist.slug,
        bio: artist.bio,
        tagline: artist.tagline,
        specialty: artist.specialty,
        neighborhood: artist.neighborhood,
        snapchat: artist.snapchat,
        instagram: artist.instagram,
        whatsapp: artist.whatsapp,
        avatarUrl: artist.avatarUrl,
        coverUrl: artist.coverUrl,
        pageStyle: artist.pageStyle,
        accent: artist.accent,
        coverLayout: artist.coverLayout,
        ctaLabel: artist.ctaLabel,
        bookingHorizonDays: artist.bookingHorizonDays,
        minNoticeHours: artist.minNoticeHours,
        showHoursOnPage: artist.showHoursOnPage,
      }}
      services={artist.services}
      portfolio={artist.portfolio}
      hours={artist.hours}
    />
  );
}
