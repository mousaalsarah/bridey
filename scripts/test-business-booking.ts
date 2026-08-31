import { randomUUID } from "crypto";
import {
  bookingTxOptions,
  chargeBrideyFee,
  createBusinessBooking,
} from "../src/lib/booking";
import { PLATFORM_FEE_LYD } from "../src/lib/constants";
import { CapacityFullError, PreferredUnavailableError, assignStaff, remainingOf, staffSnapshots } from "../src/lib/capacity";
import { db } from "../src/lib/db";
import { addDaysISO, todayISO, weekdayOf } from "../src/lib/utils";
import { isTeamBusiness } from "../src/lib/roles";
import { ensureWorkspace, loadBusiness, promoteToSalonIfTeam } from "../src/lib/workspace";

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

async function run() {
  assert(PLATFORM_FEE_LYD === 5, "platform fee is 5 LYD per confirmed booking");

  const lina = await db.artist.findUnique({ where: { slug: "lina" } });
  assert(lina, "lina demo exists");
  const linaWs = await ensureWorkspace(lina!);
  assert(linaWs.business.businessType === "independent", "lina is independent");
  assert(linaWs.business.members.filter((row) => row.status === "ACTIVE").length === 1, "independent artist has one team member");
  assert(linaWs.member.artistId === lina!.id, "owner is the only staff member");
  assert(linaWs.member.roles.includes("OWNER"), "independent owner keeps the owner role");
  assert(!isTeamBusiness(linaWs.business.businessType, 1), "solo independent is not a team-nav business");
  assert(isTeamBusiness("salon", 1), "salon keeps team nav even with one member");
  assert(isTeamBusiness("independent", 2), "hiring a second member exposes team UI");

  const sara = await db.artist.findUnique({ where: { slug: "sara-beauty" } });
  assert(sara, "sara beauty demo exists");
  const saraWs = await ensureWorkspace(sara!);
  assert(saraWs.business.businessType === "salon", "sara is a salon");
  const active = saraWs.business.members.filter((row) => row.status === "ACTIVE");
  assert(active.length === 4, `sara has 4 staff, got ${active.length}`);
  assert(active.filter((row) => row.artistId === sara!.id).length === 1, "owner is not duplicated");

  const makeup = await db.service.findFirst({ where: { businessId: saraWs.business.id, nameEn: "Bridal Makeup" } });
  const hair = await db.service.findFirst({ where: { businessId: saraWs.business.id, nameEn: "Bridal Hair" } });
  assert(makeup && hair, "sara services exist");
  const morning = saraWs.business.shifts.find((row) => row.key === "morning");
  assert(morning, "morning shift exists");
  const date = nextOpenDate(saraWs.business.hours.map((row) => row.dayOfWeek));

  const huda = active.find((row) => row.name === "هدى");
  const mona = active.find((row) => row.name === "منى");
  const aisha = active.find((row) => row.name === "عائشة");
  const saraMember = active.find((row) => row.name === "سارة");
  assert(huda && mona, "huda and mona exist");

  await db.booking.deleteMany({ where: { brideName: { startsWith: "TEST-" }, status: "PENDING" } });
  if (huda) await db.teamMember.update({ where: { id: huda.id }, data: { dailyCapacity: 3 } });
  if (aisha) await db.teamMember.update({ where: { id: aisha.id }, data: { dailyCapacity: 4 } });
  if (mona) await db.teamMember.update({ where: { id: mona.id }, data: { dailyCapacity: 5 } });
  if (saraMember) await db.teamMember.update({ where: { id: saraMember.id }, data: { dailyCapacity: 4 } });
  const business = await loadBusiness(db, saraWs.business.id);

  const combo = await db.$transaction(
    (tx) =>
      createBusinessBooking(tx, {
        business,
        services: [makeup!, hair!],
        date,
        shiftId: morning!.id,
        brideName: "TEST-COMBO",
        bridePhone: "218910009901",
        origin: "public",
        source: "bridey",
        status: "PENDING",
        requestId: randomUUID(),
      }),
    bookingTxOptions,
  );
  const makeupAssign = combo.assignments.find((row) => row.serviceId === makeup!.id);
  const hairAssign = combo.assignments.find((row) => row.serviceId === hair!.id);
  assert(makeupAssign && hairAssign, "combo booking assigned both services");
  assert(hairAssign!.teamMemberId === mona!.id, "hair assigned to Mona");
  assert(makeupAssign!.teamMemberId !== mona!.id, "makeup assigned to a makeup artist");

  const hoursDays = business.hours.map((row) => row.dayOfWeek);
  const prefDate = nextOpenDate(hoursDays, date);
  const snapshots = await staffSnapshots(db, business, prefDate, morning!.id);
  const makeupStaff = snapshots.filter((row) => row.serviceIds.includes(makeup!.id) && remainingOf(row) > 0);
  const hairStaff = snapshots.filter((row) => row.serviceIds.includes(hair!.id) && remainingOf(row) > 0);
  assert(makeupStaff.length > 0 && hairStaff.length > 0, "combo has available makeup and hair staff");
  const makeupPick = makeupStaff.find((row) => row.id === huda?.id) || makeupStaff[0];
  const hairPick = hairStaff.find((row) => row.id === mona?.id && row.id !== makeupPick.id) || hairStaff.find((row) => row.id !== makeupPick.id) || hairStaff[0];
  const dualPref = assignStaff({
    serviceIds: [makeup!.id, hair!.id],
    staff: snapshots,
    preferredByService: { [makeup!.id]: makeupPick.id, [hair!.id]: hairPick.id },
    business,
  });
  assert(dualPref.find((row) => row.serviceId === makeup!.id)?.teamMemberId === makeupPick.id, "preferred makeup stays chosen artist");
  assert(dualPref.find((row) => row.serviceId === hair!.id)?.teamMemberId === hairPick.id, "preferred hair stays chosen stylist");

  const makeupOnly = makeupStaff.find((row) => !row.serviceIds.includes(hair!.id));
  if (makeupOnly) {
    let hairBlocked = false;
    try {
      assignStaff({
        serviceIds: [makeup!.id, hair!.id],
        staff: snapshots,
        preferredByService: { [hair!.id]: makeupOnly.id },
        business,
      });
    } catch (error) {
      hairBlocked = error instanceof PreferredUnavailableError;
    }
    assert(hairBlocked, "makeup artist cannot be preferred for hair");
  }

  const comboPref = await db.$transaction(
    (tx) =>
      createBusinessBooking(tx, {
        business,
        services: [makeup!, hair!],
        date: prefDate,
        shiftId: morning!.id,
        preferredByService: { [makeup!.id]: makeupPick.id, [hair!.id]: hairPick.id },
        brideName: "TEST-COMBO-PREF",
        bridePhone: "218910009903",
        origin: "public",
        source: "bridey",
        status: "PENDING",
        requestId: randomUUID(),
      }),
    bookingTxOptions,
  );
  assert(
    comboPref.assignments.find((row) => row.serviceId === makeup!.id)?.teamMemberId === makeupPick.id,
    "combo booking keeps preferred makeup artist",
  );
  assert(
    comboPref.assignments.find((row) => row.serviceId === hair!.id)?.teamMemberId === hairPick.id,
    "combo booking keeps preferred hairstylist",
  );

  const dayBiz = await db.business.update({
    where: { id: saraWs.business.id },
    data: { scheduleMode: "DAY" },
  });
  void dayBiz;
  const dayLoaded = await loadBusiness(db, saraWs.business.id);
  const dayBooking = await db.$transaction(
    (tx) =>
      createBusinessBooking(tx, {
        business: dayLoaded,
        services: [makeup!],
        date: addDaysISO(date, 7),
        brideName: "TEST-DAY",
        bridePhone: "218910009902",
        origin: "public",
        source: "bridey",
        status: "PENDING",
        requestId: randomUUID(),
      }),
    bookingTxOptions,
  );
  assert(dayBooking.scheduleMode === "DAY", "day booking does not require an hour");
  await db.business.update({ where: { id: saraWs.business.id }, data: { scheduleMode: "SHIFT" } });

  const capArtist = await db.artist.create({
    data: {
      name: "اختبار سعة",
      phone: `21899${Date.now().toString().slice(-7)}`,
      passwordHash: lina!.passwordHash,
      slug: `cap-${Date.now().toString(36)}`,
      onboardingComplete: false,
    },
  });
  const capWs = await ensureWorkspace(capArtist);
  await db.weeklyHour.createMany({
    data: [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      artistId: capArtist.id,
      businessId: capWs.business.id,
      dayOfWeek,
      startMin: 10 * 60,
      endMin: 22 * 60,
    })),
  });
  await db.shift.deleteMany({ where: { businessId: capWs.business.id } });
  await db.shift.create({
    data: {
      businessId: capWs.business.id,
      key: "morning",
      nameAr: "صباح",
      nameEn: "Morning",
      startMin: 10 * 60,
      endMin: 14 * 60,
      sortOrder: 0,
      active: true,
    },
  });
  await db.teamMember.update({ where: { id: capWs.member.id }, data: { dailyCapacity: 4 } });
  const capService = await db.service.create({
    data: {
      artistId: capArtist.id,
      businessId: capWs.business.id,
      nameAr: "اختبار",
      nameEn: "Test",
      kind: "bridal",
      durationMin: 60,
      priceLyd: 10,
    },
  });
  await db.teamMemberService.create({
    data: { teamMemberId: capWs.member.id, serviceId: capService.id },
  });
  const capBusiness = await loadBusiness(db, capWs.business.id);
  const capShift = capBusiness.shifts[0];
  const capDate = addDaysISO(todayISO(), 3);
  for (let i = 0; i < 4; i += 1) {
    await db.$transaction(
      (tx) =>
        createBusinessBooking(tx, {
          business: capBusiness,
          services: [capService],
          date: capDate,
          shiftId: capShift.id,
          brideName: `TEST-CAP-${i}`,
          bridePhone: `21891000991${i}`,
          origin: "public",
          source: "bridey",
          status: "CONFIRMED",
          requestId: randomUUID(),
        }),
      bookingTxOptions,
    );
  }
  let fifthFailed = false;
  try {
    await db.$transaction(
      (tx) =>
        createBusinessBooking(tx, {
          business: capBusiness,
          services: [capService],
          date: capDate,
          shiftId: capShift.id,
          brideName: "TEST-CAP-5",
          bridePhone: "218910009915",
          origin: "public",
          source: "bridey",
          status: "PENDING",
          requestId: randomUUID(),
        }),
      bookingTxOptions,
    );
  } catch (error) {
    fifthFailed = error instanceof CapacityFullError;
  }
  assert(fifthFailed, "fifth booking beyond capacity 4 must fail");

  await db.teamMember.update({ where: { id: capWs.member.id }, data: { dailyCapacity: 6 } });
  const raceDate = addDaysISO(todayISO(), 4);
  const capForRace = await loadBusiness(db, capWs.business.id);
  await db.$transaction(
    (tx) =>
      createBusinessBooking(tx, {
        business: capForRace,
        services: [capService],
        date: raceDate,
        shiftId: capShift.id,
        brideName: "TEST-RACE-EXISTING",
        bridePhone: "218910009920",
        origin: "public",
        source: "bridey",
        status: "PENDING",
        requestId: randomUUID(),
      }),
    bookingTxOptions,
  );
  await db.teamMember.update({ where: { id: capWs.member.id }, data: { dailyCapacity: 2 } });
  const raceBiz = await loadBusiness(db, capWs.business.id);
  const racing = await Promise.allSettled([
    db.$transaction(
      (tx) =>
        createBusinessBooking(tx, {
          business: raceBiz,
          services: [capService],
          date: raceDate,
          shiftId: capShift.id,
          brideName: "TEST-RACE-A",
          bridePhone: "218910009921",
          origin: "public",
          source: "bridey",
          status: "PENDING",
          requestId: randomUUID(),
        }),
      bookingTxOptions,
    ),
    db.$transaction(
      (tx) =>
        createBusinessBooking(tx, {
          business: raceBiz,
          services: [capService],
          date: raceDate,
          shiftId: capShift.id,
          brideName: "TEST-RACE-B",
          bridePhone: "218910009922",
          origin: "public",
          source: "bridey",
          status: "PENDING",
          requestId: randomUUID(),
        }),
      bookingTxOptions,
    ),
  ]);
  const wins = racing.filter((row) => row.status === "fulfilled").length;
  const losses = racing.filter((row) => row.status === "rejected").length;
  assert(wins === 1 && losses === 1, `concurrent last seat: expected 1 win 1 loss, got ${wins} wins ${losses} losses`);

  await db.teamMember.update({ where: { id: makeupPick.id }, data: { dailyCapacity: 1 } });
  const freshSara = await loadBusiness(db, saraWs.business.id);
  let preferredDate = "";
  for (let i = 1; i <= 21; i += 1) {
    const candidate = addDaysISO(todayISO(), i);
    if (!hoursDays.includes(weekdayOf(candidate))) continue;
    const snaps = await staffSnapshots(db, freshSara, candidate, morning!.id);
    const snap = snaps.find((row) => row.id === makeupPick.id);
    if (snap && remainingOf(snap) > 0) {
      preferredDate = candidate;
      break;
    }
  }
  assert(preferredDate, "found an open day with remaining capacity for the preferred-artist test");
  await db.$transaction(
    (tx) =>
      createBusinessBooking(tx, {
        business: freshSara,
        services: [makeup!],
        date: preferredDate,
        shiftId: morning!.id,
        preferredMemberId: makeupPick.id,
        brideName: "TEST-HUDA-FULL",
        bridePhone: "218910009930",
        origin: "public",
        source: "bridey",
        status: "PENDING",
        requestId: randomUUID(),
      }),
    bookingTxOptions,
  );
  let preferredBlocked = false;
  const saraAfterHuda = await loadBusiness(db, saraWs.business.id);
  try {
    await db.$transaction(
      (tx) =>
        createBusinessBooking(tx, {
          business: saraAfterHuda,
          services: [makeup!],
          date: preferredDate,
          shiftId: morning!.id,
          preferredMemberId: makeupPick.id,
          brideName: "TEST-HUDA-AGAIN",
          bridePhone: "218910009931",
          origin: "public",
          source: "bridey",
          status: "PENDING",
          requestId: randomUUID(),
        }),
      bookingTxOptions,
    );
  } catch (error) {
    preferredBlocked = error instanceof PreferredUnavailableError;
  }
  assert(preferredBlocked, "preferred artist stays preferred — no silent reassignment");

  const saraForAny = await loadBusiness(db, saraWs.business.id);
  const leftoverSnaps = await staffSnapshots(db, saraForAny, preferredDate, morning!.id);
  const otherMakeup = leftoverSnaps.filter(
    (row) => row.id !== makeupPick.id && row.serviceIds.includes(makeup!.id) && remainingOf(row) > 0,
  );
  if (otherMakeup.length > 0) {
    const fallback = await db.$transaction(
      (tx) =>
        createBusinessBooking(tx, {
          business: saraForAny,
          services: [makeup!],
          date: preferredDate,
          shiftId: morning!.id,
          brideName: "TEST-ANY",
          bridePhone: "218910009932",
          origin: "public",
          source: "bridey",
          status: "PENDING",
          requestId: randomUUID(),
        }),
      bookingTxOptions,
    );
    assert(
      fallback.assignments[0]?.teamMemberId !== makeupPick.id,
      "any-available skips the full preferred artist",
    );
  }
  await db.teamMember.update({
    where: { id: makeupPick.id },
    data: { dailyCapacity: makeupPick.dailyCapacity || 4 },
  });

  const capForFee = await loadBusiness(db, capWs.business.id);
  const feeBooking = await db.$transaction(
    (tx) =>
      createBusinessBooking(tx, {
        business: capForFee,
        services: [capService],
        date: addDaysISO(todayISO(), 5),
        shiftId: capShift.id,
        brideName: "TEST-FEE",
        bridePhone: "218910009940",
        origin: "public",
        source: "bridey",
        status: "CONFIRMED",
        requestId: randomUUID(),
      }),
    bookingTxOptions,
  );
  const fee = await db.$transaction((tx) => chargeBrideyFee(tx, feeBooking));
  assert(fee?.amountLyd === 5, "confirmed public booking charges 5 LYD");
  assert(fee?.businessId === capWs.business.id, "fee belongs to the business");
  assert(fee?.artistId === capArtist.id, "invoice still settles against the owner account");

  const linaService = await db.service.findFirstOrThrow({ where: { businessId: linaWs.business.id, active: true } });
  const linaBiz = await loadBusiness(db, linaWs.business.id);
  const linaBook = await db.$transaction(
    (tx) =>
      createBusinessBooking(tx, {
        business: linaBiz,
        services: [linaService],
        date: nextOpenDate(linaBiz.hours.map((row) => row.dayOfWeek)),
        shiftId: linaBiz.shifts.find((row) => row.active)?.id,
        brideName: "TEST-LINA",
        bridePhone: "218910009950",
        origin: "public",
        source: "bridey",
        status: "PENDING",
        requestId: randomUUID(),
      }),
    bookingTxOptions,
  );
  assert(linaBook.assignments[0]?.teamMemberId === linaWs.member.id, "independent booking goes to the owner-artist");

  const beforeHire = await db.business.findUniqueOrThrow({ where: { id: linaWs.business.id } });
  await db.teamMember.deleteMany({ where: { businessId: linaWs.business.id, name: "TEST-HUDA" } });
  const hire = await db.teamMember.create({
    data: {
      businessId: linaWs.business.id,
      name: "TEST-HUDA",
      phone: "218910009960",
      roles: "MAKEUP_ARTIST",
      dailyCapacity: 4,
      status: "ACTIVE",
    },
  });
  try {
    await promoteToSalonIfTeam(db, linaWs.business.id);
    const afterHire = await db.business.findUniqueOrThrow({ where: { id: linaWs.business.id } });
    const afterCount = await db.teamMember.count({
      where: { businessId: linaWs.business.id, status: "ACTIVE" },
    });
    assert(afterHire.id === beforeHire.id, "hiring does not create a new business");
    assert(afterHire.ownerId === beforeHire.ownerId, "hiring does not change the owner");
    assert(afterHire.businessType === "salon", "first extra member turns the workspace into a salon");
    assert(isTeamBusiness(afterHire.businessType, afterCount), "team nav appears after hiring");
    const linaBookingStill = await db.booking.findUnique({ where: { id: linaBook.id } });
    assert(linaBookingStill?.businessId === linaWs.business.id, "existing bookings stay on the same business");
  } finally {
    await db.teamMember.delete({ where: { id: hire.id } });
    await db.business.update({
      where: { id: linaWs.business.id },
      data: { businessType: "independent" },
    });
  }

  console.log("business / capacity / team booking tests passed");
}

run()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
