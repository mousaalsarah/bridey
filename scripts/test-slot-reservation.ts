import { randomUUID } from "crypto";
import { SlotTakenError, backfillSlotHolds, bookingTxOptions, createGuardedBooking, expireOverdue, isUniqueConstraint } from "../src/lib/booking";
import { db } from "../src/lib/db";
import { holdIsActive, occupySlotStarts } from "../src/lib/slots";
import { addDaysISO, todayISO } from "../src/lib/utils";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const eleven = 11 * 60;
const thirteen = 13 * 60;
const twelve = 12 * 60;
const fourteen = 14 * 60;
const ten = 10 * 60;

assert(occupySlotStarts(eleven, thirteen).join(",") === "660,690,720,750", "11-13 occupies four 30-min starts");
assert(!occupySlotStarts(eleven, thirteen).includes(thirteen), "adjacent 13:00 is free");
assert(occupySlotStarts(twelve, fourteen).some((t) => occupySlotStarts(eleven, thirteen).includes(t)), "12-14 overlaps 11-13");
assert(occupySlotStarts(ten, twelve).some((t) => occupySlotStarts(eleven, thirteen).includes(t)), "10-12 overlaps 11-13");
assert(!occupySlotStarts(eleven, thirteen).some((t) => occupySlotStarts(thirteen, thirteen + 120).includes(t)), "13-15 does not overlap 11-13");

const now = new Date("2026-08-30T10:00:00.000Z");
assert(holdIsActive({ startMin: eleven, endMin: thirteen, status: "PENDING", expiresAt: null }, now), "legacy pending occupies");
assert(
  holdIsActive({ startMin: eleven, endMin: thirteen, status: "PENDING", expiresAt: new Date("2026-08-30T10:30:00.000Z") }, now),
  "active hold occupies",
);
assert(
  !holdIsActive({ startMin: eleven, endMin: thirteen, status: "PENDING", expiresAt: new Date("2026-08-30T09:59:00.000Z") }, now),
  "expired pending does not occupy",
);
assert(holdIsActive({ startMin: eleven, endMin: thirteen, status: "CONFIRMED", expiresAt: null }, now), "confirmed occupies");
assert(!holdIsActive({ startMin: eleven, endMin: thirteen, status: "DECLINED", expiresAt: null }, now), "declined does not occupy");
assert(!holdIsActive({ startMin: eleven, endMin: thirteen, status: "EXPIRED", expiresAt: null }, now), "expired status does not occupy");

console.log("slot occupancy unit checks passed");

async function makeBooking(
  artistId: string,
  serviceId: string,
  args: { date: string; startMin: number; endMin: number; name: string; expiresAt?: Date | null; status?: "PENDING" | "CONFIRMED" },
) {
  return db.$transaction(
    (tx) =>
      createGuardedBooking(
        tx,
        {
          artist: { connect: { id: artistId } },
          service: { connect: { id: serviceId } },
          origin: "public",
          source: "bridey",
          brideName: args.name,
          bridePhone: "218910000099",
          date: args.date,
          startMin: args.startMin,
          endMin: args.endMin,
          status: args.status || "PENDING",
          expiresAt: args.expiresAt === undefined ? new Date(Date.now() + 30 * 60 * 1000) : args.expiresAt,
          requestId: randomUUID(),
          items: {
            create: [{ serviceId, nameAr: "اختبار", nameEn: "test", durationMin: args.endMin - args.startMin, priceLyd: 1 }],
          },
        },
        { artistId, date: args.date, startMin: args.startMin, endMin: args.endMin },
      ),
    bookingTxOptions,
  );
}

async function runDbTests() {
  const artist = await db.artist.findFirst({
    where: { onboardingComplete: true, services: { some: { active: true } } },
    include: { services: { where: { active: true }, take: 1 } },
  });
  if (!artist?.services[0]) {
    console.log("skip db tests: no onboarded artist");
    return;
  }
  const serviceId = artist.services[0].id;
  const date = addDaysISO(todayISO(), 18);
  await db.booking.deleteMany({ where: { artistId: artist.id, date, brideName: { startsWith: "TEST-HOLD-" } } });

  const [first, second] = await Promise.allSettled([
    makeBooking(artist.id, serviceId, { date, startMin: eleven, endMin: thirteen, name: "TEST-HOLD-A" }),
    makeBooking(artist.id, serviceId, { date, startMin: eleven, endMin: thirteen, name: "TEST-HOLD-B" }),
  ]);
  const wins = [first, second].filter((r) => r.status === "fulfilled").length;
  const losses = [first, second].filter((r) => {
    if (r.status !== "rejected") return false;
    return r.reason instanceof SlotTakenError || isUniqueConstraint(r.reason);
  }).length;
  assert(wins === 1 && losses === 1, `concurrent holds must be 1 win / 1 loss, got wins=${wins} losses=${losses}`);
  console.log("concurrent same-slot test passed");

  const overlap = await Promise.allSettled([
    makeBooking(artist.id, serviceId, { date, startMin: twelve, endMin: fourteen, name: "TEST-HOLD-OVERLAP" }),
  ]);
  assert(overlap[0].status === "rejected", "12-14 must be rejected against 11-13");
  console.log("overlap test passed");

  const adjacent = await makeBooking(artist.id, serviceId, { date, startMin: thirteen, endMin: thirteen + 60, name: "TEST-HOLD-ADJ" });
  assert(adjacent.status === "PENDING", "13:00 adjacent booking must be allowed");
  console.log("adjacent test passed");

  await db.booking.create({
    data: {
      artistId: artist.id,
      serviceId,
      origin: "public",
      source: "bridey",
      brideName: "TEST-HOLD-STALE",
      bridePhone: "218910000098",
      date,
      startMin: 16 * 60,
      endMin: 17 * 60,
      status: "PENDING",
      expiresAt: new Date(Date.now() - 60 * 1000),
    },
  });
  await expireOverdue(db, artist.id);
  const afterExpire = await db.booking.findFirst({ where: { artistId: artist.id, brideName: "TEST-HOLD-STALE" } });
  assert(afterExpire?.status === "EXPIRED", "stale pending must expire");
  const reused = await makeBooking(artist.id, serviceId, { date, startMin: 16 * 60, endMin: 17 * 60, name: "TEST-HOLD-REUSE" });
  assert(reused.status === "PENDING", "expired pending must free the slot");
  console.log("expiration reuse test passed");

  await backfillSlotHolds(db);
  await db.booking.deleteMany({ where: { artistId: artist.id, date, brideName: { startsWith: "TEST-HOLD-" } } });
}

runDbTests()
  .then(() => {
    console.log("all slot reservation tests passed");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
