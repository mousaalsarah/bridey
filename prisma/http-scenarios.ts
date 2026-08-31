/**
 * HTTP hardening checks against a running Next.js server.
 * Usage: npx tsx prisma/http-scenarios.ts
 */
import { addDaysISO, todayISO } from "../src/lib/utils";
const BASE = process.env.BRIDEY_URL || "http://localhost:3000";

function assert(cond: unknown, label: string) {
  if (!cond) throw new Error(`FAIL ${label}`);
  console.log(`PASS ${label}`);
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

async function main() {
  const unauthMe = await fetch(`${BASE}/api/me`);
  assert(unauthMe.status === 401, "unauthenticated /api/me is 401");

  const unauthBook = await fetch(`${BASE}/api/bookings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert(unauthBook.status === 401, "unauthenticated POST /api/bookings is 401");

  const linaCookie = await login("0910000001");
  const noorCookie = await login("218920000002");

  const linaMeRes = await fetch(`${BASE}/api/me`, { headers: { cookie: linaCookie } });
  const linaMe = await json(linaMeRes);
  assert(linaMeRes.ok && linaMe.artist?.slug === "lina", "Lina /api/me");
  assert(
    Array.isArray(linaMe.bookings) && linaMe.bookings.every((b: { artistId?: string }) => !b.artistId || true),
    "Lina bookings payload exists",
  );
  assert(
    !JSON.stringify(linaMe).includes("نور بن عمران") && linaMe.artist.phone === "218910000001",
    "Lina /api/me does not include Noor profile",
  );

  const noorMe = await json(await fetch(`${BASE}/api/me`, { headers: { cookie: noorCookie } }));
  const noorService = noorMe.services?.find((s: { active: boolean }) => s.active);
  assert(noorService, "Noor has a service");

  const noorExisting = (noorMe.bookings || []).find((b: { bridePhone: string }) => b.bridePhone === "218918888777");
  let noorBooking = noorExisting;
  if (!noorBooking) {
    const noorCreate = await fetch(`${BASE}/api/bookings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: noorCookie },
      body: JSON.stringify({
        brideName: "زبونة نور",
        bridePhone: "0918888777",
        date: "2026-12-03",
        startMin: 16 * 60,
        endMin: 18 * 60,
        serviceIds: [noorService.id],
        source: "phone",
        artistNotes: "ملاحظة نور السرية",
      }),
    });
    noorBooking = await json(noorCreate);
    if (!noorCreate.ok) {
      console.error("Noor create failed", noorCreate.status, noorBooking);
    }
  }
  assert(noorBooking?.id, "Noor can create a manual booking");

  const steal = await fetch(`${BASE}/api/bookings/${noorBooking.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: linaCookie },
    body: JSON.stringify({ status: "CANCELLED", artistNotes: "hacked" }),
  });
  assert(steal.status === 404, "10 Lina cannot PATCH Noor booking");

  const linaAfter = await json(await fetch(`${BASE}/api/me`, { headers: { cookie: linaCookie } }));
  assert(
    !linaAfter.bookings.some((b: { id: string }) => b.id === noorBooking.id),
    "10 Lina /api/me does not list Noor booking",
  );

  const trackSara = await fetch(`${BASE}/api/public/track/BRSARA1`);
  const sara = await json(trackSara);
  assert(trackSara.ok && sara.trackCode === "BRSARA1", "9 track BRSARA1 works");
  assert(
    !("bridePhone" in sara) &&
      !("artistNotes" in sara) &&
      !("notes" in sara) &&
      !("platformFeeLyd" in sara) &&
      !("fee" in sara) &&
      !("whatsapp" in sara),
    "9 track payload has no phone, notes, or fees",
  );
  if (sara.status === "PENDING" || sara.status === "DECLINED" || sara.status === "EXPIRED") {
    assert(!("brideName" in sara) && !sara.passToken && !sara.passAvailable, "9 pending track has no pass");
  }

  const guess = await fetch(`${BASE}/api/public/track/BRZZZZZZZZ`);
  assert(guess.status === 404, "11 unknown track code is 404");
  const short = await fetch(`${BASE}/api/public/track/BR1`);
  assert(short.status === 404, "11 short track code is 404");

  const noorTrack = noorBooking.trackCode
    ? await fetch(`${BASE}/api/public/track/${noorBooking.trackCode}`)
    : { status: 404 };
  assert(noorTrack.status === 404, "11 manual/no-code booking is not trackable");

  const evening = linaMe.services.find((s: { kind: string; active: boolean }) => s.kind === "evening" && s.active);
  assert(evening, "Lina evening service exists");

  let date = "";
  let startMin: number | undefined;
  let shiftId: string | undefined;
  let shiftRemaining = 0;
  for (let i = 1; i <= 21; i += 1) {
    const iso = addDaysISO(todayISO(), i);
    const avail = await json(
      await fetch(`${BASE}/api/public/availability?slug=lina&date=${iso}&serviceIds=${evening.id}`),
    );
    if (avail.mode === "SHIFT") {
      const shift = (avail.shifts || []).find((row: { remaining: number }) => row.remaining > 0);
      if (shift) {
        date = iso;
        shiftId = shift.id;
        shiftRemaining = shift.remaining;
        break;
      }
    } else if (avail.available) {
      const slots = await json(
        await fetch(`${BASE}/api/public/slots?slug=lina&date=${iso}&serviceIds=${evening.id}`),
      );
      if (slots.slots?.length) {
        date = iso;
        startMin = slots.slots[0];
        shiftRemaining = 1;
        break;
      }
    }
  }
  assert(date, "found a free Lina slot for race");
  const stamp = Date.now().toString().slice(-6);
  const body = {
    slug: "lina",
    serviceIds: [evening.id],
    date,
    startMin,
    shiftId,
    brideName: "عروس سباق",
    bridePhone: `09170${stamp.slice(0, 5)}`.padEnd(10, "0"),
  };
  const body2 = {
    ...body,
    bridePhone: `09171${stamp.slice(0, 5)}`.padEnd(10, "0"),
    brideName: "عروس سباق ٢",
  };

  const [a, b] = await Promise.all([
    fetch(`${BASE}/api/public/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    fetch(`${BASE}/api/public/book`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body2),
    }),
  ]);
  const results = [a.status, b.status].sort();
  if (shiftRemaining === 1) {
    assert(results.includes(200) && results.includes(409), `5 only one of two simultaneous books succeeds (${a.status},${b.status})`);
  } else {
    assert(results.includes(200), `5 public book succeeds with remaining ${shiftRemaining} (${a.status},${b.status})`);
  }

  const winner = a.ok ? await json(a) : await json(b);
  const confirm1 = await fetch(`${BASE}/api/bookings/${winner.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: linaCookie },
    body: JSON.stringify({ status: "CONFIRMED" }),
  });
  assert(confirm1.ok, "2 confirm public booking");
  const confirm2 = await fetch(`${BASE}/api/bookings/${winner.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: linaCookie },
    body: JSON.stringify({ status: "CONFIRMED" }),
  });
  assert(confirm2.status === 400, "4 second confirm is rejected");

  const feesAfter = await json(await fetch(`${BASE}/api/me`, { headers: { cookie: linaCookie } }));
  const winnerFees = feesAfter.fees.filter((f: { bookingId: string }) => f.bookingId === winner.id);
  assert(winnerFees.length === 1 && winnerFees[0].amountLyd === 5, "2/4 exactly one 5 LYD fee");

  const complete = await fetch(`${BASE}/api/bookings/${winner.id}/appointment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: linaCookie },
    body: JSON.stringify({ action: "check_in" }),
  });
  assert(complete.ok, "12 check-in confirmed booking");
  await fetch(`${BASE}/api/bookings/${winner.id}/appointment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: linaCookie },
    body: JSON.stringify({ action: "start" }),
  });
  const done = await fetch(`${BASE}/api/bookings/${winner.id}/appointment`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: linaCookie },
    body: JSON.stringify({ action: "complete" }),
  });
  assert(done.ok, "12 complete after start");
  const feesDone = await json(await fetch(`${BASE}/api/me`, { headers: { cookie: linaCookie } }));
  assert(
    feesDone.fees.filter((f: { bookingId: string }) => f.bookingId === winner.id).length === 1,
    "12 complete does not add another fee",
  );

  const publicPage = await fetch(`${BASE}/a/lina`);
  assert(publicPage.ok, "public artist page loads");
  const bookPage = await fetch(`${BASE}/a/lina/book`);
  assert(bookPage.ok, "public book page loads");
  const trackPage = await fetch(`${BASE}/track`);
  assert(trackPage.ok, "track lookup page loads");

  console.log("All HTTP scenarios passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
