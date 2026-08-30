import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { FeeError, adminOverride, feeSnapshot } from "@/lib/fees";
import { db } from "@/lib/db";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await ctx.params;
  const artist = await db.artist.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, phone: true, isDemo: true },
  });
  if (!artist) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  const [billing, logs] = await Promise.all([
    feeSnapshot(id),
    db.auditLog.findMany({
      where: { artistId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  return NextResponse.json({ artist, ...billing, logs });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  try {
    const account = await adminOverride(id, admin.id, {
      action: body.action,
      reason: body.reason || "",
      days: body.days,
    });
    return NextResponse.json(account);
  } catch (error) {
    if (error instanceof FeeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
