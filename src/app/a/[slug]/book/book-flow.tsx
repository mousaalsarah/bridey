"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Brand, Button, Card, Field, LangToggle, inputClass, selectTileClass } from "@/components/ui";
import { useLang } from "@/lib/language";
import { notesContainContact } from "@/lib/booking-privacy";
import { addDaysISO, cn, formatDate, kindLabel, minutesToTime, todayISO, weekdayOf } from "@/lib/utils";

type DateReason = "OK" | "CLOSED" | "BLOCKED" | "HORIZON" | "FULL";

function parseDateReason(data: { reason?: string; available?: boolean }): DateReason {
  if (data.reason === "CLOSED" || data.reason === "BLOCKED" || data.reason === "HORIZON" || data.reason === "FULL") {
    return data.reason;
  }
  if (data.reason === "OK" || data.available) return "OK";
  return "FULL";
}

type Service = {
  id: string;
  nameAr: string;
  nameEn: string;
  kind: string;
  durationMin: number;
  priceLyd: number;
};

type ShiftOption = {
  id: string;
  nameAr: string;
  nameEn: string;
  startMin: number;
  endMin: number;
  remaining: number;
};

type StaffOption = {
  id: string;
  name: string;
  remaining: number;
  serviceIds: string[];
};

export function BookFlow({
  slug,
  artistName,
  services,
  openDays,
  blocked,
  horizonDays = 21,
  scheduleMode = "SHIFT",
}: {
  slug: string;
  artistName: string;
  services: Service[];
  openDays: number[];
  blocked: string[];
  horizonDays?: number;
  scheduleMode?: string;
}) {
  const { t, lang } = useLang();
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(services[0] ? [services[0].id] : []);
  const [date, setDate] = useState("");
  const [shiftId, setShiftId] = useState<string | null>(null);
  const [preferredByService, setPreferredByService] = useState<Record<string, string>>({});
  const [remainingDay, setRemainingDay] = useState<number | null>(null);
  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [mode, setMode] = useState(scheduleMode);
  const [dateReason, setDateReason] = useState<DateReason | "">("");
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
  const staffFor = (serviceId: string) => staff.filter((row) => row.serviceIds.includes(serviceId));
  const chosenPrefs = Object.fromEntries(
    Object.entries(preferredByService).filter(([id, memberId]) => selected.includes(id) && memberId),
  );
  const showStaff =
    staff.length > 1 && (picked.length > 1 || picked.some((s) => staffFor(s.id).length > 1));
  const chosenShift = shifts.find((row) => row.id === shiftId) || null;
  const dateAvailable = dateReason === "OK";
  const notesHaveContact = notesContainContact(notes);
  const slotReady =
    Boolean(date) &&
    selected.length > 0 &&
    dateAvailable &&
    (mode === "DAY" ? (remainingDay || 0) > 0 : Boolean(shiftId) && (chosenShift?.remaining || 0) > 0);
  const canSubmit = slotReady && !notesHaveContact;

  const minDate = todayISO();
  const maxDate = addDaysISO(minDate, Math.max(1, horizonDays) - 1);

  useEffect(() => {
    if (!date || selected.length === 0) {
      setShifts([]);
      setStaff([]);
      setRemainingDay(null);
      setDateReason("");
      return;
    }
    if (blocked.includes(date)) setDateReason("BLOCKED");
    else if (!openDays.includes(weekdayOf(date))) setDateReason("CLOSED");
    else if (date < minDate || date > maxDate) setDateReason("HORIZON");

    let cancelled = false;
    async function load(initial: boolean) {
      if (initial) setSlotsLoading(true);
      const qs = selected.map((id) => `serviceId=${encodeURIComponent(id)}`).join("&");
      try {
        const res = await fetch(`/api/public/availability?slug=${slug}&date=${date}&${qs}`);
        const d = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setDateReason("");
          setError(t.networkError);
          return;
        }
        setMode(d.mode || scheduleMode);
        setShifts(d.shifts || []);
        setStaff(d.staff || []);
        setRemainingDay(typeof d.remainingDay === "number" ? d.remainingDay : null);
        setDateReason(parseDateReason(d));
        if (initial) {
          setShiftId(null);
          const auto: Record<string, string> = {};
          for (const serviceId of selected) {
            const options = ((d.staff || []) as StaffOption[]).filter((row) => row.serviceIds.includes(serviceId));
            if (options.length === 1 && options[0].remaining > 0) auto[serviceId] = options[0].id;
          }
          setPreferredByService(auto);
        } else {
          setShiftId((current) => {
            if (!current) return current;
            const next = (d.shifts || []).find((row: ShiftOption) => row.id === current);
            return next && next.remaining > 0 ? current : null;
          });
          setPreferredByService((current) => {
            const next: Record<string, string> = {};
            for (const [serviceId, memberId] of Object.entries(current)) {
              const person = (d.staff || []).find((row: StaffOption) => row.id === memberId);
              if (person && person.serviceIds.includes(serviceId) && (person.remaining > 0 || Object.values(current).includes(memberId))) {
                next[serviceId] = memberId;
              }
            }
            return next;
          });
        }
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
  }, [date, selected, slug, t.networkError, scheduleMode, blocked, openDays, minDate, maxDate]);

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
    if (!canSubmit || submitting.current) return;
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
          shiftId: mode === "SHIFT" ? shiftId : undefined,
          preferredByService: Object.keys(chosenPrefs).length ? chosenPrefs : undefined,
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
            : data.error === "PREFERRED_UNAVAILABLE"
              ? t.preferredUnavailable
              : data.error === "UNAVAILABLE"
                ? t.slotTaken
            : data.error === "ARTIST_UNAVAILABLE"
              ? t.artistUnavailable
              : data.error === "NOTES_CONTACT"
                ? t.notesNoPhone
                : t.required,
        );
        if (data.error === "UNAVAILABLE" || data.error === "PREFERRED_UNAVAILABLE") {
          requestId.current = crypto.randomUUID();
          setShiftId(null);
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
        <p className="text-xs font-medium tracking-[0.25em] text-blush uppercase">{artistName}</p>
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
                    className={cn("flex items-center justify-between", selectTileClass(on))}
                  >
                    <div>
                      <p className="text-xs text-blush">{kindLabel(s.kind, lang)}</p>
                      <p className="font-medium">{lang === "ar" ? s.nameAr : s.nameEn}</p>
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
            <p className="mt-1 text-sm text-espresso/55">{t.pickDateHint}</p>
            <input
              type="date"
              dir="ltr"
              className={inputClass("mt-3")}
              min={minDate}
              max={maxDate}
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setShiftId(null);
                setPreferredByService({});
                setDateReason("");
                setError("");
              }}
              required
            />
            {date && slotsLoading ? <p className="mt-3 text-sm text-espresso/70">{t.checkingDate}</p> : null}
            {date && !slotsLoading && dateReason && dateReason !== "OK" ? (
              <p className="mt-3 text-sm text-error">
                {dateReason === "CLOSED"
                  ? t.dateClosed
                  : dateReason === "BLOCKED"
                    ? t.dateBlocked
                    : dateReason === "HORIZON"
                      ? t.dateTooFar
                      : t.dateFull}
              </p>
            ) : null}
            {date && !slotsLoading && dateAvailable ? (
              <p className="mt-3 text-sm text-espresso">
                {formatDate(date, lang)} · {t.dateAvailable}
              </p>
            ) : null}
          </section>

          {date && dateAvailable ? (
            <section>
              <h2 className="font-display text-2xl">{mode === "DAY" ? t.dayCapacity : t.chooseShift}</h2>
              {slotsLoading ? (
                <p className="mt-3 text-taupe">{t.loading}</p>
              ) : mode === "DAY" ? (
                remainingDay && remainingDay > 0 ? (
                  <button
                    type="button"
                    className="mt-3 w-full rounded-2xl border border-blush bg-white p-4 text-start"
                  >
                    <p className="font-medium">{formatDate(date, lang)}</p>
                    <p className="mt-1 text-sm text-espresso/60">
                      {remainingDay} {t.spotsLeft}
                    </p>
                  </button>
                ) : (
                  <p className="mt-3 text-espresso/55">{t.noSlots}</p>
                )
              ) : shifts.length === 0 ? (
                <p className="mt-3 text-espresso/55">{t.noSlots}</p>
              ) : (
                <div className="mt-3 grid gap-2">
                  {shifts.map((shift) => {
                    const full = shift.remaining <= 0;
                    return (
                      <button
                        key={shift.id}
                        type="button"
                        disabled={full}
                        onClick={() => setShiftId(shift.id)}
                        className={selectTileClass(shiftId === shift.id, full)}
                      >
                        <p className="font-medium">{lang === "ar" ? shift.nameAr : shift.nameEn}</p>
                        <p className="mt-1 text-sm opacity-80">
                          {minutesToTime(shift.startMin, lang)} – {minutesToTime(shift.endMin, lang)}
                        </p>
                        <p className="mt-1 text-sm">
                          {full ? t.shiftFull : `${shift.remaining} ${t.spotsLeft}`}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          ) : null}

          {dateAvailable && showStaff && (mode === "DAY" ? (remainingDay || 0) > 0 : Boolean(shiftId)) ? (
            <section>
              <h2 className="font-display text-2xl">{t.preferredStaff}</h2>
              <p className="mt-1 text-sm text-espresso/55">{t.preferredStaffHint}</p>
              <div className="mt-3 space-y-5">
                {picked.map((service) => {
                  const options = staffFor(service.id);
                  if (options.length === 0) return null;
                  const selectedMemberId = preferredByService[service.id] || "";
                  const alreadyChosen = new Set(
                    Object.entries(preferredByService)
                      .filter(([id]) => id !== service.id)
                      .map(([, memberId]) => memberId),
                  );
                  return (
                    <div key={service.id}>
                      <p className="text-sm font-medium text-espresso">{lang === "ar" ? service.nameAr : service.nameEn}</p>
                      <div className="mt-2 grid gap-2">
                        {options.length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreferredByService((current) => {
                                const next = { ...current };
                                delete next[service.id];
                                return next;
                              })
                            }
                            className={selectTileClass(!selectedMemberId)}
                          >
                            {t.anyAvailableStaff}
                          </button>
                        ) : null}
                        {options.map((row) => {
                          const full = row.remaining <= 0 && !alreadyChosen.has(row.id) && selectedMemberId !== row.id;
                          return (
                            <button
                              key={row.id}
                              type="button"
                              disabled={full}
                              onClick={() =>
                                setPreferredByService((current) => ({ ...current, [service.id]: row.id }))
                              }
                              className={selectTileClass(
                                selectedMemberId === row.id || (options.length === 1 && !selectedMemberId),
                                full,
                              )}
                            >
                              <p className="font-medium">{row.name}</p>
                              <p className="mt-1 text-sm text-espresso/55">
                                {full ? t.shiftFull : `${row.remaining} ${t.spotsLeft}`}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
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
              {notesHaveContact ? <p className="mt-2 text-sm text-error">{t.notesNoPhone}</p> : null}
            </Field>
          </section>

          {picked.length > 0 && date && slotReady ? (
            <Card>
              <h2 className="font-display text-2xl">{t.reviewBooking}</h2>
              <p className="mt-3 text-sm text-espresso/55">{t.businessLabel}</p>
              <p className="font-medium">{artistName}</p>
              <ul className="mt-3 space-y-1 text-sm">
                {picked.map((s) => {
                  const prefId = chosenPrefs[s.id];
                  const prefName =
                    staff.find((row) => row.id === prefId)?.name ||
                    (staffFor(s.id).length === 1 ? staffFor(s.id)[0].name : "");
                  return (
                  <li key={s.id} className="flex justify-between gap-3">
                    <span>
                      {lang === "ar" ? s.nameAr : s.nameEn}
                      {prefName ? <span className="mt-0.5 block text-xs text-espresso/55">{prefName}</span> : null}
                    </span>
                    <span>
                      {s.priceLyd} {t.lyd}
                    </span>
                  </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-sm">
                {formatDate(date, lang)}
                {chosenShift ? ` · ${lang === "ar" ? chosenShift.nameAr : chosenShift.nameEn}` : ""}
              </p>
              <p className="mt-3 font-display text-2xl">
                {t.total}: {totalPrice} {t.lyd}
              </p>
            </Card>
          ) : null}

          {error ? <p className="text-sm text-error">{error}</p> : null}
          <Button type="submit" variant="gold" className="w-full" disabled={loading || !canSubmit} loading={loading}>
            {t.sendRequest}
          </Button>
        </form>
      </main>
    </div>
  );
}
