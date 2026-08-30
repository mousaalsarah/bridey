"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Brand, Button, Field, LangToggle, inputClass } from "@/components/ui";
import { useLang } from "@/lib/language";
import { addDaysISO, cn, formatDate, kindLabel, minutesToTime, todayISO, weekdayOf } from "@/lib/utils";

type Service = {
  id: string;
  nameAr: string;
  nameEn: string;
  kind: string;
  durationMin: number;
  priceLyd: number;
};

export function BookFlow({
  slug,
  artistName,
  services,
  openDays,
  blocked,
  horizonDays = 21,
}: {
  slug: string;
  artistName: string;
  services: Service[];
  openDays: number[];
  blocked: string[];
  horizonDays?: number;
}) {
  const { t, lang } = useLang();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(services[0] ? [services[0].id] : []);
  const [date, setDate] = useState("");
  const [startMin, setStartMin] = useState<number | null>(null);
  const [slots, setSlots] = useState<number[]>([]);
  const [heldSlots, setHeldSlots] = useState<number[]>([]);
  const [brideName, setBrideName] = useState("");
  const [bridePhone, setBridePhone] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const submitting = useRef(false);
  const requestId = useRef(crypto.randomUUID());

  const picked = services.filter((s) => selected.includes(s.id));
  const totalMin = picked.reduce((sum, s) => sum + s.durationMin, 0);
  const totalPrice = picked.reduce((sum, s) => sum + s.priceLyd, 0);
  const endMin = startMin == null ? null : startMin + totalMin;

  const days = useMemo(() => {
    const start = todayISO();
    return Array.from({ length: horizonDays }, (_, i) => addDaysISO(start, i)).filter((d) => {
      if (blocked.includes(d)) return false;
      return openDays.includes(weekdayOf(d));
    });
  }, [blocked, horizonDays, openDays]);

  useEffect(() => {
    if (!date || selected.length === 0) {
      setSlots([]);
      setHeldSlots([]);
      return;
    }
    let cancelled = false;
    async function load(initial: boolean) {
      if (initial) setSlotsLoading(true);
      const qs = selected.map((id) => `serviceId=${encodeURIComponent(id)}`).join("&");
      try {
        const d = await fetch(`/api/public/slots?slug=${slug}&date=${date}&${qs}`).then((r) => r.json());
        if (cancelled) return;
        const nextSlots: number[] = d.slots || [];
        setSlots(nextSlots);
        setHeldSlots(d.held || []);
        if (initial) setStartMin(null);
        else setStartMin((current) => (current == null || nextSlots.includes(current) ? current : null));
      } catch {
        if (!cancelled) setError(t.networkError);
      } finally {
        if (!cancelled && initial) setSlotsLoading(false);
      }
    }
    load(true);
    const id = window.setInterval(() => load(false), 20000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [date, selected, slug, t.networkError]);

  function toggleService(id: string) {
    setSelected((current) => {
      if (current.includes(id)) {
        return current.length === 1 ? current : current.filter((item) => item !== id);
      }
      return [...current, id];
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!date || startMin == null || selected.length === 0 || submitting.current) return;
    submitting.current = true;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/public/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          serviceIds: selected,
          date,
          startMin,
          brideName,
          bridePhone,
          notes,
          requestId: requestId.current,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data.error === "PHONE"
            ? t.invalidPhone
            : data.error === "UNAVAILABLE"
              ? t.slotTaken
              : data.error === "ARTIST_UNAVAILABLE"
                ? t.artistUnavailable
                : t.required,
        );
        if (data.error === "UNAVAILABLE") {
          requestId.current = crypto.randomUUID();
          setStartMin(null);
          const qs = selected.map((id) => `serviceId=${encodeURIComponent(id)}`).join("&");
          const fresh = await fetch(`/api/public/slots?slug=${slug}&date=${date}&${qs}`).then((r) => r.json());
          setSlots(fresh.slots || []);
          setHeldSlots(fresh.held || []);
        }
        return;
      }
      router.push(`/a/${slug}/book/done?code=${encodeURIComponent(data.trackCode)}`);
    } catch {
      setError(t.networkError);
    } finally {
      submitting.current = false;
      setLoading(false);
    }
  }

  return (
    <div className="bridal-bg min-h-screen">
      <header className="mx-auto flex max-w-xl items-center justify-between px-5 py-5">
        <Brand href={`/a/${slug}`} />
        <div className="flex items-center gap-2">
          <Button href="/track" variant="ghost" className="px-3 py-1 text-xs">
            {t.trackBooking}
          </Button>
          <LangToggle />
        </div>
      </header>
      <main className="mx-auto max-w-xl px-5 pb-20">
        <p className="text-xs tracking-[0.25em] text-gold uppercase">{artistName}</p>
        <h1 className="mt-1 font-display text-4xl">{t.bookAppointment}</h1>

        <form onSubmit={submit} className="mt-8 space-y-8">
          <section>
            <h2 className="font-display text-2xl">{t.chooseServices}</h2>
            <p className="mt-1 text-sm text-espresso/55">
              {selected.length} {t.selectedCount}
              {totalMin ? ` · ${t.durationHint} ${totalMin} ${t.minutes}` : ""}
            </p>
            <div className="mt-3 grid gap-2">
              {services.map((s) => {
                const on = selected.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleService(s.id)}
                    className={cn(
                      "flex items-center justify-between rounded-3xl border p-4 text-start",
                      on ? "border-gold bg-rose/60" : "border-champagne/30 bg-white/70",
                    )}
                  >
                    <div>
                      <p className="text-xs text-gold">{kindLabel(s.kind, lang)}</p>
                      <p className="font-medium">{lang === "ar" ? s.nameAr : s.nameEn}</p>
                      <p className="text-sm text-espresso/55">
                        {s.durationMin} {t.minutes}
                      </p>
                    </div>
                    <div className="text-end">
                      <p className="font-display text-xl">
                        {s.priceLyd} {t.lyd}
                      </p>
                      <p className="mt-1 text-xs text-espresso/50">{on ? "✓" : "+"}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="font-display text-2xl">{t.chooseDay}</h2>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              {days.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDate(d)}
                  className={cn(
                    "min-w-28 rounded-2xl border px-3 py-3 text-sm",
                    date === d ? "border-gold bg-espresso text-ivory" : "border-champagne/30 bg-white/70",
                  )}
                >
                  {formatDate(d, lang)}
                </button>
              ))}
            </div>
          </section>

          {date ? (
            <section>
              <h2 className="font-display text-2xl">{t.chooseTime}</h2>
              <p className="mt-1 text-sm text-espresso/55">
                {t.durationHint} {totalMin} {t.minutes}
              </p>
              {slotsLoading ? (
                <p className="mt-3 text-espresso/45">{lang === "ar" ? "لحظات…" : "Loading…"}</p>
              ) : slots.length === 0 && heldSlots.length === 0 ? (
                <p className="mt-3 text-espresso/55">{t.noSlots}</p>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {slots.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setStartMin(m)}
                      className={cn(
                        "rounded-full border px-4 py-2 text-sm",
                        startMin === m ? "border-gold bg-gold" : "border-champagne/40 bg-white",
                      )}
                    >
                      {minutesToTime(m, lang)}
                    </button>
                  ))}
                  {heldSlots.map((m) => (
                    <button
                      key={`held-${m}`}
                      type="button"
                      disabled
                      title={t.holdHint}
                      className="rounded-full border border-champagne/40 bg-rose/70 px-4 py-2 text-sm text-espresso/55"
                    >
                      {minutesToTime(m, lang)} · {t.slotHeld}
                    </button>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="font-display text-2xl">{t.yourDetails}</h2>
            <Field label={t.brideName}>
              <input className={inputClass()} value={brideName} onChange={(e) => setBrideName(e.target.value)} required />
            </Field>
            <Field label={t.phone}>
              <input className={inputClass()} dir="ltr" value={bridePhone} onChange={(e) => setBridePhone(e.target.value)} placeholder="091xxxxxxx" required />
            </Field>
            <Field label={t.notes}>
              <textarea className={inputClass("min-h-20")} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </section>

          {picked.length > 0 && date && startMin != null && endMin != null ? (
            <section className="rounded-[1.6rem] border border-champagne/40 bg-white/80 p-5">
              <h2 className="font-display text-2xl">{t.reviewBooking}</h2>
              <p className="mt-3 text-sm text-espresso/55">{lang === "ar" ? "الخبيرة" : "Artist"}</p>
              <p className="font-medium">{artistName}</p>
              <ul className="mt-3 space-y-1 text-sm">
                {picked.map((s) => (
                  <li key={s.id} className="flex justify-between">
                    <span>{lang === "ar" ? s.nameAr : s.nameEn}</span>
                    <span>
                      {s.priceLyd} {t.lyd}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm">
                {formatDate(date, lang)} · {minutesToTime(startMin, lang)} {t.endTime} {minutesToTime(endMin, lang)}
              </p>
              <p className="mt-2 text-sm text-espresso/60">
                {t.durationHint} {totalMin} {t.minutes}
              </p>
              <p className="mt-3 font-display text-2xl">
                {t.total}: {totalPrice} {t.lyd}
              </p>
            </section>
          ) : null}

          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <Button type="submit" variant="gold" className="w-full" disabled={loading || !date || startMin == null || selected.length === 0}>
            {t.sendRequest}
          </Button>
        </form>
      </main>
    </div>
  );
}
