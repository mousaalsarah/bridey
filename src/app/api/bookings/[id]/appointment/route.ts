import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentArtist } from "@/lib/auth";
import { applyAppointmentAction, AppointmentError } from "@/lib/appointment";
import { runBookingTransaction } from "@/lib/booking";
import { appointmentInclude, canAccessAppointment, presentAppointment } from "@/lib/bridey-pass";
import { db } from "@/lib/db";
import { lockBusiness, requireWorkspace } from "@/lib/workspace";

const schema = z.object({
  action: z.enum(["check_in", "start", "complete", "mark_paid", "record_payment"]),
  amountLyd: z.number().int().min(1).max(50000).optional(),
  depositLyd: z.number().int().min(0).max(50000).optional(),
});

export const maxDuration = 30;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const workspace = await requireWorkspace(artist);
  const { id } = await ctx.params;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  const existing = await db.booking.findFirst({
    where: { id, businessId: workspace.business.id },
    include: { assignments: true },
  });
  if (!existing || !canAccessAppointment(workspace, existing)) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  try {
    const booking = await runBookingTransaction(async (tx) => {
      await lockBusiness(tx, workspace.business.id);
      return applyAppointmentAction(tx, {
        bookingId: id,
        businessId: workspace.business.id,
        memberId: workspace.member.id,
        artistId: artist.id,
        ownerArtistId: workspace.business.ownerId,
        action: parsed.data.action,
        amountLyd: parsed.data.amountLyd,
        depositLyd: parsed.data.depositLyd,
      });
    });
    return NextResponse.json(
      presentAppointment(booking, {
        memberId: workspace.member.id,
        canManageBusiness: workspace.permissions.canManageBusiness,
      }),
    );
  } catch (error) {
    if (error instanceof AppointmentError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
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
