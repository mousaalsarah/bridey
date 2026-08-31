"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";

const FILTERS = ["", "ACTIVE", "PAYMENT_DUE", "GRACE_PERIOD", "PAYMENT_PENDING", "SUSPENDED"] as const;

type Row = {
  id: string;
  name: string;
  slug: string;
  status: string;
  outstanding: number;
  nextPaymentDueDate: string;
};

export default function AdminArtistsPage() {
  const [status, setStatus] = useState("");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    const q = status ? `?status=${status}` : "";
    fetch(`/api/admin/artists${q}`)
      .then((r) => r.json())
      .then(setRows);
  }, [status]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl">الخبيرات</h1>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((id) => (
          <button
            key={id || "all"}
            type="button"
            onClick={() => setStatus(id)}
            className={`rounded-full px-3 py-1.5 text-sm ${status === id ? "bg-blush text-espresso" : "bg-white text-espresso/70"}`}
          >
            {id || "الكل"}
          </button>
        ))}
      </div>
      {rows.map((row) => (
        <Card key={row.id}>
          <Link href={`/admin/artists/${row.id}`} className="block">
            <p className="font-display text-2xl">{row.name}</p>
            <p className="text-sm text-espresso/55">
              {row.status} · {row.outstanding} د.ل · {row.nextPaymentDueDate}
            </p>
          </Link>
        </Card>
      ))}
    </div>
  );
}
