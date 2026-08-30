import { SLOT_STEP_MIN } from "./constants";
import { weekdayOf } from "./utils";

type Hour = { dayOfWeek: number; startMin: number; endMin: number };
export type BusySlot = {
  startMin: number;
  endMin: number;
  status: string;
  expiresAt?: Date | string | null;
};

export function occupySlotStarts(startMin: number, endMin: number) {
  const starts: number[] = [];
  const first = Math.floor(startMin / SLOT_STEP_MIN) * SLOT_STEP_MIN;
  for (let t = first; t < endMin; t += SLOT_STEP_MIN) {
    if (t < endMin && t + SLOT_STEP_MIN > startMin) starts.push(t);
  }
  return starts;
}

export function holdIsActive(booking: BusySlot, now = new Date()) {
  if (booking.status === "CONFIRMED") return true;
  if (booking.status !== "PENDING") return false;
  if (!booking.expiresAt) return true;
  return new Date(booking.expiresAt).getTime() > now.getTime();
}

export function generateSlotStates(
  date: string,
  durationMin: number,
  hours: Hour[],
  bookings: BusySlot[],
  blockedDates: string[],
  minStartMin = 0,
  now = new Date(),
) {
  if (durationMin <= 0) return { available: [] as number[], held: [] as number[] };
  if (blockedDates.includes(date)) return { available: [], held: [] };
  const day = weekdayOf(date);
  const window = hours.find((h) => h.dayOfWeek === day);
  if (!window) return { available: [], held: [] };

  const occupying = bookings.filter((b) => holdIsActive(b, now));
  const available: number[] = [];
  const held: number[] = [];

  for (let start = window.startMin; start + durationMin <= window.endMin; start += SLOT_STEP_MIN) {
    if (start < minStartMin) continue;
    const end = start + durationMin;
    const clashes = occupying.filter((b) => start < b.endMin && end > b.startMin);
    if (!clashes.length) {
      available.push(start);
      continue;
    }
    if (clashes.every((b) => b.status === "PENDING")) held.push(start);
  }

  return { available, held };
}

export function generateSlots(
  date: string,
  durationMin: number,
  hours: Hour[],
  bookings: BusySlot[],
  blockedDates: string[],
  minStartMin = 0,
) {
  return generateSlotStates(date, durationMin, hours, bookings, blockedDates, minStartMin).available;
}

