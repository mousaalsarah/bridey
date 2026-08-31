"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppointmentPanel, type AppointmentView } from "@/components/appointment-panel";
import { Button, Card, PageSkeleton } from "@/components/ui";
import { useLang } from "@/lib/language";

export default function DashboardPassPage() {
  const { t } = useLang();
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [data, setData] = useState<AppointmentView | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/pass/${encodeURIComponent(params.token)}`);
      if (cancelled) return;
      if (res.status === 401) {
        router.replace(`/login?next=${encodeURIComponent(`/dashboard/pass/${params.token}`)}`);
        return;
      }
      if (res.status === 403) {
        setError("denied");
        return;
      }
      if (!res.ok) {
        setError("invalid");
        return;
      }
      setData(await res.json());
    }
    load().catch(() => setError("invalid"));
    return () => {
      cancelled = true;
    };
  }, [params.token, router]);

  return (
    <div className="space-y-4">
      <Button href="/dashboard/scan" variant="ghost">
        {t.back}
      </Button>
      {error === "denied" ? (
        <Card>
          <p className="font-display text-2xl">{t.passDenied}</p>
        </Card>
      ) : null}
      {error === "invalid" ? (
        <Card>
          <p className="font-display text-2xl">{t.passInvalid}</p>
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
