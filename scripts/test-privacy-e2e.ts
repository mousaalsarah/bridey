/**
 * Final e2e privacy / fee verification against the same payload shapes
 * the business dashboard APIs return (GET /api/me, PATCH /api/bookings/[id], GET /api/alerts).
 */
import { randomUUID } from "crypto";
import {
  CapacityFullError,
  NotesContactError,
  PreferredUnavailableError,
  STATUS_TRANSITIONS,
  bookingTxOptions,
  chargeBrideyFee,
  createBusinessBooking,
  expireOverdue,
} from "../src/lib/booking";
import { notesContainContact, payloadContainsPhone, presentBooking } from "../src/lib/booking-privacy";
import { PLATFORM_FEE_LYD } from "../src/lib/constants";
import { db } from "../src/lib/db";
import { addDaysISO, normalizePhone, todayISO, weekdayOf } from "../src/lib/utils";
import { ensureWorkspace, loadBusiness } from "../src/lib/workspace";

const BRIDE = "Sara Ahmed";
const RAW_PHONE = "0912345678";
const STORED_PHONE = normalizePhone(RAW_PHONE);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function nextOpenDate(days: number[], from = todayISO()) {
  for (let i = 1; i <= 21; i += 1) {
    const date = addDaysISO(from, i);
    if (days.includes(weekdayOf(date))) return date;
  }
  return addDaysISO(from, 7);
}

function studioBookingPayload<T extends Parameters<typeof presentBooking>[0]>(
  booking: T,
  viewer: { memberId: string; canManageBusiness: boolean },
) {
  return presentBooking(booking, viewer);
}

async function loadStudioBooking(id: string) {
  return db.booking.findFirstOrThrow({
    where: { id },
    include: {
      service: true,
      items: true,
      fee: true,
      shift: true,
      assignments: { include: { teamMember: { select: { id: true, name: true, roles: true } } } },
    },
  });
}

function alertsPayload(booking: { id: string; brideName: string; date: string }) {
  return { pendingBookings: 1, latest: [{ id: booking.id, brideName: booking.brideName, date: booking.date }] };
}

async function cleanup() {
  const leftover = await db.booking.findMany({
    where: { OR: [{ brideName: BRIDE, bridePhone: STORED_PHONE }, { brideName: { startsWith: "TEST-E2E-" } }] },
    select: { id: true },
  });
  const ids = leftover.map((row) => row.id);
  if (!ids.length) return;
  await db.platformFee.deleteMany({ where: { bookingId: { in: ids } } });
  await db.booking.deleteMany({ where: { id: { in: ids } } });
}

async function publicBooking(
  business: Awaited<ReturnType<typeof loadBusiness>>,
  services: Array<{ id: string; nameAr: string; nameEn: string; durationMin: number; priceLyd: number }>,
  args: { date: string; shiftId?: string; name: string; phone: string; notes?: string; expiresAt?: Date },
) {
  return db.$transaction(
    (tx) =>
      createBusinessBooking(tx, {
        business,
        services,
        date: args.date,
        shiftId: args.shiftId,
        brideName: args.name,
        bridePhone: normalizePhone(args.phone),
        notes: args.notes || "Bridal makeup, Saturday morning",
        origin: "public",
        source: "bridey",
        status: "PENDING",
        expiresAt: args.expiresAt || new Date(Date.now() + 30 * 60 * 1000),
        requestId: randomUUID(),
      }),
    bookingTxOptions,
  );
}

