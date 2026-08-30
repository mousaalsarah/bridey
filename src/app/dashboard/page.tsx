"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { StudioRevenuePeek } from "@/components/studio-revenue";
import { useLang } from "@/lib/language";
import { useStudio, type Studio, type StudioBooking } from "@/lib/use-studio";
import { bookingServiceNames, displayPhone, formatDate, minutesToTime, minutesUntil, sourceLabel, todayISO, whatsappLink } from "@/lib/utils";

const FILTERS = ["today", "upcoming", "pending", "confirmed", "completed", "cancelled"] as const;

const STATUS_KEY = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  DECLINED: "declined",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  NO_SHOW: "noShow",
  EXPIRED: "expired",
} as const;

export default function DashboardPage() {
  const { lang } = useLang();
  return (
    <Suspense fallback={<p className="text-espresso/50">{lang === "ar" ? "لحظات…" : "Loading…"}</p>}>
      <DashboardHome />
    </Suspense>
  );
}

function DashboardHome() {
  const { t, lang } = useLang();
  const { data, loading, error, reload } = useStudio();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>(tab === "pending" ? "pending" : "today");
  const [autoOpened, setAutoOpened] = useState(tab === "pending");
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data && !data.artist.onboardingComplete) router.replace("/onboarding");
  }, [data, router]);

  useEffect(() => {
    const onBookings = () => reload();
    window.addEventListener("bridey:bookings", onBookings);
    return () => window.removeEventListener("bridey:bookings", onBookings);
  }, [reload]);

  useEffect(() => {
    if (tab === "pending") {
      setFilter("pending");
      setAutoOpened(true);
    }
  }, [tab]);

  const today = todayISO();
  const bookings = data?.bookings || [];

  const counts = useMemo(
    () => ({
      today: bookings.filter((b) => b.date === today && (b.status === "PENDING" || b.status === "CONFIRMED")).length,
      upcoming: bookings.filter((b) => b.date >= today && (b.status === "PENDING" || b.status === "CONFIRMED")).length,
      pending: bookings.filter((b) => b.status === "PENDING").length,
      confirmed: bookings.filter((b) => b.status === "CONFIRMED").length,
      completed: bookings.filter((b) => b.status === "COMPLETED").length,
      cancelled: bookings.filter((b) => b.status === "CANCELLED" || b.status === "DECLINED" || b.status === "EXPIRED" || b.status === "NO_SHOW").length,
    }),
    [bookings, today],
  );

  useEffect(() => {
    if (autoOpened || tab === "pending") return;
    if (counts.pending > 0) {
      setFilter("pending");
      setAutoOpened(true);
    }
  }, [autoOpened, counts.pending, tab]);

  const pendingNames = useMemo(() => {
    const pending = bookings.filter((b) => b.status === "PENDING");
    const shown = pending.slice(0, 3).map((b) => b.brideName);
    const extra = pending.length - shown.length;
    if (!shown.length) return "";
    const list = shown.join(lang === "ar" ? "، " : ", ");
    return extra > 0 ? `${list} +${extra} ${t.pendingOthers}` : list;
  }, [bookings, lang, t.pendingOthers]);

  function chooseFilter(key: (typeof FILTERS)[number]) {
    setFilter(key);
    setAutoOpened(true);
    router.replace(key === "pending" ? "/dashboard?tab=pending" : "/dashboard", { scroll: false });
  }

  const visible = bookings.filter((b) => {
    if (filter === "today") return b.date === today && (b.status === "PENDING" || b.status === "CONFIRMED");
    if (filter === "upcoming") return b.date >= today && (b.status === "PENDING" || b.status === "CONFIRMED");
    if (filter === "pending") return b.status === "PENDING";
    if (filter === "confirmed") return b.status === "CONFIRMED";
    if (filter === "completed") return b.status === "COMPLETED";
    return ["CANCELLED", "DECLINED", "EXPIRED", "NO_SHOW"].includes(b.status);
  });

  if (loading || !data) {
    return <p className="text-espresso/50">{error === "NETWORK" ? t.networkError : lang === "ar" ? "لحظات…" : "Loading…"}</p>;
  }

  async function setStatus(id: string, status: string) {
    const res = await fetch(`/api/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error === "UNAVAILABLE" ? t.slotTaken : t.networkError);
      return;
    }
    reload();
    window.dispatchEvent(new Event("bridey:alerts"));
  }

  async function saveNote(id: string) {
    await fetch(`/api/bookings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artistNotes: noteDraft[id] ?? "" }),
    });
    reload();
  }

  return (
    <div className="space-y-6">
      {data.artist.isDemo ? (
        <p className="rounded-2xl bg-rose/70 px-4 py-2 text-sm text-espresso/80">{t.demoBanner}</p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.25em] text-gold uppercase">{data.artist.name}</p>
          <h1 className="font-display text-4xl">{t.dashboard}</h1>
        </div>
        <div className="text-end">
          {data.billing?.account.canCreateBookings !== false ? (
            <>
              <Button href="/dashboard/new" variant="gold">
                {t.addAppointment}
              </Button>
              <p className="mt-2 max-w-xs text-xs text-espresso/45">{t.manualFeeHint}</p>
            </>
          ) : (
            <p className="max-w-xs text-sm text-espresso/70">{t.billingPaused}</p>
          )}
        </div>
      </div>

      <StudioRevenuePeek bookings={data.bookings} fees={data.fees} />

      {data.billing ? <FeeCard billing={data.billing} /> : null}

      {counts.pending > 0 ? (
        <button
          type="button"
          onClick={() => chooseFilter("pending")}
          className={`w-full rounded-3xl px-5 py-4 text-start shadow-gold ${
            filter === "pending" ? "bg-espresso text-ivory" : "alert-banner bg-espresso text-ivory"
          }`}
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs tracking-[0.2em] text-gold uppercase">{t.pending}</p>
              <p className="mt-1 font-display text-2xl">{t.pendingNow}</p>
              <p className="mt-1 text-sm text-ivory/75">{t.pendingNowBody}</p>
              {pendingNames ? <p className="mt-2 text-sm text-gold">{pendingNames}</p> : null}
            </div>
            <span className="alert-pulse grid h-14 min-w-14 place-items-center rounded-full bg-gold px-3 font-display text-3xl text-espresso">
              {counts.pending}
            </span>
          </div>
          {filter !== "pending" ? <p className="mt-3 text-sm text-gold">{t.seePending}</p> : null}
        </button>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label={t.pending}
          value={counts.pending}
          alert={counts.pending > 0}
          onClick={() => chooseFilter("pending")}
        />
        <Stat label={t.today} value={counts.today} onClick={() => chooseFilter("today")} />
        <Stat label={t.outstanding} value={`${data.outstanding} ${t.lyd}`} />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((key) => {
          const waiting = key === "pending" && counts.pending > 0;
          return (
            <button
              key={key}
              type="button"
              onClick={() => chooseFilter(key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
                filter === key
                  ? waiting
                    ? "bg-gold text-espresso"
                    : "bg-espresso text-ivory"
                  : waiting
                    ? "bg-gold/30 text-espresso"
                    : "bg-white/70 text-espresso/70"
              }`}
            >
              {t[key]}
              <span
                className={`ms-1 inline-flex min-w-5 justify-center rounded-full px-1.5 text-xs ${
                  waiting ? "alert-pulse bg-espresso text-ivory" : filter === key ? "text-ivory/80" : "text-espresso/50"
                }`}
              >
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <Card>
          <p className="text-espresso/60">{t.emptyBookings}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button href="/dashboard/share" variant="gold">
              {t.share}
            </Button>
            {data.billing?.account.canCreateBookings !== false ? (
              <Button href="/dashboard/new" variant="ghost">
                {t.addAppointment}
              </Button>
            ) : null}
          </div>
        </Card>
      ) : (
        visible.map((b) => (
          <BookingCard
            key={b.id}
            booking={b}
            note={noteDraft[b.id] ?? b.artistNotes}
            onNote={(value) => setNoteDraft((d) => ({ ...d, [b.id]: value }))}
            onSaveNote={() => saveNote(b.id)}
            onStatus={(status) => setStatus(b.id, status)}
          />
        ))
      )}
    </div>
  );
}

function BookingCard({
  booking: b,
  note,
  onNote,
  onSaveNote,
  onStatus,
}: {
  booking: StudioBooking;
  note: string;
  onNote: (value: string) => void;
  onSaveNote: () => void;
  onStatus: (status: string) => void;
}) {
  const { t, lang } = useLang();
  const statusLabel = t[STATUS_KEY[b.status as keyof typeof STATUS_KEY] ?? "pending"];

  return (
    <Card className={b.status === "PENDING" ? "ring-2 ring-gold bg-gold/10" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs ${b.origin === "public" ? "bg-gold/80" : "bg-rose"}`}>
              {b.origin === "public" ? t.brideyBooking : t.manualBooking}
            </span>
            <span className="rounded-full bg-ivory px-2 py-0.5 text-xs">{sourceLabel(b.source, lang)}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${b.status === "PENDING" ? "bg-espresso text-ivory" : "bg-ivory"}`}>
              {statusLabel}
            </span>
          </div>
          <p className="mt-2 font-display text-xl">{b.brideName}</p>
          <p className="text-sm text-espresso/60">
            {bookingServiceNames(b, lang)} · {formatDate(b.date, lang)} · {minutesToTime(b.startMin, lang)} – {minutesToTime(b.endMin, lang)}
          </p>
          {b.trackCode ? (
            <p className="mt-1 font-mono text-xs tracking-widest text-gold" dir="ltr">
              {b.trackCode}
            </p>
          ) : null}
          <p className="mt-1 text-sm" dir="ltr">
            {displayPhone(b.bridePhone)}
          </p>
          {b.notes ? <p className="mt-2 text-sm text-espresso/55">{b.notes}</p> : null}
          {b.origin === "public" && b.status === "PENDING" ? <p className="mt-2 text-xs text-gold">{t.feeOnConfirm}</p> : null}
          {b.status === "PENDING" ? <HoldCountdown expiresAt={b.expiresAt} /> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {b.status === "PENDING" ? (
            <>
              <Button variant="gold" onClick={() => onStatus("CONFIRMED")}>
                {t.confirm}
              </Button>
              <Button variant="ghost" onClick={() => onStatus("DECLINED")}>
                {t.decline}
              </Button>
            </>
          ) : null}
          {b.status === "CONFIRMED" ? (
            <>
              <Button variant="dark" onClick={() => onStatus("COMPLETED")}>
                {t.completed}
              </Button>
              <Button variant="ghost" onClick={() => onStatus("NO_SHOW")}>
                {t.noShow}
              </Button>
              <Button variant="ghost" onClick={() => onStatus("CANCELLED")}>
                {t.cancelBooking}
              </Button>
            </>
          ) : null}
          <Button href={whatsappLink(b.bridePhone)} variant="rose">
            {t.whatsapp}
          </Button>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <textarea
          className="w-full rounded-2xl border border-champagne/40 bg-white/80 px-3 py-2 text-sm"
          placeholder={t.artistNotes}
          value={note}
          onChange={(e) => onNote(e.target.value)}
        />
        <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={onSaveNote}>
          {t.saveNotes}
        </Button>
      </div>
    </Card>
  );
}

function HoldCountdown({ expiresAt }: { expiresAt: string | null }) {
  const { t } = useLang();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 15000);
    return () => window.clearInterval(id);
  }, [expiresAt]);
  const mins = expiresAt ? minutesUntil(expiresAt) : null;
  return (
    <div className="mt-3 rounded-2xl bg-espresso px-3 py-2 text-ivory">
      <p className="text-xs tracking-[0.2em] text-gold uppercase">{t.waitingConfirm}</p>
      {mins == null ? null : mins > 0 ? (
        <p className="mt-1 text-sm">
          {t.responseDeadline}: {mins} {t.minutesRemaining}
        </p>
      ) : (
        <p className="mt-1 text-sm text-gold">{t.holdReleased}</p>
      )}
    </div>
  );
}

function FeeCard({ billing }: { billing: NonNullable<Studio["billing"]> }) {
  const { t, lang } = useLang();
  const status = billing.account.status;
  const amount = billing.openInvoice?.amountLyd || billing.outstanding;
  if (status === "ACTIVE" && amount <= 0) {
    return (
      <Card>
        <p className="text-xs tracking-[0.2em] text-gold uppercase">{t.earnings}</p>
        <p className="mt-1 font-display text-2xl">{t.billingActive}</p>
        <Button href="/dashboard/earnings" variant="ghost" className="mt-3">
          {t.viewSubscription}
        </Button>
      </Card>
    );
  }
  return (
    <Card>
      {billing.notices[0] ? (
        <p className="mb-3 text-sm text-gold">{lang === "ar" ? billing.notices[0].bodyAr : billing.notices[0].bodyEn}</p>
      ) : null}
      <p className="text-xs tracking-[0.2em] text-gold uppercase">{t.earnings}</p>
      {status === "ACTIVE" ? (
        <>
          <p className="mt-1 font-display text-2xl">{amount} {t.lyd}</p>
          <p className="mt-2 text-sm text-espresso/60">
            {t.billingNext}: {formatDate(billing.account.nextPaymentDueDate, lang)}
          </p>
          <Button href="/dashboard/earnings" variant="ghost" className="mt-3">
            {t.paySubscription}
          </Button>
        </>
      ) : null}
      {status === "PAYMENT_DUE" ? (
        <>
          <p className="mt-1 font-display text-2xl">{t.billingDueSoon}</p>
          <p className="mt-2 text-sm">
            {amount} {t.lyd} · {formatDate(billing.account.nextPaymentDueDate, lang)}
          </p>
          <Button href="/dashboard/earnings" variant="gold" className="mt-3">
            {t.paySubscription}
          </Button>
        </>
      ) : null}
      {status === "GRACE_PERIOD" ? (
        <>
          <p className="mt-1 font-display text-2xl">{t.billingOverdue}</p>
          <p className="mt-2 text-sm">
            {amount} {t.lyd} · {t.billingGraceLeft}: {billing.account.graceDaysLeft} {t.days}
          </p>
          <Button href="/dashboard/earnings" variant="gold" className="mt-3">
            {t.paySubscription}
          </Button>
        </>
      ) : null}
      {status === "PAYMENT_PENDING" ? (
        <>
          <p className="mt-1 font-display text-2xl">{t.billingReview}</p>
          <Button href="/dashboard/earnings" variant="ghost" className="mt-3">
            {t.viewSubscription}
          </Button>
        </>
      ) : null}
      {status === "SUSPENDED" ? (
        <>
          <p className="mt-1 font-display text-2xl">{t.billingPaused}</p>
          <p className="mt-2 text-sm text-espresso/70">{t.billingPausedBody}</p>
          <Button href="/dashboard/earnings" variant="gold" className="mt-3">
            {t.billingSubmit}
          </Button>
        </>
      ) : null}
    </Card>
  );
}

function Stat({
  label,
  value,
  alert,
  onClick,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <Card className={alert ? "bg-gold/20 ring-2 ring-gold" : undefined}>
      <p className="text-xs text-espresso/50">{label}</p>
      <p className={`mt-1 font-display text-3xl ${alert ? "text-espresso" : ""}`}>{value}</p>
    </Card>
  );
  if (!onClick) return body;
  return (
    <button type="button" onClick={onClick} className="text-start">
      {body}
    </button>
  );
}
