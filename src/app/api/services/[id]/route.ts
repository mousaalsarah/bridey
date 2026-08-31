import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import { db } from "@/lib/db";
import { memberMatchesServiceKind, parseRoles } from "@/lib/roles";
import { WorkspaceError, requirePermission, requireWorkspace, syncServiceStaffByRole } from "@/lib/workspace";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const workspace = await requireWorkspace(artist);
    requirePermission(workspace, "canManageServices");
    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    const existing = await db.service.findFirst({
      where: { id, businessId: workspace.business.id },
    });
    if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const updated = await db.service.update({
      where: { id },
      data: {
        nameAr: typeof body.nameAr === "string" ? body.nameAr : undefined,
        nameEn: typeof body.nameEn === "string" ? body.nameEn : undefined,
        description: typeof body.description === "string" ? body.description : undefined,
        kind: typeof body.kind === "string" ? body.kind : undefined,
        durationMin: typeof body.durationMin === "number" ? body.durationMin : undefined,
        priceLyd: typeof body.priceLyd === "number" ? body.priceLyd : undefined,
        active: typeof body.active === "boolean" ? body.active : undefined,
      },
    });

    if (typeof body.kind === "string" && !Array.isArray(body.staffIds)) {
      await syncServiceStaffByRole(db, workspace.business.id);
    }

    if (Array.isArray(body.staffIds)) {
      await db.teamMemberService.deleteMany({ where: { serviceId: id } });
      const kind = typeof body.kind === "string" ? body.kind : updated.kind;
      const members = await db.teamMember.findMany({
        where: { businessId: workspace.business.id, id: { in: body.staffIds }, status: "ACTIVE" },
      });
      const eligible = members.filter((member) => memberMatchesServiceKind(parseRoles(member.roles), kind));
      if (eligible.length) {
        await db.teamMemberService.createMany({
          data: eligible.map((member) => ({ teamMemberId: member.id, serviceId: id })),
        });
      }
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof WorkspaceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const workspace = await requireWorkspace(artist);
    requirePermission(workspace, "canManageServices");
    const { id } = await ctx.params;
    const existing = await db.service.findFirst({
      where: { id, businessId: workspace.business.id },
    });
    if (!existing) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    await db.service.update({ where: { id }, data: { active: false } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof WorkspaceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
