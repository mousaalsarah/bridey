import type { Artist, Prisma } from "@prisma/client";
import { CapacityFullError, claimCapacitySeats } from "./capacity";
import { BLOCKING_STATUSES, DEFAULT_DAILY_CAPACITY } from "./constants";
import { db } from "./db";
import { defaultCapacityForRoles, hasManagementRole, memberMatchesServiceKind, parseRoles, rolesFromSpecialty } from "./roles";
import { deriveShiftsFromWindow, typicalWindow } from "./shifts";

type Tx = Prisma.TransactionClient | typeof db;

export class WorkspaceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}

const businessInclude = {
  owner: true,
  members: { include: { services: true, artist: { select: { id: true, name: true, phone: true, slug: true } } } },
  shifts: { orderBy: { sortOrder: "asc" as const } },
  hours: true,
  blocked: true,
  services: { select: { id: true, kind: true, active: true } },
} satisfies Prisma.BusinessInclude;

export type LoadedBusiness = Prisma.BusinessGetPayload<{ include: typeof businessInclude }>;

export type StudioPermissions = {
  canManageBusiness: boolean;
  canManageTeam: boolean;
  canManageServices: boolean;
  canViewFees: boolean;
  canAssign: boolean;
  canSeeBrideContact: boolean;
};

export type Workspace = {
  artist: Artist;
  business: LoadedBusiness;
  member: LoadedBusiness["members"][number];
  permissions: StudioPermissions;
};

function permissionsFor(roles: string[]): StudioPermissions {
  const manage = hasManagementRole(roles);
  return {
    canManageBusiness: manage,
    canManageTeam: manage,
    canManageServices: manage,
    canViewFees: manage,
    canAssign: manage,
    canSeeBrideContact: manage,
  };
}

export async function loadBusiness(tx: Tx, id: string): Promise<LoadedBusiness> {
  return tx.business.findUniqueOrThrow({
    where: { id },
    include: businessInclude,
  });
}

export async function lockBusiness(tx: Tx, businessId: string) {
  await tx.business.update({ where: { id: businessId }, data: { updatedAt: new Date() } });
}

export async function lockTeamMembers(tx: Tx, ids: string[]) {
  for (const id of [...new Set(ids)]) {
    await tx.teamMember.update({ where: { id }, data: { updatedAt: new Date() } });
  }
}

async function uniqueBusinessSlug(tx: Tx, preferred: string, artistId: string) {
  let slug = preferred;
  for (let i = 0; i < 8; i += 1) {
    const taken = await tx.business.findUnique({ where: { slug } });
    if (!taken) return slug;
    slug = `${preferred}-${artistId.slice(-4).toLowerCase()}${i || ""}`;
  }
  return `${preferred}-${Date.now().toString(36)}`;
}

async function defaultShifts(tx: Tx, artist: Artist, businessId: string) {
  const hours = await tx.weeklyHour.findMany({ where: { OR: [{ artistId: artist.id }, { businessId }] } });
  const window = typicalWindow(hours);
  return deriveShiftsFromWindow(window.startMin, window.endMin);
}

export async function syncShiftsFromHours(tx: Tx, artist: Artist, businessId: string) {
  const existing = await tx.shift.findMany({ where: { businessId } });
  if (existing.length) return existing;
  const drafts = await defaultShifts(tx, artist, businessId);
  await tx.shift.createMany({
    data: drafts.map((shift) => ({
      businessId,
      key: shift.key,
      nameAr: shift.nameAr,
      nameEn: shift.nameEn,
      startMin: shift.startMin,
      endMin: shift.endMin,
      sortOrder: shift.sortOrder,
      capacity: null,
      active: true,
    })),
  });
  return tx.shift.findMany({ where: { businessId }, orderBy: { sortOrder: "asc" } });
}

