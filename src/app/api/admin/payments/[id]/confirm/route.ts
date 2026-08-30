import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { FeeError, confirmPayment } from "@/lib/fees";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await confirmPayment(id, admin.id, "admin"));
  } catch (error) {
    if (error instanceof FeeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
