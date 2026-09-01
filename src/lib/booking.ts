import { randomInt } from "crypto";
import { Prisma } from "@prisma/client";
import { CapacityFullError, assignStaff, claimCapacitySeats, releaseCapacityHolds, staffSnapshots, type ServiceAssignment } from "./capacity";
import { SlotTakenError, isRetryableTxError, isUniqueConstraint } from "./booking-errors";
import { NotesContactError, notesContainContact } from "./booking-privacy";
import { uniquePassToken } from "./bridey-pass";
import { BLOCKING_STATUSES, BOOKING_REQUEST_TIMEOUT_MINUTES, PLATFORM_FEE_LYD } from "./constants";
import { db } from "./db";
import { assertCanCreateBooking, attachFeeToInvoice } from "./fees";
import { occupySlotStarts } from "./slots";
import { todayISO, weekdayOf } from "./utils";
import { lockBusiness, lockTeamMembers, loadBusiness, type LoadedBusiness } from "./workspace";

export { SlotTakenError, isRetryableTxError, isUniqueConstraint } from "./booking-errors";
export { CapacityFullError, PreferredUnavailableError } from "./capacity";
export { NotesContactError } from "./booking-privacy";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomTrackCode() {
  let code = "BR";
  for (let i = 0; i < 10; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

type Tx = Prisma.TransactionClient | typeof db;

export async function uniqueTrackCode(tx: Tx = db) {
  for (let i = 0; i < 16; i += 1) {
    const code = randomTrackCode();
    const exists = await tx.booking.findUnique({ where: { trackCode: code } });
    if (!exists) return code;
  }
  return `BR${Date.now().toString(36).toUpperCase()}${randomInt(36).toString(36).toUpperCase()}`;
}

export function normalizeTrackCode(raw: string) {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && aEnd > bStart;
}

export function nowMinutesTripoli() {
  const tripoli = new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Tripoli" }));
  return tripoli.getHours() * 60 + tripoli.getMinutes();
}

export function holdExpiresAt(from = new Date()) {
  return new Date(from.getTime() + BOOKING_REQUEST_TIMEOUT_MINUTES * 60 * 1000);
}

export const bookingTxOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  timeout: 15000,
  maxWait: 10000,
} as const;

const BOOKING_TX_ATTEMPTS = 4;

export async function runBookingTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < BOOKING_TX_ATTEMPTS; attempt += 1) {
    try {
      return await db.$transaction(fn, bookingTxOptions);
    } catch (error) {
      last = error;
      if (!isRetryableTxError(error) || attempt === BOOKING_TX_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1) * (attempt + 1)));
    }
  }
  throw last;
}

export async function expireOverdue(tx: Tx, artistId?: string) {
  const today = todayISO();
  const now = new Date();
  const nowMin = nowMinutesTripoli();
  const owned = artistId ? await tx.business.findFirst({ where: { ownerId: artistId }, select: { id: true } }) : null;
  const pending = await tx.booking.findMany({
    where: {
      status: "PENDING",
      ...(artistId || owned
        ? {
            OR: [artistId ? { artistId } : undefined, owned ? { businessId: owned.id } : undefined].filter(
              Boolean,
            ) as Prisma.BookingWhereInput[],
          }
        : {}),
      OR: [{ expiresAt: { lte: now } }, { date: { lte: today } }],
    },
    select: { id: true, date: true, endMin: true, expiresAt: true },
  });
  const ids = pending
    .filter((b) => {
      if (b.expiresAt && b.expiresAt <= now) return true;
      return b.date < today || (b.date === today && b.endMin <= nowMin);
    })
    .map((b) => b.id);
  if (!ids.length) return ids;
  await tx.slotHold.deleteMany({ where: { bookingId: { in: ids } } });
  await tx.capacityHold.deleteMany({ where: { bookingId: { in: ids } } });
  await tx.booking.updateMany({ where: { id: { in: ids } }, data: { status: "EXPIRED" } });
  return ids;
}

export async function lockArtistSchedule(tx: Tx, artistId: string) {
  await tx.artist.update({
    where: { id: artistId },
    data: { updatedAt: new Date() },
  });
}

export async function releaseSlotHolds(tx: Tx, bookingId: string) {
  await tx.slotHold.deleteMany({ where: { bookingId } });
}