async function run() {
  assert(PLATFORM_FEE_LYD === 5, "platform fee is 5 LYD");
  assert(STORED_PHONE === "218912345678", "0912345678 stores as 218912345678");
  assert(notesContainContact("0912345678"), "notes catch 0912345678");
  assert(notesContainContact("+218912345678"), "notes catch +218912345678");
  assert(notesContainContact("00218912345678"), "notes catch 00218912345678");
  assert(!(STATUS_TRANSITIONS.CONFIRMED || []).includes("PENDING"), "cannot roll confirmed back to pending");
  assert(!(STATUS_TRANSITIONS.CONFIRMED || []).includes("DECLINED"), "cannot reject after confirm");

  const lina = await db.artist.findUniqueOrThrow({ where: { slug: "lina" } });
  const linaWs = await ensureWorkspace(lina);
  const linaBiz = await loadBusiness(db, linaWs.business.id);
  const service = await db.service.findFirstOrThrow({ where: { businessId: linaWs.business.id, active: true } });
  const days = linaBiz.hours.map((row) => row.dayOfWeek);
  const date = nextOpenDate(days);
  const later = nextOpenDate(days, addDaysISO(date, 1));
  const later2 = nextOpenDate(days, addDaysISO(later, 1));
  const shift = linaBiz.shifts.find((row) => row.active);
  const owner = { memberId: linaWs.member.id, canManageBusiness: true };

  await cleanup();

  const pending = await publicBooking(linaBiz, [service], {
    date,
    shiftId: shift?.id,
    name: BRIDE,
    phone: RAW_PHONE,
  });
  assert(pending.status === "PENDING", "created pending");
  assert(pending.bridePhone === STORED_PHONE, "database still stores the real phone");

  const pendingRow = await loadStudioBooking(pending.id);
  const meBookings = [studioBookingPayload(pendingRow, owner)];
  const meEnvelope = { bookings: meBookings, fees: [], alerts: alertsPayload(pendingRow) };
  assert(meBookings[0].brideName === BRIDE, "Sara Ahmed is visible");
  assert(meBookings[0].status === "PENDING", "status pending");
  assert(Boolean(meBookings[0].date), "date visible");
  assert(!meBookings[0].bridePhone, "pending API phone is empty");
  assert(!meBookings[0].contactAvailable, "WhatsApp/contact locked");
  assert(!payloadContainsPhone(meEnvelope, RAW_PHONE), "dashboard JSON does not contain 0912345678");
  assert(!payloadContainsPhone(meEnvelope, STORED_PHONE), "dashboard JSON does not contain 218912345678");
  assert(!payloadContainsPhone(alertsPayload(pendingRow), RAW_PHONE), "alerts omit the phone");

  let notesBlocked = false;
  try {
    await publicBooking(linaBiz, [service], {
      date: addDaysISO(date, 7),
      shiftId: shift?.id,
      name: "TEST-E2E-NOTES",
      phone: "0912345679",
      notes: "call me 0912345678",
    });
  } catch (error) {
    notesBlocked = error instanceof NotesContactError;
  }
  assert(notesBlocked, "obvious phone in notes is rejected");

  const confirmed = await db.$transaction(async (tx) => {
    const next = await tx.booking.update({
      where: { id: pending.id },
      data: { status: "CONFIRMED", confirmedAt: new Date(), expiresAt: null },
    });
    const fee = await chargeBrideyFee(tx, next);
    if (!fee) throw new Error("fee missing");
    return tx.booking.findFirstOrThrow({
      where: { id: pending.id },
      include: {
        service: true,
        items: true,
        fee: true,
        shift: true,
        assignments: { include: { teamMember: { select: { id: true, name: true, roles: true } } } },
      },
    });
  }, bookingTxOptions);

  const confirmedView = studioBookingPayload(confirmed, owner);
  assert(confirmed.status === "CONFIRMED", "confirmed");
  assert(confirmedView.bridePhone === STORED_PHONE, "authorized user receives 218912345678 after confirm");
  assert(confirmedView.contactAvailable, "contact unlocked after confirm");
  const fee = await db.platformFee.findUnique({ where: { bookingId: confirmed.id } });
  assert(fee?.amountLyd === 5 && fee.status === "UNPAID", "exactly 5 LYD unpaid fee");

  assert(!(STATUS_TRANSITIONS[confirmed.status] || []).includes("CONFIRMED"), "second confirm is not an allowed transition");
  const again = await db.$transaction((tx) => chargeBrideyFee(tx, confirmed), bookingTxOptions);
  assert((await db.platformFee.count({ where: { bookingId: confirmed.id } })) === 1, "no duplicate fee");
  assert(again?.id === fee.id, "charge is idempotent");

  await db.booking.update({ where: { id: confirmed.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  const cancelled = await loadStudioBooking(confirmed.id);
  const cancelledView = studioBookingPayload(cancelled, owner);
  assert(cancelledView.bridePhone === STORED_PHONE, "phone stays available after confirm→cancel");
  assert((await db.platformFee.findUnique({ where: { bookingId: confirmed.id } }))?.status === "UNPAID", "cancel does not erase fee");

  let deleteBlocked = false;
  try {
    await db.booking.delete({ where: { id: confirmed.id } });
  } catch {
    deleteBlocked = true;
  }
  assert(deleteBlocked, "confirmed booking with a fee cannot be deleted");
  assert(await db.platformFee.findUnique({ where: { bookingId: confirmed.id } }), "billing record survives delete attempt");

  const declined = await publicBooking(linaBiz, [service], {
    date: later,
    shiftId: shift?.id,
    name: "TEST-E2E-DECLINED",
    phone: "0912345680",
  });
  await db.booking.update({ where: { id: declined.id }, data: { status: "DECLINED", expiresAt: null } });
  const declinedRow = await loadStudioBooking(declined.id);
  const declinedView = studioBookingPayload(declinedRow, owner);
  assert(declinedRow.status === "DECLINED", "rejected");
  assert(!declinedView.bridePhone && !declinedView.contactAvailable, "rejected phone stays hidden");
  assert(!(await db.platformFee.findUnique({ where: { bookingId: declined.id } })), "reject creates no fee");

  const expiring = await publicBooking(linaBiz, [service], {
    date: later2,
    shiftId: shift?.id,
    name: "TEST-E2E-EXPIRED",
    phone: "0912345681",
    expiresAt: new Date(Date.now() - 60 * 1000),
  });
  await expireOverdue(db, lina.id);
  const expiredRow = await loadStudioBooking(expiring.id);
  const expiredView = studioBookingPayload(expiredRow, owner);
  assert(expiredRow.status === "EXPIRED", "expired");
  assert(!expiredView.bridePhone && !expiredView.contactAvailable, "expired phone stays hidden");
  assert(!(await db.platformFee.findUnique({ where: { bookingId: expiredRow.id } })), "expire creates no fee");

  const sara = await db.artist.findUniqueOrThrow({ where: { slug: "sara-beauty" } });
  const saraWs = await ensureWorkspace(sara);
  const saraBiz = await loadBusiness(db, saraWs.business.id);
  const makeup = await db.service.findFirstOrThrow({ where: { businessId: saraWs.business.id, nameEn: "Bridal Makeup" } });
  const hair = await db.service.findFirstOrThrow({ where: { businessId: saraWs.business.id, nameEn: "Bridal Hair" } });
  const huda = saraBiz.members.find((row) => row.name === "هدى");
  const mona = saraBiz.members.find((row) => row.name === "منى");
  const aisha = saraBiz.members.find((row) => row.name === "عائشة");
  assert(huda && mona && aisha, "sara staff exist");
  await db.teamMember.update({ where: { id: huda.id }, data: { dailyCapacity: 4 } });
  await db.teamMember.update({ where: { id: mona.id }, data: { dailyCapacity: 5 } });
  const morning = saraBiz.shifts.find((row) => row.key === "morning");
  const openDays = saraBiz.hours.map((row) => row.dayOfWeek);
  let combo: Awaited<ReturnType<typeof createBusinessBooking>> | null = null;
  for (let i = 1; i <= 28 && !combo; i += 1) {
    const comboDate = addDaysISO(todayISO(), i);
    if (!openDays.includes(weekdayOf(comboDate))) continue;
    try {
      combo = await publicBooking(saraBiz, [makeup, hair], {
        date: comboDate,
        shiftId: morning?.id,
        name: "TEST-E2E-STAFF",
        phone: "0912345682",
      });
    } catch (error) {
      if (error instanceof PreferredUnavailableError || error instanceof CapacityFullError) continue;
      throw error;
    }
  }
  if (!combo) throw new Error("could not place staff booking");
  const comboRow = await loadStudioBooking(combo.id);
  const saraOwner = { memberId: saraWs.member.id, canManageBusiness: true };
  const hudaViewer = { memberId: huda.id, canManageBusiness: false };
  const aishaViewer = { memberId: aisha.id, canManageBusiness: false };
  assert(!studioBookingPayload(comboRow, saraOwner).bridePhone, "owner has no pending bypass");
  assert(!studioBookingPayload(comboRow, hudaViewer).bridePhone, "assigned staff no pending phone");
  assert(!payloadContainsPhone(studioBookingPayload(comboRow, saraOwner), "0912345682"), "team pending JSON clean");

  await db.$transaction(async (tx) => {
    const next = await tx.booking.update({
      where: { id: combo.id },
      data: { status: "CONFIRMED", confirmedAt: new Date(), expiresAt: null },
    });
    await chargeBrideyFee(tx, next);
  }, bookingTxOptions);
  const comboConfirmed = await loadStudioBooking(combo.id);
  assert(studioBookingPayload(comboConfirmed, saraOwner).contactAvailable, "owner sees phone after confirm");
  const assigned = comboConfirmed.assignments.map((row) => row.teamMemberId);
  if (assigned.includes(huda.id)) {
    assert(studioBookingPayload(comboConfirmed, hudaViewer).contactAvailable, "assigned staff sees phone after confirm");
  }
  if (!assigned.includes(aisha.id)) {
    assert(!studioBookingPayload(comboConfirmed, aishaViewer).bridePhone, "unassigned staff still hidden");
  }

  await cleanup();
  console.log("e2e privacy / anti-bypass verification passed");
}

run()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch(() => undefined);
    await db.$disconnect();
    process.exit(1);
  });
