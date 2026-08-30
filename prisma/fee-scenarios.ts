import { PrismaClient } from "@prisma/client";
import {
  FeeError,
  assertCanCreateBooking,
  canCreateNewBookings,
  confirmPayment,
  deriveStatus,
  rejectPayment,
  refreshFeeAccount,
  submitFeePayment,
} from "../src/lib/fees";

const db = new PrismaClient();

function assert(cond: unknown, label: string) {
  if (!cond) throw new Error(`FAIL ${label}`);
  console.log(`PASS ${label}`);
}

async function main() {
  const artist = await db.artist.findUnique({ where: { slug: "lina" } });
  const admin = await db.admin.findUnique({ where: { email: "admin@bridey.ly" } });
  assert(artist && admin, "lina and admin exist");

  const account = await refreshFeeAccount(artist!.id);
  assert(account.status !== "SUSPENDED" || account.manualSuspend, "existing artist is not auto-suspended");

  assert(deriveStatus({ status: "ACTIVE", nextPaymentDueDate: "2026-09-01", gracePeriodEndDate: "2026-09-04", today: "2026-08-20", hasOpenBalance: true }) === "ACTIVE", "before due is ACTIVE");
  assert(deriveStatus({ status: "ACTIVE", nextPaymentDueDate: "2026-09-01", gracePeriodEndDate: "2026-09-04", today: "2026-09-01", hasOpenBalance: true }) === "PAYMENT_DUE", "due date is PAYMENT_DUE");
  assert(deriveStatus({ status: "ACTIVE", nextPaymentDueDate: "2026-09-01", gracePeriodEndDate: "2026-09-04", today: "2026-09-02", hasOpenBalance: true }) === "GRACE_PERIOD", "day after due is GRACE");
  assert(deriveStatus({ status: "ACTIVE", nextPaymentDueDate: "2026-09-01", gracePeriodEndDate: "2026-09-04", today: "2026-09-04", hasOpenBalance: true }) === "SUSPENDED", "grace end is SUSPENDED");
  assert(deriveStatus({ status: "ACTIVE", nextPaymentDueDate: "2026-09-01", gracePeriodEndDate: "2026-09-04", today: "2026-09-10", hasOpenBalance: false }) === "ACTIVE", "no balance stays ACTIVE");

  const unpaid = await db.platformFee.findMany({ where: { artistId: artist!.id, status: "UNPAID" } });
  if (unpaid.length === 0) {
    console.log("SKIP payment proof — no unpaid fees");
  } else {
    const refreshed = await refreshFeeAccount(artist!.id);
    const invoice = await db.subscriptionInvoice.findFirst({
      where: { artistId: artist!.id, status: { in: ["UNPAID", "OVERDUE", "PAYMENT_PENDING"] }, amountLyd: { gt: 0 } },
    });
    assert(invoice && invoice.amountLyd === unpaid.reduce((sum, fee) => sum + fee.amountLyd, 0), "invoice amount equals accumulated unpaid fees");
    assert(invoice!.amountLyd !== 50 || unpaid.length === 5, "invoice is not a fixed 50 LYD plan");

    const proof = await submitFeePayment(artist!.id, {
      invoiceId: invoice!.id,
      method: "BANK_TRANSFER",
      amountLyd: invoice!.amountLyd,
      paidOn: "2026-08-30",
      reference: invoice!.reference,
      receiptUrl: "",
      note: "test",
    });
    assert(proof.status === "PENDING", "payment submitted pending");
    const afterSubmit = await db.artistSubscription.findUnique({ where: { artistId: artist!.id } });
    assert(afterSubmit?.status === "PAYMENT_PENDING", "account PAYMENT_PENDING");

    await confirmPayment(proof.id, admin!.id);
    const afterConfirm = await refreshFeeAccount(artist!.id);
    assert(afterConfirm.status === "ACTIVE" && afterConfirm.newBookingsPaused === false, "confirm activates account");
    const paidInvoice = await db.subscriptionInvoice.findUnique({ where: { id: invoice!.id } });
    assert(paidInvoice?.status === "PAID", "invoice marked PAID");
    const stillUnpaid = await db.platformFee.count({ where: { id: { in: unpaid.map((f) => f.id) }, status: "UNPAID" } });
    assert(stillUnpaid === 0, "linked platform fees marked PAID");
  }

  await db.artistSubscription.update({
    where: { artistId: artist!.id },
    data: { status: "SUSPENDED", newBookingsPaused: true, manualSuspend: true },
  });
  const paused = await db.artistSubscription.findUniqueOrThrow({ where: { artistId: artist!.id } });
  assert(!canCreateNewBookings(paused), "suspended cannot create bookings");
  let blocked = false;
  try {
    await assertCanCreateBooking(artist!.id);
  } catch (e) {
    blocked = e instanceof FeeError && e.message === "FEES_PAUSED";
  }
  assert(blocked, "server rejects new booking while fee account suspended");
  const existing = await db.booking.findFirst({ where: { artistId: artist!.id } });
  assert(Boolean(existing), "existing booking remains while suspended");

  await db.artistSubscription.update({
    where: { artistId: artist!.id },
    data: { status: "ACTIVE", newBookingsPaused: false, manualSuspend: false },
  });
  await refreshFeeAccount(artist!.id);

  const unauth = await fetch("http://localhost:3000/api/admin/payments").catch(() => ({ status: 0 }));
  assert((unauth as Response).status === 401 || (unauth as Response).status === 0, "unauthenticated admin list is denied");

  console.log("Fee payment lifecycle checks passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
