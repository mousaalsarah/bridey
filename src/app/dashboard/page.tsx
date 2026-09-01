"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Card, EmptyState, PageHeader, Skeleton, StatCard, StatusBadge } from "@/components/ui";
import { StudioRevenuePeek } from "@/components/studio-revenue";
import { PLATFORM_FEE_LYD } from "@/lib/constants";
import { useLang } from "@/lib/language";
import { useStudio, type Studio, type StudioBooking } from "@/lib/use-studio";
import { bookingServiceNames, displayPhone, formatDate, minutesToTime, minutesUntil, todayISO, whatsappLink } from "@/lib/utils";

const FILTERS = ["today", "upcoming", "pending", "confirmed", "completed", "cancelled"] as const;

const STATUS_KEY = {
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CHECKED_IN: "checkedIn",
  IN_PROGRESS: "inProgress",
  DECLINED: "declined",
  CANCELLED: "cancelled",
  COMPLETED: "completed",
  NO_SHOW: "noShow",
  EXPIRED: "expired",
} as const;

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
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
    if (data && !data.artist.onboardingComplete && data.permissions?.canManageBusiness !== false) router.replace("/onboarding");
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

  const live = ["PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"];
  const hour = Number(
    new Date().toLocaleString("en-GB", { timeZone: "Africa/Tripoli", hour: "numeric", hour12: false }),
  );
  const greet = hour < 12 ? t.greetingMorning : hour < 17 ? t.greetingAfternoon : t.greetingEvening;
  const firstName = (data?.artist.name || "").trim().split(/\s+/)[0] || "";
  const counts = useMemo(
    () => ({
      today: bookings.filter((b) => b.date === today && live.includes(b.status)).length,
      upcoming: bookings.filter((b) => b.date >= today && live.includes(b.status)).length,
      pending: bookings.filter((b) => b.status === "PENDING").length,
      confirmed: bookings.filter((b) => ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS"].includes(b.status)).length,
      completed: bookings.filter((b) => b.status === "COMPLETED").length,
      cancelled: bookings.filter((b) => b.status === "CANCELLED" || b.status === "DECLINED" || b.status === "EXPIRED" || b.status === "NO_SHOW").length,
      todayAll: bookings.filter((b) => b.date === today && b.status !== "DECLINED" && b.status !== "EXPIRED").length,
      todayConfirmed: bookings.filter((b) => b.date === today && ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS"].includes(b.status)).length,
      todayPending: bookings.filter((b) => b.date === today && b.status === "PENDING").length,
      todayCompleted: bookings.filter((b) => b.date === today && b.status === "COMPLETED").length,
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
    if (filter === "today") return b.date === today && ["PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"].includes(b.status);
    if (filter === "upcoming") return b.date >= today && ["PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS"].includes(b.status);
    if (filter === "pending") return b.status === "PENDING";
    if (filter === "confirmed") return ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS"].includes(b.status);
    if (filter === "completed") return b.status === "COMPLETED";
    return ["CANCELLED", "DECLINED", "EXPIRED", "NO_SHOW"].includes(b.status);
  });

  if (loading || !data) {
    return error === "NETWORK" ? <p className="text-error">{t.networkError}</p> : <DashboardSkeleton />;
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
        <p className="rounded-xl bg-rose px-4 py-2.5 text-sm text-espresso/80">{t.demoBanner}</p>
      ) : null}

      <PageHeader
        eyebrow={data.business?.name || data.artist.name}
        title={`${greet}${firstName ? (lang === "ar" ? `، ${firstName}` : `, ${firstName}`) : ""}`}
        body={t.todayOverview}
        actions={
          <>
            <Button href="/dashboard/scan" variant="dark" className="flex-1 sm:flex-none">
              {t.scanPass}
            </Button>
            {data.permissions?.canManageBusiness !== false && data.billing?.account.canCreateBookings !== false ? (
              <Button href="/dashboard/new" variant="gold" className="flex-1 sm:flex-none">
                {t.addAppointment}
              </Button>
            ) : null}
          </>
        }
      />
      {data.permissions?.canManageBusiness !== false && data.billing?.account.canCreateBookings !== false ? (
        <p className="-mt-3 text-xs text-taupe">{t.manualFeeHint}</p>
      ) : data.billing && !data.billing.account.canCreateBookings ? (
        <p className="-mt-3 text-sm text-espresso/70">{t.billingPaused}</p>
      ) : null}

      {data.permissions?.canViewFees !== false ? <StudioRevenuePeek bookings={data.bookings} fees={data.fees} /> : null}

      {data.permissions?.canViewFees !== false && data.billing ? <FeeCard billing={data.billing} /> : null}

      {counts.pending > 0 ? (
        <button
          type="button"
          onClick={() => chooseFilter("pending")}
          className="w-full rounded-2xl border border-blush/35 bg-rose/70 px-5 py-4 text-start shadow-soft"
          aria-live="polite"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-[0.16em] text-blush uppercase">{t.bookingRequests}</p>
              <p className="mt-1 font-display text-2xl text-espresso">{t.pendingNow}</p>
              <p className="mt-1 text-sm text-espresso/70">
                {counts.pending} {t.requestsWaiting}
              </p>
              {pendingNames ? <p className="mt-2 text-sm text-espresso/80">{pendingNames}</p> : null}
            </div>
            <span className="grid h-12 min-w-12 place-items-center rounded-xl bg-white px-3 font-display text-2xl text-espresso">
              {counts.pending}
            </span>
          </div>
        </button>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t.todaysBookings} value={counts.todayAll} onClick={() => chooseFilter("today")} />
        <StatCard label={t.confirmed} value={counts.todayConfirmed} onClick={() => chooseFilter("confirmed")} />
        <StatCard
          label={t.pending}
          value={counts.todayPending}
          tone={counts.pending > 0 ? "warning" : "default"}
          onClick={() => chooseFilter("pending")}
        />
        <StatCard label={t.completed} value={counts.todayCompleted} onClick={() => chooseFilter("completed")} />
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-espresso/70">{t.todaySchedule}</p>
        <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0">
          {FILTERS.map((key) => {
            const waiting = key === "pending" && counts.pending > 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => chooseFilter(key)}
                className={`min-h-9 shrink-0 rounded-xl px-3 py-1.5 text-sm transition ${
                  filter === key
                    ? waiting
                      ? "bg-blush text-espresso"
                      : "bg-espresso text-ivory"
                    : waiting
                      ? "bg-warning/15 text-espresso"
                      : "bg-white text-espresso/70"
                }`}
              >
                {t[key]}
                <span className={`ms-1 inline-flex min-w-5 justify-center rounded-full px-1.5 text-xs ${filter === key ? "text-ivory/80" : "text-taupe"}`}>
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={t.emptyBookingsTitle}
          body={t.emptyBookingsBody}
          action={
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap">
              <Button href="/dashboard/share" variant="gold" className="w-full sm:w-auto">
                {t.shareBookingLink}
              </Button>
              {data.permissions?.canManageBusiness !== false && data.billing?.account.canCreateBookings !== false ? (
                <Button href="/dashboard/new" variant="ghost" className="w-full sm:w-auto">
                  {t.addAppointment}
                </Button>
              ) : null}
            </div>
          }
        />
      ) : (
        visible.map((b) => (
          <BookingCard
            key={b.id}
            booking={b}
            note={noteDraft[b.id] ?? b.artistNotes}
            onNote={(value) => setNoteDraft((d) => ({ ...d, [b.id]: value }))}
            onSaveNote={() => saveNote(b.id)}
            onStatus={(status) => setStatus(b.id, status)}
            members={(data.members || []).filter((row) => row.status === "ACTIVE")}
            canAssign={Boolean(data.permissions?.canAssign)}
            onAssign={async (assignments) => {
              const res = await fetch(`/api/bookings/${b.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ assignments }),
              });
              if (!res.ok) {
                alert(t.slotTaken);
                return;
              }
              reload();
            }}
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
  members,
  canAssign,
  onAssign,
}: {
  booking: StudioBooking;
  note: string;
  onNote: (value: string) => void;
  onSaveNote: () => void;
  onStatus: (status: string) => void | Promise<void>;
  members: Array<{ id: string; name: string; serviceIds: string[] }>;
  canAssign: boolean;
  onAssign: (assignments: Array<{ serviceId: string; teamMemberId: string }>) => void;
}) {
  const { t, lang } = useLang();
  const [askConfirm, setAskConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const statusLabel = t[STATUS_KEY[b.status as keyof typeof STATUS_KEY] ?? "pending"];
  const publicPending = b.origin === "public" && b.status === "PENDING";
  const timeLabel = b.shift
    ? lang === "ar"
      ? b.shift.nameAr
      : b.shift.nameEn
    : minutesToTime(b.startMin, lang);
  const totalLyd = (b.items?.length ? b.items : [b.service]).reduce((sum, item) => sum + (item?.priceLyd || 0), 0);
  const paidLyd = b.paidLyd || 0;
  const remainingLyd = Math.max(0, totalLyd - paidLyd);

  async function runStatus(status: string) {
    setBusy(true);
    setAskConfirm(false);
    try {
      await onStatus(status);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={b.status === "PENDING" ? "border-blush/40 bg-rose/40" : undefined}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-espresso/70">{timeLabel}</p>
            <StatusBadge status={b.status} label={statusLabel} />
          </div>
          <p className="mt-3 font-display text-2xl text-espresso">{b.brideName}</p>
          <p className="mt-1 text-sm text-espresso/65">{bookingServiceNames(b, lang)}</p>
          <p className="text-sm text-taupe">{formatDate(b.date, lang)}</p>
          {b.assignments?.length ? (
            <p className="mt-2 text-sm text-espresso/60">
              {b.assignments.map((row) => row.teamMember.name).filter((name, i, all) => all.indexOf(name) === i).join(" · ")}
            </p>
          ) : null}
          {totalLyd > 0 && ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"].includes(b.status) ? (
            <p className={`mt-2 text-sm ${remainingLyd > 0 ? "font-medium text-espresso" : "text-success"}`}>
              {remainingLyd > 0 ? `${remainingLyd} ${t.lyd} ${t.remaining}` : t.paidInFull}
            </p>
          ) : null}
          {canAssign && members.length > 1 && (b.status === "PENDING" || b.status === "CONFIRMED") ? (
            <div className="mt-3 space-y-2">
              {(b.items?.length ? b.items : [{ serviceId: b.service?.id, nameAr: b.service.nameAr, nameEn: b.service.nameEn }]).map((item) => {
                const serviceId = item.serviceId || b.assignments?.find((row) => row.serviceId)?.serviceId;
                if (!serviceId) return null;
                const current = b.assignments?.find((row) => row.serviceId === serviceId)?.teamMemberId || "";
                const options = members.filter((member) => member.serviceIds.includes(serviceId) || member.id === current);
                return (
                  <label key={serviceId} className="block text-xs text-espresso/60">
                    {lang === "ar" ? item.nameAr : item.nameEn}
                    <select
                      className="mt-1 w-full rounded-xl border border-champagne/40 bg-white px-3 py-2 text-sm text-espresso"
                      value={current}
                      onChange={(e) => {
                        const next = (b.assignments || []).map((row) => ({
                          serviceId: row.serviceId,
                          teamMemberId: row.serviceId === serviceId ? e.target.value : row.teamMemberId,
                        }));
                        if (!next.some((row) => row.serviceId === serviceId)) {
                          next.push({ serviceId, teamMemberId: e.target.value });
                        }
                        onAssign(next);
                      }}
                    >
                      {options.map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          ) : null}
          {b.trackCode ? (
            <p className="mt-2 font-mono text-xs tracking-widest text-taupe" dir="ltr">
              {b.trackCode}
            </p>
          ) : null}
          {b.bridePhone ? (
            <p className="mt-1 text-sm" dir="ltr">
              {displayPhone(b.bridePhone)}
            </p>
          ) : publicPending ? (
            <p className="mt-2 text-xs text-taupe">{t.phoneHiddenUntilConfirm}</p>
          ) : null}
          {b.status === "CONFIRMED" && b.contactAvailable ? (
            <p className="mt-2 text-xs text-success">{t.contactNowAvailable}</p>
          ) : null}
          {b.notes ? <p className="mt-2 text-sm text-espresso/55">{b.notes}</p> : null}
          {publicPending ? <p className="mt-2 text-xs text-taupe">{t.feeOnConfirm}</p> : null}
          {b.status === "PENDING" ? <HoldCountdown expiresAt={b.expiresAt} /> : null}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {b.status === "PENDING" ? (
            <>
              <Button variant="gold" disabled={busy} loading={busy} onClick={() => setAskConfirm(true)}>
                {publicPending ? `${t.confirm} — ${PLATFORM_FEE_LYD} ${t.lyd}` : t.confirm}
              </Button>
              <Button variant="danger" disabled={busy} loading={busy} onClick={() => runStatus("DECLINED")}>
                {t.decline}
              </Button>
            </>
          ) : null}
          {["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"].includes(b.status) ? (
            <>
              <Button href={`/dashboard/appointments/${b.id}`} variant="dark">
                {t.openAppointment}
              </Button>
              {b.status === "CONFIRMED" ? (
                <Button variant="ghost" disabled={busy} onClick={() => runStatus("NO_SHOW")}>
                  {t.noShow}
                </Button>
              ) : null}
              {["CONFIRMED", "CHECKED_IN", "IN_PROGRESS"].includes(b.status) ? (
                <Button variant="ghost" disabled={busy} onClick={() => runStatus("CANCELLED")}>
                  {t.cancelBooking}
                </Button>
              ) : null}
            </>
          ) : null}
          {b.bridePhone ? (
            <Button href={whatsappLink(b.bridePhone)} variant="rose">
              {t.contactBride}
            </Button>
          ) : null}
        </div>
      </div>
      {askConfirm ? (
        <div className="mt-4 rounded-2xl bg-ivory px-4 py-4">
          <p className="font-display text-xl">{t.confirmDialogTitle}</p>
          <p className="mt-2 text-sm text-espresso/70">{t.confirmDialogBody}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setAskConfirm(false)}>
              {t.confirmDialogCancel}
            </Button>
            <Button variant="gold" disabled={busy} loading={busy} onClick={() => runStatus("CONFIRMED")}>
              {publicPending ? `${t.confirm} — ${PLATFORM_FEE_LYD} ${t.lyd}` : t.confirm}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="mt-4 space-y-2">
        <textarea
          className="w-full rounded-xl border border-champagne/40 bg-white px-3 py-2 text-sm outline-none focus:border-blush focus:ring-2 focus:ring-blush/20"
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
    <div className="mt-3 rounded-xl bg-rose px-3 py-2">
      <p className="text-xs font-medium tracking-[0.16em] text-blush uppercase">{t.waitingConfirm}</p>
      {mins == null ? null : mins > 0 ? (
        <p className="mt-1 text-sm">
          {t.responseDeadline}: {mins} {t.minutesRemaining}
        </p>
      ) : (
        <p className="mt-1 text-sm text-warning">{t.holdReleased}</p>
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
        <p className="text-xs font-medium tracking-[0.16em] text-blush uppercase">{t.earnings}</p>
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
        <p className="mb-3 text-sm text-espresso/70">{lang === "ar" ? billing.notices[0].bodyAr : billing.notices[0].bodyEn}</p>
      ) : null}
      <p className="text-xs font-medium tracking-[0.16em] text-blush uppercase">{t.earnings}</p>
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

function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-36" />
      <Skeleton className="h-36" />
    </div>
  );
}
