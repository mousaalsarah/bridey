/**
 * Live HTTP anti-bypass audit against a running Next.js server.
 * Usage: npx tsx scripts/test-privacy-http.ts
 */
import { randomUUID } from "crypto";
import { payloadContainsPhone } from "../src/lib/booking-privacy";
import { PLATFORM_FEE_LYD } from "../src/lib/constants";
import { addDaysISO, todayISO } from "../src/lib/utils";

const BASE = process.env.BRIDEY_URL || "http://localhost:3000";
const BRIDE = "Sara Ahmed";
const RAW_PHONE = "0912345678";
const STORED = "218912345678";

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
  const cookie = cookieFrom(res);
  assert(Boolean(cookie), `session cookie ${phone}`);
  return cookie;
}

function auth(cookie: string) {
  return { cookie };
}

function clean(payload: unknown, phone = RAW_PHONE) {
  return !payloadContainsPhone(payload, phone);
}

function lockedBookingsPayload(me: { bookings?: Array<{ contactAvailable?: boolean }>; fees?: unknown }) {
  return {
    bookings: (me.bookings || []).filter((row) => !row.contactAvailable),
    fees: me.fees,
  };
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
      const slotsUrl = new URL(`${BASE}/api/public/slots`);
      slotsUrl.searchParams.set("slug", slug);
      slotsUrl.searchParams.set("date", date);
      for (const id of serviceIds) slotsUrl.searchParams.append("serviceId", id);
      const slots = await json(await fetch(slotsUrl));
      const startMin = Array.isArray(slots.slots) ? slots.slots[0] : null;
      if (typeof startMin === "number") return { date, startMin };
      if (avail.mode === "DAY") return { date };
    }
  }
  throw new Error(`no public slot for ${slug}`);
}

async function publicBook(args: {
  slug: string;
  serviceIds: string[];
  name: string;
  phone: string;
  notes?: string;
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
      notes: args.notes || "Bridal makeup, Saturday morning",
      requestId: randomUUID(),
    }),
  });
}

