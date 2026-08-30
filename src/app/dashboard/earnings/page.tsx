"use client";

import { useState } from "react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { useLang } from "@/lib/language";
import { useStudio } from "@/lib/use-studio";
import { formatDate, todayISO } from "@/lib/utils";

const METHOD_LABEL: Record<string, { ar: string; en: string }> = {
  BANK_TRANSFER: { ar: "تحويل بنكي", en: "Bank transfer" },
  E_PAYMENT: { ar: "دفع إلكتروني", en: "E-payment" },
  CASH: { ar: "كاش", en: "Cash" },
  OTHER: { ar: "أخرى", en: "Other" },
};

const INVOICE_STATUS: Record<string, "invUnpaid" | "invPaymentPending" | "invPaid" | "invOverdue"> = {
  UNPAID: "invUnpaid",
  PAYMENT_PENDING: "invPaymentPending",
  PAID: "invPaid",
  OVERDUE: "invOverdue",
};

export default function FeesPage() {
  const { t, lang } = useLang();
  const { data, loading, reload } = useStudio();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [method, setMethod] = useState("BANK_TRANSFER");
  const [paidOn, setPaidOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  if (loading || !data) {
    return <p className="text-espresso/50">{lang === "ar" ? "لحظات…" : "Loading…"}</p>;
  }

  const month = todayISO().slice(0, 7);
  const monthFees = data.fees.filter((f) => f.createdAt.slice(0, 7) === month);
  const monthTotal = monthFees.reduce((sum, f) => sum + f.amountLyd, 0);
  const billing = data.billing;
  const invoice = billing?.openInvoice;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    setBusy(true);
    setError("");
    const body = new FormData();
    body.set("invoiceId", invoice.id);
    body.set("method", method);
    body.set("amountLyd", String(invoice.amountLyd));
    body.set("paidOn", paidOn);
    body.set("reference", invoice.reference);
    body.set("note", note);
    if (file) body.set("receipt", file);
    const res = await fetch("/api/fees/submit", { method: "POST", body });
    setBusy(false);
    if (!res.ok) {
      setError(t.networkError);
      return;
    }
    setShowForm(false);
    reload();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl">{t.earnings}</h1>
        <p className="mt-2 text-sm text-espresso/60">{t.feeBody}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-espresso/50">{t.feesThisMonth}</p>
          <p className="mt-1 font-display text-4xl">{monthFees.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-espresso/50">{t.thisMonth}</p>
          <p className="mt-1 font-display text-4xl">
            {monthTotal} {t.lyd}
          </p>
        </Card>
        <Card>
          <p className="text-xs text-espresso/50">{t.feeBalance}</p>
          <p className="mt-1 font-display text-4xl">
            {data.outstanding} {t.lyd}
          </p>
        </Card>
      </div>

      {invoice && invoice.amountLyd > 0 ? (
        <Card className="space-y-3">
          <h2 className="font-display text-2xl">{t.billingPay}</h2>
          <p>
            {t.billingAmount}: <strong>{invoice.amountLyd} {t.lyd}</strong>
          </p>
          <p>
            {t.billingDue}: {formatDate(invoice.dueDate, lang)}
          </p>
          <p>
            {t.billingRef}:{" "}
            <span className="font-mono tracking-widest" dir="ltr">
              {invoice.reference}
            </span>
          </p>
          <p className="text-sm text-espresso/55">{t.billingRefHint}</p>
          {billing?.settings ? (
            <div className="rounded-2xl bg-ivory p-4 text-sm">
              <p className="font-medium">{t.bankTransfer}</p>
              <p>{billing.settings.bankName}</p>
              <p>{billing.settings.accountName}</p>
              <p dir="ltr">{billing.settings.accountNumber}</p>
              <p className="mt-2 text-espresso/60">{billing.settings.instructions || t.billingExact}</p>
            </div>
          ) : null}
          {billing?.account.status === "PAYMENT_PENDING" ? (
            <p className="text-gold">{t.billingReview}</p>
          ) : (
            <Button variant="gold" onClick={() => setShowForm(true)}>
              {t.billingIPaid}
            </Button>
          )}
        </Card>
      ) : null}

      {showForm && invoice ? (
        <Card>
          <form onSubmit={submit} className="space-y-3">
            <Field label={t.billingMethod}>
              <select className={inputClass()} value={method} onChange={(e) => setMethod(e.target.value)}>
                {(billing?.settings.supportedMethods || ["BANK_TRANSFER"]).map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABEL[m]?.[lang] || m}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t.billingPaidOn}>
              <input className={inputClass()} type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </Field>
            <Field label={t.billingReceipt}>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </Field>
            <Field label={t.billingNote}>
              <textarea className={inputClass("min-h-16")} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="submit" variant="gold" disabled={busy}>
                {t.billingSubmit}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                {t.back}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {billing?.invoices?.length ? (
        <div>
          <h2 className="font-display text-2xl">{t.billingHistory}</h2>
          <div className="mt-3 space-y-2">
            {billing.invoices.map((inv) => (
              <Card key={inv.id} className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-sm" dir="ltr">
                    {inv.number}
                  </p>
                  <p className="text-sm text-espresso/55">
                    {formatDate(inv.dueDate, lang)} · {inv.reference}
                  </p>
                </div>
                <p className="text-sm">
                  {inv.amountLyd} {t.lyd} · {t[INVOICE_STATUS[inv.status] || "invUnpaid"]}
                </p>
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {data.fees.map((f) => (
          <Card key={f.id} className="flex items-center justify-between">
            <div>
              <p>{f.booking.brideName}</p>
              <p className="text-sm text-espresso/55">
                {formatDate(f.booking.date, lang)} · {f.booking.trackCode || f.bookingId.slice(-6)}
              </p>
            </div>
            <p className="text-sm">
              {f.amountLyd} {t.lyd} · {f.status === "PAID" ? (lang === "ar" ? "مسدد" : "Paid") : lang === "ar" ? "مستحق" : "Due"}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
