import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import { db } from "@/lib/db";
import { WorkspaceError, requirePermission, requireWorkspace } from "@/lib/workspace";

export async function POST(req: Request) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const workspace = await requireWorkspace(artist);
    requirePermission(workspace, "canManageBusiness");
    const { date, reason } = await req.json().catch(() => ({}));
    if (typeof date !== "string") return NextResponse.json({ error: "INVALID" }, { status: 400 });

    const row = await db.blockedDate.upsert({
      where: { artistId_date: { artistId: workspace.business.ownerId, date } },
      update: { reason: typeof reason === "string" ? reason : "", businessId: workspace.business.id },
      create: {
        artistId: workspace.business.ownerId,
        businessId: workspace.business.id,
        date,
        reason: typeof reason === "string" ? reason : "",
      },
    });
    return NextResponse.json(row);
  } catch (error) {
    if (error instanceof WorkspaceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function DELETE(req: Request) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const workspace = await requireWorkspace(artist);
    requirePermission(workspace, "canManageBusiness");
    const { date } = await req.json().catch(() => ({}));
    if (typeof date !== "string") return NextResponse.json({ error: "INVALID" }, { status: 400 });
    await db.blockedDate.deleteMany({
      where: {
        date,
        OR: [{ artistId: workspace.business.ownerId }, { businessId: workspace.business.id }],
      },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof WorkspaceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
