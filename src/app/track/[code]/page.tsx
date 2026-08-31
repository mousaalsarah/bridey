"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand, Button, Card, LangToggle, Skeleton, StatusBadge } from "@/components/ui";
import { useLang } from "@/lib/language";
import { formatDate, minutesToTime, minutesUntil } from "@/lib/utils";

type TrackData = {
  trackCode: string;
  status: string;
  date: string;
  startMin: number;
  endMin: number;
  expiresAt: string | null;
  artistName: string;
  artistSlug: string;
  scheduleMode?: string;
  shift?: { nameAr: string; nameEn: string; startMin: number; endMin: number } | null;
  assignments?: Array<{ serviceAr: string; serviceEn: string; staffName: string }>;
  services: Array<{ nameAr: string; nameEn: string; durationMin: number; priceLyd: number }>;
  passAvailable?: boolean;
  passToken?: string;
  brideName?: string;
};

const STATUS_KEY = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CHECKED_IN: "checkedIn",
  IN_PROGRESS: "inProgress",
  DECLINED: "declined",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  NO_SHOW: "noShow",
  EXPIRED: "expired",
} as const;

export default function TrackStatusPage() {
  const { t, lang } = useLang();
  const params = useParams<{ code: string }>();
  const [data, setData] = useState<TrackData | null>(null);
  const [missing, setMissing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/public/track/${params.code}`);
      if (cancelled) return;
      if (!res.ok) {
        setMissing(true);
        return;
      }
      setMissing(false);
      setData(await res.json());
    }
    load().catch(() => {
      if (!cancelled) setMissing(true);
    });
    const id = window.setInterval(() => {
      load().catch(() => undefined);
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [params.code]);

  const statusLabel = data ? t[STATUS_KEY[data.status as keyof typeof STATUS_KEY] ?? "pending"] : "";

  return (
    <div className="bridal-bg min-h-screen">
      <header className="mx-auto flex max-w-md items-center justify-between px-5 py-5">
        <Brand />
        <LangToggle />
      </header>
      <main className="mx-auto max-w-md px-5 pb-16">
        <h1 className="font-display text-4xl">{t.trackTitle}</h1>

        {missing ? (
          <Card className="mt-8">
            <p className="text-espresso/70">{t.trackNotFound}</p>
            <Button href="/track" variant="gold" className="mt-5 w-full">
              {t.trackLookup}
            </Button>
          </Card>
        ) : null}

        {data ? (
          <Card className="mt-8 space-y-4">
            <StatusBadge status={data.status} label={statusLabel} />
            <div className="space-y-1 text-espresso/75">
              <p className="font-display text-2xl">{data.artistName}</p>
              <p>
                {formatDate(data.date, lang)}
                {data.shift
                  ? ` · ${lang === "ar" ? data.shift.nameAr : data.shift.nameEn}`
                  : ` · ${minutesToTime(data.startMin, lang)} – ${minutesToTime(data.endMin, lang)}`}
              </p>
              {data.assignments?.length ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {data.assignments.map((row) => (
                    <li key={`${row.serviceAr}-${row.staffName}`}>
                      {lang === "ar" ? row.serviceAr : row.serviceEn} · {row.staffName}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {data.status === "PENDING" ? (
              <p className="text-sm text-espresso/70">
                {t.bookingSentBody}
                {data.expiresAt && minutesUntil(data.expiresAt) > 0
                  ? ` · ${t.responseDeadline}: ${minutesUntil(data.expiresAt)} ${t.minutesRemaining}`
                  : ""}
              </p>
            ) : null}
            {data.status === "CONFIRMED" || data.status === "CHECKED_IN" || data.status === "IN_PROGRESS" || data.status === "COMPLETED" ? (
              <p className="text-sm text-espresso/70">{t.bookingConfirmedBody}</p>
            ) : null}
            {data.status === "DECLINED" ? <p className="text-sm text-espresso/70">{t.bookingDeclinedBody}</p> : null}
            {data.status === "EXPIRED" ? <p className="text-sm text-espresso/70">{t.bookingExpiredBody}</p> : null}
            <ul className="space-y-2">
              {data.services.map((s) => (
                <li key={`${s.nameAr}-${s.priceLyd}`} className="flex justify-between rounded-2xl bg-ivory px-3 py-2 text-sm">
                  <span>{lang === "ar" ? s.nameAr : s.nameEn}</span>
                  <span>
                    {s.priceLyd} {t.lyd}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-espresso/60">{t.savePageHint}</p>
            <p className="text-xs text-espresso/45">
              {t.bookingNumber}:{" "}
              <span className="font-mono tracking-widest" dir="ltr">
                {data.trackCode}
              </span>
            </p>
            {data.passAvailable ? (
              <Button href={`/track/${data.trackCode}/pass`} variant="gold" className="w-full">
                {t.viewPass}
              </Button>
            ) : null}
            <Button
              variant="gold"
              className="w-full"
              onClick={async () => {
                await navigator.clipboard.writeText(window.location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? t.copied : t.copyTrackLink}
            </Button>
            <Button href={`/a/${data.artistSlug}`} variant="ghost" className="w-full">
              {t.publicProfile}
            </Button>
            <p className="text-center text-xs text-espresso/40">{t.poweredBy}</p>
          </Card>
        ) : null}

        {!data && !missing ? (
          <div className="mt-8 space-y-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-12" />
          </div>
        ) : null}
      </main>
    </div>
  );
}