export async function releaseBookingHolds(tx: Tx, bookingId: string) {
  await releaseSlotHolds(tx, bookingId);
  await releaseCapacityHolds(tx, bookingId);
}

export async function claimSlotHolds(
  tx: Tx,
  args: { artistId: string; date: string; startMin: number; endMin: number; bookingId: string },
) {
  const starts = occupySlotStarts(args.startMin, args.endMin);
  if (!starts.length) throw new SlotTakenError();
  try {
    await tx.slotHold.createMany({
      data: starts.map((startMin) => ({
        artistId: args.artistId,
        date: args.date,
        startMin,
        bookingId: args.bookingId,
      })),
    });
  } catch (error) {
    if (isUniqueConstraint(error)) throw new SlotTakenError();
    throw error;
  }
}

export async function hasOverlap(
  tx: Tx,
  args: { artistId: string; date: string; startMin: number; endMin: number; excludeId?: string },
) {
  const now = new Date();
  const rows = await tx.booking.findMany({
    where: {
      artistId: args.artistId,
      date: args.date,
      scheduleMode: "HOURLY",
      status: { in: [...BLOCKING_STATUSES] },
      ...(args.excludeId ? { NOT: { id: args.excludeId } } : {}),
    },
    select: { startMin: true, endMin: true, status: true, expiresAt: true },
  });
  return rows.some((row) => {
    if (row.status === "PENDING" && row.expiresAt && row.expiresAt <= now) return false;
    return rangesOverlap(args.startMin, args.endMin, row.startMin, row.endMin);
  });
}

export async function createGuardedBooking(
  tx: Tx,
  data: Prisma.BookingCreateInput,
  slot: { artistId: string; date: string; startMin: number; endMin: number },
) {
  await lockArtistSchedule(tx, slot.artistId);
  await assertCanCreateBooking(slot.artistId, tx);
  await expireOverdue(tx, slot.artistId);
  await backfillSlotHolds(tx, slot.artistId);
  if (await hasOverlap(tx, slot)) throw new SlotTakenError();
  const booking = await tx.booking.create({
    data: { ...data, scheduleMode: data.scheduleMode || "HOURLY" },
    include: { items: true, service: true },
  });
  if (await hasOverlap(tx, { ...slot, excludeId: booking.id })) {
    await tx.booking.delete({ where: { id: booking.id } });
    throw new SlotTakenError();
  }
  await claimSlotHolds(tx, { ...slot, bookingId: booking.id });
  return booking;
}

export async function chargeBrideyFee(
  tx: Tx,
  booking: { id: string; artistId: string; origin: string; businessId?: string | null },
) {
  if (booking.origin !== "public") return null;
  const existing = await tx.platformFee.findUnique({ where: { bookingId: booking.id } });
  if (existing) return existing;
  try {
    const fee = await tx.platformFee.create({
      data: {
        artistId: booking.artistId,
        businessId: booking.businessId || undefined,
        bookingId: booking.id,
        amountLyd: PLATFORM_FEE_LYD,
        status: "UNPAID",
      },
    });
    await tx.booking.update({
      where: { id: booking.id },
      data: { platformFeeLyd: PLATFORM_FEE_LYD, feeStatus: "UNPAID" },
    });
    await attachFeeToInvoice(booking.artistId, fee.id, tx);
    return fee;
  } catch (error) {
    if (isUniqueConstraint(error, "bookingId")) {
      return tx.platformFee.findUnique({ where: { bookingId: booking.id } });
    }
    throw error;
  }
}

export const STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "DECLINED", "CANCELLED", "EXPIRED"],
  CONFIRMED: ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
  CHECKED_IN: ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  DECLINED: [],
  CANCELLED: [],
  NO_SHOW: [],
  EXPIRED: [],
};

export const TERMINAL_STATUSES = ["DECLINED", "CANCELLED", "EXPIRED", "COMPLETED", "NO_SHOW"] as const;

