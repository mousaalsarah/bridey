import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { isLibyaPhone, normalizePhone, slugify } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2),
  phone: z.string().min(8),
  password: z.string().min(4),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!isLibyaPhone(phone)) {
    return NextResponse.json({ error: "PHONE" }, { status: 400 });
  }

  const exists = await db.artist.findUnique({ where: { phone } });
  if (exists) {
    return NextResponse.json({ error: "TAKEN" }, { status: 409 });
  }

  let slug = slugify(parsed.data.name);
  const slugTaken = await db.artist.findUnique({ where: { slug } });
  if (slugTaken) slug = `${slug}-${phone.slice(-4)}`;

  const artist = await db.artist.create({
    data: {
      name: parsed.data.name.trim(),
      phone,
      passwordHash: await hashPassword(parsed.data.password),
      slug,
      whatsapp: phone,
    },
  });

  const invite = await db.teamMember.findFirst({
    where: { phone, artistId: null, status: "ACTIVE" },
  });
  if (invite) {
    await db.teamMember.update({
      where: { id: invite.id },
      data: { artistId: artist.id, name: invite.name || artist.name },
    });
  }

  await createSession(artist.id);
  return NextResponse.json({ id: artist.id, slug: artist.slug, onboardingComplete: false });
}
