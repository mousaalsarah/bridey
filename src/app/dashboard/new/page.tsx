"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, Field, PageHeader, PageSkeleton, inputClass } from "@/components/ui";
import { MANUAL_SOURCES } from "@/lib/constants";
import { useLang } from "@/lib/language";
import { useStudio } from "@/lib/use-studio";
import { minutesToTime, todayISO } from "@/lib/utils";

export default function NewAppointmentPage() {
  const { t, lang } = useLang();
  const { data, loading } = useStudio();
  const router = useRouter();
  const [brideName, setBrideName] = useState("");
  const [bridePhone, setBridePhone] = useState("");
  const [date, setDate] = useState(todayISO());
  const [shiftId, setShiftId] = useState("");
  const [preferredByService, setPreferredByService] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [source, setSource] = useState("whatsapp");
  const [notes, setNotes] = useState("");
  const [artistNotes, setArtistNotes] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const services = (data?.services || []).filter((s) => s.active);
  const shifts = (data?.shifts || []).filter((s) => s.active);
  const members = (data?.members || []).filter((row) => row.status === "ACTIVE");
  const mode = data?.business?.scheduleMode || "SHIFT";

  if (loading || !data) {
    return <PageSkeleton />;
  }

  if (data.permissions?.canManageBusiness === false) {
    return (
      <Card>
        <p className="font-display text-2xl">{t.forbidden}</p>
      </Card>
    );
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
          shiftId: mode === "SHIFT" ? shiftId || undefined : undefined,
          preferredByService: Object.fromEntries(
            Object.entries(preferredByService).filter(([id, memberId]) => selected.includes(id) && memberId),
          ),
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
              : body.error === "PREFERRED_UNAVAILABLE"
                ? t.preferredUnavailable
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
      <PageHeader title={t.addAppointment} body={t.manualFeeHint} />
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <Field label={t.brideName}>
            <input className={inputClass()} value={brideName} onChange={(e) => setBrideName(e.target.value)} required />
          </Field>
          <Field label={t.phone}>
            <input className={inputClass()} dir="ltr" value={bridePhone} onChange={(e) => setBridePhone(e.target.value)} required />
          </Field>
          <Field label={t.chooseDay}>
            <input className={inputClass()} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </Field>
          {mode === "SHIFT" ? (
            <Field label={t.chooseShift}>
              <select className={inputClass()} value={shiftId} onChange={(e) => setShiftId(e.target.value)} required>
                <option value="">{t.chooseShift}</option>
                {shifts.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {lang === "ar" ? shift.nameAr : shift.nameEn} · {minutesToTime(shift.startMin, lang)}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
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
                </label>
              ))}
            </div>
          </Field>
          {selected.map((serviceId) => {
            const service = services.find((row) => row.id === serviceId);
            const options = members.filter((member) => member.serviceIds.includes(serviceId));
            if (!service || options.length === 0 || members.length <= 1) return null;
            return (
              <Field
                key={serviceId}
                label={`${t.preferredStaff} · ${lang === "ar" ? service.nameAr : service.nameEn}`}
              >
                <select
                  className={inputClass()}
                  value={preferredByService[serviceId] || (options.length === 1 ? options[0].id : "")}
                  onChange={(e) =>
                    setPreferredByService((current) => {
                      const next = { ...current };
                      if (e.target.value) next[serviceId] = e.target.value;
                      else delete next[serviceId];
                      return next;
                    })
                  }
                >
                  {options.length > 1 ? <option value="">{t.anyAvailableStaff}</option> : null}
                  {options.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </Field>
            );
          })}
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
          {error ? <p className="text-sm text-error">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" variant="gold" disabled={busy || selected.length === 0} loading={busy}>
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
