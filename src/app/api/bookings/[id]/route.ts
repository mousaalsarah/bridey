import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import {
  STATUS_TRANSITIONS,
  SlotTakenError,
  TERMINAL_STATUSES,
  chargeBrideyFee,
  expireOverdue,
  hasOverlap,
  lockArtistSchedule,
  reassignBooking,
  releaseBookingHolds,
  runBookingTransaction,
} from "@/lib/booking";
import { uniquePassToken, appointmentInclude, canAccessAppointment, presentAppointment } from "@/lib/bridey-pass";
import { presentBooking } from "@/lib/booking-privacy";
import { PLATFORM_FEE_LYD } from "@/lib/constants";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/fees";
import { lockBusiness, requireWorkspace, type Workspace } from "@/lib/workspace";

export const maxDuration = 30;

function forWorkspace<T extends Parameters<typeof presentBooking>[0]>(workspace: Workspace, booking: T) {
  return presentBooking(booking, {
    memberId: workspace.member.id,
    canManageBusiness: workspace.permissions.canManageBusiness,
  });
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const workspace = await requireWorkspace(artist);
  const { id } = await ctx.params;
  const booking = await db.booking.findFirst({
    where: { id, businessId: workspace.business.id },
    include: appointmentInclude,
  });
  if (!booking || !canAccessAppointment(workspace, booking)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }
  return NextResponse.json(
    presentAppointment(booking, {
      memberId: workspace.member.id,
      canManageBusiness: workspace.permissions.canManageBusiness,
    }),
  );
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const workspace = await requireWorkspace(artist);
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const booking = await db.booking.findFirst({
    where: {
      id,
      businessId: workspace.business.id,
      ...(workspace.permissions.canManageBusiness
        ? {}
        : { assignments: { some: { teamMemberId: workspace.member.id } } }),
    },
    include: { assignments: true },
  });
  if (!booking) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (Array.isArray(body.assignments)) {
    if (!workspace.permissions.canAssign) return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
    try {
      const updated = await runBookingTransaction((tx) =>
        reassignBooking(tx, {
          bookingId: id,
          business: workspace.business,
          assignments: body.assignments.map((row: { serviceId: string; teamMemberId: string }) => ({
            serviceId: row.serviceId,
            teamMemberId: row.teamMemberId,
          })),
        }),
      );
      return NextResponse.json(forWorkspace(workspace, updated));
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
      }
      return NextResponse.json({ error: "UNAVAILABLE" }, { status: 409 });
    }
  }

  if (typeof body.artistNotes === "string") {
    await db.booking.update({
      where: { id },
      data: { artistNotes: body.artistNotes.slice(0, 500) },
    });
  }

  const status = typeof body.status === "string" ? body.status : undefined;
  if (!status) {
    const updated = await db.booking.findFirst({
      where: { id },
      include: { service: true, items: true, fee: true, assignments: true, shift: true },
    });
    return NextResponse.json(updated ? forWorkspace(workspace, updated) : updated);
  }

  const allowed = STATUS_TRANSITIONS[booking.status] || [];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });
  }

  try {
    const updated = await runBookingTransaction(async (tx) => {
      await lockBusiness(tx, workspace.business.id);
      await lockArtistSchedule(tx, workspace.business.ownerId);
      await expireOverdue(tx, workspace.business.ownerId);
      const current = await tx.booking.findFirst({ where: { id, businessId: workspace.business.id } });
      if (!current) throw new Error("NOT_FOUND");
      if (!(STATUS_TRANSITIONS[current.status] || []).includes(status)) {
        throw new Error("INVALID_STATUS");
      }

      if (status === "CONFIRMED") {
        if (
          current.scheduleMode === "HOURLY" &&
          (await hasOverlap(tx, {
            artistId: current.artistId,
            date: current.date,
            startMin: current.startMin,
            endMin: current.endMin,
            excludeId: current.id,
          }))
        ) {
          throw new SlotTakenError();
        }
        const token = current.brideyPassToken || (await uniquePassToken(tx));
        const issued = !current.brideyPassToken;
        const next = await tx.booking.update({
          where: { id },
          data: {
            status: "CONFIRMED",
            confirmedAt: current.confirmedAt || new Date(),
            expiresAt: null,
            brideyPassToken: token,
          },
        });
        if (next.origin === "public") {
          const fee = await chargeBrideyFee(tx, next);
          if (!fee) throw new Error("FEE_FAILED");
        }
        await writeAudit(tx, {
          actorType: "artist",
          actorId: artist.id,
          action: "booking.confirmed",
          artistId: workspace.business.ownerId,
          reason: `booking:${id};fee:${next.origin === "public" ? PLATFORM_FEE_LYD : 0};contactUnlocked:1`,
        });
        if (issued) {
          await writeAudit(tx, {
            actorType: "artist",
            actorId: artist.id,
            action: "pass.generated",
            artistId: workspace.business.ownerId,
            reason: `booking:${id}`,
          });
        }
        const loaded = await tx.booking.findFirstOrThrow({
          where: { id },
          include: { service: true, items: true, fee: true, assignments: true, shift: true },
        });
        return forWorkspace(workspace, loaded);
      }

      if ((TERMINAL_STATUSES as readonly string[]).includes(status)) {
        await releaseBookingHolds(tx, id);
      }

      return tx.booking.update({
        where: { id },
        data: {
          status,
          cancelledAt: status === "CANCELLED" ? new Date() : current.cancelledAt,
          expiresAt: null,
        },
        include: { service: true, items: true, fee: true, assignments: true, shift: true },
      });
    });
    return NextResponse.json(forWorkspace(workspace, updated));
  } catch (error) {
    if (error instanceof SlotTakenError) {
      return NextResponse.json({ error: "UNAVAILABLE" }, { status: 409 });
    }
    if (error instanceof Error && error.message === "FEE_FAILED") {
      return NextResponse.json({ error: "FEE_FAILED" }, { status: 500 });
    }
    if (error instanceof Error && (error.message === "INVALID_STATUS" || error.message === "NOT_FOUND")) {
      return NextResponse.json({ error: error.message }, { status: error.message === "NOT_FOUND" ? 404 : 400 });
    }
    throw error;
  }
}