export async function backfillSlotHolds(tx: Tx = db, artistId?: string) {
  const active = await tx.booking.findMany({
    where: {
      status: { in: [...BLOCKING_STATUSES] },
      scheduleMode: "HOURLY",
      ...(artistId ? { artistId } : {}),
      holds: { none: {} },
    },
    select: { id: true, artistId: true, date: true, startMin: true, endMin: true, status: true, expiresAt: true },
  });
  const now = new Date();
  let created = 0;
  for (const booking of active) {
    if (booking.status === "PENDING" && booking.expiresAt && booking.expiresAt <= now) continue;
    try {
      await claimSlotHolds(tx, {
        artistId: booking.artistId,
        date: booking.date,
        startMin: booking.startMin,
        endMin: booking.endMin,
        bookingId: booking.id,
      });
      created += 1;
    } catch (error) {
      if (error instanceof SlotTakenError) continue;
      throw error;
    }
  }
  return created;
}

function resolveWindow(
  business: LoadedBusiness,
  date: string,
  shiftId: string | null | undefined,
  startMin: number | undefined,
  endMin: number | undefined,
) {
  const mode = business.scheduleMode === "HOURLY" ? "HOURLY" : business.scheduleMode === "DAY" ? "DAY" : "SHIFT";
  const dayHours = business.hours.find((row) => row.dayOfWeek === weekdayOf(date));
  if (!dayHours && mode !== "HOURLY") throw new CapacityFullError("CLOSED");

  if (mode === "HOURLY") {
    if (startMin == null || endMin == null || endMin <= startMin) throw new CapacityFullError("UNAVAILABLE");
    return { mode, shiftId: null as string | null, startMin, endMin };
  }

  if (mode === "DAY") {
    const start = dayHours?.startMin ?? 10 * 60;
    const end = dayHours?.endMin ?? 20 * 60;
    return { mode, shiftId: null as string | null, startMin: start, endMin: end };
  }

  const shift = shiftId
    ? business.shifts.find((row) => row.id === shiftId && row.active)
    : business.shifts.find((row) => row.active);
  if (!shift) throw new CapacityFullError("UNAVAILABLE");
  return { mode, shiftId: shift.id, startMin: shift.startMin, endMin: shift.endMin };
}

