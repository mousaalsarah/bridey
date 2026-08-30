"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { MANUAL_SOURCES } from "@/lib/constants";
import { useLang } from "@/lib/language";
import { useStudio } from "@/lib/use-studio";
import { todayISO } from "@/lib/utils";

export default function NewAppointmentPage() {
  const { t, lang } = useLang();
  const { data, loading } = useStudio();
  const router = useRouter();
  const [brideName, setBrideName] = useState("");
  const [bridePhone, setBridePhone] = useState("");
  const [date, setDate] = useState(todayISO());
  const [startMin, setStartMin] = useState(10 * 60);
  const [endMin, setEndMin] = useState(12 * 60);
  const [selected, setSelected] = useState<string[]>([]);
  const [source, setSource] = useState("whatsapp");
  const [notes, setNotes] = useState("");
  const [artistNotes, setArtistNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const services = (data?.services || []).filter((s) => s.active);
  const selectedDuration = services.filter((s) => selected.includes(s.id)).reduce((sum, s) => sum + s.durationMin, 0);

  useEffect(() => {
    if (selectedDuration > 0) setEndMin(startMin + selectedDuration);
  }, [selectedDuration, startMin]);

  if (loading || !data) {
    return <p className="text-espresso/50">{lang === "ar" ? "لحظات…" : "Loading…"}</p>;
  }

  if (data.billing && !data.billing.account.canCreateBookings) {
    return (
      <Card>
        <p className="font-display text-2xl">{t.billingPaused}</p>
        <p className="mt-2 text-sm text-espresso/70">{t.billingPausedBody}</p>
        <Button href="/dashboard/earnings" variant="gold" className="mt-4">
          {t.paySubscription}
        </Button>
      </Card>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brideName,
          bridePhone,
          date,
          startMin,
          endMin,
          serviceIds: selected,
          source,
          notes,
          artistNotes,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          body.error === "PHONE"
            ? t.invalidPhone
            : body.error === "UNAVAILABLE"
              ? t.slotTaken
              : body.error === "FEES_PAUSED"
                ? t.billingPausedBody
                : t.required,
        );
        return;
      }
      router.push("/dashboard");
    } catch {
      setError(t.networkError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl">{t.addAppointment}</h1>
        <p className="mt-2 text-sm text-espresso/60">{t.manualFeeHint}</p>
        {selectedDuration ? (
          <p className="mt-1 text-sm text-espresso/50">
            {t.durationHint} {selectedDuration} {t.minutes}
          </p>
        ) : null}
      </div>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label={t.brideName}>
            <input className={inputClass()} value={brideName} onChange={(e) => setBrideName(e.target.value)} required />
          </Field>
          <Field label={t.phone}>
            <input className={inputClass()} dir="ltr" value={bridePhone} onChange={(e) => setBridePhone(e.target.value)} required />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t.chooseDay}>
              <input className={inputClass()} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label={t.chooseTime}>
              <input
                className={inputClass()}
                type="time"
                value={`${String(Math.floor(startMin / 60)).padStart(2, "0")}:${String(startMin % 60).padStart(2, "0")}`}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  setStartMin(h * 60 + m);
                }}
              />
            </Field>
            <Field label={t.endTime}>
              <input
                className={inputClass()}
                type="time"
                value={`${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  setEndMin(h * 60 + m);
                }}
              />
            </Field>
          </div>
          <Field label={t.services}>
            <div className="space-y-2">
              {services.map((s) => (
                <label key={s.id} className="flex items-center justify-between rounded-2xl bg-ivory px-3 py-2 text-sm">
                  <span>
                    <input
                      type="checkbox"
                      className="ms-2"
                      checked={selected.includes(s.id)}
                      onChange={() =>
                        setSelected((cur) => (cur.includes(s.id) ? cur.filter((id) => id !== s.id) : [...cur, s.id]))
                      }
                    />
                    {lang === "ar" ? s.nameAr : s.nameEn}
                  </span>
                  <span>
                    {s.durationMin} {t.minutes}
                  </span>
                </label>
              ))}
            </div>
          </Field>
          <Field label={t.bookingSource}>
            <select className={inputClass()} value={source} onChange={(e) => setSource(e.target.value)}>
              {MANUAL_SOURCES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s[lang]}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-espresso/50">{t.manualSourceHint}</p>
          </Field>
          <Field label={t.notes}>
            <textarea className={inputClass("min-h-16")} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          <Field label={t.artistNotes}>
            <textarea className={inputClass("min-h-16")} value={artistNotes} onChange={(e) => setArtistNotes(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" variant="gold" disabled={busy || selected.length === 0}>
              {t.save}
            </Button>
            <Button href="/dashboard" variant="ghost">
              {t.back}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