async function main() {
  assert(PLATFORM_FEE_LYD === 5, "product fee is 5 LYD");

  const unauthMe = await fetch(`${BASE}/api/me`);
  assert(unauthMe.status === 401, "GET /api/me unauthenticated is 401");

  const linaCookie = await login("0910000001");
  const linaMe = await json(await fetch(`${BASE}/api/me`, { headers: auth(linaCookie) }));
  assert(linaMe.artist?.slug === "lina", "Lina /api/me");
  const service = (linaMe.services || []).find((row: { active: boolean }) => row.active);
  assert(service, "Lina has an active service");
  const slot = await findSlot("lina", [service.id]);

  const notesBlocked = await publicBook({
    slug: "lina",
    serviceIds: [service.id],
    name: "TEST-HTTP-NOTES",
    phone: "0912345679",
    notes: "call me 0912345678 or +218912345678",
    slot: await findSlot("lina", [service.id]),
  });
  assert(notesBlocked.status === 400, "POST /api/public/book rejects notes with a phone");
  assert((await json(notesBlocked)).error === "NOTES_CONTACT", "notes error is NOTES_CONTACT");

  const created = await publicBook({
    slug: "lina",
    serviceIds: [service.id],
    name: BRIDE,
    phone: RAW_PHONE,
    slot,
  });
  const createdBody = await json(created);
  assert(created.ok && createdBody.id, "public booking created");
  assert(createdBody.trackCode, "track code returned");
  assert(!("bridePhone" in createdBody), "POST /api/public/book does not return the phone");
  assert(clean(createdBody), "public book JSON has no 0912345678");

  const track = await json(await fetch(`${BASE}/api/public/track/${createdBody.trackCode}`));
  assert(track.status !== "undefined" && track.trackCode === createdBody.trackCode, "GET /api/public/track works");
  assert(!("bridePhone" in track) && !("brideName" in track), "track omits bride contact");
  assert(clean(track), "track JSON has no 0912345678");

  const pendingMe = await json(await fetch(`${BASE}/api/me`, { headers: auth(linaCookie) }));
  const pending = (pendingMe.bookings || []).find((row: { id: string }) => row.id === createdBody.id);
  assert(pending, "pending booking appears on GET /api/me");
  assert(pending.brideName === BRIDE, "Sara Ahmed is visible");
  assert(pending.status === "PENDING", "status is PENDING");
  assert(pending.date === slot.date, "date is visible");
  assert(!pending.bridePhone, "GET /api/me pending bridePhone is empty");
  assert(!pending.contactAvailable, "contactAvailable is false while pending");
  assert(clean(pending, RAW_PHONE), "pending booking JSON has no 0912345678");
  const lockedMe = lockedBookingsPayload(pendingMe);
  assert(clean(lockedMe, RAW_PHONE), "locked GET /api/me bookings/fees have no 0912345678");

  const dashboardHtml = await (await fetch(`${BASE}/dashboard`, { headers: auth(linaCookie) })).text();
  assert(!dashboardHtml.includes(RAW_PHONE) && !dashboardHtml.includes(STORED), "GET /dashboard HTML has no 0912345678");
  const earningsHtml = await (await fetch(`${BASE}/dashboard/earnings`, { headers: auth(linaCookie) })).text();
  assert(!earningsHtml.includes(RAW_PHONE) && !earningsHtml.includes(STORED), "GET /dashboard/earnings HTML has no 0912345678");

  const alerts = await json(await fetch(`${BASE}/api/alerts`, { headers: auth(linaCookie) }));
  assert(typeof alerts.pendingBookings === "number", "GET /api/alerts");
  assert((alerts.latest || []).every((row: Record<string, unknown>) => !("bridePhone" in row)), "alerts latest has no phone field");
  assert(clean(alerts), "GET /api/alerts has no 0912345678");

  const feesPending = await json(await fetch(`${BASE}/api/fees`, { headers: auth(linaCookie) }));
  assert(clean(feesPending), "GET /api/fees pending has no 0912345678");

  const peek = await fetch(`${BASE}/api/bookings/${createdBody.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auth(linaCookie) },
    body: JSON.stringify({ artistNotes: "prep kit" }),
  });
  const peekBody = await json(peek);
  assert(peek.ok, "PATCH /api/bookings/[id] notes-only");
  assert(!peekBody.bridePhone, "notes-only PATCH does not return pending phone");
  assert(clean(peekBody), "notes-only PATCH JSON has no 0912345678");

  const getById = await fetch(`${BASE}/api/bookings/${createdBody.id}`, { headers: auth(linaCookie) });
  const getBody = await json(getById);
  assert(getById.ok, "GET /api/bookings/[id] is authorized");
  assert(!getBody.bridePhone, "GET appointment payload strips pending phone");
  assert(clean(getBody), "GET appointment JSON has no 0912345678");

  const del = await fetch(`${BASE}/api/bookings/${createdBody.id}`, {
    method: "DELETE",
    headers: auth(linaCookie),
  });
  assert(del.status === 405 || del.status === 404, "no business DELETE /api/bookings/[id]");

  const confirm = await fetch(`${BASE}/api/bookings/${createdBody.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auth(linaCookie) },
    body: JSON.stringify({ status: "CONFIRMED" }),
  });
  const confirmed = await json(confirm);
  assert(confirm.ok, "PATCH confirm succeeds");
  assert(confirmed.status === "CONFIRMED", "status CONFIRMED");
  assert(confirmed.bridePhone === STORED, "authorized owner receives 218912345678 after confirm");
  assert(confirmed.contactAvailable, "contactAvailable true after confirm");

  const afterMe = await json(await fetch(`${BASE}/api/me`, { headers: auth(linaCookie) }));
  const after = (afterMe.bookings || []).find((row: { id: string }) => row.id === createdBody.id);
  assert(after?.bridePhone === STORED, "GET /api/me returns phone after confirm");
  const fees = (afterMe.fees || []).filter((row: { bookingId: string }) => row.bookingId === createdBody.id);
  assert(fees.length === 1 && fees[0].amountLyd === 5, "exactly one 5 LYD fee");
  assert(
    (fees[0].booking ? !("bridePhone" in fees[0].booking) : true),
    "fee.booking nested object does not include bridePhone",
  );

  const confirm2 = await fetch(`${BASE}/api/bookings/${createdBody.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auth(linaCookie) },
    body: JSON.stringify({ status: "CONFIRMED" }),
  });
  assert(confirm2.status === 400, "second confirm is rejected");
  const meDup = await json(await fetch(`${BASE}/api/me`, { headers: auth(linaCookie) }));
  const dupFees = (meDup.fees || []).filter((row: { bookingId: string }) => row.bookingId === createdBody.id);
  assert(dupFees.length === 1, "repeated confirm does not create a second 5 LYD fee");

  const rollback = await fetch(`${BASE}/api/bookings/${createdBody.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auth(linaCookie) },
    body: JSON.stringify({ status: "PENDING" }),
  });
  assert(rollback.status === 400, "cannot roll CONFIRMED back to PENDING");

  const cancel = await fetch(`${BASE}/api/bookings/${createdBody.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auth(linaCookie) },
    body: JSON.stringify({ status: "CANCELLED" }),
  });
  const cancelled = await json(cancel);
  assert(cancel.ok && cancelled.status === "CANCELLED", "confirmed booking can be cancelled");
  const meCancel = await json(await fetch(`${BASE}/api/me`, { headers: auth(linaCookie) }));
  const still = (meCancel.fees || []).filter((row: { bookingId: string }) => row.bookingId === createdBody.id);
  assert(still.length === 1 && still[0].amountLyd === 5, "cancel keeps the 5 LYD fee");
  const cancelledRow = (meCancel.bookings || []).find((row: { id: string }) => row.id === createdBody.id);
  assert(cancelledRow?.bridePhone === STORED, "phone stays available after confirm→cancel");

  const declineSlot = await findSlot("lina", [service.id]);
  const declinedRes = await publicBook({
    slug: "lina",
    serviceIds: [service.id],
    name: "TEST-HTTP-DECLINED",
    phone: "0912345680",
    slot: declineSlot,
  });
  const declinedBody = await json(declinedRes);
  assert(declinedRes.ok, "second pending booking created");
  const decline = await fetch(`${BASE}/api/bookings/${declinedBody.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auth(linaCookie) },
    body: JSON.stringify({ status: "DECLINED" }),
  });
  const declined = await json(decline);
  assert(decline.ok && declined.status === "DECLINED", "PENDING → DECLINED");
  assert(!declined.bridePhone && !declined.contactAvailable, "rejected phone stays hidden");
  assert(clean(declined, "0912345680"), "declined PATCH has no phone");
  const meDecline = await json(await fetch(`${BASE}/api/me`, { headers: auth(linaCookie) }));
  assert(
    !(meDecline.fees || []).some((row: { bookingId: string }) => row.bookingId === declinedBody.id),
    "reject creates no 5 LYD fee",
  );

  const expireSlot = await findSlot("lina", [service.id]);
  const expireRes = await publicBook({
    slug: "lina",
    serviceIds: [service.id],
    name: "TEST-HTTP-EXPIRED",
    phone: "0912345681",
    slot: expireSlot,
  });
  const expireBody = await json(expireRes);
  const expire = await fetch(`${BASE}/api/bookings/${expireBody.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auth(linaCookie) },
    body: JSON.stringify({ status: "EXPIRED" }),
  });
  const expired = await json(expire);
  assert(expire.ok && expired.status === "EXPIRED", "PENDING → EXPIRED");
  assert(!expired.bridePhone && !expired.contactAvailable, "expired phone stays hidden");
  assert(clean(expired, "0912345681"), "expired PATCH has no phone");
  const meExpire = await json(await fetch(`${BASE}/api/me`, { headers: auth(linaCookie) }));
  assert(
    !(meExpire.fees || []).some((row: { bookingId: string }) => row.bookingId === expireBody.id),
    "expire creates no 5 LYD fee",
  );

  const saraCookie = await login("0930000003");
  const hudaCookie = await login("0930000004");
  const aishaCookie = await login("0930000005");
  const monaCookie = await login("0930000006");
  const staffCookies: Record<string, string> = { هدى: hudaCookie, عائشة: aishaCookie, منى: monaCookie };
  const saraMe = await json(await fetch(`${BASE}/api/me`, { headers: auth(saraCookie) }));
  assert(saraMe.business?.slug === "sara-beauty" || saraMe.artist?.slug === "sara-beauty", "Sara Beauty owner login");
  const makeup = (saraMe.services || []).find((row: { nameEn: string; active: boolean }) => row.active && row.nameEn === "Bridal Makeup");
  const hair = (saraMe.services || []).find((row: { nameEn: string; active: boolean }) => row.active && row.nameEn === "Bridal Hair");
  assert(makeup && hair, "Sara Beauty makeup + hair services");
  const teamSlot = await findSlot("sara-beauty", [makeup.id, hair.id]);
  const teamBook = await publicBook({
    slug: "sara-beauty",
    serviceIds: [makeup.id, hair.id],
    name: "TEST-HTTP-STAFF",
    phone: "0912345682",
    slot: teamSlot,
  });
  const teamBody = await json(teamBook);
  assert(teamBook.ok && teamBody.id, "Sara Beauty pending combo booking");

  const steal = await fetch(`${BASE}/api/bookings/${teamBody.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auth(linaCookie) },
    body: JSON.stringify({ status: "CONFIRMED" }),
  });
  assert(steal.status === 404, "Lina cannot confirm Sara Beauty booking");

  const saraPending = await json(await fetch(`${BASE}/api/me`, { headers: auth(saraCookie) }));
  const ownerPending = (saraPending.bookings || []).find((row: { id: string }) => row.id === teamBody.id);
  assert(ownerPending && !ownerPending.bridePhone, "Sara owner has no pending phone bypass");
  assert(clean(lockedBookingsPayload(saraPending), "0912345682"), "Sara owner locked bookings have no staff-test phone");

  const assignedPendingIds = (ownerPending.assignments || []).map((row: { teamMemberId: string }) => row.teamMemberId);
  const assignedPendingMembers = (saraPending.members || []).filter(
    (row: { id: string; name: string }) => assignedPendingIds.includes(row.id) && row.name !== "سارة",
  );
  assert(assignedPendingMembers.length > 0, "combo booking assigned at least one non-owner staff member");
  for (const member of assignedPendingMembers) {
    const cookie = staffCookies[member.name];
    assert(cookie, `login cookie for assigned staff ${member.name}`);
    const staffMe = await json(await fetch(`${BASE}/api/me`, { headers: auth(cookie) }));
    const row = (staffMe.bookings || []).find((item: { id: string }) => item.id === teamBody.id);
    assert(row, `assigned staff ${member.name} can see the pending booking`);
    assert(!row.bridePhone, `assigned staff ${member.name} pending phone is empty`);
    assert(clean(lockedBookingsPayload(staffMe), "0912345682"), `assigned staff ${member.name} locked bookings have no phone`);
  }
  assert(clean(lockedBookingsPayload(await json(await fetch(`${BASE}/api/me`, { headers: auth(hudaCookie) }))), "0912345682"), "Huda locked bookings have no pending phone");
  assert(clean(lockedBookingsPayload(await json(await fetch(`${BASE}/api/me`, { headers: auth(aishaCookie) }))), "0912345682"), "Aisha locked bookings have no pending phone");

  const teamConfirm = await fetch(`${BASE}/api/bookings/${teamBody.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auth(saraCookie) },
    body: JSON.stringify({ status: "CONFIRMED" }),
  });
  const teamConfirmed = await json(teamConfirm);
  assert(teamConfirm.ok && teamConfirmed.status === "CONFIRMED", "Sara Beauty confirm");
  assert(teamConfirmed.bridePhone === "218912345682", "owner receives phone after confirm");

  const saraAfter = await json(await fetch(`${BASE}/api/me`, { headers: auth(saraCookie) }));
  const ownerAfter = (saraAfter.bookings || []).find((row: { id: string }) => row.id === teamBody.id);
  assert(ownerAfter?.contactAvailable && ownerAfter.bridePhone === "218912345682", "owner GET /api/me unlocked");
  const teamFee = (saraAfter.fees || []).filter((row: { bookingId: string }) => row.bookingId === teamBody.id);
  assert(teamFee.length === 1 && teamFee[0].amountLyd === 5, "Sara Beauty confirm created one 5 LYD fee");

  const assignedIds = (ownerAfter?.assignments || []).map((row: { teamMemberId: string }) => row.teamMemberId);
  const assignedMembers = (saraAfter.members || []).filter(
    (row: { id: string; name: string }) => assignedIds.includes(row.id) && row.name !== "سارة",
  );
  for (const member of assignedMembers) {
    const cookie = staffCookies[member.name];
    const staffMe = await json(await fetch(`${BASE}/api/me`, { headers: auth(cookie) }));
    const row = (staffMe.bookings || []).find((item: { id: string }) => item.id === teamBody.id);
    assert(row?.bridePhone === "218912345682", `assigned staff ${member.name} sees phone after confirm`);
  }
  const aishaMember = (saraAfter.members || []).find((row: { name: string }) => row.name === "عائشة");
  if (aishaMember && !assignedIds.includes(aishaMember.id)) {
    const aishaAfter = await json(await fetch(`${BASE}/api/me`, { headers: auth(aishaCookie) }));
    const aishaConfirmed = (aishaAfter.bookings || []).find((row: { id: string }) => row.id === teamBody.id);
    assert(!aishaConfirmed, "unassigned staff does not receive the booking after confirm");
  }

  const adminAsBusiness = await fetch(`${BASE}/api/admin/overview`, { headers: auth(saraCookie) });
  assert(adminAsBusiness.status === 401, "business session cannot read /api/admin/overview");

  console.log("HTTP privacy / anti-bypass verification passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
