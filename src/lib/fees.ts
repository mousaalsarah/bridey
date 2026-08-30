import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { addDaysISO, todayISO } from "./utils";

export const FEE_STATUSES = ["ACTIVE", "PAYMENT_DUE", "GRACE_PERIOD", "PAYMENT_PENDING", "SUSPENDED"] as const;
export type FeeStatus = (typeof FEE_STATUSES)[number];

export const GRACE_DAYS = 3;
const DUE_REMINDER_DAYS = 7;

type Tx = Prisma.TransactionClient | typeof db;

export class FeeError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
    this.name = "FeeError";
  }
}

export function addMonthsISO(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const cursor = new Date(y, m - 1 + months, 1);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  cursor.setDate(Math.min(d, last));
  const yy = cursor.getFullYear();
  const mm = String(cursor.getMonth() + 1).padStart(2, "0");
  const dd = String(cursor.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function monthStartISO(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

export function nextMonthStartISO(iso: string) {
  return addMonthsISO(monthStartISO(iso), 1);
}

export function monthEndISO(iso: string) {
  return addDaysISO(nextMonthStartISO(iso), -1);
}

export function daysBetween(from: string, to: string) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

export function canCreateNewBookings(account: { status: string; newBookingsPaused: boolean; manualSuspend?: boolean }) {
  if (account.manualSuspend || account.newBookingsPaused) return false;
  return account.status !== "SUSPENDED";
}

export function deriveStatus(args: {
  status: string;
  nextPaymentDueDate: string;
  gracePeriodEndDate: string;
  reminderDays?: number;
  today?: string;
  hasOpenBalance?: boolean;
}) {
  if (args.status === "PAYMENT_PENDING") return "PAYMENT_PENDING" as FeeStatus;
  if (args.hasOpenBalance === false) return "ACTIVE";
  const today = args.today || todayISO();
  const reminder = args.reminderDays ?? DUE_REMINDER_DAYS;
  if (today >= args.gracePeriodEndDate) return "SUSPENDED";
  if (today > args.nextPaymentDueDate) return "GRACE_PERIOD";
  if (today >= args.nextPaymentDueDate || daysBetween(today, args.nextPaymentDueDate) <= reminder) {
    return "PAYMENT_DUE";
  }
  return "ACTIVE";
}

export async function nextDocumentNumber(tx: Tx, kind: "INV" | "BRD") {
  const year = todayISO().slice(0, 4);
  const key = `${kind}-${year}`;
  const row = await tx.numberSequence.upsert({
    where: { key },
    create: { key, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${kind}-${year}-${String(row.value).padStart(6, "0")}`;
}

export async function writeAudit(
  tx: Tx,
  data: {
    actorType: string;
    actorId: string;
    action: string;
    artistId?: string;
    paymentId?: string;
    invoiceId?: string;
    reason?: string;
  },
) {
  await tx.auditLog.create({
    data: {
      actorType: data.actorType,
      actorId: data.actorId,
      action: data.action,
      artistId: data.artistId || "",
      paymentId: data.paymentId || "",
      invoiceId: data.invoiceId || "",
      reason: data.reason || "",
    },
  });
}

export async function notify(tx: Tx, artistId: string, kind: string, bodyAr: string, bodyEn: string) {
  await tx.artistNotice.create({ data: { artistId, kind, bodyAr, bodyEn } });
}

export async function ensurePaymentSettings(tx: Tx = db) {
  return tx.paymentSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      bankName: "مصرف التجارة والتنمية",
      accountName: "Bridey",
      accountNumber: "1234567890",
      instructions: "حوّلي المبلغ الظاهر بالضبط واحتفظي بإيصال التحويل.",
      supportedMethods: "BANK_TRANSFER,E_PAYMENT,CASH",
      reminderDays: 7,
    },
  });
}

function periodDates(iso: string) {
  const start = monthStartISO(iso);
  const end = monthEndISO(iso);
  const due = nextMonthStartISO(iso);
  return { start, end, due, grace: addDaysISO(due, GRACE_DAYS) };
}

export async function ensureFeeAccount(artistId: string, tx: Tx = db) {
  const today = todayISO();
  const period = periodDates(today);
  const existing = await tx.artistSubscription.findUnique({ where: { artistId } });
  if (existing) {
    return tx.artistSubscription.update({
      where: { id: existing.id },
      data: {
        currentPeriodStart: period.start,
        currentPeriodEnd: period.end,
      },
    });
  }
  return tx.artistSubscription.create({
    data: {
      artistId,
      status: "ACTIVE",
      newBookingsPaused: false,
      startDate: today,
      currentPeriodStart: period.start,
      currentPeriodEnd: period.end,
      nextPaymentDueDate: period.due,
      gracePeriodEndDate: period.grace,
    },
  });
}

async function cancelOrphanInvoices(tx: Tx, artistId: string) {
  const orphans = await tx.subscriptionInvoice.findMany({
    where: { artistId, status: { in: ["UNPAID", "OVERDUE", "PAYMENT_PENDING"] } },
    include: { fees: { select: { id: true } } },
  });
  for (const invoice of orphans) {
    if (invoice.fees.length === 0) {
      await tx.subscriptionInvoice.update({ where: { id: invoice.id }, data: { status: "CANCELLED" } });
    }
  }
}

async function createFeeInvoice(
  tx: Tx,
  args: {
    artistId: string;
    subscriptionId: string;
    periodStart: string;
    periodEnd: string;
    dueDate: string;
  },
) {
  const number = await nextDocumentNumber(tx, "INV");
  const reference = await nextDocumentNumber(tx, "BRD");
  return tx.subscriptionInvoice.create({
    data: {
      number,
      reference,
      artistId: args.artistId,
      subscriptionId: args.subscriptionId,
      periodStart: args.periodStart,
      periodEnd: args.periodEnd,
      amountLyd: 0,
      dueDate: args.dueDate,
      status: "UNPAID",
    },
  });
}

async function syncInvoiceAmount(tx: Tx, invoiceId: string) {
  const fees = await tx.platformFee.findMany({
    where: { invoiceId, status: "UNPAID" },
  });
  const amount = fees.reduce((sum, fee) => sum + fee.amountLyd, 0);
  const invoice = await tx.subscriptionInvoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (amount === 0 && ["UNPAID", "OVERDUE"].includes(invoice.status)) {
    await tx.subscriptionInvoice.update({ where: { id: invoiceId }, data: { amountLyd: 0, status: "CANCELLED" } });
    return null;
  }
  const today = todayISO();
  const status =
    invoice.status === "PAYMENT_PENDING" || invoice.status === "PAID" || invoice.status === "CANCELLED"
      ? invoice.status
      : today > invoice.dueDate
        ? "OVERDUE"
        : "UNPAID";
  return tx.subscriptionInvoice.update({
    where: { id: invoiceId },
    data: { amountLyd: amount, status },
  });
}

export async function attachFeeToInvoice(artistId: string, feeId: string, tx: Tx = db) {
  const account = await ensureFeeAccount(artistId, tx);
  const fee = await tx.platformFee.findFirst({ where: { id: feeId, artistId } });
  if (!fee || fee.status === "PAID") return fee;
  if (fee.invoiceId) {
    await syncInvoiceAmount(tx, fee.invoiceId);
    return fee;
  }

  const feeDay = fee.createdAt.toISOString().slice(0, 10);
  const period = periodDates(feeDay);
  const open = await tx.subscriptionInvoice.findFirst({
    where: {
      subscriptionId: account.id,
      periodStart: period.start,
      status: { in: ["UNPAID", "OVERDUE"] },
    },
    orderBy: { createdAt: "desc" },
  });
  const invoice =
    open ||
    (await createFeeInvoice(tx, {
      artistId,
      subscriptionId: account.id,
      periodStart: period.start,
      periodEnd: period.end,
      dueDate: period.due,
    }));
  const updated = await tx.platformFee.update({
    where: { id: fee.id },
    data: { invoiceId: invoice.id },
  });
  await syncInvoiceAmount(tx, invoice.id);
  return updated;
}

async function collectUnpaidFees(tx: Tx, artistId: string) {
  const account = await ensureFeeAccount(artistId, tx);
  await cancelOrphanInvoices(tx, artistId);

  const loose = await tx.platformFee.findMany({
    where: { artistId, status: "UNPAID", invoiceId: null },
    orderBy: { createdAt: "asc" },
  });
  if (loose.length === 0) return;

  const today = todayISO();
  const current = periodDates(today);
  const openCurrent = await tx.subscriptionInvoice.findFirst({
    where: {
      subscriptionId: account.id,
      periodStart: current.start,
      status: { in: ["UNPAID", "OVERDUE"] },
    },
    orderBy: { createdAt: "desc" },
  });
  const invoice =
    openCurrent ||
    (await createFeeInvoice(tx, {
      artistId,
      subscriptionId: account.id,
      periodStart: current.start,
      periodEnd: current.end,
      dueDate: current.due,
    }));

  await tx.platformFee.updateMany({
    where: { id: { in: loose.map((fee) => fee.id) } },
    data: { invoiceId: invoice.id },
  });
  await syncInvoiceAmount(tx, invoice.id);
}

function noticeForStatus(status: FeeStatus, daysLeft: number, amount: number) {
  if (status === "PAYMENT_DUE" && daysLeft === 0) {
    return {
      kind: "due_today",
      ar: `رسوم برايدي (${amount} د.ل) مستحقة اليوم.`,
      en: `Your Bridey platform fees (${amount} LYD) are due today.`,
    };
  }
  if (status === "PAYMENT_DUE") {
    return {
      kind: "due_soon",
      ar: `رسوم برايدي المتراكمة (${amount} د.ل) قرب موعد سدادها.`,
      en: `Your accumulated Bridey fees (${amount} LYD) are due soon.`,
    };
  }
  if (status === "GRACE_PERIOD") {
    return {
      kind: "grace",
      ar: `رسوم برايدي متأخرة. باقي ${daysLeft} يوم قبل ما يتوقف استقبال الحجوزات الجديدة.`,
      en: `Your platform fees are overdue. You have ${daysLeft} days remaining before new booking access is paused.`,
    };
  }
  if (status === "SUSPENDED") {
    return {
      kind: "suspended",
      ar: "رسوم برايدي متأخرة، واستقبال الحجوزات الجديدة متوقف مؤقتاً. حجوزاتك الحالية باقية.",
      en: "Your platform fees are overdue and new booking access has been paused. Existing bookings remain available.",
    };
  }
  return null;
}

export async function refreshFeeAccount(artistId: string, tx: Tx = db) {
  await ensurePaymentSettings(tx);
  const settings = await tx.paymentSettings.findUnique({ where: { id: "default" } });
  let account = await ensureFeeAccount(artistId, tx);
  await collectUnpaidFees(tx, artistId);

  const openInvoices = await tx.subscriptionInvoice.findMany({
    where: { artistId, status: { in: ["UNPAID", "OVERDUE", "PAYMENT_PENDING"] }, amountLyd: { gt: 0 } },
    orderBy: { dueDate: "asc" },
  });
  for (const invoice of openInvoices) {
    await syncInvoiceAmount(tx, invoice.id);
  }
  const open = await tx.subscriptionInvoice.findMany({
    where: { artistId, status: { in: ["UNPAID", "OVERDUE", "PAYMENT_PENDING"] }, amountLyd: { gt: 0 } },
    orderBy: { dueDate: "asc" },
  });
  const oldest = open[0] || null;
  const today = todayISO();
  const due = oldest?.dueDate || account.nextPaymentDueDate;
  const grace = oldest ? addDaysISO(oldest.dueDate, GRACE_DAYS) : account.gracePeriodEndDate;
  const pending = open.some((invoice) => invoice.status === "PAYMENT_PENDING") || account.status === "PAYMENT_PENDING";
  const next = account.manualSuspend
    ? "SUSPENDED"
    : deriveStatus({
        status: pending ? "PAYMENT_PENDING" : "ACTIVE",
        nextPaymentDueDate: due,
        gracePeriodEndDate: grace,
        reminderDays: settings?.reminderDays,
        today,
        hasOpenBalance: Boolean(oldest),
      });
  const paused = account.manualSuspend || next === "SUSPENDED";

  if (
    next !== account.status ||
    paused !== account.newBookingsPaused ||
    due !== account.nextPaymentDueDate ||
    grace !== account.gracePeriodEndDate
  ) {
    account = await tx.artistSubscription.update({
      where: { id: account.id },
      data: {
        status: next,
        newBookingsPaused: paused,
        nextPaymentDueDate: due,
        gracePeriodEndDate: grace,
      },
    });
    const daysLeft = Math.max(0, daysBetween(today, grace));
    const note = noticeForStatus(next, daysLeft, oldest?.amountLyd || 0);
    if (note && next !== "PAYMENT_PENDING") await notify(tx, artistId, note.kind, note.ar, note.en);
    if (next === "SUSPENDED") {
      await writeAudit(tx, { actorType: "system", actorId: "system", action: "fees_suspended", artistId });
    }
  }
  return tx.artistSubscription.findUniqueOrThrow({ where: { artistId } });
}

export async function assertCanCreateBooking(artistId: string, tx: Tx = db) {
  const account = await refreshFeeAccount(artistId, tx);
  if (!canCreateNewBookings(account)) {
    throw new FeeError("FEES_PAUSED", 403);
  }
  return account;
}

export async function submitFeePayment(
  artistId: string,
  input: {
    invoiceId: string;
    method: string;
    amountLyd: number;
    paidOn: string;
    reference: string;
    receiptUrl: string;
    note: string;
  },
) {
  return db.$transaction(async (tx) => {
    const account = await refreshFeeAccount(artistId, tx);
    const invoice = await tx.subscriptionInvoice.findFirst({
      where: { id: input.invoiceId, artistId },
      include: { fees: true },
    });
    if (!invoice) throw new FeeError("NOT_FOUND", 404);
    if (invoice.status === "PAID" || invoice.status === "CANCELLED") {
      throw new FeeError("INVOICE_CLOSED", 400);
    }
    if (invoice.amountLyd <= 0 || invoice.fees.length === 0) {
      throw new FeeError("NO_BALANCE", 400);
    }
    const methods = (await ensurePaymentSettings(tx)).supportedMethods.split(",");
    const method = methods.includes(input.method) ? input.method : "OTHER";
    const payment = await tx.subscriptionPayment.create({
      data: {
        artistId,
        subscriptionId: account.id,
        invoiceId: invoice.id,
        amountLyd: input.amountLyd || invoice.amountLyd,
        currency: invoice.currency,
        method,
        status: "PENDING",
        reference: input.reference || invoice.reference,
        receiptUrl: input.receiptUrl,
        note: input.note.slice(0, 500),
        paidOn: input.paidOn || todayISO(),
      },
    });
    await tx.subscriptionInvoice.update({
      where: { id: invoice.id },
      data: { status: "PAYMENT_PENDING" },
    });
    await tx.artistSubscription.update({
      where: { id: account.id },
      data: { status: "PAYMENT_PENDING" },
    });
    await notify(
      tx,
      artistId,
      "payment_submitted",
      "إثبات دفع رسوم برايدي قيد المراجعة.",
      "Your platform-fee payment has been submitted and is awaiting verification.",
    );
    await writeAudit(tx, {
      actorType: "artist",
      actorId: artistId,
      action: "payment_submitted",
      artistId,
      paymentId: payment.id,
      invoiceId: invoice.id,
    });
    return payment;
  });
}

/**
 * Gateway-ready confirmation. Today an admin calls this; later a webhook can.
 */
export async function confirmPayment(paymentId: string, reviewerId: string, actorType = "admin") {
  return db.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findUnique({
      where: { id: paymentId },
      include: { invoice: { include: { fees: true } }, subscription: true },
    });
    if (!payment) throw new FeeError("NOT_FOUND", 404);
    if (payment.status === "CONFIRMED") return payment;

    const now = new Date();
    await tx.subscriptionPayment.update({
      where: { id: payment.id },
      data: { status: "CONFIRMED", reviewedAt: now, reviewedBy: reviewerId },
    });
    await tx.subscriptionInvoice.update({
      where: { id: payment.invoiceId },
      data: { status: "PAID" },
    });
    const feeIds = payment.invoice.fees.map((fee) => fee.id);
    if (feeIds.length) {
      await tx.platformFee.updateMany({
        where: { id: { in: feeIds } },
        data: { status: "PAID", paidAt: now },
      });
      await tx.booking.updateMany({
        where: { id: { in: payment.invoice.fees.map((fee) => fee.bookingId) } },
        data: { feeStatus: "PAID" },
      });
    }
    await tx.artistSubscription.update({
      where: { id: payment.subscriptionId },
      data: { status: "ACTIVE", newBookingsPaused: false, manualSuspend: false },
    });
    await notify(
      tx,
      payment.artistId,
      "payment_confirmed",
      "تم تأكيد دفع رسوم برايدي.",
      "Your Bridey platform-fee payment has been confirmed.",
    );
    await writeAudit(tx, {
      actorType,
      actorId: reviewerId,
      action: "payment_confirmed",
      artistId: payment.artistId,
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
    });
    await refreshFeeAccount(payment.artistId, tx);
    return tx.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } });
  });
}

export async function rejectPayment(paymentId: string, reviewerId: string, reason: string) {
  return db.$transaction(async (tx) => {
    const payment = await tx.subscriptionPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new FeeError("NOT_FOUND", 404);
    if (payment.status === "CONFIRMED") throw new FeeError("ALREADY_CONFIRMED", 400);
    await tx.subscriptionPayment.update({
      where: { id: payment.id },
      data: {
        status: "REJECTED",
        reviewedAt: new Date(),
        reviewedBy: reviewerId,
        rejectionReason: reason.slice(0, 400),
      },
    });
    const pending = await tx.subscriptionPayment.count({
      where: { invoiceId: payment.invoiceId, status: "PENDING" },
    });
    const invoice = await tx.subscriptionInvoice.findUniqueOrThrow({ where: { id: payment.invoiceId } });
    await tx.subscriptionInvoice.update({
      where: { id: payment.invoiceId },
      data: { status: pending ? "PAYMENT_PENDING" : todayISO() > invoice.dueDate ? "OVERDUE" : "UNPAID" },
    });
    await notify(
      tx,
      payment.artistId,
      "payment_rejected",
      `ما قدرنا نتحقق من دفعة الرسوم. ${reason} قدّمي إيصالاً جديداً.`,
      `Your fee payment could not be verified. ${reason} Please submit a new payment.`,
    );
    await writeAudit(tx, {
      actorType: "admin",
      actorId: reviewerId,
      action: "payment_rejected",
      artistId: payment.artistId,
      paymentId: payment.id,
      invoiceId: payment.invoiceId,
      reason,
    });
    await refreshFeeAccount(payment.artistId, tx);
    return tx.subscriptionPayment.findUniqueOrThrow({ where: { id: payment.id } });
  });
}

export async function adminOverride(
  artistId: string,
  adminId: string,
  input: { action: "activate" | "suspend" | "extend"; reason: string; days?: number },
) {
  if (!input.reason.trim()) throw new FeeError("REASON_REQUIRED", 400);
  return db.$transaction(async (tx) => {
    const account = await refreshFeeAccount(artistId, tx);
    const today = todayISO();
    const data: Prisma.ArtistSubscriptionUpdateInput = {};
    if (input.action === "activate") {
      data.status = "ACTIVE";
      data.newBookingsPaused = false;
      data.manualSuspend = false;
      if (today >= account.gracePeriodEndDate || today > account.nextPaymentDueDate) {
        const due = addDaysISO(today, 30);
        data.nextPaymentDueDate = due;
        data.gracePeriodEndDate = addDaysISO(due, GRACE_DAYS);
        await tx.subscriptionInvoice.updateMany({
          where: { artistId, status: { in: ["UNPAID", "OVERDUE"] } },
          data: { dueDate: due, status: "UNPAID" },
        });
      }
    }
    if (input.action === "suspend") {
      data.status = "SUSPENDED";
      data.newBookingsPaused = true;
      data.manualSuspend = true;
    }
    if (input.action === "extend") {
      const days = Math.max(1, input.days || 30);
      const due = addDaysISO(account.nextPaymentDueDate >= today ? account.nextPaymentDueDate : today, days);
      data.nextPaymentDueDate = due;
      data.gracePeriodEndDate = addDaysISO(due, GRACE_DAYS);
      data.status = "ACTIVE";
      data.newBookingsPaused = false;
      data.manualSuspend = false;
      await tx.subscriptionInvoice.updateMany({
        where: { artistId, status: { in: ["UNPAID", "OVERDUE"] } },
        data: { dueDate: due, status: "UNPAID" },
      });
    }
    await tx.artistSubscription.update({ where: { id: account.id }, data });
    await writeAudit(tx, {
      actorType: "admin",
      actorId: adminId,
      action: `fees_${input.action}`,
      artistId,
      reason: input.reason,
    });
    return refreshFeeAccount(artistId, tx);
  });
}

export async function feeSnapshot(artistId: string) {
  const account = await refreshFeeAccount(artistId);
  const settings = await ensurePaymentSettings();
  const invoices = await db.subscriptionInvoice.findMany({
    where: { artistId, status: { not: "CANCELLED" } },
    include: {
      payments: { orderBy: { createdAt: "desc" } },
      fees: { include: { booking: { select: { id: true, brideName: true, date: true, trackCode: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });
  const notices = await db.artistNotice.findMany({
    where: { artistId, read: false },
    orderBy: { createdAt: "desc" },
    take: 8,
  });
  const open = invoices.find((invoice) => ["UNPAID", "PAYMENT_PENDING", "OVERDUE"].includes(invoice.status)) || null;
  const today = todayISO();
  const outstanding = await db.platformFee.aggregate({
    where: { artistId, status: "UNPAID" },
    _sum: { amountLyd: true },
  });
  return {
    account: {
      ...account,
      canCreateBookings: canCreateNewBookings(account),
      daysUntilDue: daysBetween(today, account.nextPaymentDueDate),
      graceDaysLeft: Math.max(0, daysBetween(today, account.gracePeriodEndDate)),
    },
    settings: {
      bankName: settings.bankName,
      accountName: settings.accountName,
      accountNumber: settings.accountNumber,
      instructions: settings.instructions,
      supportedMethods: settings.supportedMethods.split(",").filter(Boolean),
    },
    openInvoice: open,
    invoices,
    notices,
    outstanding: outstanding._sum.amountLyd || 0,
  };
}
