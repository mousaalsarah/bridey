import type { Prisma } from "@prisma/client";
import { releaseBookingHolds } from "./booking";
import { appointmentInclude, bookingTotalLyd, type LoadedAppointment } from "./bridey-pass";
import { writeAudit } from "./fees";

type Tx = Prisma.TransactionClient;

export class AppointmentError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "AppointmentError";
  }
}

export type AppointmentAction = "check_in" | "start" | "complete" | "mark_paid" | "record_payment";

async function load(tx: Tx, bookingId: string, businessId: string) {
  const booking = await tx.booking.findFirst({
    where: { id: bookingId, businessId },
    include: appointmentInclude,
  });
  if (!booking) throw new AppointmentError("NOT_FOUND", 404);
  return booking;
}

async function audit(
  tx: Tx,
  args: { artistId: string; ownerArtistId: string; action: string; bookingId: string; extra?: string },
) {
  await writeAudit(tx, {
    actorType: "artist",
    actorId: args.artistId,
    action: args.action,
    artistId: args.ownerArtistId,
    reason: `booking:${args.bookingId}${args.extra ? `;${args.extra}` : ""}`,
  });
}

export async function applyAppointmentAction(
  tx: Tx,
  args: {
    bookingId: string;
    businessId: string;
    memberId: string;
    artistId: string;
    ownerArtistId: string;
    action: AppointmentAction;
    amountLyd?: number;
    depositLyd?: number;
  },
): Promise<LoadedAppointment> {
  const current = await load(tx, args.bookingId, args.businessId);
  if (current.status === "CANCELLED" && (args.action === "check_in" || args.action === "start" || args.action === "complete")) {
    throw new AppointmentError("INVALID_STATUS", 400);
  }

  if (args.action === "check_in") {
    if (["CHECKED_IN", "IN_PROGRESS", "COMPLETED"].includes(current.status)) return current;
    if (current.status !== "CONFIRMED") throw new AppointmentError("INVALID_STATUS", 400);
    const result = await tx.booking.updateMany({
      where: { id: current.id, status: "CONFIRMED" },
      data: {
        status: "CHECKED_IN",
        checkedInAt: current.checkedInAt || new Date(),
        checkedInById: current.checkedInById || args.memberId,
      },
    });
    if (result.count === 0) {
      const again = await load(tx, args.bookingId, args.businessId);
      if (["CHECKED_IN", "IN_PROGRESS", "COMPLETED"].includes(again.status)) return again;
      throw new AppointmentError("INVALID_STATUS", 400);
    }
    await audit(tx, { artistId: args.artistId, ownerArtistId: args.ownerArtistId, action: "booking.checked_in", bookingId: current.id });
    return load(tx, args.bookingId, args.businessId);
  }

  if (args.action === "start") {
    if (["IN_PROGRESS", "COMPLETED"].includes(current.status)) return current;
    if (current.status !== "CHECKED_IN") throw new AppointmentError("INVALID_STATUS", 400);
    const result = await tx.booking.updateMany({
      where: { id: current.id, status: "CHECKED_IN" },
      data: {
        status: "IN_PROGRESS",
        startedAt: current.startedAt || new Date(),
        startedById: current.startedById || args.memberId,
      },
    });
    if (result.count === 0) {
      const again = await load(tx, args.bookingId, args.businessId);
      if (["IN_PROGRESS", "COMPLETED"].includes(again.status)) return again;
      throw new AppointmentError("INVALID_STATUS", 400);
    }
    await audit(tx, { artistId: args.artistId, ownerArtistId: args.ownerArtistId, action: "booking.started", bookingId: current.id });
    return load(tx, args.bookingId, args.businessId);
  }

  if (args.action === "complete") {
    if (current.status === "COMPLETED") return current;
    if (current.status !== "IN_PROGRESS") throw new AppointmentError("INVALID_STATUS", 400);
    const result = await tx.booking.updateMany({
      where: { id: current.id, status: "IN_PROGRESS" },
      data: {
        status: "COMPLETED",
        completedAt: current.completedAt || new Date(),
        completedById: current.completedById || args.memberId,
        expiresAt: null,
      },
    });
    if (result.count === 0) {
      const again = await load(tx, args.bookingId, args.businessId);
      if (again.status === "COMPLETED") return again;
      throw new AppointmentError("INVALID_STATUS", 400);
    }
    await releaseBookingHolds(tx, current.id);
    await audit(tx, { artistId: args.artistId, ownerArtistId: args.ownerArtistId, action: "booking.completed", bookingId: current.id });
    return load(tx, args.bookingId, args.businessId);
  }

  if (args.action === "mark_paid" || args.action === "record_payment") {
    if (!["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"].includes(current.status)) {
      throw new AppointmentError("INVALID_STATUS", 400);
    }
    const total = bookingTotalLyd(current);
    const paid = current.paidLyd || 0;
    if (paid >= total && total > 0) return current;
    const add =
      args.action === "mark_paid"
        ? Math.max(0, total - paid)
        : Math.max(0, Math.floor(Number(args.amountLyd) || 0));
    if (add <= 0) return current;
    const nextPaid = Math.min(total, paid + add);
    const depositLyd =
      typeof args.depositLyd === "number" && args.depositLyd >= 0
        ? Math.floor(args.depositLyd)
        : current.depositLyd || (paid === 0 && nextPaid < total ? nextPaid : current.depositLyd);
    const result = await tx.booking.updateMany({
      where: {
        id: current.id,
        paidLyd: paid,
        status: { in: ["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"] },
      },
      data: {
        paidLyd: nextPaid,
        depositLyd,
        paidAt: new Date(),
        paidById: args.memberId,
      },
    });
    if (result.count === 0) {
      return load(tx, args.bookingId, args.businessId);
    }
    await audit(tx, {
      artistId: args.artistId,
      ownerArtistId: args.ownerArtistId,
      action: "booking.payment_recorded",
      bookingId: current.id,
      extra: `paid:${nextPaid};total:${total}`,
    });
    return load(tx, args.bookingId, args.businessId);
  }

  throw new AppointmentError("INVALID", 400);
}
