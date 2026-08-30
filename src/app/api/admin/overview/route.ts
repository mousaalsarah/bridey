import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { refreshFeeAccount } from "@/lib/fees";
import { db } from "@/lib/db";
import { todayISO } from "@/lib/utils";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const artists = await db.artist.findMany({ select: { id: true } });
  for (const artist of artists) {
    await refreshFeeAccount(artist.id);
  }

  const [totalArtists, byStatus, pendingPayments, paidThisMonth, outstanding] = await Promise.all([
    db.artist.count(),
    db.artistSubscription.groupBy({ by: ["status"], _count: true }),
    db.subscriptionPayment.count({ where: { status: "PENDING" } }),
    db.subscriptionPayment.aggregate({
      where: { status: "CONFIRMED", reviewedAt: { gte: new Date(`${todayISO().slice(0, 7)}-01`) } },
      _sum: { amountLyd: true },
      _count: true,
    }),
    db.platformFee.aggregate({
      where: { status: "UNPAID" },
      _sum: { amountLyd: true },
    }),
  ]);

  const counts = Object.fromEntries(byStatus.map((row) => [row.status, row._count]));
  return NextResponse.json({
    totalArtists,
    active: counts.ACTIVE || 0,
    paymentDue: counts.PAYMENT_DUE || 0,
    gracePeriod: counts.GRACE_PERIOD || 0,
    paymentPending: counts.PAYMENT_PENDING || 0,
    suspended: counts.SUSPENDED || 0,
    pendingPayments,
    monthlyRevenue: paidThisMonth._sum.amountLyd || 0,
    monthlyPaidCount: paidThisMonth._count,
    outstandingFees: outstanding._sum.amountLyd || 0,
  });
}
