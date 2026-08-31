import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentArtist } from "@/lib/auth";
import { TEAM_ROLES } from "@/lib/constants";
import { db } from "@/lib/db";
import { defaultCapacityForRoles, joinRoles, memberMatchesServiceKind, parseRoles } from "@/lib/roles";
import { isLibyaPhone, normalizePhone } from "@/lib/utils";
import { WorkspaceError, promoteToSalonIfTeam, requirePermission, requireWorkspace } from "@/lib/workspace";

const createSchema = z.object({
  name: z.string().min(2).max(80),
  phone: z.string().min(8).max(20).optional().default(""),
  roles: z.array(z.string()).min(1),
  dailyCapacity: z.number().int().min(1).max(20).optional(),
  serviceIds: z.array(z.string()).optional().default([]),
});

function fail(error: unknown) {
  if (error instanceof WorkspaceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
}

export async function POST(req: Request) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const workspace = await requireWorkspace(artist);
    requirePermission(workspace, "canManageTeam");
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

    const roles = joinRoles(parsed.data.roles.filter((role) => TEAM_ROLES.some((row) => row.id === role)));
    const phone = parsed.data.phone ? normalizePhone(parsed.data.phone) : "";
    if (phone && !isLibyaPhone(phone)) return NextResponse.json({ error: "PHONE" }, { status: 400 });

    if (phone === artist.phone || phone === workspace.member.phone) {
      return NextResponse.json({ error: "DUPLICATE" }, { status: 409 });
    }
    const duplicate = await db.teamMember.findFirst({
      where: {
        businessId: workspace.business.id,
        status: "ACTIVE",
        OR: [
          phone ? { phone } : undefined,
          phone ? { artist: { phone } } : undefined,
        ].filter(Boolean) as object[],
      },
    });
    if (duplicate) return NextResponse.json({ error: "DUPLICATE" }, { status: 409 });

    const linked = phone ? await db.artist.findUnique({ where: { phone } }) : null;
    const member = await db.teamMember.create({
      data: {
        businessId: workspace.business.id,
        artistId: linked?.id,
        name: parsed.data.name.trim(),
        phone: phone || linked?.phone || "",
        roles,
        dailyCapacity: parsed.data.dailyCapacity || defaultCapacityForRoles(parseRoles(roles)),
        status: "ACTIVE",
      },
    });

    const serviceIds = parsed.data.serviceIds.filter(Boolean);
    const services = serviceIds.length
      ? await db.service.findMany({
          where: { businessId: workspace.business.id, id: { in: serviceIds } },
        })
      : (await db.service.findMany({ where: { businessId: workspace.business.id, active: true } })).filter((service) =>
          memberMatchesServiceKind(parseRoles(roles), service.kind),
        );
    if (services.length) {
      await db.teamMemberService.createMany({
        data: services.map((service) => ({ teamMemberId: member.id, serviceId: service.id })),
      });
    }

    await promoteToSalonIfTeam(db, workspace.business.id);

    return NextResponse.json(member);
  } catch (error) {
    return fail(error);
  }
}
