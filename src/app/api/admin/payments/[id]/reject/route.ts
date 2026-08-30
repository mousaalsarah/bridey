import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { FeeError, rejectPayment } from "@/lib/fees";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "ما قدرنا نتحقق من الدفعة.";
  try {
    return NextResponse.json(await rejectPayment(id, admin.id, reason));
  } catch (error) {
    if (error instanceof FeeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
