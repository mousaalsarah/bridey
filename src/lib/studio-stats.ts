import { shiftMonth, todayISO } from "./utils";

const EARNED = new Set(["CONFIRMED", "COMPLETED"]);
const LOST = new Set(["DECLINED", "CANCELLED", "EXPIRED", "NO_SHOW"]);

export type StatBooking = {
  date: string;
  status: string;
  origin: string;
  source: string;
  items?: Array<{ nameAr: string; nameEn: string; priceLyd: number }>;
  platformFeeLyd?: number;
};

export type StatFee = {
  amountLyd: number;
  booking: { date: string };
};

export function bookingValue(booking: StatBooking) {
  if (!booking.items?.length) return 0;
  return booking.items.reduce((sum, item) => sum + (item.priceLyd || 0), 0);
}

export function inMonth(date: string, month: string) {
  return date.startsWith(month);
}

export function percentChange(now: number, then: number) {
  if (!then && !now) return 0;
  if (!then) return 100;
  return Math.round(((now - then) / then) * 100);
}

export function studioMonths(bookings: Array<{ date: string }>) {
  const current = todayISO().slice(0, 7);
  let earliest = current;
  let latest = current;
  for (const b of bookings) {
    const month = b.date.slice(0, 7);
    if (!month) continue;
    if (month < earliest) earliest = month;
    if (month > latest) latest = month;
  }
  const months: string[] = [];
  let cursor = earliest;
  while (cursor <= latest) {
    months.push(cursor);
    cursor = shiftMonth(cursor, 1);
  }
  return months.reverse();
}

export function studioMonthStats(bookings: StatBooking[], fees: StatFee[], month: string) {
  const rows = bookings.filter((b) => inMonth(b.date, month));
  const earned = rows.filter((b) => EARNED.has(b.status));
  const bridey = earned.filter((b) => b.origin === "public");
  const manual = earned.filter((b) => b.origin !== "public");
  const completed = rows.filter((b) => b.status === "COMPLETED");
  const pending = rows.filter((b) => b.status === "PENDING");
  const lost = rows.filter((b) => LOST.has(b.status));
  const publicDecided = rows.filter((b) => b.origin === "public" && b.status !== "PENDING");
  const publicWon = publicDecided.filter((b) => EARNED.has(b.status));

  const revenueLyd = earned.reduce((sum, b) => sum + bookingValue(b), 0);
  const completedLyd = completed.reduce((sum, b) => sum + bookingValue(b), 0);
  const feeLyd = fees.filter((f) => inMonth(f.booking.date, month)).reduce((sum, f) => sum + f.amountLyd, 0);

  const sources = new Map<string, { id: string; count: number; lyd: number }>();
  for (const b of earned) {
    const id = b.source || "other";
    const cur = sources.get(id) || { id, count: 0, lyd: 0 };
    cur.count += 1;
    cur.lyd += bookingValue(b);
    sources.set(id, cur);
  }

  const services = new Map<string, { nameAr: string; nameEn: string; count: number; lyd: number }>();
  for (const b of earned) {
    for (const item of b.items || []) {
      const cur = services.get(item.nameAr) || { nameAr: item.nameAr, nameEn: item.nameEn, count: 0, lyd: 0 };
      cur.count += 1;
      cur.lyd += item.priceLyd || 0;
      services.set(item.nameAr, cur);
    }
  }

  return {
    month,
    requestCount: rows.length,
    bookingCount: earned.length,
    brideyCount: bridey.length,
    manualCount: manual.length,
    completedCount: completed.length,
    pendingCount: pending.length,
    lostCount: lost.length,
    revenueLyd,
    completedLyd,
    feeLyd,
    netLyd: revenueLyd - feeLyd,
    avgTicketLyd: earned.length ? Math.round(revenueLyd / earned.length) : 0,
    confirmRate: publicDecided.length ? Math.round((publicWon.length / publicDecided.length) * 100) : 0,
    sources: [...sources.values()].sort((a, b) => b.lyd - a.lyd || b.count - a.count),
    services: [...services.values()].sort((a, b) => b.lyd - a.lyd || b.count - a.count).slice(0, 6),
  };
}

export type StudioMonthStats = ReturnType<typeof studioMonthStats>;

export function studioTrend(bookings: StatBooking[], fees: StatFee[], endMonth: string, count = 6) {
  const points = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const month = shiftMonth(endMonth, -i);
    const stats = studioMonthStats(bookings, fees, month);
    points.push({
      month,
      revenueLyd: stats.revenueLyd,
      feeLyd: stats.feeLyd,
      bookingCount: stats.bookingCount,
      brideyCount: stats.brideyCount,
    });
  }
  return points;
}
