/**
 * Bridey Pass + appointment workflow tests (HTTP + Prisma).
 * Usage: npx tsx scripts/test-bridey-pass.ts
 */
import { randomUUID } from "crypto";
import { payloadContainsPhone } from "../src/lib/booking-privacy";
import { PLATFORM_FEE_LYD } from "../src/lib/constants";
import { parsePassToken } from "../src/lib/pass-token";
import { addDaysISO, todayISO } from "../src/lib/utils";

const BASE = process.env.BRIDEY_URL || "http://localhost:3000";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`FAIL ${message}`);
  console.log(`PASS ${message}`);
}

function cookieFrom(res: Response) {
  const raw = res.headers.getSetCookie?.() || [];
  const header = raw.length ? raw : [res.headers.get("set-cookie") || ""];
  const session = header
    .flatMap((h) => h.split(/,(?=\s*bridey_)/i))
    .map((h) => h.split(";")[0])
    .find((c) => c.startsWith("bridey_session="));
  return session || "";
}

async function json(res: Response) {
  return res.json().catch(() => ({}));
}

async function login(phone: string) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password: "bridey123" }),
  });
  assert(res.ok, `login ${phone}`);
  return cookieFrom(res);
}

async function findSlot(slug: string, serviceIds: string[]) {
  for (let i = 1; i <= 28; i += 1) {
    const date = addDaysISO(todayISO(), i);
    const url = new URL(`${BASE}/api/public/availability`);
    url.searchParams.set("slug", slug);
    url.searchParams.set("date", date);
    url.searchParams.set("serviceIds", serviceIds.join(","));
    const avail = await json(await fetch(url));
    if (avail.mode === "SHIFT") {
      const shift = (avail.shifts || []).find((row: { remaining: number }) => row.remaining > 0);
      if (shift) return { date, shiftId: shift.id as string };
    } else if (avail.available) {
      return { date };
    }
  }
  throw new Error(`no slot for ${slug}`);
}

async function publicBook(args: {
  slug: string;
  serviceIds: string[];
  name: string;
  phone: string;
  slot: { date: string; shiftId?: string; startMin?: number };
}) {
  return fetch(`${BASE}/api/public/book`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      slug: args.slug,
      serviceIds: args.serviceIds,
      date: args.slot.date,
      shiftId: args.slot.shiftId,
      startMin: args.slot.startMin,
      brideName: args.name,
      bridePhone: args.phone,
      notes: "Bridal makeup",
      requestId: randomUUID(),
    }),
  });
}

async function act(cookie: string, id: string, action: string, extra?: Record<string, number>) {
  return fetch(`${BASE}/api/bookings/${id}/appointment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ action, ...extra }),
  });
}

async function completeLive(cookie: string, id: string) {
  await fetch(`${BASE}/api/bookings/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ status: "CONFIRMED" }),
  });
  await act(cookie, id, "check_in");
  await act(cookie, id, "start");
  return json(await act(cookie, id, "complete"));
}

