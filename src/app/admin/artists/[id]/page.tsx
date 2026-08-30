"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Field, inputClass } from "@/components/ui";

export default function AdminArtistPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<any>(null);
  const [reason, setReason] = useState("");

  async function load() {
    const res = await fetch(`/api/admin/artists/${id}`);
    if (res.ok) setData(await res.json());
  }

  useEffect(() => {
    load();
  }, [id]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    await fetch(`/api/admin/artists/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason, ...extra }),
    });
    setReason("");
    load();
  }

  if (!data) return <p>لحظات…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl">{data.artist.name}</h1>
        <p className="text-sm text-espresso/55">/{data.artist.slug}</p>
      </div>
      <Card>
        <p>
          {data.account.status} · مستحق {data.outstanding} د.ل
        </p>
        <p className="text-sm text-espresso/60">الاستحقاق: {data.account.nextPaymentDueDate}</p>
      </Card>
      <Card className="space-y-3">
        <Field label="سبب التعديل اليدوي">
          <input className={inputClass()} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button variant="gold" onClick={() => act("activate")}>
            تفعيل الحجوزات
          </Button>
          <Button variant="ghost" onClick={() => act("suspend")}>
            إيقاف الحجوزات الجديدة
          </Button>
          <Button variant="ghost" onClick={() => act("extend", { days: 30 })}>
            تمديد ٣٠ يوم
          </Button>
        </div>
      </Card>
      <div>
        <h2 className="font-display text-2xl">الفواتير</h2>
        {data.invoices.map((inv: { id: string; number: string; reference: string; status: string; amountLyd: number }) => (
          <p key={inv.id} className="mt-2 text-sm">
            {inv.number} · {inv.reference} · {inv.amountLyd} د.ل · {inv.status}
          </p>
        ))}
      </div>
    </div>
  );
}
