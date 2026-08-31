import { notFound } from "next/navigation";
import { canCreateNewBookings, refreshFeeAccount } from "@/lib/fees";
import { db } from "@/lib/db";
import { Card } from "@/components/ui";
import { BookFlow } from "./book-flow";
import { findBusinessBySlug } from "@/lib/workspace";

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const business = await findBusinessBySlug(slug);
  if (!business || !business.owner.onboardingComplete) notFound();

  const services = await db.service.findMany({
    where: { businessId: business.id, active: true },
    orderBy: { priceLyd: "asc" },
  });
  if (services.length === 0) notFound();

  const account = await refreshFeeAccount(business.ownerId);
  if (!canCreateNewBookings(account)) {
    return (
      <div className="bridal-bg grid min-h-screen place-items-center px-5">
        <Card className="max-w-md p-8 text-center">
          <h1 className="font-display text-3xl">{business.name}</h1>
          <p className="mt-3 text-espresso/70">هذا المركز ما يستقبل حجوزات جديدة حالياً. جرّبي لاحقاً.</p>
          <p className="mt-2 text-sm text-espresso/50">This business is not taking new bookings right now. Please try later.</p>
        </Card>
      </div>
    );
  }

  return (
    <BookFlow
      slug={business.slug}
      artistName={business.name}
      services={services}
      openDays={business.hours.map((h) => h.dayOfWeek)}
      blocked={business.blocked.map((b) => b.date)}
      horizonDays={business.bookingHorizonDays}
      scheduleMode={business.scheduleMode}
    />
  );
}
