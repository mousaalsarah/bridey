"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { DAY_LABELS, HOUR_PRESETS } from "@/lib/constants";
import { useLang } from "@/lib/language";
import { useStudio } from "@/lib/use-studio";
import { addDaysISO, todayISO } from "@/lib/utils";

export default function HoursPage() {
  const { t, lang } = useLang();
  const { data, loading, reload } = useStudio();
  const [date, setDate] = useState(todayISO());

  if (loading || !data) {
    return <p className="text-espresso/50">{lang === "ar" ? "لحظات…" : "Loading…"}</p>;
  }

  async function applyPreset(preset: string) {
    await fetch("/api/hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset }),
    });
    reload();
  }

  async function block() {
    await fetch("/api/blocked", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date }),
    });
    reload();
  }

  async function unblock(d: string) {
    await fetch("/api/blocked", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: d }),
    });
    reload();
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl">{t.hours}</h1>
      <div className="grid gap-3">
        {HOUR_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p.id)}
            className="rounded-[1.5rem] border border-champagne/30 bg-white/70 p-4 text-start hover:border-gold"
          >
            <p className="font-medium">{p[lang]}</p>
            <p className="text-sm text-espresso/55">{lang === "ar" ? p.hintAr : p.hintEn}</p>
          </button>
        ))}
      </div>

      <Card>
        <p className="font-display text-xl">{lang === "ar" ? "أيامك الحالية" : "Current week"}</p>
        <ul className="mt-3 space-y-1 text-sm text-espresso/70">
          {DAY_LABELS.map((d, i) => {
            const hour = data.hours.find((h) => h.dayOfWeek === i);
            return (
              <li key={d.en} className="flex justify-between">
                <span>{d[lang]}</span>
                <span>{hour ? `${Math.floor(hour.startMin / 60)}:00 – ${Math.floor(hour.endMin / 60)}:00` : "—"}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <p className="font-display text-xl">{t.blocked}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="date"
            className="rounded-2xl border border-champagne/40 px-3 py-2"
            min={todayISO()}
            max={addDaysISO(todayISO(), 90)}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Button variant="gold" onClick={block}>
            {lang === "ar" ? "أغلقي اليوم" : "Close this day"}
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {data.blocked.map((b) => (
            <button key={b.date} type="button" onClick={() => unblock(b.date)} className="rounded-full bg-rose px-3 py-1 text-sm">
              {b.date} ×
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}
