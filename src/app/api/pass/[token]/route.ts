import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import { expireOverdue } from "@/lib/booking";
import { appointmentInclude, canAccessAppointment, parsePassToken, passIsAvailable, presentAppointment } from "@/lib/bridey-pass";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/workspace";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { token: raw } = await ctx.params;
  const token = parsePassToken(raw) || raw.trim();
  if (token.length < 32) {
    return NextResponse.json({ error: "INVALID_PASS" }, { status: 404 });
  }

  await expireOverdue(db);
  let workspace;
  try {
    workspace = await requireWorkspace(artist);
  } catch {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const booking = await db.booking.findUnique({
    where: { brideyPassToken: token },
    include: appointmentInclude,
  });
  if (!booking || !passIsAvailable(booking)) {
    return NextResponse.json({ error: "INVALID_PASS" }, { status: 404 });
  }
  if (!canAccessAppointment(workspace, booking)) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  return NextResponse.json(
    presentAppointment(booking, {
      memberId: workspace.member.id,
      canManageBusiness: workspace.permissions.canManageBusiness,
    }),
    { headers: { "Cache-Control": "no-store" } },
  );
}
