import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentArtist } from "@/lib/auth";
import { db } from "@/lib/db";
import { HOUR_PRESETS } from "@/lib/constants";
import { joinSpecialties, slugify } from "@/lib/utils";

const serviceSchema = z.object({
  nameAr: z.string().min(2),
  nameEn: z.string().optional().default(""),
  kind: z.string().optional().default("bridal"),
  durationMin: z.number().min(30).max(480),
  priceLyd: z.number().min(1).max(50000),
});

const schema = z.object({
  specialty: z.union([z.string(), z.array(z.string())]).optional(),
  specialties: z.array(z.string()).optional(),
  neighborhood: z.string(),
  bio: z.string().optional().default(""),
  snapchat: z.string().optional().default(""),
  services: z.array(serviceSchema).min(1).max(8),
  hoursPreset: z.string(),
  slug: z.string().optional(),
});

export async function POST(req: Request) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID" }, { status: 400 });
  }

  const preset = HOUR_PRESETS.find((p) => p.id === parsed.data.hoursPreset) ?? HOUR_PRESETS[0];
  let slug = parsed.data.slug ? slugify(parsed.data.slug) : artist.slug;
  const taken = await db.artist.findFirst({ where: { slug, NOT: { id: artist.id } } });
  if (taken) slug = `${slug}-${artist.phone.slice(-4)}`;

  await db.$transaction([
    db.artist.update({
      where: { id: artist.id },
      data: {
        specialty: joinSpecialties(parsed.data.specialties || parsed.data.specialty || ["makeup"]),
        neighborhood: parsed.data.neighborhood,
        bio: parsed.data.bio,
        snapchat: parsed.data.snapchat,
        slug,
        onboardingComplete: true,
      },
    }),
    ...parsed.data.services.map((service) =>
      db.service.create({
        data: {
          artistId: artist.id,
          nameAr: service.nameAr,
          nameEn: service.nameEn || service.nameAr,
          kind: service.kind,
          durationMin: service.durationMin,
          priceLyd: service.priceLyd,
        },
      }),
    ),
    db.weeklyHour.deleteMany({ where: { artistId: artist.id } }),
    ...preset.days.map((dayOfWeek) =>
      db.weeklyHour.create({
        data: {
          artistId: artist.id,
          dayOfWeek,
          startMin: preset.startMin,
          endMin: preset.endMin,
        },
      }),
    ),
  ]);

  return NextResponse.json({ slug, ok: true });
}
