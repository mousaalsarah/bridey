import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminSession } from "@/lib/admin-auth";
import { verifyPassword } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({
  email: z.string().min(3),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });
  const admin = await db.admin.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!admin || !(await verifyPassword(parsed.data.password, admin.passwordHash))) {
    return NextResponse.json({ error: "LOGIN" }, { status: 401 });
  }
  await createAdminSession(admin.id);
  return NextResponse.json({ id: admin.id, name: admin.name });
}
