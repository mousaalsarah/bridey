import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import {
  STATUS_TRANSITIONS,
  SlotTakenError,
  TERMINAL_STATUSES,
  bookingTxOptions,
  chargeBrideyFee,
  expireOverdue,
  hasOverlap,
  lockArtistSchedule,
  releaseSlotHolds,
} from "@/lib/booking";
import { db } from "@/lib/db";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const booking = await db.booking.findFirst({ where: { id, artistId: artist.id } });
  if (!booking) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (typeof body.artistNotes === "string") {
    await db.booking.update({
      where: { id },
      data: { artistNotes: body.artistNotes.slice(0, 500) },
    });
  }

  const status = typeof body.status === "string" ? body.status : undefined;
  if (!status) {
    const updated = await db.booking.findFirst({
      where: { id, artistId: artist.id },
      include: { service: true, items: true, fee: true },
    });
    return NextResponse.json(updated);
  }

  const allowed = STATUS_TRANSITIONS[booking.status] || [];
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: "INVALID_STATUS" }, { status: 400 });
  }

  try {
    const updated = await db.$transaction(async (tx) => {
      await lockArtistSchedule(tx, artist.id);
      await expireOverdue(tx, artist.id);
      const current = await tx.booking.findFirst({ where: { id, artistId: artist.id } });
      if (!current) throw new Error("NOT_FOUND");
      if (!(STATUS_TRANSITIONS[current.status] || []).includes(status)) {
        throw new Error("INVALID_STATUS");
      }

      if (status === "CONFIRMED") {
        if (await hasOverlap(tx, {
          artistId: artist.id,
          date: current.date,
          startMin: current.startMin,
          endMin: current.endMin,
          excludeId: current.id,
        })) {
          throw new SlotTakenError();
        }
        const next = await tx.booking.update({
          where: { id },
          data: { status: "CONFIRMED", confirmedAt: current.confirmedAt || new Date(), expiresAt: null },
        });
        await chargeBrideyFee(tx, next);
        return tx.booking.findFirstOrThrow({
          where: { id, artistId: artist.id },
          include: { service: true, items: true, fee: true },
        });
      }

      if ((TERMINAL_STATUSES as readonly string[]).includes(status)) {
        await releaseSlotHolds(tx, id);
      }

      return tx.booking.update({
        where: { id },
        data: {
          status,
          cancelledAt: status === "CANCELLED" ? new Date() : current.cancelledAt,
          expiresAt: null,
        },
        include: { service: true, items: true, fee: true },
      });
    }, bookingTxOptions);
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof SlotTakenError) {
      return NextResponse.json({ error: "UNAVAILABLE" }, { status: 409 });
    }
    if (error instanceof Error && (error.message === "INVALID_STATUS" || error.message === "NOT_FOUND")) {
      return NextResponse.json({ error: error.message }, { status: error.message === "NOT_FOUND" ? 404 : 400 });
    }
    throw error;
  }
}