async function main() {
  assert(PLATFORM_FEE_LYD === 5, "fee still 5 LYD");
  assert(parsePassToken("https://example.com/p/abcdefghijklmnopqrstuvwxyz012345") === "abcdefghijklmnopqrstuvwxyz012345", "parse URL token");
  assert(!parsePassToken("0912345678"), "parser rejects a phone number");

  const lina = await login("0910000001");
  const me = await json(await fetch(`${BASE}/api/me`, { headers: { cookie: lina } }));
  const service = (me.services || []).find((row: { active: boolean }) => row.active);
  const slot = await findSlot("lina", [service.id]);
  const created = await publicBook({
    slug: "lina",
    serviceIds: [service.id],
    name: "Sara Ahmed",
    phone: "0912345678",
    slot,
  });
  const pending = await json(created);
  assert(created.ok && pending.id, "A pending booking created");

  const trackPending = await json(await fetch(`${BASE}/api/public/track/${pending.trackCode}`));
  assert(!trackPending.passAvailable && !trackPending.passToken, "A no usable pass while pending");
  assert(!("bridePhone" in trackPending), "A track has no phone");
  assert(!payloadContainsPhone(trackPending, "0912345678"), "A track JSON has no phone");
  const mePending = await json(await fetch(`${BASE}/api/me`, { headers: { cookie: lina } }));
  assert(
    !(mePending.fees || []).some((row: { bookingId: string }) => row.bookingId === pending.id),
    "A no 5 LYD fee while pending",
  );

  const unauthPass = await fetch(`${BASE}/api/pass/not-a-real-token-value-0123456789abcdef`);
  assert(unauthPass.status === 401, "F unauthenticated pass lookup is 401");
  const unauthBody = await json(unauthPass);
  assert(!unauthBody.brideName && !unauthBody.bridePhone, "F unauthenticated body has no booking");

  const pendingPass = await fetch(`${BASE}/api/pass/${pending.trackCode}`, { headers: { cookie: lina } });
  assert(pendingPass.status === 404, "A pending track code is not a pass token");

  const checkPending = await act(lina, pending.id, "check_in");
  assert(checkPending.status === 400, "A cannot check in pending");

  const confirm = await fetch(`${BASE}/api/bookings/${pending.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: lina },
    body: JSON.stringify({ status: "CONFIRMED" }),
  });
  const confirmed = await json(confirm);
  assert(confirm.ok && confirmed.status === "CONFIRMED", "B confirmed");
  const meAfter = await json(await fetch(`${BASE}/api/me`, { headers: { cookie: lina } }));
  const fees = (meAfter.fees || []).filter((row: { bookingId: string }) => row.bookingId === pending.id);
  assert(fees.length === 1 && fees[0].amountLyd === 5, "B 5 LYD fee exists");
  assert(!meAfter.bookings.some((row: { id: string; brideyPassToken?: string }) => row.id === pending.id && row.brideyPassToken), "B staff /api/me does not include pass token");

  const track = await json(await fetch(`${BASE}/api/public/track/${pending.trackCode}`));
  assert(track.passAvailable && track.passToken, "B pass token exists");
  assert(track.brideName === "Sara Ahmed", "B bride can see her name on the pass payload");
  assert(!payloadContainsPhone(track, "0912345678"), "M track/pass payload has no phone");
  assert(track.passToken.length >= 32, "B token is long");
  assert(!track.passToken.includes("0912345678"), "M token is not the phone");
  assert(parsePassToken(`${BASE}/p/${track.passToken}`) === track.passToken, "QR URL encodes only the token path");

  const gate = await fetch(`${BASE}/p/${track.passToken}`);
  const gateHtml = await gate.text();
  assert(gate.ok, "public gate page loads");
  assert(!gateHtml.includes("0912345678") && !gateHtml.includes("Sara Ahmed"), "6/32 gate HTML has no booking details");

  const open = await fetch(`${BASE}/api/pass/${track.passToken}`, { headers: { cookie: lina } });
  const appointment = await json(open);
  assert(open.ok, "C authorized scan opens booking");
  assert(appointment.brideName === "Sara Ahmed", "C bride name shown");
  assert(appointment.services?.length >= 1, "C services shown");
  assert(appointment.payment && typeof appointment.payment.totalLyd === "number", "C payment shown");
  assert(appointment.actions.canCheckIn, "C check-in available");
  assert(!appointment.brideyPassToken, "scan payload does not echo the token");
  assert(!payloadContainsPhone(appointment, "0912345678") || appointment.bridePhone, "M phone only via privacy rules after confirm");
  assert(appointment.bridePhone === "218912345678", "M authorized owner receives phone after confirm");
  assert(!("platformFeeLyd" in appointment) && !appointment.fee, "17 platform fee is not on appointment payload");

  const noor = await login("218920000002");
  const wrong = await fetch(`${BASE}/api/pass/${track.passToken}`, { headers: { cookie: noor } });
  const wrongBody = await json(wrong);
  assert(wrong.status === 403, "D wrong business is denied");
  assert(!wrongBody.brideName && !wrongBody.bridePhone && !wrongBody.services, "D no booking details");

  const firstCheck = await json(await act(lina, pending.id, "check_in"));
  assert(firstCheck.status === "CHECKED_IN" && firstCheck.checkedInAt, "E checked in");
  const firstAt = firstCheck.checkedInAt;
  const secondCheck = await json(await act(lina, pending.id, "check_in"));
  assert(secondCheck.status === "CHECKED_IN" && secondCheck.checkedInAt === firstAt, "E/L duplicate check-in is idempotent");
  assert(!secondCheck.actions.canCheckIn && secondCheck.actions.canStart, "E check-in disabled, start available");

  const start = await json(await act(lina, pending.id, "start"));
  assert(start.status === "IN_PROGRESS" && start.startedAt, "F started");
  const startAgain = await json(await act(lina, pending.id, "start"));
  assert(startAgain.startedAt === start.startedAt, "F duplicate start prevented");
  assert(!startAgain.actions.canStart && startAgain.actions.canComplete, "F complete available");

  const depositAmt = Math.min(200, Math.max(1, Math.floor((appointment.payment.totalLyd || 2) / 2)));
  const paid = await json(await act(lina, pending.id, "record_payment", { amountLyd: depositAmt, depositLyd: depositAmt }));
  assert(paid.payment.depositLyd === depositAmt && paid.payment.depositPaid, "H deposit paid");
  assert(paid.payment.remainingLyd === paid.payment.totalLyd - depositAmt, "H remaining is total-deposit");
  const full = await json(await act(lina, pending.id, "mark_paid"));
  assert(full.payment.remainingLyd === 0 && full.payment.status === "paid", "J paid in full");
  const fullAgain = await json(await act(lina, pending.id, "mark_paid"));
  assert(fullAgain.payment.paidLyd === full.payment.paidLyd, "duplicate payment is idempotent");

  const complete = await json(await act(lina, pending.id, "complete"));
  assert(complete.status === "COMPLETED" && complete.completedAt, "G completed");
  const completeAgain = await json(await act(lina, pending.id, "complete"));
  assert(completeAgain.completedAt === complete.completedAt, "G duplicate complete prevented");
  assert(!completeAgain.actions.canCheckIn && !completeAgain.actions.canStart && !completeAgain.actions.canComplete, "G actions disabled");

  const trackDone = await json(await fetch(`${BASE}/api/public/track/${pending.trackCode}`));
  assert(trackDone.passAvailable && trackDone.passToken === track.passToken, "23 pass remains after completion");

  const reuse = await json(await fetch(`${BASE}/api/pass/${track.passToken}`, { headers: { cookie: lina } }));
  assert(reuse.id === appointment.id && reuse.status === "COMPLETED", "L QR reuse returns the same booking");

  const cancelSlot = await findSlot("lina", [service.id]);
  const cancelBook = await json(
    await publicBook({ slug: "lina", serviceIds: [service.id], name: "TEST-PASS-CANCEL", phone: "0912345691", slot: cancelSlot }),
  );
  await fetch(`${BASE}/api/bookings/${cancelBook.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: lina },
    body: JSON.stringify({ status: "CONFIRMED" }),
  });
  const cancelled = await fetch(`${BASE}/api/bookings/${cancelBook.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: lina },
    body: JSON.stringify({ status: "CANCELLED" }),
  });
  assert(cancelled.ok, "K cancelled after confirm");
  const cancelCheck = await act(lina, cancelBook.id, "check_in");
  assert(cancelCheck.status === 400, "K cannot check in cancelled");
  const cancelStart = await act(lina, cancelBook.id, "start");
  assert(cancelStart.status === 400, "K cannot start cancelled");
  const cancelComplete = await act(lina, cancelBook.id, "complete");
  assert(cancelComplete.status === 400, "K cannot complete cancelled");

  const unpaidSlot = await findSlot("lina", [service.id]);
  const unpaidBook = await json(
    await publicBook({ slug: "lina", serviceIds: [service.id], name: "TEST-PASS-UNPAID", phone: "0912345692", slot: unpaidSlot }),
  );
  await fetch(`${BASE}/api/bookings/${unpaidBook.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: lina },
    body: JSON.stringify({ status: "CONFIRMED" }),
  });
  const unpaid = await json(await fetch(`${BASE}/api/bookings/${unpaidBook.id}`, { headers: { cookie: lina } }));
  assert(unpaid.payment.paidLyd === 0 && unpaid.payment.status === "unpaid", "I no deposit / not paid");
  assert(unpaid.payment.remainingLyd === unpaid.payment.totalLyd, "I remaining equals total");

  const paySlot1 = await findSlot("lina", [service.id]);
  const payBook1 = await json(
    await publicBook({ slug: "lina", serviceIds: [service.id], name: "TEST-PASS-PAY-AFTER", phone: "0912345694", slot: paySlot1 }),
  );
  const donePay1 = await completeLive(lina, payBook1.id);
  assert(donePay1.status === "COMPLETED" && donePay1.actions.canRecordPayment, "completed booking can still record payment");
  const total1 = donePay1.payment.totalLyd as number;
  const firstPay = Math.max(1, Math.min(200, Math.floor(total1 / 2)));
  const secondPay = Math.max(1, Math.min(100, total1 - firstPay - 1));
  await act(lina, payBook1.id, "record_payment", { amountLyd: firstPay, depositLyd: firstPay });
  const after100 = await json(await act(lina, payBook1.id, "record_payment", { amountLyd: secondPay }));
  assert(after100.status === "COMPLETED", "T1 appointment stays COMPLETED");
  assert(after100.payment.paidLyd === firstPay + secondPay, "T1 paid increased by recorded amount");
  assert(after100.payment.remainingLyd === total1 - firstPay - secondPay, "T1 remaining decreased");

  const paySlot2 = await findSlot("lina", [service.id]);
  const payBook2 = await json(
    await publicBook({ slug: "lina", serviceIds: [service.id], name: "TEST-PASS-PAY-FULL", phone: "0912345695", slot: paySlot2 }),
  );
  const donePay2 = await completeLive(lina, payBook2.id);
  const total2 = donePay2.payment.totalLyd as number;
  const deposit2 = Math.max(1, Math.min(200, Math.floor(total2 / 2)));
  await act(lina, payBook2.id, "record_payment", { amountLyd: deposit2, depositLyd: deposit2 });
  const marked = await json(await act(lina, payBook2.id, "mark_paid"));
  assert(marked.status === "COMPLETED", "T2 appointment stays COMPLETED");
  assert(marked.payment.paidLyd === total2 && marked.payment.remainingLyd === 0 && marked.payment.status === "paid", "T2 paid in full after complete");
  const markedAgain = await json(await act(lina, payBook2.id, "mark_paid"));
  assert(markedAgain.status === "COMPLETED" && markedAgain.payment.paidLyd === total2, "T3 duplicate mark remaining does not increase paid");
  const feesPay = await json(await fetch(`${BASE}/api/me`, { headers: { cookie: lina } }));
  const payFees = (feesPay.fees || []).filter((row: { bookingId: string }) => row.bookingId === payBook2.id);
  assert(payFees.length === 1 && payFees[0].amountLyd === 5, "T5 customer payment does not change 5 LYD fee");

  const sara = await login("0930000003");
  const aisha = await login("0930000005");
  const saraMe = await json(await fetch(`${BASE}/api/me`, { headers: { cookie: sara } }));
  const makeup = (saraMe.services || []).find((row: { nameEn: string }) => row.nameEn === "Bridal Makeup");
  const hair = (saraMe.services || []).find((row: { nameEn: string }) => row.nameEn === "Bridal Hair");
  const teamSlot = await findSlot("sara-beauty", [makeup.id, hair.id]);
  const combo = await json(
    await publicBook({
      slug: "sara-beauty",
      serviceIds: [makeup.id, hair.id],
      name: "TEST-PASS-MULTI",
      phone: "0912345693",
      slot: teamSlot,
    }),
  );
  await fetch(`${BASE}/api/bookings/${combo.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: sara },
    body: JSON.stringify({ status: "CONFIRMED" }),
  });
  const comboView = await json(await fetch(`${BASE}/api/bookings/${combo.id}`, { headers: { cookie: sara } }));
  assert(comboView.services.length >= 2, "N multi-service list");
  assert(comboView.assignments.length >= 2, "N assignments listed");
  const comboTrack = await json(await fetch(`${BASE}/api/public/track/${combo.trackCode}`));
  const aishaScan = await fetch(`${BASE}/api/pass/${comboTrack.passToken}`, { headers: { cookie: aisha } });
  const assignedIds = (comboView.assignments || []).map((row: { teamMemberId: string }) => row.teamMemberId);
  const aishaMember = (saraMe.members || []).find((row: { name: string }) => row.name === "عائشة");
  if (aishaMember && !assignedIds.includes(aishaMember.id)) {
    assert(aishaScan.status === 403 || aishaScan.status === 404, "20 unassigned staff denied on scan");
    const denied = await json(aishaScan);
    assert(!denied.brideName, "20 denied body has no bride");
  }

  console.log("Bridey Pass tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
