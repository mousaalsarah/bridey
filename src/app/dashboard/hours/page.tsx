"use client";

import { useState } from "react";
import { Button, Card, Field, PageHeader, PageSkeleton, inputClass } from "@/components/ui";
import { ASSIGNMENT_MODES, DAY_LABELS, HOUR_PRESETS, SCHEDULE_MODES } from "@/lib/constants";
import { useLang } from "@/lib/language";
import { useStudio } from "@/lib/use-studio";
import { addDaysISO, minutesToTime, todayISO } from "@/lib/utils";

export default function HoursPage() {
  const { t, lang } = useLang();
  const { data, loading, reload } = useStudio();
  const [date, setDate] = useState(todayISO());
  const [capacity, setCapacity] = useState<number | null>(null);

  if (loading || !data) {
    return <PageSkeleton cards={4} />;
  }

  async function applyPreset(preset: string) {
    await fetch("/api/hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset }),
    });
    reload();
  }

  async function saveSchedule(patch: Record<string, unknown>) {
    await fetch("/api/hours", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
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

  const daily = capacity ?? data.member?.dailyCapacity ?? 4;

  return (
    <div className="space-y-6">
      <PageHeader title={t.hours} body={t.scheduleHint} />
      <div className="grid gap-3">
        {HOUR_PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => applyPreset(p.id)}
            className="rounded-2xl border border-champagne/30 bg-white p-4 text-start transition hover:border-blush hover:shadow-soft"
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
        <p className="font-display text-xl">{t.bookingStyle}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {SCHEDULE_MODES.filter((mode) => mode.id !== "HOURLY").map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => saveSchedule({ scheduleMode: mode.id })}
              className={`rounded-full px-3 py-1.5 text-sm ${
                data.business?.scheduleMode === mode.id ? "bg-blush text-espresso" : "bg-ivory text-espresso/70"
              }`}
            >
              {mode[lang]}
            </button>
          ))}
        </div>
        <p className="mt-4 text-sm text-espresso/60">{t.assignmentMode}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {ASSIGNMENT_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => saveSchedule({ assignmentMode: mode.id })}
              className={`rounded-full px-3 py-1.5 text-sm ${
                data.business?.assignmentMode === mode.id ? "bg-blush text-espresso" : "bg-ivory text-espresso/70"
              }`}
            >
              {mode[lang]}
            </button>
          ))}
        </div>
        <div className="mt-4">
          <Field label={t.dailyCapacity}>
          <div className="flex gap-2">
            <input
              className={inputClass()}
              type="number"
              min={1}
              max={20}
              value={daily}
              onChange={(e) => setCapacity(Number(e.target.value))}
            />
            <Button variant="gold" onClick={() => saveSchedule({ dailyCapacity: daily })}>
              {t.save}
            </Button>
          </div>
          </Field>
        </div>
      </Card>

      <Card>
        <p className="font-display text-xl">{t.shifts}</p>
        <div className="mt-3 space-y-3">
          {(data.shifts || []).map((shift) => (
            <div key={shift.id} className="rounded-2xl bg-ivory p-3 text-sm">
              <p className="font-medium">{lang === "ar" ? shift.nameAr : shift.nameEn}</p>
              <p className="text-espresso/60">
                {minutesToTime(shift.startMin, lang)} – {minutesToTime(shift.endMin, lang)}
              </p>
              <label className="mt-2 flex items-center gap-2">
                <span>{t.shiftCapacity}</span>
                <input
                  className="w-20 rounded-xl border border-champagne/40 px-2 py-1"
                  type="number"
                  min={1}
                  placeholder="—"
                  defaultValue={shift.capacity ?? ""}
                  onBlur={(e) => {
                    const value = e.target.value === "" ? null : Number(e.target.value);
                    saveSchedule({ shifts: [{ id: shift.id, capacity: value }] });
                  }}
                />
              </label>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <p className="font-display text-xl">{t.blocked}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            type="date"
            className="rounded-xl border border-champagne/40 px-3 py-2"
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