async function attachExistingRows(tx: Tx, artist: Artist, businessId: string, memberId: string) {
  await tx.weeklyHour.updateMany({ where: { artistId: artist.id, businessId: null }, data: { businessId } });
  await tx.blockedDate.updateMany({ where: { artistId: artist.id, businessId: null }, data: { businessId } });
  await tx.service.updateMany({ where: { artistId: artist.id, businessId: null }, data: { businessId } });
  await tx.booking.updateMany({ where: { artistId: artist.id, businessId: null }, data: { businessId } });
  await tx.platformFee.updateMany({ where: { artistId: artist.id, businessId: null }, data: { businessId } });

  const services = await tx.service.findMany({ where: { businessId } });
  for (const service of services) {
    const assigned = await tx.teamMemberService.count({ where: { serviceId: service.id } });
    if (assigned > 0) continue;
    await tx.teamMemberService.upsert({
      where: { teamMemberId_serviceId: { teamMemberId: memberId, serviceId: service.id } },
      update: {},
      create: { teamMemberId: memberId, serviceId: service.id },
    });
  }

  const shifts = await tx.shift.findMany({ where: { businessId, active: true } });
  const bookings = await tx.booking.findMany({
    where: { businessId },
    include: { items: true, assignments: true, capacityHolds: true },
  });
  const member = await tx.teamMember.findUnique({ where: { id: memberId } });
  for (const booking of bookings) {
    if (!booking.assignments.length) {
      const serviceIds = booking.items.length ? booking.items.map((item) => item.serviceId) : [booking.serviceId];
      for (const serviceId of serviceIds) {
        await tx.bookingAssignment.upsert({
          where: { bookingId_serviceId: { bookingId: booking.id, serviceId } },
          update: {},
          create: { bookingId: booking.id, teamMemberId: memberId, serviceId },
        });
      }
    }
    const covering = shifts.filter((shift) => booking.startMin >= shift.startMin && booking.startMin < shift.endMin);
    const shiftId = covering[0]?.id || shifts[0]?.id || null;
    if (!booking.shiftId && shiftId && booking.scheduleMode !== "HOURLY") {
      await tx.booking.update({ where: { id: booking.id }, data: { shiftId } });
    }
    if (
      member &&
      (BLOCKING_STATUSES as readonly string[]).includes(booking.status) &&
      booking.capacityHolds.length === 0
    ) {
      try {
        await claimCapacitySeats(tx, {
          date: booking.date,
          shiftId,
          bookingId: booking.id,
          memberIds: [memberId],
          members: [{ id: member.id, dailyCapacity: member.dailyCapacity }],
          shiftCapacity: covering[0]?.capacity ?? shifts[0]?.capacity ?? null,
        });
      } catch (error) {
        if (!(error instanceof CapacityFullError)) throw error;
      }
    }
  }
}

export async function createOwnedBusiness(tx: Tx, artist: Artist, input?: { name?: string; businessType?: string; slug?: string }) {
  const slug = await uniqueBusinessSlug(tx, input?.slug || artist.slug, artist.id);
  const business = await tx.business.create({
    data: {
      ownerId: artist.id,
      name: input?.name?.trim() || artist.name,
      slug,
      businessType: input?.businessType === "salon" ? "salon" : "independent",
      scheduleMode: "SHIFT",
      assignmentMode: "AUTO",
      neighborhood: artist.neighborhood,
      city: artist.city,
      phone: artist.phone,
      bio: artist.bio,
      bookingHorizonDays: artist.bookingHorizonDays,
      minNoticeHours: artist.minNoticeHours,
    },
  });
  const member = await tx.teamMember.create({
    data: {
      businessId: business.id,
      artistId: artist.id,
      name: artist.name,
      phone: artist.phone,
      roles: rolesFromSpecialty(artist.specialty),
      dailyCapacity: DEFAULT_DAILY_CAPACITY,
      status: "ACTIVE",
    },
  });
  await syncShiftsFromHours(tx, artist, business.id);
  await attachExistingRows(tx, artist, business.id, member.id);
  return business.id;
}

async function loadWorkspaceByMember(tx: Tx, artist: Artist, memberId: string): Promise<Workspace> {
  const member = await tx.teamMember.findUnique({ where: { id: memberId } });
  if (!member || member.status !== "ACTIVE") throw new WorkspaceError("UNAUTHORIZED", 401);
  const business = await tx.business.findUniqueOrThrow({
    where: { id: member.businessId },
    include: businessInclude,
  });
  const hydrated = business.members.find((row) => row.id === member.id);
  if (!hydrated) throw new WorkspaceError("UNAUTHORIZED", 401);
  return {
    artist,
    business,
    member: hydrated,
    permissions: permissionsFor(parseRoles(hydrated.roles)),
  };
}

