import type { Prisma } from "@prisma/client";
import { BLOCKING_STATUSES, DAY_BUCKET } from "./constants";
import { db } from "./db";
import { isUniqueConstraint } from "./booking-errors";
import { memberMatchesServiceKind, parseRoles } from "./roles";

export type CapacityMember = {
  id: string;
  name: string;
  status: string;
  roles?: string;
  dailyCapacity: number;
  services: Array<{ serviceId: string }>;
};

export type CapacityBusiness = {
  members: CapacityMember[];
  shifts: Array<{ id: string; active: boolean; capacity: number | null }>;
  services?: Array<{ id: string; kind: string }>;
};

export function activeMembers(business: CapacityBusiness) {
  return business.members.filter((member) => member.status === "ACTIVE");
}

export function memberCanPerform(member: CapacityMember, serviceId: string, kind?: string) {
  if (kind) return memberMatchesServiceKind(parseRoles(member.roles), kind);
  return member.services.some((row) => row.serviceId === serviceId);
}

type Tx = Prisma.TransactionClient | typeof db;

export class CapacityFullError extends Error {
  constructor(message = "CAPACITY_FULL") {
    super(message);
    this.name = "CapacityFullError";
  }
}

export class PreferredUnavailableError extends Error {
  constructor() {
    super("PREFERRED_UNAVAILABLE");
    this.name = "PreferredUnavailableError";
  }
}

export type StaffSnapshot = {
  id: string;
  name: string;
  dailyCapacity: number;
  shiftCapacity: number | null;
  serviceIds: string[];
  remainingDay: number;
  remainingShift: number;
};

export function remainingOf(staff: StaffSnapshot) {
  return Math.max(0, Math.min(staff.remainingDay, staff.remainingShift));
}

export async function usedSeats(
  tx: Tx,
  args: { teamMemberId: string; date: string; bucket: string },
) {
  return tx.capacityHold.count({
    where: { teamMemberId: args.teamMemberId, date: args.date, bucket: args.bucket },
  });
}

export async function staffSnapshots(
  tx: Tx,
  business: CapacityBusiness,
  date: string,
  shiftId: string | null,
): Promise<StaffSnapshot[]> {
  const shift = shiftId ? business.shifts.find((row) => row.id === shiftId && row.active) : null;
  const members = activeMembers(business);
  const rows: StaffSnapshot[] = [];
  for (const member of members) {
    const usedDay = await usedSeats(tx, { teamMemberId: member.id, date, bucket: DAY_BUCKET });
    const usedShift = shift
      ? await usedSeats(tx, { teamMemberId: member.id, date, bucket: shift.id })
      : 0;
    const shiftCap = shift?.capacity ?? member.dailyCapacity;
    rows.push({
      id: member.id,
      name: member.name,
      dailyCapacity: member.dailyCapacity,
      shiftCapacity: shift?.capacity ?? null,
      serviceIds: member.services.map((row) => row.serviceId),
      remainingDay: Math.max(0, member.dailyCapacity - usedDay),
      remainingShift: Math.max(0, shiftCap - usedShift),
    });
  }
  return rows;
}

export async function claimCapacitySeats(
  tx: Tx,
  args: {
    date: string;
    shiftId: string | null;
    bookingId: string;
    memberIds: string[];
    members: Array<{ id: string; dailyCapacity: number }>;
    shiftCapacity: number | null;
  },
) {
  const uniqueIds = [...new Set(args.memberIds)];
  for (const memberId of uniqueIds) {
    const member = args.members.find((row) => row.id === memberId);
    if (!member) throw new CapacityFullError();
    await claimBucket(tx, {
      teamMemberId: memberId,
      date: args.date,
      bucket: DAY_BUCKET,
      capacity: member.dailyCapacity,
      bookingId: args.bookingId,
    });
    if (args.shiftId) {
      await claimBucket(tx, {
        teamMemberId: memberId,
        date: args.date,
        bucket: args.shiftId,
        capacity: args.shiftCapacity ?? member.dailyCapacity,
        bookingId: args.bookingId,
      });
    }
  }
}

async function claimBucket(
  tx: Tx,
  args: { teamMemberId: string; date: string; bucket: string; capacity: number; bookingId: string },
) {
  if (args.capacity <= 0) throw new CapacityFullError();
  const existing = await tx.capacityHold.findMany({
    where: { teamMemberId: args.teamMemberId, date: args.date, bucket: args.bucket },
    select: { seat: true },
  });
  const taken = new Set(existing.map((row) => row.seat));
  for (let seat = 0; seat < args.capacity; seat += 1) {
    if (taken.has(seat)) continue;
    try {
      await tx.capacityHold.create({
        data: {
          teamMemberId: args.teamMemberId,
          date: args.date,
          bucket: args.bucket,
          seat,
          bookingId: args.bookingId,
        },
      });
      return;
    } catch (error) {
      if (isUniqueConstraint(error)) continue;
      throw error;
    }
  }
  throw new CapacityFullError();
}

