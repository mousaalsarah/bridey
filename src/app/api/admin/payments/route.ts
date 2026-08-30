import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const status = new URL(req.url).searchParams.get("status") || "PENDING";
  const payments = await db.subscriptionPayment.findMany({
    where: { status },
    include: {
      artist: { select: { id: true, name: true, slug: true, phone: true } },
      invoice: { select: { id: true, number: true, reference: true, dueDate: true, amountLyd: true } },
    },
    orderBy: { submittedAt: "desc" },
  });
  return NextResponse.json(payments);
}
