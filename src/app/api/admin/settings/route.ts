import { NextResponse } from "next/server";
import { getCurrentAdmin } from "@/lib/admin-auth";
import { ensurePaymentSettings, writeAudit } from "@/lib/fees";
import { db } from "@/lib/db";

export async function GET() {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const settings = await ensurePaymentSettings();
  return NextResponse.json({ settings });
}

export async function PATCH(req: Request) {
  const admin = await getCurrentAdmin();
  if (!admin) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const data: Record<string, string | number> = {};
  for (const key of ["bankName", "accountName", "accountNumber", "instructions", "supportedMethods"] as const) {
    if (typeof body[key] === "string") data[key] = body[key];
  }
  if (typeof body.reminderDays === "number") data.reminderDays = Math.min(30, Math.max(1, body.reminderDays));
  await ensurePaymentSettings();
  const settings = await db.paymentSettings.update({ where: { id: "default" }, data });
  await writeAudit(db, {
    actorType: "admin",
    actorId: admin.id,
    action: "payment_settings_changed",
    reason: "Updated bank/payment settings",
  });
  return NextResponse.json(settings);
}
