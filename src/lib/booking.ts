import { randomInt } from "crypto";
import { Prisma } from "@prisma/client";
import { BLOCKING_STATUSES, BOOKING_REQUEST_TIMEOUT_MINUTES, PLATFORM_FEE_LYD } from "./constants";
import { db } from "./db";
import { assertCanCreateBooking, attachFeeToInvoice } from "./fees";
import { occupySlotStarts } from "./slots";
import { todayISO } from "./utils";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class SlotTakenError extends Error {
  constructor() {
    super("UNAVAILABLE");
    this.name = "SlotTakenError";
  }
}

export function randomTrackCode() {
  let code = "BR";
  for (let i = 0; i < 10; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

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

type Tx = Prisma.TransactionClient | typeof db;

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

export function isUniqueConstraint(error: unknown, field?: string) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") return false;
  if (!field) return true;
  const target = error.meta?.target;
  if (Array.isArray(target)) return target.some((item) => String(item).includes(field));
  return String(target || "").includes(field);
}

export const bookingTxOptions = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  timeout: 15000,
  maxWait: 10000,
} as const;

export async function expireOverdue(tx: Tx, artistId?: string) {
  const today = todayISO();
  const now = new Date();
  const nowMin = nowMinutesTripoli();
  const pending = await tx.booking.findMany({
    where: {
      status: "PENDING",
      ...(artistId ? { artistId } : {}),
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
  const booking = await tx.booking.create({ data, include: { items: true, service: true } });
  if (await hasOverlap(tx, { ...slot, excludeId: booking.id })) {
    await tx.booking.delete({ where: { id: booking.id } });
    throw new SlotTakenError();
  }
  await claimSlotHolds(tx, { ...slot, bookingId: booking.id });
  return booking;
}

export async function chargeBrideyFee(tx: Tx, booking: { id: string; artistId: string; origin: string }) {
  if (booking.origin !== "public") return null;
  const existing = await tx.platformFee.findUnique({ where: { bookingId: booking.id } });
  if (existing) return existing;
  try {
    const fee = await tx.platformFee.create({
      data: {
        artistId: booking.artistId,
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
  } catch {
    return tx.platformFee.findUnique({ where: { bookingId: booking.id } });
  }
}

export const STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "DECLINED", "CANCELLED", "EXPIRED"],
  CONFIRMED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
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
