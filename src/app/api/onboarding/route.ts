import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentArtist } from "@/lib/auth";
import { db } from "@/lib/db";
import { HOUR_PRESETS } from "@/lib/constants";
import { deriveShiftsFromWindow } from "@/lib/shifts";
import { joinSpecialties, slugify } from "@/lib/utils";
import { createOwnedBusiness, ensureWorkspace } from "@/lib/workspace";

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
  businessType: z.enum(["independent", "salon"]).optional(),
  businessName: z.string().optional(),
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
  const takenBiz = await db.business.findFirst({ where: { slug } });
  if (taken || (takenBiz && takenBiz.ownerId !== artist.id)) slug = `${slug}-${artist.phone.slice(-4)}`;

  await db.artist.update({
    where: { id: artist.id },
    data: {
      specialty: joinSpecialties(parsed.data.specialties || parsed.data.specialty || ["makeup"]),
      neighborhood: parsed.data.neighborhood,
      bio: parsed.data.bio,
      snapchat: parsed.data.snapchat,
      slug,
      onboardingComplete: true,
    },
  });

  const refreshed = await db.artist.findUniqueOrThrow({ where: { id: artist.id } });
  let workspace = await ensureWorkspace(refreshed);
  if (workspace.business.ownerId !== artist.id) {
    const businessId = await createOwnedBusiness(db, refreshed, {
      name: parsed.data.businessName,
      businessType: parsed.data.businessType,
      slug,
    });
    workspace = await ensureWorkspace(await db.artist.findUniqueOrThrow({ where: { id: artist.id } }));
    void businessId;
  }

  await db.business.update({
    where: { id: workspace.business.id },
    data: {
      name: parsed.data.businessName?.trim() || refreshed.name,
      slug,
      businessType: parsed.data.businessType === "salon" ? "salon" : "independent",
      neighborhood: parsed.data.neighborhood,
      bio: parsed.data.bio,
    },
  });

  await db.weeklyHour.deleteMany({ where: { OR: [{ artistId: artist.id }, { businessId: workspace.business.id }] } });
  await db.weeklyHour.createMany({
    data: preset.days.map((dayOfWeek) => ({
      artistId: artist.id,
      businessId: workspace.business.id,
      dayOfWeek,
      startMin: preset.startMin,
      endMin: preset.endMin,
    })),
  });
  await db.shift.deleteMany({ where: { businessId: workspace.business.id } });
  await db.shift.createMany({
    data: deriveShiftsFromWindow(preset.startMin, preset.endMin).map((shift) => ({
      businessId: workspace.business.id,
      key: shift.key,
      nameAr: shift.nameAr,
      nameEn: shift.nameEn,
      startMin: shift.startMin,
      endMin: shift.endMin,
      sortOrder: shift.sortOrder,
      active: true,
    })),
  });

  for (const service of parsed.data.services) {
    const created = await db.service.create({
      data: {
        artistId: artist.id,
        businessId: workspace.business.id,
        nameAr: service.nameAr,
        nameEn: service.nameEn || service.nameAr,
        kind: service.kind,
        durationMin: service.durationMin,
        priceLyd: service.priceLyd,
      },
    });
    await db.teamMemberService.upsert({
      where: { teamMemberId_serviceId: { teamMemberId: workspace.member.id, serviceId: created.id } },
      update: {},
      create: { teamMemberId: workspace.member.id, serviceId: created.id },
    });
  }

  return NextResponse.json({ slug, ok: true });
}
