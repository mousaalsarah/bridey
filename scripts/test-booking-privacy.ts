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
import { notesContainContact, payloadContainsPhone, presentBooking, viewerCanSeeBrideContact } from "../src/lib/booking-privacy";
import { PLATFORM_FEE_LYD } from "../src/lib/constants";
import { db } from "../src/lib/db";
import { addDaysISO, todayISO, weekdayOf } from "../src/lib/utils";
import { ensureWorkspace, loadBusiness } from "../src/lib/workspace";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function nextOpenDate(days: number[], from = todayISO()) {
  for (let i = 1; i <= 21; i += 1) {
    const date = addDaysISO(from, i);
    if (days.includes(weekdayOf(date))) return date;
  }
  return addDaysISO(from, 7);
}

async function cleanup() {
  const leftover = await db.booking.findMany({
    where: { brideName: { startsWith: "TEST-PRIV-" } },
    select: { id: true },
  });
  const ids = leftover.map((row) => row.id);
  if (!ids.length) return;
  await db.platformFee.deleteMany({ where: { bookingId: { in: ids } } });
  await db.booking.deleteMany({ where: { id: { in: ids } } });
}

async function run() {
  assert(!(STATUS_TRANSITIONS.CONFIRMED || []).includes("PENDING"), "confirmed cannot roll back to pending");
  assert((STATUS_TRANSITIONS.PENDING || []).includes("CONFIRMED"), "pending can confirm");
  assert((STATUS_TRANSITIONS.PENDING || []).includes("DECLINED"), "pending can decline");
  assert((STATUS_TRANSITIONS.PENDING || []).includes("EXPIRED"), "pending can expire");
  assert((STATUS_TRANSITIONS.CONFIRMED || []).includes("CANCELLED"), "confirmed can cancel");

  assert(notesContainContact("كلمني 0910000001"), "notes catch 09XXXXXXXX");
  assert(notesContainContact("09 1000 0001"), "notes catch spaced 09");
  assert(notesContainContact("+218 91 000 0001"), "notes catch +218");
  assert(notesContainContact("00218910000001"), "notes catch 00218");
  assert(notesContainContact("واتساب 218910000001"), "notes catch 2189");
  assert(notesContainContact("https://wa.me/218910000001"), "notes catch wa.me");
  assert(notesContainContact("email me at sara@example.com"), "notes catch email");
  assert(notesContainContact("رقمي ٠٩١٠٠٠٠٠٠١"), "notes catch arabic digits");
  assert(!notesContainContact("الفرح في قاعة الأندلس، الساعة 5 عصراً"), "ordinary venue notes allowed");
  assert(!notesContainContact("السعر 150 دينار"), "prices are not phones");
  assert(!notesContainContact("2026-12-04"), "dates are not phones");
  assert(!notesContainContact("قاعة رقم 12"), "short numbers are not phones");

  const lina = await db.artist.findUniqueOrThrow({ where: { slug: "lina" } });
  const linaWs = await ensureWorkspace(lina);
  const linaBiz = await loadBusiness(db, linaWs.business.id);
  const linaService = await db.service.findFirstOrThrow({ where: { businessId: linaWs.business.id, active: true } });
  const linaDate = nextOpenDate(linaBiz.hours.map((row) => row.dayOfWeek));
  const linaShift = linaBiz.shifts.find((row) => row.active);
  const owner = { memberId: linaWs.member.id, canManageBusiness: true };

  await cleanup();

  const pending = await db.$transaction(
    (tx) =>
      createBusinessBooking(tx, {
        business: linaBiz,
        services: [linaService],
        date: linaDate,
        shiftId: linaShift?.id,
        brideName: "TEST-PRIV-PENDING",
        bridePhone: "218910008801",
        origin: "public",
        source: "bridey",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        requestId: randomUUID(),
      }),
    bookingTxOptions,
  );

  const pendingView = presentBooking(pending, owner);
  assert(!pendingView.bridePhone, "1 owner does not receive pending phone");
  assert(!pendingView.contactAvailable, "1 contact stays locked while pending");
  assert(!payloadContainsPhone(pendingView, "218910008801"), "2 pending payload does not contain the phone");
  assert(!viewerCanSeeBrideContact(pending, owner), "2 owner cannot read pending phone");

  let notesBlocked = false;
  try {
    await db.$transaction(
      (tx) =>
        createBusinessBooking(tx, {
          business: linaBiz,
          services: [linaService],
          date: addDaysISO(linaDate, 1),
          shiftId: linaShift?.id,
          brideName: "TEST-PRIV-NOTES",
          bridePhone: "218910008809",
          notes: "كلمني على 0910000001",
          origin: "public",
          source: "bridey",
          status: "PENDING",
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          requestId: randomUUID(),
        }),
      bookingTxOptions,
    );
  } catch (error) {
    notesBlocked = error instanceof NotesContactError;
  }
  assert(notesBlocked, "public notes with a phone are rejected");

  const sneaky = presentBooking(
    { ...pending, notes: "واتساب 218910008801 القاعة الأندلس" },
    owner,
  );
  assert(!payloadContainsPhone(sneaky, "218910008801"), "pending notes cannot smuggle the phone");
  assert(sneaky.notes.includes("الأندلس"), "safe note text remains");

  const confirmed = await db.$transaction(async (tx) => {
    const next = await tx.booking.update({
      where: { id: pending.id },
      data: { status: "CONFIRMED", confirmedAt: new Date(), expiresAt: null },
    });
    const fee = await chargeBrideyFee(tx, next);
    if (!fee) throw new Error("fee missing after confirm");
    return tx.booking.findFirstOrThrow({
      where: { id: pending.id },
      include: { assignments: true },
    });
  }, bookingTxOptions);

  const confirmedView = presentBooking(confirmed, owner);
  assert(confirmed.status === "CONFIRMED", "3 status is confirmed");
  assert(confirmedView.bridePhone === "218910008801", "3 phone unlocked after confirm");
  assert(confirmedView.contactAvailable, "3 contact available after confirm");
  const fee = await db.platformFee.findUnique({ where: { bookingId: confirmed.id } });
  assert(fee?.amountLyd === PLATFORM_FEE_LYD && fee.status === "UNPAID", "3 exactly 5 LYD unpaid fee");

  const again = await db.$transaction((tx) => chargeBrideyFee(tx, confirmed), bookingTxOptions);
  const fees = await db.platformFee.findMany({ where: { bookingId: confirmed.id } });
  assert(fees.length === 1 && again?.id === fee?.id, "10 second confirm/charge does not duplicate the fee");

  const declined = await db.$transaction(
    (tx) =>
      createBusinessBooking(tx, {
        business: linaBiz,
        services: [linaService],
        date: addDaysISO(linaDate, 7),
        shiftId: linaShift?.id,
        brideName: "TEST-PRIV-DECLINED",
        bridePhone: "218910008802",
        origin: "public",
        source: "bridey",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
        requestId: randomUUID(),
      }),
    bookingTxOptions,
  );
  await db.booking.update({ where: { id: declined.id }, data: { status: "DECLINED", expiresAt: null } });
  const declinedRow = await db.booking.findFirstOrThrow({ where: { id: declined.id }, include: { assignments: true } });
  const declinedView = presentBooking(declinedRow, owner);
  assert(!declinedView.bridePhone && !declinedView.contactAvailable, "4 declined phone stays hidden");
  assert(!(await db.platformFee.findUnique({ where: { bookingId: declined.id } })), "4 declined creates no fee");

  const expiring = await db.$transaction(
    (tx) =>
      createBusinessBooking(tx, {
        business: linaBiz,
        services: [linaService],
        date: addDaysISO(linaDate, 8),
        shiftId: linaShift?.id,
        brideName: "TEST-PRIV-EXPIRED",
        bridePhone: "218910008803",
        origin: "public",
        source: "bridey",
        status: "PENDING",
        expiresAt: new Date(Date.now() - 60 * 1000),
        requestId: randomUUID(),
      }),
    bookingTxOptions,
  );
  await expireOverdue(db, lina.id);
  const expiredRow = await db.booking.findFirstOrThrow({ where: { id: expiring.id }, include: { assignments: true } });
  assert(expiredRow.status === "EXPIRED", "5 pending hold expires");
  const expiredView = presentBooking(expiredRow, owner);
  assert(!expiredView.bridePhone && !expiredView.contactAvailable, "5 expired phone stays hidden");
  assert(!(await db.platformFee.findUnique({ where: { bookingId: expiredRow.id } })), "5 expired creates no fee");

  await db.booking.update({
    where: { id: confirmed.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });
  const cancelledRow = await db.booking.findFirstOrThrow({ where: { id: confirmed.id }, include: { assignments: true } });
  const cancelledView = presentBooking(cancelledRow, owner);
  assert(cancelledView.bridePhone === "218910008801", "6 phone stays available after confirmed→cancelled");
  const feeAfterCancel = await db.platformFee.findUnique({ where: { bookingId: confirmed.id } });
  assert(feeAfterCancel?.status === "UNPAID" && feeAfterCancel.amountLyd === PLATFORM_FEE_LYD, "6 cancel does not erase the fee");

  const sara = await db.artist.findUniqueOrThrow({ where: { slug: "sara-beauty" } });
  const saraWs = await ensureWorkspace(sara);
  const saraBiz = await loadBusiness(db, saraWs.business.id);
  const makeup = await db.service.findFirstOrThrow({ where: { businessId: saraWs.business.id, nameEn: "Bridal Makeup" } });
  const hair = await db.service.findFirstOrThrow({ where: { businessId: saraWs.business.id, nameEn: "Bridal Hair" } });
  const huda = saraBiz.members.find((row) => row.name === "هدى");
  const mona = saraBiz.members.find((row) => row.name === "منى");
  const aisha = saraBiz.members.find((row) => row.name === "عائشة");
  assert(huda && mona && aisha, "sara staff exist");
  await db.teamMember.update({ where: { id: huda!.id }, data: { dailyCapacity: 4 } });
  await db.teamMember.update({ where: { id: mona!.id }, data: { dailyCapacity: 5 } });
  const morning = saraBiz.shifts.find((row) => row.key === "morning");
  const openDays = saraBiz.hours.map((row) => row.dayOfWeek);
  let combo: Awaited<ReturnType<typeof createBusinessBooking>> | null = null;
  for (let i = 1; i <= 28 && !combo; i += 1) {
    const date = addDaysISO(todayISO(), i);
    if (!openDays.includes(weekdayOf(date))) continue;
    try {
      combo = await db.$transaction(
        (tx) =>
          createBusinessBooking(tx, {
            business: saraBiz,
            services: [makeup, hair],
            date,
            shiftId: morning?.id,
            preferredByService: { [makeup.id]: huda!.id, [hair.id]: mona!.id },
            brideName: "TEST-PRIV-STAFF",
            bridePhone: "218910008804",
            origin: "public",
            source: "bridey",
            status: "PENDING",
            expiresAt: new Date(Date.now() + 30 * 60 * 1000),
            requestId: randomUUID(),
          }),
        bookingTxOptions,
      );
    } catch (error) {
      if (error instanceof PreferredUnavailableError || error instanceof CapacityFullError) continue;
      throw error;
    }
  }
  if (!combo) throw new Error("could place a makeup+hair test booking");
  const hudaViewer = { memberId: huda!.id, canManageBusiness: false };
  const aishaViewer = { memberId: aisha!.id, canManageBusiness: false };
  const saraOwner = { memberId: saraWs.member.id, canManageBusiness: true };
  assert(!viewerCanSeeBrideContact(combo, hudaViewer), "7 assigned staff cannot see pending phone");
  assert(!viewerCanSeeBrideContact(combo, saraOwner), "7 owner cannot see pending phone either");
  assert(!payloadContainsPhone(presentBooking(combo, saraOwner), "218910008804"), "8 no customer-list bypass via pending payload");

  const comboConfirmed = await db.$transaction(async (tx) => {
    const next = await tx.booking.update({
      where: { id: combo.id },
      data: { status: "CONFIRMED", confirmedAt: new Date(), expiresAt: null },
    });
    await chargeBrideyFee(tx, next);
    return tx.booking.findFirstOrThrow({ where: { id: combo.id }, include: { assignments: true } });
  }, bookingTxOptions);

  assert(viewerCanSeeBrideContact(comboConfirmed, saraOwner), "7 owner sees phone after confirm");
  assert(viewerCanSeeBrideContact(comboConfirmed, hudaViewer), "7 assigned makeup artist sees phone after confirm");
  assert(viewerCanSeeBrideContact(comboConfirmed, { memberId: mona!.id, canManageBusiness: false }), "7 assigned hairstylist sees phone after confirm");
  assert(!viewerCanSeeBrideContact(comboConfirmed, aishaViewer), "7 unassigned staff cannot see phone");
  assert(presentBooking(comboConfirmed, aishaViewer).bridePhone === "", "7 unassigned payload strips phone");

  const alertsShape = { pendingBookings: 1, latest: [{ id: pending.id, brideName: "Sara", date: linaDate }] };
  assert(!payloadContainsPhone(alertsShape, "218910008801"), "9 pending notification shape has no phone");

  await cleanup();
  console.log("booking privacy / confirm-fee tests passed");
}

run()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await cleanup().catch(() => undefined);
    await db.$disconnect();
    process.exit(1);
  });
