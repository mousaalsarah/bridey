import { notFound } from "next/navigation";
import { canCreateNewBookings, refreshFeeAccount } from "@/lib/fees";
import { db } from "@/lib/db";
import { BookFlow } from "./book-flow";

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const artist = await db.artist.findUnique({
    where: { slug },
    include: {
      services: { where: { active: true }, orderBy: { priceLyd: "asc" } },
      hours: true,
      blocked: true,
    },
  });
  if (!artist || !artist.onboardingComplete || artist.services.length === 0) notFound();

  const account = await refreshFeeAccount(artist.id);
  if (!canCreateNewBookings(account)) {
    return (
      <div className="bridal-bg grid min-h-screen place-items-center px-5">
        <div className="max-w-md rounded-[2rem] border border-champagne/30 bg-white/80 p-8 text-center">
          <h1 className="font-display text-3xl">{artist.name}</h1>
          <p className="mt-3 text-espresso/70">الخبيرة ما تستقبل حجوزات جديدة حالياً. جرّبي لاحقاً.</p>
          <p className="mt-2 text-sm text-espresso/50">This artist is not taking new bookings right now. Please try later.</p>
        </div>
      </div>
    );
  }

  return (
    <BookFlow
      slug={artist.slug}
      artistName={artist.name}
      services={artist.services}
      openDays={artist.hours.map((h) => h.dayOfWeek)}
      blocked={artist.blocked.map((b) => b.date)}
      horizonDays={artist.bookingHorizonDays}
    />
  );
}
