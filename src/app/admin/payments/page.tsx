"use client";

import { useEffect, useState } from "react";
import { Button, Card, inputClass } from "@/components/ui";

type Payment = {
  id: string;
  amountLyd: number;
  method: string;
  reference: string;
  receiptUrl: string;
  submittedAt: string;
  artist: { id: string; name: string };
  invoice: { number: string; reference: string };
};

export default function AdminPaymentsPage() {
  const [rows, setRows] = useState<Payment[]>([]);
  const [reason, setReason] = useState("ما قدرنا نتحقق من الدفعة.");

  async function load() {
    const res = await fetch("/api/admin/payments?status=PENDING");
    if (res.ok) setRows(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function confirm(id: string) {
    await fetch(`/api/admin/payments/${id}/confirm`, { method: "POST" });
    load();
  }

  async function reject(id: string) {
    await fetch(`/api/admin/payments/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    load();
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl">دفعات رسوم تنتظر المراجعة</h1>
      {rows.length === 0 ? <p className="text-espresso/55">ما فيه دفعات معلّقة.</p> : null}
      {rows.map((p) => (
        <Card key={p.id} className="space-y-3">
          <p className="font-display text-2xl">{p.artist.name}</p>
          <p className="text-sm text-espresso/60">
            {p.invoice.number} · {p.amountLyd} د.ل · {p.method}
          </p>
          <p className="font-mono text-sm" dir="ltr">
            {p.reference || p.invoice.reference}
          </p>
          {p.receiptUrl ? (
            <a href={p.receiptUrl} target="_blank" rel="noreferrer" className="text-sm text-blush">
              عرض الإيصال
            </a>
          ) : null}
          <input className={inputClass()} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="gold" onClick={() => confirm(p.id)}>
              تأكيد الدفع
            </Button>
            <Button variant="ghost" onClick={() => reject(p.id)}>
              رفض
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