export async function createBusinessBooking(
  tx: Tx,
  args: {
    business: LoadedBusiness;
    services: Array<{ id: string; nameAr: string; nameEn: string; durationMin: number; priceLyd: number }>;
    date: string;
    shiftId?: string | null;
    startMin?: number;
    endMin?: number;
    preferredMemberId?: string | null;
    preferredByService?: Record<string, string> | null;
    assignments?: ServiceAssignment[];
    brideName: string;
    bridePhone: string;
    notes?: string;
    artistNotes?: string;
    origin: string;
    source: string;
    status: string;
    expiresAt?: Date | null;
    requestId?: string;
    trackCode?: string | null;
  },
) {
  if (args.origin === "public" && notesContainContact(args.notes || "")) {
    throw new NotesContactError();
  }
  await lockBusiness(tx, args.business.id);
  await lockArtistSchedule(tx, args.business.ownerId);
  await assertCanCreateBooking(args.business.ownerId, tx);
  await expireOverdue(tx, args.business.ownerId);
  const business = await loadBusiness(tx, args.business.id);

  if (business.blocked.some((row) => row.date === args.date)) throw new CapacityFullError("UNAVAILABLE");
  const openDay = business.hours.some((row) => row.dayOfWeek === weekdayOf(args.date));
  if (!openDay && business.scheduleMode !== "HOURLY") throw new CapacityFullError("UNAVAILABLE");

  const window = resolveWindow(business, args.date, args.shiftId, args.startMin, args.endMin);
  const staff = await staffSnapshots(tx, business, args.date, window.shiftId);
  const serviceIds = args.services.map((service) => service.id);
  const assignments =
    args.assignments?.length
      ? args.assignments
      : assignStaff({
          serviceIds,
          staff,
          preferredMemberId: args.preferredMemberId,
          preferredByService: args.preferredByService,
          business,
        });

  const memberIds = [...new Set(assignments.map((row) => row.teamMemberId))];
  await lockTeamMembers(tx, memberIds);

  const shift = window.shiftId ? business.shifts.find((row) => row.id === window.shiftId) : null;
  const booking = await tx.booking.create({
    data: {
      artist: { connect: { id: business.ownerId } },
      business: { connect: { id: business.id } },
      service: { connect: { id: args.services[0].id } },
      ...(window.shiftId ? { shift: { connect: { id: window.shiftId } } } : {}),
      scheduleMode: window.mode,
      trackCode: args.trackCode,
      origin: args.origin,
      source: args.source,
      brideName: args.brideName,
      bridePhone: args.bridePhone,
      notes: args.notes || "",
      artistNotes: args.artistNotes || "",
      date: args.date,
      startMin: window.startMin,
      endMin: window.endMin,
      status: args.status,
      confirmedAt: args.status === "CONFIRMED" ? new Date() : undefined,
      expiresAt: args.expiresAt,
      requestId: args.requestId,
      brideyPassToken: args.status === "CONFIRMED" ? await uniquePassToken(tx) : undefined,
      items: {
        create: args.services.map((service) => ({
          serviceId: service.id,
          teamMemberId: assignments.find((row) => row.serviceId === service.id)?.teamMemberId,
          nameAr: service.nameAr,
          nameEn: service.nameEn,
          durationMin: service.durationMin,
          priceLyd: service.priceLyd,
        })),
      },
      assignments: {
        create: assignments.map((row) => ({
          teamMemberId: row.teamMemberId,
          serviceId: row.serviceId,
        })),
      },
    },
    include: { items: true, service: true, assignments: true, shift: true },
  });

  try {
    await claimCapacitySeats(tx, {
      date: args.date,
      shiftId: window.shiftId,
      bookingId: booking.id,
      memberIds,
      members: business.members.map((member) => ({ id: member.id, dailyCapacity: member.dailyCapacity })),
      shiftCapacity: shift?.capacity ?? null,
    });
  } catch (error) {
    await tx.booking.delete({ where: { id: booking.id } });
    if (error instanceof CapacityFullError) throw error;
    if (isUniqueConstraint(error)) throw new CapacityFullError();
    throw error;
  }

  if (window.mode === "HOURLY") {
    try {
      await claimSlotHolds(tx, {
        artistId: business.ownerId,
        date: args.date,
        startMin: window.startMin,
        endMin: window.endMin,
        bookingId: booking.id,
      });
    } catch (error) {
      await tx.booking.delete({ where: { id: booking.id } });
      throw error instanceof SlotTakenError ? error : new SlotTakenError();
    }
  }

  return booking;
}

export async function reassignBooking(
  tx: Tx,
  args: {
    bookingId: string;
    business: LoadedBusiness;
    assignments: ServiceAssignment[];
  },
) {
  const booking = await tx.booking.findFirst({ where: { id: args.bookingId, businessId: args.business.id } });
  if (!booking) throw new Error("NOT_FOUND");
  if (!["PENDING", "CONFIRMED"].includes(booking.status)) throw new CapacityFullError("UNAVAILABLE");
  await lockBusiness(tx, args.business.id);
  const memberIds = [...new Set(args.assignments.map((row) => row.teamMemberId))];
  await lockTeamMembers(tx, memberIds);
  await releaseCapacityHolds(tx, booking.id);
  await tx.bookingAssignment.deleteMany({ where: { bookingId: booking.id } });
  await tx.bookingAssignment.createMany({
    data: args.assignments.map((row) => ({
      bookingId: booking.id,
      teamMemberId: row.teamMemberId,
      serviceId: row.serviceId,
    })),
  });
  for (const row of args.assignments) {
    await tx.bookingItem.updateMany({
      where: { bookingId: booking.id, serviceId: row.serviceId },
      data: { teamMemberId: row.teamMemberId },
    });
  }
  const shift = booking.shiftId ? args.business.shifts.find((row) => row.id === booking.shiftId) : null;
  await claimCapacitySeats(tx, {
    date: booking.date,
    shiftId: booking.scheduleMode === "SHIFT" ? booking.shiftId : null,
    bookingId: booking.id,
    memberIds,
    members: args.business.members.map((member) => ({ id: member.id, dailyCapacity: member.dailyCapacity })),
    shiftCapacity: shift?.capacity ?? null,
  });
  return tx.booking.findFirstOrThrow({
    where: { id: booking.id },
    include: { items: true, service: true, assignments: true, shift: true, fee: true },
  });
}
