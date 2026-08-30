import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { refreshFeeAccount } from "@/lib/fees";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const status = new URL(req.url).searchParams.get("status") || "";
  const artists = await db.artist.findMany({
    select: { id: true, name: true, slug: true, phone: true, isDemo: true },
    orderBy: { createdAt: "desc" },
  });
  const rows = [];
  for (const artist of artists) {
    const account = await refreshFeeAccount(artist.id);
    if (status && account.status !== status) continue;
    const outstanding = await db.platformFee.aggregate({
      where: { artistId: artist.id, status: "UNPAID" },
      _sum: { amountLyd: true },
    });
    rows.push({
      ...artist,
      status: account.status,
      outstanding: outstanding._sum.amountLyd || 0,
      nextPaymentDueDate: account.nextPaymentDueDate,
      newBookingsPaused: account.newBookingsPaused,
    });
  }
  return NextResponse.json(rows);
}