export async function ensureWorkspace(artist: Artist, tx: Tx = db): Promise<Workspace> {
  const owned = await tx.business.findFirst({ where: { ownerId: artist.id }, orderBy: { createdAt: "asc" } });
  if (owned) {
    const member = await tx.teamMember.findFirst({
      where: { businessId: owned.id, artistId: artist.id, status: "ACTIVE" },
    });
    if (!member) {
      const created = await tx.teamMember.create({
        data: {
          businessId: owned.id,
          artistId: artist.id,
          name: artist.name,
          phone: artist.phone,
          roles: rolesFromSpecialty(artist.specialty),
          dailyCapacity: defaultCapacityForRoles(rolesFromSpecialty(artist.specialty)),
          status: "ACTIVE",
        },
      });
      await attachExistingRows(tx, artist, owned.id, created.id);
      await syncShiftsFromHours(tx, artist, owned.id);
      return loadWorkspaceByMember(tx, artist, created.id);
    }
    await syncShiftsFromHours(tx, artist, owned.id);
    await attachExistingRows(tx, artist, owned.id, member.id);
    return loadWorkspaceByMember(tx, artist, member.id);
  }

  const invited = await tx.teamMember.findFirst({
    where: {
      status: "ACTIVE",
      OR: [{ artistId: artist.id }, { phone: artist.phone, artistId: null }],
    },
    orderBy: { createdAt: "asc" },
  });
  if (invited) {
    if (!invited.artistId) {
      await tx.teamMember.update({
        where: { id: invited.id },
        data: { artistId: artist.id, name: invited.name || artist.name, phone: artist.phone },
      });
    }
    return loadWorkspaceByMember(tx, artist, invited.id);
  }

  const businessId = await createOwnedBusiness(tx, artist);
  const member = await tx.teamMember.findFirstOrThrow({
    where: { businessId, artistId: artist.id },
  });
  return loadWorkspaceByMember(tx, artist, member.id);
}

export async function requireWorkspace(artist: Artist) {
  return ensureWorkspace(artist);
}

export function requirePermission(workspace: Workspace, key: keyof StudioPermissions) {
  if (!workspace.permissions[key]) {
    throw new WorkspaceError("FORBIDDEN", 403);
  }
}

export async function migrateAllArtists(tx: Tx = db) {
  const artists = await tx.artist.findMany();
  for (const artist of artists) {
    await ensureWorkspace(artist, tx);
  }
}

export async function findBusinessBySlug(slug: string, tx: Tx = db) {
  const direct = await tx.business.findUnique({
    where: { slug },
    include: businessInclude,
  });
  if (direct) return direct;
  const artist = await tx.artist.findUnique({ where: { slug } });
  if (!artist) return null;
  const owned = await tx.business.findFirst({ where: { ownerId: artist.id } });
  if (!owned && !artist.onboardingComplete) return null;
  const workspace = await ensureWorkspace(artist, tx);
  if (workspace.business.ownerId !== artist.id) return null;
  return workspace.business;
}

export function activeMembers(business: LoadedBusiness) {
  return business.members.filter((member) => member.status === "ACTIVE");
}

export function memberCanPerform(member: LoadedBusiness["members"][number], serviceId: string, kind?: string) {
  if (kind) return memberMatchesServiceKind(parseRoles(member.roles), kind);
  return member.services.some((row) => row.serviceId === serviceId);
}

export async function syncServiceStaffByRole(tx: Tx, businessId: string) {
  const [members, services] = await Promise.all([
    tx.teamMember.findMany({ where: { businessId, status: "ACTIVE" } }),
    tx.service.findMany({ where: { businessId }, include: { staff: true } }),
  ]);
  for (const service of services) {
    const eligibleIds = new Set(
      members.filter((member) => memberMatchesServiceKind(parseRoles(member.roles), service.kind)).map((member) => member.id),
    );
    const currentIds = new Set(service.staff.map((row) => row.teamMemberId));
    const toAdd = [...eligibleIds].filter((id) => !currentIds.has(id));
    const toRemove = [...currentIds].filter((id) => !eligibleIds.has(id));
    if (toRemove.length) {
      await tx.teamMemberService.deleteMany({
        where: { serviceId: service.id, teamMemberId: { in: toRemove } },
      });
    }
    if (toAdd.length) {
      await tx.teamMemberService.createMany({
        data: toAdd.map((teamMemberId) => ({ teamMemberId, serviceId: service.id })),
      });
    }
  }
}

export { isTeamBusiness } from "./roles";

export async function promoteToSalonIfTeam(tx: Tx, businessId: string) {
  const business = await tx.business.findUniqueOrThrow({
    where: { id: businessId },
    select: { businessType: true },
  });
  if (business.businessType === "salon") return;
  const activeCount = await tx.teamMember.count({
    where: { businessId, status: "ACTIVE" },
  });
  if (activeCount > 1) {
    await tx.business.update({
      where: { id: businessId },
      data: { businessType: "salon" },
    });
  }
}

export function bookingScopeWhere(workspace: Workspace): Prisma.BookingWhereInput {
  if (workspace.permissions.canManageBusiness) {
    return { businessId: workspace.business.id };
  }
  return {
    businessId: workspace.business.id,
    assignments: { some: { teamMemberId: workspace.member.id } },
  };
}
