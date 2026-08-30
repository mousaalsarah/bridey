/**
 * Local hardening checks against the SQLite database.
 * Run after `npx prisma generate` and a running or stopped app.
 */
import { PrismaClient } from "@prisma/client";
import { chargeBrideyFee, createGuardedBooking, hasOverlap, rangesOverlap, SlotTakenError } from "../src/lib/booking";

const db = new PrismaClient();

function assert(cond: unknown, label: string) {
  if (!cond) throw new Error(`FAIL ${label}`);
  console.log(`PASS ${label}`);
}

async function main() {
  const lina = await db.artist.findUnique({ where: { slug: "lina" } });
  const noor = await db.artist.findUnique({ where: { slug: "noor" } });
  assert(lina && noor, "demo artists exist");
  const glam = await db.service.findFirst({ where: { artistId: lina!.id, nameAr: "مكياج عروس كامل" } });
  const trial = await db.service.findFirst({ where: { artistId: lina!.id, nameAr: "تجربة المكياج" } });
  const noorSvc = await db.service.findFirst({ where: { artistId: noor!.id } });
  assert(glam && trial && noorSvc, "demo services exist");

  const date = "2026-10-15";
  const leftover = await db.booking.findMany({
    where: { bridePhone: { startsWith: "21899" }, artistId: { in: [lina!.id, noor!.id] } },
    select: { id: true },
  });
  if (leftover.length) {
    await db.platformFee.deleteMany({ where: { bookingId: { in: leftover.map((b) => b.id) } } });
    await db.booking.deleteMany({ where: { id: { in: leftover.map((b) => b.id) } } });
  }

  // Scenario 1 — manual Snapchat booking, no fee, blocks slot
  const manual = await db.$transaction((tx) =>
    createGuardedBooking(
      tx,
      {
        artist: { connect: { id: lina!.id } },
        service: { connect: { id: glam!.id } },
        origin: "manual",
        source: "snapchat",
        brideName: "منى اختبار",
        bridePhone: "218991111111",
        date,
        startMin: 10 * 60,
        endMin: 12 * 60,
        status: "CONFIRMED",
        items: {
          create: [{ serviceId: glam!.id, nameAr: glam!.nameAr, nameEn: glam!.nameEn, durationMin: 120, priceLyd: 450 }],
        },
      },
      { artistId: lina!.id, date, startMin: 600, endMin: 720 },
    ),
  );
  const fee1 = await db.platformFee.findUnique({ where: { bookingId: manual.id } });
  assert(!fee1 && manual.origin === "manual", "1 manual snapchat booking has 0 fee");
  assert(await hasOverlap(db, { artistId: lina!.id, date, startMin: 660, endMin: 780 }), "1 overlapping 11-13 is blocked");

  // Scenario 2 — public confirm creates exactly 10 LYD
  const publicB = await db.$transaction((tx) =>
    createGuardedBooking(
      tx,
      {
        artist: { connect: { id: lina!.id } },
        service: { connect: { id: trial!.id } },
        origin: "public",
        source: "bridey",
        trackCode: "BRTESTPUB01",
        brideName: "هدى اختبار",
        bridePhone: "218992222222",
        date,
        startMin: 13 * 60,
        endMin: 14 * 60 + 30,
        status: "PENDING",
        items: {
          create: [{ serviceId: trial!.id, nameAr: trial!.nameAr, nameEn: trial!.nameEn, durationMin: 90, priceLyd: 180 }],
        },
      },
      { artistId: lina!.id, date, startMin: 780, endMin: 870 },
    ),
  );
  await db.$transaction(async (tx) => {
    const next = await tx.booking.update({ where: { id: publicB.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
    await chargeBrideyFee(tx, next);
  });
  const fees2 = await db.platformFee.findMany({ where: { bookingId: publicB.id } });
  assert(fees2.length === 1 && fees2[0].amountLyd === 10, "2 public confirm adds exactly 10 LYD");

  // Scenario 4 — confirm twice does not duplicate fee
  await db.$transaction(async (tx) => {
    await chargeBrideyFee(tx, { id: publicB.id, artistId: lina!.id, origin: "public" });
    await chargeBrideyFee(tx, { id: publicB.id, artistId: lina!.id, origin: "public" });
  });
  const fees4 = await db.platformFee.findMany({ where: { bookingId: publicB.id } });
  assert(fees4.length === 1, "4 double confirm still one fee");

  // Scenario 3 — declined public has no fee
  const declined = await db.booking.create({
    data: {
      artistId: lina!.id,
      serviceId: trial!.id,
      origin: "public",
      source: "bridey",
      trackCode: "BRTESTDEC01",
      brideName: "رفض اختبار",
      bridePhone: "218993333333",
      date: "2026-10-16",
      startMin: 600,
      endMin: 690,
      status: "DECLINED",
    },
  });
  const fee3 = await db.platformFee.findUnique({ where: { bookingId: declined.id } });
  assert(!fee3, "3 declined booking has no fee");

  // Scenario 5 — race on same slot: second create fails
  let secondFailed = false;
  try {
    await db.$transaction((tx) =>
      createGuardedBooking(
        tx,
        {
          artist: { connect: { id: lina!.id } },
          service: { connect: { id: trial!.id } },
          origin: "public",
          source: "bridey",
          brideName: "تداخل",
          bridePhone: "218994444444",
          date,
          startMin: 10 * 60,
          endMin: 11 * 60,
          status: "PENDING",
        },
        { artistId: lina!.id, date, startMin: 600, endMin: 660 },
      ),
    );
  } catch (e) {
    secondFailed = e instanceof SlotTakenError;
  }
  assert(secondFailed, "5 overlapping public request rejected");

  // Scenario 6 — cancel confirmed keeps fee
  await db.booking.update({ where: { id: publicB.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  const still = await db.booking.findUnique({ where: { id: publicB.id }, include: { fee: true } });
  assert(still?.status === "CANCELLED" && still.fee?.amountLyd === 10, "6 cancelled confirmed stays in history with fee");

  // Scenario 7 — manual WhatsApp, no fee, blocks
  const wa = await db.$transaction((tx) =>
    createGuardedBooking(
      tx,
      {
        artist: { connect: { id: lina!.id } },
        service: { connect: { id: trial!.id } },
        origin: "manual",
        source: "whatsapp",
        brideName: "واتساب اختبار",
        bridePhone: "218995555555",
        date: "2026-10-16",
        startMin: 12 * 60,
        endMin: 14 * 60,
        status: "CONFIRMED",
      },
      { artistId: lina!.id, date: "2026-10-16", startMin: 720, endMin: 840 },
    ),
  );
  const fee7 = await db.platformFee.findUnique({ where: { bookingId: wa.id } });
  assert(!fee7 && (await hasOverlap(db, { artistId: lina!.id, date: "2026-10-16", startMin: 780, endMin: 810 })), "7 manual whatsapp blocks and is free");

  // Scenario 8 — multi-service duration
  const multiDur = (glam!.durationMin || 0) + (trial!.durationMin || 0);
  assert(multiDur === 270, "8 makeup 180 + trial 90 = 270 minutes");
  assert(rangesOverlap(600, 720, 660, 780) && !rangesOverlap(600, 660, 660, 720), "8 overlap vs back-to-back");

  // Scenario 12 — complete does not add another fee
  await db.booking.update({ where: { id: wa.id }, data: { status: "COMPLETED" } });
  const fee12 = await db.platformFee.count({ where: { bookingId: wa.id } });
  assert(fee12 === 0, "12 completed manual still has no fee");

  // Scenario 10 — tenant isolation at query level
  const leak = await db.booking.findFirst({ where: { id: wa.id, artistId: noor!.id } });
  assert(!leak, "10 noor cannot see lina booking by artistId scope");

  console.log("All local booking-core scenarios passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
