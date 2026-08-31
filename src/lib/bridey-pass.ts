import { randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import { isUniqueConstraint } from "./booking-errors";
import { presentBooking, type ContactViewer } from "./booking-privacy";
import { PASS_HIDDEN_STATUSES } from "./constants";
import type { Workspace } from "./workspace";

export { parsePassToken, passUrl } from "./pass-token";

type Tx = Prisma.TransactionClient;

export const appointmentInclude = {
  service: true,
  items: true,
  shift: true,
  business: { select: { id: true, name: true, slug: true } },
  assignments: {
    include: {
      teamMember: { select: { id: true, name: true, roles: true } },
      service: { select: { id: true, nameAr: true, nameEn: true, kind: true } },
    },
  },
} satisfies Prisma.BookingInclude;

export type LoadedAppointment = Prisma.BookingGetPayload<{ include: typeof appointmentInclude }>;

export function randomPassToken() {
  return randomBytes(32).toString("base64url");
}

export async function uniquePassToken(tx: Tx) {
  for (let i = 0; i < 12; i += 1) {
    const token = randomPassToken();
    const exists = await tx.booking.findUnique({ where: { brideyPassToken: token }, select: { id: true } });
    if (!exists) return token;
  }
  return randomPassToken();
}

export async function ensurePassToken(tx: Tx, booking: { id: string; status: string; brideyPassToken?: string | null }) {
  if (PASS_HIDDEN_STATUSES.includes(booking.status as (typeof PASS_HIDDEN_STATUSES)[number])) {
    return booking.brideyPassToken || "";
  }
  if (booking.brideyPassToken) return booking.brideyPassToken;
  for (let i = 0; i < 8; i += 1) {
    const token = await uniquePassToken(tx);
    try {
      await tx.booking.update({ where: { id: booking.id }, data: { brideyPassToken: token } });
      return token;
    } catch (error) {
      if (!isUniqueConstraint(error, "brideyPassToken")) throw error;
    }
  }
  throw new Error("PASS_TOKEN_FAILED");
}

export function passIsAvailable(booking: { status: string; brideyPassToken?: string | null; confirmedAt?: Date | string | null }) {
  if (!booking.brideyPassToken) return false;
  if (PASS_HIDDEN_STATUSES.includes(booking.status as (typeof PASS_HIDDEN_STATUSES)[number])) return false;
  return Boolean(booking.confirmedAt) || ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"].includes(booking.status);
}

export function bookingTotalLyd(booking: { items?: Array<{ priceLyd?: number | null }>; service?: { priceLyd?: number | null } | null }) {
  if (booking.items?.length) {
    return booking.items.reduce((sum, item) => sum + (item.priceLyd || 0), 0);
  }
  return booking.service?.priceLyd || 0;
}

export function paymentSnapshot(booking: {
  items?: Array<{ priceLyd?: number | null }>;
  service?: { priceLyd?: number | null } | null;
  depositLyd?: number | null;
  paidLyd?: number | null;
}) {
  const totalLyd = bookingTotalLyd(booking);
  const depositLyd = Math.max(0, booking.depositLyd || 0);
  const paidLyd = Math.max(0, Math.min(totalLyd, booking.paidLyd || 0));
  const remainingLyd = Math.max(0, totalLyd - paidLyd);
  const depositPaid = depositLyd > 0 && paidLyd >= depositLyd;
  const status = remainingLyd <= 0 && totalLyd > 0 ? "paid" : paidLyd > 0 ? "partial" : "unpaid";
  return { totalLyd, depositLyd, paidLyd, remainingLyd, depositPaid, status };
}

export function canAccessAppointment(workspace: Workspace, booking: { businessId?: string | null; artistId?: string | null; assignments?: Array<{ teamMemberId: string }> }) {
  const sameBusiness = booking.businessId
    ? booking.businessId === workspace.business.id
    : booking.artistId === workspace.business.ownerId;
  if (!sameBusiness) return false;
  if (workspace.permissions.canManageBusiness) return true;
  return (booking.assignments || []).some((row) => row.teamMemberId === workspace.member.id);
}

export function appointmentActions(status: string) {
  return {
    canCheckIn: status === "CONFIRMED",
    canStart: status === "CHECKED_IN",
    canComplete: status === "IN_PROGRESS",
    canRecordPayment: ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"].includes(status),
  };
}

export function presentAppointment(booking: LoadedAppointment, viewer: ContactViewer) {
  const presented = presentBooking(booking, viewer);
  const payment = paymentSnapshot(booking);
  const services = (booking.items.length ? booking.items : [booking.service]).map((item) => ({
    nameAr: item.nameAr,
    nameEn: item.nameEn,
    durationMin: "durationMin" in item ? item.durationMin : booking.service.durationMin,
    priceLyd: item.priceLyd,
  }));
  return {
    id: booking.id,
    status: booking.status,
    origin: booking.origin,
    brideName: booking.brideName,
    bridePhone: presented.bridePhone,
    contactAvailable: presented.contactAvailable,
    notes: presented.notes,
    date: booking.date,
    startMin: booking.startMin,
    endMin: booking.endMin,
    scheduleMode: booking.scheduleMode,
    trackCode: booking.trackCode,
    shift: booking.shift
      ? { nameAr: booking.shift.nameAr, nameEn: booking.shift.nameEn, startMin: booking.shift.startMin, endMin: booking.shift.endMin }
      : null,
    businessName: booking.business?.name || "",
    assignments: booking.assignments.map((row) => ({
      teamMemberId: row.teamMemberId,
      serviceId: row.serviceId,
      staffName: row.teamMember.name,
      serviceAr: row.service.nameAr,
      serviceEn: row.service.nameEn,
    })),
    services,
    payment,
    checkedInAt: booking.checkedInAt,
    startedAt: booking.startedAt,
    completedAt: booking.completedAt,
    cancelledAt: booking.cancelledAt,
    actions: appointmentActions(booking.status),
  };
}

export type AppointmentPayload = ReturnType<typeof presentAppointment>;
