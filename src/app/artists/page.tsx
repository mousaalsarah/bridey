"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Brand, Button, LangToggle } from "@/components/ui";
import { useLang } from "@/lib/language";
import { neighborhoodLabel, specialtyLabel } from "@/lib/utils";

type Card = {
  name: string;
  slug: string;
  specialty: string;
  neighborhood: string;
  bio: string;
  cover: string;
  fromPrice: number | null;
};

export default function ArtistsPage() {
  const { t, lang } = useLang();
  const [artists, setArtists] = useState<Card[]>([]);

  useEffect(() => {
    fetch("/api/public/artists")
      .then((r) => r.json())
      .then(setArtists);
  }, []);

  return (
    <div className="bridal-bg min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Brand />
        <div className="flex items-center gap-2">
          <LangToggle />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 pb-16">
        <h1 className="font-display text-4xl">{t.discoverTitle}</h1>
        <p className="mt-2 text-espresso/65">{t.discoverBody}</p>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {artists.map((a) => (
            <Link key={a.slug} href={`/a/${a.slug}`} className="overflow-hidden rounded-[1.8rem] border border-champagne/30 bg-white/70 shadow-soft">
              <div className="aspect-[4/3] bg-rose">
                {a.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.cover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="tile h-full" />
                )}
              </div>
              <div className="p-4">
                <p className="font-display text-2xl">{a.name}</p>
                <p className="text-sm text-espresso/60">
                  {specialtyLabel(a.specialty, lang)} · {neighborhoodLabel(a.neighborhood, lang)}
                </p>
                {a.fromPrice != null ? (
                  <p className="mt-2 text-sm">
                    {t.from} {a.fromPrice} {t.lyd}
                  </p>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
