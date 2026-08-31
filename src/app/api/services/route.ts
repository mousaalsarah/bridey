import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentArtist } from "@/lib/auth";
import { db } from "@/lib/db";
import { memberMatchesServiceKind, parseRoles } from "@/lib/roles";
import { WorkspaceError, requirePermission, requireWorkspace } from "@/lib/workspace";

const schema = z.object({
  nameAr: z.string().min(2),
  nameEn: z.string().optional().default(""),
  description: z.string().optional().default(""),
  kind: z.string().optional().default("other"),
  durationMin: z.number().min(30).max(480),
  priceLyd: z.number().min(1),
  staffIds: z.array(z.string()).optional(),
});

export async function POST(req: Request) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const workspace = await requireWorkspace(artist);
    requirePermission(workspace, "canManageServices");
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "INVALID" }, { status: 400 });

    const service = await db.service.create({
      data: {
        artistId: workspace.business.ownerId,
        businessId: workspace.business.id,
        nameAr: parsed.data.nameAr,
        nameEn: parsed.data.nameEn || parsed.data.nameAr,
        description: parsed.data.description,
        kind: parsed.data.kind,
        durationMin: parsed.data.durationMin,
        priceLyd: parsed.data.priceLyd,
      },
    });
    const allMembers = await db.teamMember.findMany({
      where: { businessId: workspace.business.id, status: "ACTIVE" },
    });
    const staffIds = parsed.data.staffIds?.length
      ? parsed.data.staffIds
      : allMembers
          .filter((member) => memberMatchesServiceKind(parseRoles(member.roles), parsed.data.kind))
          .map((member) => member.id);
    const members = allMembers.filter((member) => staffIds.includes(member.id));
    if (members.length) {
      await db.teamMemberService.createMany({
        data: members.map((member) => ({ teamMemberId: member.id, serviceId: service.id })),
      });
    } else {
      await db.teamMemberService.create({
        data: { teamMemberId: workspace.member.id, serviceId: service.id },
      });
    }
    return NextResponse.json(service);
  } catch (error) {
    if (error instanceof WorkspaceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
