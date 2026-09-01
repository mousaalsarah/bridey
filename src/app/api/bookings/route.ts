import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentArtist } from "@/lib/auth";
import {
  CapacityFullError,
  PreferredUnavailableError,
  SlotTakenError,
  createBusinessBooking,
  isUniqueConstraint,
  runBookingTransaction,
} from "@/lib/booking";
import { FeeError } from "@/lib/fees";
import { normalizeBookingSource } from "@/lib/constants";
import { db } from "@/lib/db";
import { isLibyaPhone, normalizePhone } from "@/lib/utils";
import { presentBooking } from "@/lib/booking-privacy";
import { requirePermission, requireWorkspace } from "@/lib/workspace";

const schema = z.object({
  brideName: z.string().min(2).max(80),
  bridePhone: z.string().min(8).max(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  shiftId: z.string().optional(),
  startMin: z.number().int().min(0).max(24 * 60 - 1).optional(),
  endMin: z.number().int().min(1).max(24 * 60).optional(),
  durationMin: z.number().int().min(15).max(12 * 60).optional(),
  serviceIds: z.array(z.string()).min(1).max(8),
  preferredMemberId: z.string().optional(),
  preferredByService: z.record(z.string(), z.string()).optional(),
  assignments: z.array(z.object({ serviceId: z.string(), teamMemberId: z.string() })).optional(),
  notes: z.string().max(500).optional().default(""),
  artistNotes: z.string().max(500).optional().default(""),
  source: z.string(),
});

export const maxDuration = 30;

export async function POST(req: Request) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const workspace = await requireWorkspace(artist);
  requirePermission(workspace, "canManageBusiness");

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

  const source = normalizeBookingSource(parsed.data.source);
  const phone = normalizePhone(parsed.data.bridePhone);
  if (!isLibyaPhone(phone)) return NextResponse.json({ error: "PHONE" }, { status: 400 });

  const uniqueIds = [...new Set(parsed.data.serviceIds)];
  const services = await db.service.findMany({
    where: { businessId: workspace.business.id, id: { in: uniqueIds }, active: true },
  });
  if (services.length !== uniqueIds.length) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const durationMin = parsed.data.durationMin || services.reduce((sum, s) => sum + s.durationMin, 0);
  const startMin = parsed.data.startMin;
  const endMin =
    parsed.data.endMin && startMin != null && parsed.data.endMin > startMin
      ? parsed.data.endMin
      : startMin != null
        ? startMin + durationMin
        : undefined;

  try {
    const booking = await runBookingTransaction((tx) =>
      createBusinessBooking(tx, {
        business: workspace.business,
        services,
        date: parsed.data.date,
        shiftId: parsed.data.shiftId,
        startMin,
        endMin,
        preferredMemberId: parsed.data.preferredMemberId,
        preferredByService: parsed.data.preferredByService,
        assignments: parsed.data.assignments,
        brideName: parsed.data.brideName.trim(),
        bridePhone: phone,
        notes: parsed.data.notes,
        artistNotes: parsed.data.artistNotes,
        origin: "manual",
        source,
        status: "CONFIRMED",
        expiresAt: null,
      }),
    );
    return NextResponse.json(
      presentBooking(booking, {
        memberId: workspace.member.id,
        canManageBusiness: workspace.permissions.canManageBusiness,
      }),
    );
  } catch (error) {
    if (error instanceof PreferredUnavailableError) {
      return NextResponse.json({ error: "PREFERRED_UNAVAILABLE" }, { status: 409 });
    }
    if (error instanceof CapacityFullError || error instanceof SlotTakenError || isUniqueConstraint(error)) {
      return NextResponse.json({ error: "UNAVAILABLE" }, { status: 409 });
    }
    if (error instanceof FeeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
