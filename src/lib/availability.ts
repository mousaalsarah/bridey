import { expireOverdue, nowMinutesTripoli } from "./booking";
import { remainingBookingsForServices, remainingOf, staffSnapshots } from "./capacity";
import { db } from "./db";
import { addDaysISO, todayISO, weekdayOf } from "./utils";
import type { LoadedBusiness } from "./workspace";
import { activeMembers, memberCanPerform } from "./workspace";

export async function publicAvailability(
  business: LoadedBusiness,
  args: { date: string; serviceIds: string[] },
) {
  await expireOverdue(db, business.ownerId);
  const fresh = await db.business.findUniqueOrThrow({
    where: { id: business.id },
    include: {
      owner: true,
      members: { include: { services: true, artist: { select: { id: true, name: true, phone: true, slug: true } } } },
      shifts: { orderBy: { sortOrder: "asc" } },
      hours: true,
      blocked: true,
      services: { select: { id: true, kind: true, active: true } },
    },
  });

  const blocked = fresh.blocked.some((row) => row.date === args.date);
  const open = fresh.hours.some((row) => row.dayOfWeek === weekdayOf(args.date));
  const mode = fresh.scheduleMode === "HOURLY" ? "HOURLY" : fresh.scheduleMode === "DAY" ? "DAY" : "SHIFT";
  const minNotice = args.date === todayISO() ? nowMinutesTripoli() + fresh.minNoticeHours * 60 : 0;
  const lastDay = addDaysISO(todayISO(), fresh.bookingHorizonDays - 1);
  const inHorizon = args.date >= todayISO() && args.date <= lastDay;

  if (!inHorizon) {
    return { mode, remainingDay: 0, shifts: [], staff: [], available: false, reason: "HORIZON" as const };
  }
  if (blocked) {
    return { mode, remainingDay: 0, shifts: [], staff: [], available: false, reason: "BLOCKED" as const };
  }
  if (!open) {
    return { mode, remainingDay: 0, shifts: [], staff: [], available: false, reason: "CLOSED" as const };
  }

  const dayStaff = await staffSnapshots(db, fresh, args.date, null);
  const remainingDay = remainingBookingsForServices(fresh, dayStaff, args.serviceIds);

  const shifts = [];
  if (mode === "SHIFT") {
    for (const shift of fresh.shifts.filter((row) => row.active)) {
      if (args.date === todayISO() && shift.endMin <= minNotice) continue;
      const staff = await staffSnapshots(db, fresh, args.date, shift.id);
      const remaining = remainingBookingsForServices(fresh, staff, args.serviceIds);
      shifts.push({
        id: shift.id,
        key: shift.key,
        nameAr: shift.nameAr,
        nameEn: shift.nameEn,
        startMin: shift.startMin,
        endMin: shift.endMin,
        remaining,
        capacity: shift.capacity,
      });
    }
  }

  const serviceKind = (id: string) => fresh.services.find((row) => row.id === id)?.kind;

  const staff = activeMembers(fresh)
    .filter((member) => args.serviceIds.some((id) => memberCanPerform(member, id, serviceKind(id))))
    .map((member) => {
      const row = dayStaff.find((item) => item.id === member.id);
      return {
        id: member.id,
        name: member.name,
        remaining: row ? remainingOf(row) : 0,
        serviceIds: args.serviceIds.filter((id) => memberCanPerform(member, id, serviceKind(id))),
      };
    });

  const available =
    mode === "SHIFT" ? shifts.some((shift) => shift.remaining > 0) : remainingDay > 0;

  return {
    mode,
    remainingDay,
    shifts,
    staff,
    available,
    reason: available ? ("OK" as const) : ("FULL" as const),
  };
}
