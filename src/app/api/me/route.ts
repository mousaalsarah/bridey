import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import { expireOverdue } from "@/lib/booking";
import { feeSnapshot } from "@/lib/fees";
import { db } from "@/lib/db";
import { clampHorizon, clampNotice, normalizeAccent, normalizeCoverLayout, normalizePageStyle, socialHandle } from "@/lib/page-theme";
import { joinSpecialties, slugify } from "@/lib/utils";

export async function GET() {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  await expireOverdue(db, artist.id);

  const [services, portfolio, hours, blocked, bookings, fees] = await Promise.all([
    db.service.findMany({ where: { artistId: artist.id }, orderBy: { createdAt: "asc" } }),
    db.portfolioImage.findMany({ where: { artistId: artist.id }, orderBy: { createdAt: "desc" } }),
    db.weeklyHour.findMany({ where: { artistId: artist.id } }),
    db.blockedDate.findMany({ where: { artistId: artist.id } }),
    db.booking.findMany({
      where: { artistId: artist.id },
      include: { service: true, items: true, fee: true },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
    }),
    db.platformFee.findMany({
      where: { artistId: artist.id },
      include: { booking: { select: { id: true, brideName: true, date: true, trackCode: true, origin: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const billing = await feeSnapshot(artist.id);
  const outstanding = billing.outstanding;

  const { passwordHash: _passwordHash, ...safeArtist } = artist;

  return NextResponse.json({
    artist: safeArtist,
    services,
    portfolio,
    hours,
    blocked,
    bookings,
    fees,
    outstanding,
    billing,
  });
}

export async function PATCH(req: Request) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const data: Record<string, string | boolean | number> = {};

  for (const key of ["name", "bio", "neighborhood", "avatarUrl", "coverUrl", "tagline", "ctaLabel"] as const) {
    if (typeof body[key] === "string") data[key] = key === "tagline" || key === "ctaLabel" ? body[key].slice(0, 80) : body[key];
  }

  if (typeof body.snapchat === "string") data.snapchat = socialHandle(body.snapchat);
  if (typeof body.instagram === "string") data.instagram = socialHandle(body.instagram);
  if (typeof body.whatsapp === "string") data.whatsapp = body.whatsapp;
  if (typeof body.pageStyle === "string") data.pageStyle = normalizePageStyle(body.pageStyle);
  if (typeof body.accent === "string") data.accent = normalizeAccent(body.accent);
  if (typeof body.coverLayout === "string") data.coverLayout = normalizeCoverLayout(body.coverLayout);
  if (typeof body.showHoursOnPage === "boolean") data.showHoursOnPage = body.showHoursOnPage;
  if (typeof body.bookingHorizonDays === "number") data.bookingHorizonDays = clampHorizon(body.bookingHorizonDays);
  if (typeof body.minNoticeHours === "number") data.minNoticeHours = clampNotice(body.minNoticeHours);

  if (Array.isArray(body.specialties) || Array.isArray(body.specialty) || typeof body.specialty === "string") {
    data.specialty = joinSpecialties(body.specialties || body.specialty);
  }

  if (typeof body.slug === "string") {
    const next = slugify(body.slug) || artist.slug;
    const taken = await db.artist.findFirst({ where: { slug: next, NOT: { id: artist.id } } });
    if (!taken) data.slug = next;
  }

  const updated = await db.artist.update({ where: { id: artist.id }, data });
  const { passwordHash: _hidden, ...safe } = updated;
  return NextResponse.json(safe);
}
