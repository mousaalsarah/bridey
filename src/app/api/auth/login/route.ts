import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";

const schema = z.object({
  phone: z.string().min(8),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const phone = normalizePhone(parsed.data.phone);
  const artist = await db.artist.findUnique({ where: { phone } });
  if (!artist || !(await verifyPassword(parsed.data.password, artist.passwordHash))) {
    return NextResponse.json({ error: "LOGIN" }, { status: 401 });
  }

  await createSession(artist.id);
  return NextResponse.json({
    id: artist.id,
    slug: artist.slug,
    onboardingComplete: artist.onboardingComplete,
  });
}
