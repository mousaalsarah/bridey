"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PassScanner } from "@/components/pass-scanner";
import { Button, Card, EmptyState, Field, PageHeader, Skeleton, inputClass } from "@/components/ui";
import { useLang } from "@/lib/language";
import { useStudio } from "@/lib/use-studio";
import { bookingServiceNames, formatDate } from "@/lib/utils";

export default function ScanPassPage() {
  const { t, lang } = useLang();
  const router = useRouter();
  const { data, loading } = useStudio();
  const [query, setQuery] = useState("");
  const go = useCallback(
    (token: string) => {
      router.push(`/dashboard/pass/${encodeURIComponent(token)}`);
    },
    [router],
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bookings = data?.bookings || [];
    if (!q) {
      return bookings.filter((b) => ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS"].includes(b.status)).slice(0, 8);
    }
    return bookings
      .filter((b) => {
        const blob = `${b.brideName} ${b.trackCode || ""} ${b.date}`.toLowerCase();
        return blob.includes(q);
      })
      .slice(0, 12);
  }, [data?.bookings, query]);

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t.scanPass} body={t.scanCameraHint} />
      <div className="mx-auto max-w-md">
        <PassScanner onToken={go} />
      </div>
      <Card className="space-y-3">
        <Field label={t.searchBooking}>
          <input
            className={inputClass()}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchBookingHint}
          />
        </Field>
        {matches.length ? (
          <div className="space-y-2">
            {matches.map((b) => (
              <button
                key={b.id}
                type="button"
                className="block w-full rounded-xl bg-cream px-4 py-3 text-start transition hover:bg-rose/60"
                onClick={() => router.push(`/dashboard/appointments/${b.id}`)}
              >
                <p className="font-medium">{b.brideName}</p>
                <p className="text-sm text-taupe">
                  {bookingServiceNames(b, lang)} · {formatDate(b.date, lang)}
                  {b.trackCode ? ` · ${b.trackCode}` : ""}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState title={t.emptyBookingsTitle} body={t.searchBookingHint} />
        )}
      </Card>
      <Button href="/dashboard" variant="ghost">
        {t.back}
      </Button>
    </div>
  );
}
