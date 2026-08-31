"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BrideyPassCard, type PublicPass } from "@/components/bridey-pass-card";
import { Brand, Button, LangToggle } from "@/components/ui";
import { useLang } from "@/lib/language";

type TrackPass = PublicPass & { passAvailable?: boolean; status: string; artistName: string; artistSlug: string };

export default function TrackPassPage() {
  const { t } = useLang();
  const params = useParams<{ code: string }>();
  const [data, setData] = useState<TrackPass | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/public/track/${params.code}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setMissing(true);
          return;
        }
        const body = await res.json();
        if (!body.passAvailable || !body.passToken) {
          setMissing(true);
          setData(body);
          return;
        }
        setData(body);
      })
      .catch(() => setMissing(true));
    return () => {
      cancelled = true;
    };
  }, [params.code]);

  return (
    <div className="bridal-bg min-h-screen">
      <header className="mx-auto flex max-w-md items-center justify-between px-5 py-5">
        <Brand />
        <LangToggle />
      </header>
      <main className="mx-auto max-w-md px-5 pb-16">
        <h1 className="font-display text-4xl">{t.passTitle}</h1>
        {data?.passToken ? (
          <div className="mt-6">
            <BrideyPassCard
              data={{
                brideName: data.brideName,
                artistName: data.artistName,
                trackCode: data.trackCode,
                status: data.status,
                date: data.date,
                startMin: data.startMin,
                endMin: data.endMin,
                shift: data.shift,
                services: data.services,
                passToken: data.passToken,
              }}
            />
          </div>
        ) : (
          <p className="mt-6 text-espresso/70">{missing ? t.passUnavailable : t.loading}</p>
        )}
        <Button href={`/track/${params.code}`} variant="ghost" className="mt-6 w-full">
          {t.back}
        </Button>
      </main>
    </div>
  );
}
