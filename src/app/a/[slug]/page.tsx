import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canCreateNewBookings, refreshFeeAccount } from "@/lib/fees";
import { db } from "@/lib/db";
import { neighborhoodLabel } from "@/lib/utils";
import { findBusinessBySlug } from "@/lib/workspace";
import { ArtistPublic } from "./public-view";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const business = await findBusinessBySlug(slug);
  if (!business) return { title: "Bridey" };
  const area = neighborhoodLabel(business.neighborhood || business.owner.neighborhood, "ar");
  return {
    title: `${business.name}${area ? ` · ${area}` : ""}`,
    description: business.owner.tagline || business.bio || business.owner.bio || `احجزي موعدك مع ${business.name}`,
    openGraph: {
      title: business.name,
      description: business.owner.tagline || business.bio || "احجزي إطلالة فرحك",
    },
  };
}

export default async function ArtistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await findBusinessBySlug(slug);
  if (!business || !business.owner.onboardingComplete) notFound();

  const [services, portfolio, account] = await Promise.all([
    db.service.findMany({ where: { businessId: business.id, active: true }, orderBy: { priceLyd: "asc" } }),
    db.portfolioImage.findMany({ where: { artistId: business.ownerId }, orderBy: { createdAt: "desc" } }),
    refreshFeeAccount(business.ownerId),
  ]);

  const artist = business.owner;
  return (
    <ArtistPublic
      bookingOpen={canCreateNewBookings(account)}
      artist={{
        name: business.name,
        slug: business.slug,
        bio: business.bio || artist.bio,
        tagline: artist.tagline,
        specialty: artist.specialty,
        neighborhood: business.neighborhood || artist.neighborhood,
        snapchat: artist.snapchat,
        instagram: artist.instagram,
        whatsapp: artist.whatsapp,
        avatarUrl: artist.avatarUrl,
        coverUrl: artist.coverUrl,
        pageStyle: artist.pageStyle,
        accent: artist.accent,
        coverLayout: artist.coverLayout,
        ctaLabel: artist.ctaLabel,
        bookingHorizonDays: business.bookingHorizonDays,
        minNoticeHours: business.minNoticeHours,
        showHoursOnPage: artist.showHoursOnPage,
      }}
      services={services}
      portfolio={portfolio}
      hours={business.hours}
      shifts={business.shifts.filter((row) => row.active)}
      scheduleMode={business.scheduleMode}
    />
  );
}