export async function releaseCapacityHolds(tx: Tx, bookingId: string) {
  await tx.capacityHold.deleteMany({ where: { bookingId } });
}

export type ServiceAssignment = { serviceId: string; teamMemberId: string };

function sanitizePreferredByService(raw: Record<string, string> | null | undefined, serviceIds: string[]) {
  const map: Record<string, string> = {};
  if (!raw) return map;
  for (const serviceId of serviceIds) {
    const memberId = raw[serviceId]?.trim();
    if (memberId) map[serviceId] = memberId;
  }
  return map;
}

export function assignStaff(args: {
  serviceIds: string[];
  staff: StaffSnapshot[];
  preferredMemberId?: string | null;
  preferredByService?: Record<string, string> | null;
  business: CapacityBusiness;
}): ServiceAssignment[] {
  const remaining = new Map(args.staff.map((row) => [row.id, remainingOf(row)]));
  const assignedThisBooking = new Set<string>();
  const result: ServiceAssignment[] = [];

  const kindOf = (serviceId: string) => args.business.services?.find((row) => row.id === serviceId)?.kind;

  const capable = (serviceId: string) =>
    args.staff.filter((row) => {
      const member = args.business.members.find((item) => item.id === row.id);
      return member && memberCanPerform(member, serviceId, kindOf(serviceId));
    });

  function takeMember(memberId: string, serviceId: string) {
    if (!assignedThisBooking.has(memberId)) {
      const left = remaining.get(memberId) ?? 0;
      if (left < 1) throw new CapacityFullError();
      remaining.set(memberId, left - 1);
      assignedThisBooking.add(memberId);
    }
    result.push({ serviceId, teamMemberId: memberId });
  }

  const preferredMap = sanitizePreferredByService(args.preferredByService, args.serviceIds);
  const preferred = args.preferredMemberId
    ? args.staff.find((row) => row.id === args.preferredMemberId)
    : null;
  if (args.preferredMemberId && !preferred) throw new PreferredUnavailableError();
  if (preferred) {
    for (const serviceId of args.serviceIds) {
      const member = args.business.members.find((item) => item.id === preferred.id);
      if (!preferredMap[serviceId] && member && memberCanPerform(member, serviceId, kindOf(serviceId))) {
        preferredMap[serviceId] = preferred.id;
      }
    }
  }

  const leftover: string[] = [];
  for (const serviceId of args.serviceIds) {
    const preferredId = preferredMap[serviceId];
    if (!preferredId) {
      leftover.push(serviceId);
      continue;
    }
    const snapshot = args.staff.find((row) => row.id === preferredId);
    const bizMember = args.business.members.find((item) => item.id === preferredId);
    if (!snapshot || !bizMember || !memberCanPerform(bizMember, serviceId, kindOf(serviceId))) {
      throw new PreferredUnavailableError();
    }
    if (remainingOf(snapshot) < 1 && !assignedThisBooking.has(snapshot.id)) {
      throw new PreferredUnavailableError();
    }
    try {
      takeMember(snapshot.id, serviceId);
    } catch (error) {
      if (error instanceof CapacityFullError) throw new PreferredUnavailableError();
      throw error;
    }
  }

  for (const serviceId of leftover) {
    const options = capable(serviceId);
    if (!options.length) throw new CapacityFullError("NO_STAFF");
    const ranked = [...options].sort((a, b) => {
      const ra = assignedThisBooking.has(a.id) ? 999 : remaining.get(a.id) ?? 0;
      const rb = assignedThisBooking.has(b.id) ? 999 : remaining.get(b.id) ?? 0;
      return rb - ra || a.name.localeCompare(b.name);
    });
    const pick = ranked.find((row) => assignedThisBooking.has(row.id) || (remaining.get(row.id) ?? 0) > 0);
    if (!pick) throw new CapacityFullError();
    takeMember(pick.id, serviceId);
  }

  return result;
}

export function remainingBookingsForServices(
  business: CapacityBusiness,
  staff: StaffSnapshot[],
  serviceIds: string[],
) {
  let count = 0;
  const clone: StaffSnapshot[] = staff.map((row) => ({ ...row }));
  for (let i = 0; i < 40; i += 1) {
    try {
      const assigned = assignStaff({ serviceIds, staff: clone, business });
      const used = new Set(assigned.map((row) => row.teamMemberId));
      for (const id of used) {
        const row = clone.find((item) => item.id === id);
        if (!row) continue;
        row.remainingDay = Math.max(0, row.remainingDay - 1);
        row.remainingShift = Math.max(0, row.remainingShift - 1);
      }
      count += 1;
    } catch {
      break;
    }
  }
  return count;
}

export function blockingWhere(date: string): Prisma.BookingWhereInput {
  return { date, status: { in: [...BLOCKING_STATUSES] } };
}
