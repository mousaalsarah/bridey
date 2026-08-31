"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AppointmentPanel, type AppointmentView } from "@/components/appointment-panel";
import { Button, Card, PageSkeleton } from "@/components/ui";
import { useLang } from "@/lib/language";

export default function AppointmentPage() {
  const { t } = useLang();
  const params = useParams<{ id: string }>();
  const [data, setData] = useState<AppointmentView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/bookings/${params.id}`);
      if (cancelled) return;
      if (!res.ok) {
        setError(res.status === 403 ? "denied" : "invalid");
        return;
      }
      setData(await res.json());
    }
    load().catch(() => setError("invalid"));
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  return (
    <div className="space-y-4">
      <Button href="/dashboard/scan" variant="ghost">
        {t.back}
      </Button>
      {error ? (
        <Card>
          <p className="font-display text-2xl">{error === "denied" ? t.passDenied : t.passInvalid}</p>
        </Card>
      ) : null}
      {data ? (
        <Card>
          <AppointmentPanel data={data} onUpdate={setData} />
        </Card>
      ) : null}
      {!data && !error ? <PageSkeleton cards={2} /> : null}
    </div>
  );
}
