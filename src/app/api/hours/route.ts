import { NextResponse } from "next/server";
import { getCurrentArtist } from "@/lib/auth";
import { HOUR_PRESETS } from "@/lib/constants";
import { db } from "@/lib/db";
import { deriveShiftsFromWindow, typicalWindow } from "@/lib/shifts";
import { WorkspaceError, requirePermission, requireWorkspace } from "@/lib/workspace";

export async function PUT(req: Request) {
  const artist = await getCurrentArtist();
  if (!artist) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  try {
    const workspace = await requireWorkspace(artist);
    requirePermission(workspace, "canManageBusiness");
    const body = await req.json().catch(() => ({}));
    const ownerId = workspace.business.ownerId;
    const businessId = workspace.business.id;

    if (typeof body.preset === "string") {
      const preset = HOUR_PRESETS.find((p) => p.id === body.preset);
      if (!preset) return NextResponse.json({ error: "INVALID" }, { status: 400 });
      await db.weeklyHour.deleteMany({ where: { OR: [{ artistId: ownerId }, { businessId }] } });
      await db.weeklyHour.createMany({
        data: preset.days.map((dayOfWeek) => ({
          artistId: ownerId,
          businessId,
          dayOfWeek,
          startMin: preset.startMin,
          endMin: preset.endMin,
        })),
      });
      const drafts = deriveShiftsFromWindow(preset.startMin, preset.endMin);
      await db.shift.deleteMany({ where: { businessId } });
      await db.shift.createMany({
        data: drafts.map((shift) => ({
          businessId,
          key: shift.key,
          nameAr: shift.nameAr,
          nameEn: shift.nameEn,
          startMin: shift.startMin,
          endMin: shift.endMin,
          sortOrder: shift.sortOrder,
          active: true,
        })),
      });
    } else if (Array.isArray(body.hours)) {
      await db.weeklyHour.deleteMany({ where: { OR: [{ artistId: ownerId }, { businessId }] } });
      const rows = body.hours
        .filter((h: { dayOfWeek: number; startMin: number; endMin: number }) => h.endMin > h.startMin)
        .map((h: { dayOfWeek: number; startMin: number; endMin: number }) => ({
          artistId: ownerId,
          businessId,
          dayOfWeek: h.dayOfWeek,
          startMin: h.startMin,
          endMin: h.endMin,
        }));
      if (rows.length) await db.weeklyHour.createMany({ data: rows });
      if (!workspace.business.shifts.length) {
        const window = typicalWindow(rows);
        const drafts = deriveShiftsFromWindow(window.startMin, window.endMin);
        await db.shift.createMany({
          data: drafts.map((shift) => ({
            businessId,
            key: shift.key,
            nameAr: shift.nameAr,
            nameEn: shift.nameEn,
            startMin: shift.startMin,
            endMin: shift.endMin,
            sortOrder: shift.sortOrder,
            active: true,
          })),
        });
      }
    }

    const businessData: Record<string, string> = {};
    if (body.scheduleMode === "DAY" || body.scheduleMode === "SHIFT" || body.scheduleMode === "HOURLY") {
      businessData.scheduleMode = body.scheduleMode;
    }
    if (body.assignmentMode === "AUTO" || body.assignmentMode === "MANUAL") {
      businessData.assignmentMode = body.assignmentMode;
    }
    if (Object.keys(businessData).length) {
      await db.business.update({ where: { id: businessId }, data: businessData });
    }

    if (typeof body.dailyCapacity === "number") {
      await db.teamMember.update({
        where: { id: workspace.member.id },
        data: { dailyCapacity: Math.min(20, Math.max(1, Math.round(body.dailyCapacity))) },
      });
    }

    if (Array.isArray(body.shifts)) {
      for (const shift of body.shifts) {
        if (typeof shift.id !== "string") continue;
        const existing = await db.shift.findFirst({ where: { id: shift.id, businessId } });
        if (!existing) continue;
        await db.shift.update({
          where: { id: shift.id },
          data: {
            nameAr: typeof shift.nameAr === "string" ? shift.nameAr : undefined,
            nameEn: typeof shift.nameEn === "string" ? shift.nameEn : undefined,
            startMin: typeof shift.startMin === "number" ? shift.startMin : undefined,
            endMin: typeof shift.endMin === "number" ? shift.endMin : undefined,
            capacity: shift.capacity === null || shift.capacity === "" ? null : typeof shift.capacity === "number" ? shift.capacity : undefined,
            active: typeof shift.active === "boolean" ? shift.active : undefined,
          },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof WorkspaceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
