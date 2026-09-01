"use client";

import { useState } from "react";
import { Button, Card, Field, SectionLabel, StatusBadge, inputClass } from "@/components/ui";
import { useLang } from "@/lib/language";
import { displayPhone, formatClock, formatDate, minutesToTime } from "@/lib/utils";

export type AppointmentView = {
  id: string;
  status: string;
  brideName: string;
  bridePhone: string;
  contactAvailable?: boolean;
  date: string;
  startMin: number;
  endMin: number;
  trackCode: string | null;
  shift: { nameAr: string; nameEn: string; startMin: number; endMin: number } | null;
  businessName: string;
  assignments: Array<{ teamMemberId: string; staffName: string; serviceAr: string; serviceEn: string }>;
  services: Array<{ nameAr: string; nameEn: string; durationMin: number; priceLyd: number }>;
  payment: {
    totalLyd: number;
    depositLyd: number;
    paidLyd: number;
    remainingLyd: number;
    depositPaid: boolean;
    status: string;
  };
  checkedInAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  actions: { canCheckIn: boolean; canStart: boolean; canComplete: boolean; canRecordPayment: boolean };
};

const STEPS = ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"] as const;

export function AppointmentPanel({
  data,
  onUpdate,
}: {
  data: AppointmentView;
  onUpdate: (next: AppointmentView) => void;
}) {
  const { t, lang } = useLang();
  const [busy, setBusy] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const services = data.services.map((s) => (lang === "ar" ? s.nameAr : s.nameEn)).join(" · ");
  const when = data.shift
    ? `${formatDate(data.date, lang)} · ${lang === "ar" ? data.shift.nameAr : data.shift.nameEn}`
    : `${formatDate(data.date, lang)} · ${minutesToTime(data.startMin, lang)} – ${minutesToTime(data.endMin, lang)}`;
  const statusLabel =
    data.status === "CHECKED_IN"
      ? t.checkedIn
      : data.status === "IN_PROGRESS"
        ? t.inProgress
        : data.status === "COMPLETED"
          ? t.appointmentCompleted
          : data.status === "CANCELLED"
            ? t.cancelled
            : data.status === "NO_SHOW"
              ? t.noShow
              : t.confirmed;
  const payLabel =
    data.payment.status === "paid" ? t.paidInFull : data.payment.status === "partial" ? t.partiallyPaid : t.notPaid;
  const stepIndex = STEPS.indexOf(data.status as (typeof STEPS)[number]);

  async function run(action: string, extra?: Record<string, number>) {
    setBusy(action);
    setError("");
    const res = await fetch(`/api/bookings/${data.id}/appointment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy("");
    if (!res.ok) {
      setError(body.error === "INVALID_STATUS" ? t.bookingCannotChange : t.networkError);
      return;
    }
    onUpdate(body);
    window.dispatchEvent(new Event("bridey:bookings"));
  }

  const nextAction = data.actions.canCheckIn
    ? { action: "check_in", label: t.checkIn }
    : data.actions.canStart
      ? { action: "start", label: t.startAppointment }
      : data.actions.canComplete
        ? { action: "complete", label: t.completeAppointment }
        : null;

  return (
    <div className="space-y-5">
      <section>
        <SectionLabel>{t.brideName}</SectionLabel>
        <p className="mt-2 font-display text-3xl text-espresso">{data.brideName}</p>
        {data.bridePhone ? (
          <p className="mt-2 text-sm" dir="ltr">
            {displayPhone(data.bridePhone)}
          </p>
        ) : null}
        <div className="mt-3">
          <StatusBadge status={data.status} label={statusLabel} />
        </div>
      </section>

      <section>
        <SectionLabel>{t.services}</SectionLabel>
        <p className="mt-2 text-espresso/80">{services}</p>
      </section>

      <section>
        <SectionLabel>{t.hours}</SectionLabel>
        <p className="mt-2 text-espresso/80">{when}</p>
      </section>

      {data.assignments.length ? (
        <section>
          <SectionLabel>{t.assigned}</SectionLabel>
          <ul className="mt-2 space-y-1 text-sm text-espresso/75">
            {data.assignments.map((row) => (
              <li key={`${row.teamMemberId}-${row.serviceAr}`}>
                {row.staffName} — {lang === "ar" ? row.serviceAr : row.serviceEn}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.status !== "CANCELLED" && data.status !== "NO_SHOW" && data.status !== "DECLINED" ? (
        <Card className="bg-cream/60">
          <SectionLabel>{t.appointmentSection}</SectionLabel>
          <ol className="mt-4 space-y-3">
            {STEPS.map((step, index) => {
              const done = stepIndex > index || data.status === "COMPLETED";
              const current = data.status === step;
              const label =
                step === "CONFIRMED"
                  ? t.confirmed
                  : step === "CHECKED_IN"
                    ? t.checkedIn
                    : step === "IN_PROGRESS"
                      ? t.inProgress
                      : t.appointmentCompleted;
              return (
                <li key={step} className="flex items-center gap-3">
                  <span
                    className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] ${
                      current ? "bg-blush text-espresso ring-4 ring-blush/25" : done ? "bg-blush text-espresso" : "bg-white text-taupe"
                    }`}
                  >
                    {done && !current ? "✓" : index + 1}
                  </span>
                  <span className={current ? "font-medium text-espresso" : "text-espresso/55"}>{label}</span>
                </li>
              );
            })}
          </ol>
          {data.checkedInAt ? (
            <p className="mt-3 text-sm text-espresso/70">
              {t.checkedInAt} {formatClock(data.checkedInAt, lang)}
            </p>
          ) : null}
          {data.startedAt ? (
            <p className="mt-1 text-sm text-espresso/70">
              {t.startedAtLabel} {formatClock(data.startedAt, lang)}
            </p>
          ) : null}
          {data.completedAt ? (
            <p className="mt-1 text-sm text-success">
              {t.appointmentCompleted} · {formatClock(data.completedAt, lang)}
            </p>
          ) : null}
          {error ? <p className="mt-3 text-sm text-error">{error}</p> : null}
          {nextAction ? (
            <Button
              variant="gold"
              className="mt-4 w-full"
              disabled={Boolean(busy)}
              loading={Boolean(busy)}
              onClick={() => run(nextAction.action)}
            >
              {nextAction.label}
            </Button>
          ) : null}
        </Card>
      ) : (
        <p className="text-sm text-espresso/70">{data.status === "CANCELLED" ? t.passCancelled : statusLabel}</p>
      )}

      <Card>
        <SectionLabel>{t.paymentSection}</SectionLabel>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center sm:gap-3">
          <div className="min-w-0">
            <p className="font-display text-xl sm:text-2xl">
              {data.payment.totalLyd} <span className="text-sm font-sans">{t.lyd}</span>
            </p>
            <p className="mt-1 text-xs text-taupe">{t.total}</p>
          </div>
          <div className="min-w-0">
            <p className="font-display text-xl sm:text-2xl">
              {data.payment.paidLyd} <span className="text-sm font-sans">{t.lyd}</span>
            </p>
            <p className="mt-1 text-xs text-taupe">{t.paidLabel}</p>
          </div>
          <div className="min-w-0">
            <p className={`font-display text-2xl sm:text-3xl ${data.payment.remainingLyd > 0 ? "text-espresso" : "text-success"}`}>
              {data.payment.remainingLyd} <span className="text-sm font-sans">{t.lyd}</span>
            </p>
            <p className="mt-1 text-xs text-taupe">{t.remaining}</p>
          </div>
        </div>
        {data.payment.depositLyd > 0 ? (
          <p className="mt-3 text-sm text-espresso/70">
            {t.deposit}: {data.payment.depositLyd} {t.lyd}
            {data.payment.depositPaid ? ` · ${t.paidLabel}` : ` · ${t.notPaid}`}
          </p>
        ) : null}
        {data.payment.remainingLyd > 0 ? (
          <p className="mt-3 rounded-xl bg-warning/12 px-3 py-2 text-sm font-medium text-espresso">
            {t.outstandingPayment}: {data.payment.remainingLyd} {t.lyd}
          </p>
        ) : data.payment.totalLyd > 0 ? (
          <p className="mt-3 text-sm text-success">{t.paidInFull}</p>
        ) : (
          <p className="mt-3 text-sm text-espresso/70">{payLabel}</p>
        )}
        {data.actions.canRecordPayment && data.payment.remainingLyd > 0 ? (
          <div className="mt-4 space-y-3 border-t border-champagne/30 pt-4">
            <Field label={t.paymentAmount}>
              <input
                className={inputClass()}
                dir="ltr"
                type="number"
                min={1}
                max={data.payment.remainingLyd}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                disabled={Boolean(busy) || !Number(amount)}
                loading={busy === "record_payment"}
                onClick={() => run("record_payment", { amountLyd: Number(amount) })}
              >
                {t.recordPayment}
              </Button>
              <Button variant="gold" disabled={Boolean(busy)} loading={busy === "mark_paid"} onClick={() => run("mark_paid")}>
                {t.markRemainingPaid}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
