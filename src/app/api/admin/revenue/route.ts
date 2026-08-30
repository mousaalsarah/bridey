import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { availableMonths, monthBounds, revenueForMonth, revenueTrend } from "@/lib/revenue";
import { shiftMonth, todayISO } from "@/lib/utils";

export async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const requested = new URL(req.url).searchParams.get("month") || todayISO().slice(0, 7);
  const { month } = monthBounds(requested);
  const previousMonth = shiftMonth(month, -1);
  const [current, previous, trend, months] = await Promise.all([
    revenueForMonth(month),
    revenueForMonth(previousMonth),
    revenueTrend(month, 6),
    availableMonths(),
  ]);

  const change = (now: number, then: number) => {
    if (!then && !now) return 0;
    if (!then) return 100;
    return Math.round(((now - then) / then) * 100);
  };

  return NextResponse.json({
    month,
    previousMonth,
    months,
    current,
    previous: {
      generatedLyd: previous.generatedLyd,
      collectedLyd: previous.collectedLyd,
      bookingCount: previous.bookingCount,
    },
    change: {
      generated: change(current.generatedLyd, previous.generatedLyd),
      collected: change(current.collectedLyd, previous.collectedLyd),
      bookings: change(current.bookingCount, previous.bookingCount),
    },
    trend,
  });
}
