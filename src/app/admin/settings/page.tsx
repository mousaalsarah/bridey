"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, inputClass } from "@/components/ui";

export default function AdminSettingsPage() {
  const [form, setForm] = useState({
    bankName: "",
    accountName: "",
    accountNumber: "",
    instructions: "",
    supportedMethods: "BANK_TRANSFER,E_PAYMENT,CASH",
    reminderDays: 7,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.settings) setForm((current) => ({ ...current, ...d.settings }));
      });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl">بيانات التحويل</h1>
      <Card>
        <form onSubmit={save} className="space-y-3">
          <Field label="البنك">
            <input className={inputClass()} value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
          </Field>
          <Field label="اسم الحساب">
            <input className={inputClass()} value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} />
          </Field>
          <Field label="رقم الحساب">
            <input className={inputClass()} dir="ltr" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} />
          </Field>
          <Field label="تعليمات">
            <textarea className={inputClass("min-h-20")} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
          </Field>
          <Button type="submit" variant="gold">
            {saved ? "تم الحفظ" : "حفظ"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
