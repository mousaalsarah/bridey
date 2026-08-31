import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import { expireOverdue } from "@/lib/booking";
import { feeSnapshot } from "@/lib/fees";
import { db } from "@/lib/db";
import { clampHorizon, clampNotice, normalizeAccent, normalizeCoverLayout, normalizePageStyle, socialHandle } from "@/lib/page-theme";
import { parseRoles } from "@/lib/roles";
import { joinSpecialties, slugify } from "@/lib/utils";
import { presentBooking } from "@/lib/booking-privacy";
import { bookingScopeWhere, requireWorkspace, syncServiceStaffByRole, WorkspaceError } from "@/lib/workspace";

export async function GET() {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const workspace = await requireWorkspace(artist);
  await expireOverdue(db, workspace.business.ownerId);
  await syncServiceStaffByRole(db, workspace.business.id);

  const [services, portfolio, bookings, fees] = await Promise.all([
    db.service.findMany({
      where: { businessId: workspace.business.id },
      include: { staff: true },
      orderBy: { createdAt: "asc" },
    }),
    db.portfolioImage.findMany({ where: { artistId: workspace.business.ownerId }, orderBy: { createdAt: "desc" } }),
    db.booking.findMany({
      where: bookingScopeWhere(workspace),
      include: {
        service: true,
        items: true,
        fee: true,
        shift: true,
        assignments: { include: { teamMember: { select: { id: true, name: true, roles: true } } } },
      },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
    }),
    workspace.permissions.canViewFees
      ? db.platformFee.findMany({
          where: { businessId: workspace.business.id },
          include: { booking: { select: { id: true, brideName: true, date: true, trackCode: true, origin: true } } },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const billing = workspace.permissions.canViewFees ? await feeSnapshot(workspace.business.ownerId) : null;
  const outstanding = billing?.outstanding || 0;
  const { passwordHash: _passwordHash, ...safeArtist } = artist;

  return NextResponse.json({
    artist: safeArtist,
    business: {
      id: workspace.business.id,
      name: workspace.business.name,
      slug: workspace.business.slug,
      businessType: workspace.business.businessType,
      scheduleMode: workspace.business.scheduleMode,
      assignmentMode: workspace.business.assignmentMode,
      neighborhood: workspace.business.neighborhood,
    },
    member: {
      id: workspace.member.id,
      name: workspace.member.name,
      roles: parseRoles(workspace.member.roles),
      dailyCapacity: workspace.member.dailyCapacity,
      status: workspace.member.status,
    },
    permissions: workspace.permissions,
    members: workspace.permissions.canManageTeam
      ? workspace.business.members.map((row) => ({
          id: row.id,
          artistId: row.artistId,
          name: row.name,
          phone: row.phone,
          roles: parseRoles(row.roles),
          dailyCapacity: row.dailyCapacity,
          status: row.status,
          serviceIds: row.services.map((item) => item.serviceId),
        }))
      : workspace.business.members
          .filter((row) => row.status === "ACTIVE")
          .map((row) => ({
            id: row.id,
            artistId: row.artistId,
            name: row.name,
            phone: "",
            roles: parseRoles(row.roles),
            dailyCapacity: row.dailyCapacity,
            status: row.status,
            serviceIds: row.services.map((item) => item.serviceId),
          })),
    shifts: workspace.business.shifts,
    services: services.map((service) => ({
      ...service,
      staffIds: service.staff.map((row) => row.teamMemberId),
    })),
    portfolio,
    hours: workspace.business.hours.length ? workspace.business.hours : workspace.business.owner ? await db.weeklyHour.findMany({ where: { artistId: workspace.business.ownerId } }) : [],
    blocked: workspace.business.blocked.length
      ? workspace.business.blocked
      : await db.blockedDate.findMany({ where: { artistId: workspace.business.ownerId } }),
    bookings: bookings.map((booking) =>
      presentBooking(booking, {
        memberId: workspace.member.id,
        canManageBusiness: workspace.permissions.canManageBusiness,
      }),
    ),
    fees,
    outstanding,
    billing,
  });
}

export async function PATCH(req: Request) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  let workspace;
  try {
    workspace = await requireWorkspace(artist);
  } catch (error) {
    if (error instanceof WorkspaceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

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

  if (typeof body.slug === "string" && workspace.permissions.canManageBusiness) {
    const next = slugify(body.slug) || artist.slug;
    const takenArtist = await db.artist.findFirst({ where: { slug: next, NOT: { id: artist.id } } });
    const takenBusiness = await db.business.findFirst({
      where: { slug: next, NOT: { id: workspace.business.id } },
    });
    if (!takenArtist && !takenBusiness) data.slug = next;
  }

  const updated = await db.artist.update({ where: { id: artist.id }, data });
  if (workspace.permissions.canManageBusiness) {
    await db.business.update({
      where: { id: workspace.business.id },
      data: {
        name: typeof body.businessName === "string" ? body.businessName.slice(0, 80) : data.name || undefined,
        slug: typeof data.slug === "string" ? data.slug : undefined,
        neighborhood: typeof data.neighborhood === "string" ? data.neighborhood : undefined,
        bio: typeof data.bio === "string" ? data.bio : undefined,
        bookingHorizonDays: typeof data.bookingHorizonDays === "number" ? data.bookingHorizonDays : undefined,
        minNoticeHours: typeof data.minNoticeHours === "number" ? data.minNoticeHours : undefined,
      },
    });
  }
  const { passwordHash: _hidden, ...safe } = updated;
  return NextResponse.json(safe);
}
