"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Brand, Button, Card, LangToggle } from "@/components/ui";
import { useLang } from "@/lib/language";

function DoneCard() {
  const { t } = useLang();
  const params = useParams<{ slug: string }>();
  const search = useSearchParams();
  const code = (search.get("code") || "").toUpperCase();

  return (
    <Card className="p-8 text-center">
      <h1 className="font-display text-4xl">{t.bookingSent}</h1>
      <p className="mt-3 text-sm text-espresso/70">{t.bookingSentBody}</p>
      {code ? (
        <p className="mt-5 text-espresso/70">
          {t.bookingNumber}:{" "}
          <span className="font-mono tracking-[0.16em] text-espresso" dir="ltr">
            {code}
          </span>
        </p>
      ) : null}
      <div className="mt-8 space-y-3">
        {code ? (
          <Button href={`/track/${code}`} variant="gold" className="w-full">
            {t.followBooking}
          </Button>
        ) : (
          <Button href="/track" variant="gold" className="w-full">
            {t.followBooking}
          </Button>
        )}
        <Button href={`/a/${params.slug}`} variant="ghost" className="w-full">
          {t.publicProfile}
        </Button>
      </div>
    </Card>
  );
}

export default function DonePage() {
  return (
    <div className="bridal-bg flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-md items-center justify-between px-5 py-5">
        <Brand />
        <LangToggle />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pb-16">
        <Suspense>
          <DoneCard />
        </Suspense>
      </main>
    </div>
  );
}
