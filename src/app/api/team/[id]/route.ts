import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import { TEAM_ROLES } from "@/lib/constants";
import { db } from "@/lib/db";
import { joinRoles, memberMatchesServiceKind, parseRoles } from "@/lib/roles";
import { WorkspaceError, requirePermission, requireWorkspace } from "@/lib/workspace";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const workspace = await requireWorkspace(artist);
    requirePermission(workspace, "canManageTeam");
    const { id } = await ctx.params;
    const member = await db.teamMember.findFirst({
      where: { id, businessId: workspace.business.id },
    });
    if (!member) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const data: Record<string, string | number> = {};
    if (typeof body.name === "string" && body.name.trim().length >= 2) data.name = body.name.trim();
    if (typeof body.dailyCapacity === "number") {
      data.dailyCapacity = Math.min(20, Math.max(1, Math.round(body.dailyCapacity)));
    }
    if (typeof body.status === "string" && ["ACTIVE", "INACTIVE"].includes(body.status)) {
      if (member.artistId === workspace.business.ownerId && body.status === "INACTIVE") {
        return NextResponse.json({ error: "OWNER" }, { status: 400 });
      }
      data.status = body.status;
    }
    if (Array.isArray(body.roles)) {
      const roles = joinRoles(body.roles.filter((role: string) => TEAM_ROLES.some((row) => row.id === role)));
      if (member.artistId === workspace.business.ownerId && !roles.includes("OWNER")) {
        data.roles = `OWNER,${roles}`;
      } else {
        data.roles = roles;
      }
    }

    const updated = await db.teamMember.update({ where: { id }, data });

    if (Array.isArray(body.roles) && !Array.isArray(body.serviceIds)) {
      const roles = parseRoles(updated.roles);
      const services = await db.service.findMany({ where: { businessId: workspace.business.id, active: true } });
      await db.teamMemberService.deleteMany({ where: { teamMemberId: id } });
      const matching = services.filter((service) => memberMatchesServiceKind(roles, service.kind));
      if (matching.length) {
        await db.teamMemberService.createMany({
          data: matching.map((service) => ({ teamMemberId: id, serviceId: service.id })),
        });
      }
    }

    if (Array.isArray(body.serviceIds)) {
      await db.teamMemberService.deleteMany({ where: { teamMemberId: id } });
      const services = await db.service.findMany({
        where: { businessId: workspace.business.id, id: { in: body.serviceIds } },
      });
      if (services.length) {
        await db.teamMemberService.createMany({
          data: services.map((service) => ({ teamMemberId: id, serviceId: service.id })),
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
