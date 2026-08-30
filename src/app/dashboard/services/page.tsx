"use client";

import { useState } from "react";
import { Button, Card, Field, inputClass } from "@/components/ui";
import { SERVICE_KINDS } from "@/lib/constants";
import { useLang } from "@/lib/language";
import { useStudio } from "@/lib/use-studio";
import { kindLabel } from "@/lib/utils";

export default function ServicesPage() {
  const { t, lang } = useLang();
  const { data, loading, reload } = useStudio();
  const [nameAr, setNameAr] = useState("");
  const [kind, setKind] = useState("bridal");
  const [durationMin, setDurationMin] = useState(90);
  const [priceLyd, setPriceLyd] = useState(200);

  if (loading || !data) {
    return <p className="text-espresso/50">{lang === "ar" ? "لحظات…" : "Loading…"}</p>;
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nameAr, nameEn: nameAr, kind, durationMin, priceLyd }),
    });
    setNameAr("");
    reload();
  }

  async function toggle(id: string, active: boolean) {
    await fetch(`/api/services/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active }),
    });
    reload();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl">{t.services}</h1>
        <p className="mt-2 text-sm text-espresso/60">{t.packageHint}</p>
      </div>
      <form onSubmit={add} className="grid gap-3 rounded-[2rem] border border-champagne/30 bg-white/70 p-5 md:grid-cols-5">
        <Field label={t.serviceKind}>
          <select className={inputClass()} value={kind} onChange={(e) => setKind(e.target.value)}>
            {SERVICE_KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k[lang]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={lang === "ar" ? "اسم الباقة" : "Package"}>
          <input className={inputClass()} value={nameAr} onChange={(e) => setNameAr(e.target.value)} required />
        </Field>
        <Field label={t.duration}>
          <input className={inputClass()} type="number" min={30} step={30} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} />
        </Field>
        <Field label={t.price}>
          <input className={inputClass()} type="number" min={1} value={priceLyd} onChange={(e) => setPriceLyd(Number(e.target.value))} />
        </Field>
        <div className="flex items-end">
          <Button type="submit" variant="gold" className="w-full">
            {t.addService}
          </Button>
        </div>
      </form>

      <div className="space-y-3">
        {data.services.map((s) => (
          <Card key={s.id} className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-gold">{kindLabel(s.kind, lang)}</p>
              <p className="font-medium">{lang === "ar" ? s.nameAr : s.nameEn}</p>
              <p className="text-sm text-espresso/55">
                {s.durationMin} {t.minutes} · {s.priceLyd} {t.lyd}
              </p>
            </div>
            <Button variant={s.active ? "ghost" : "gold"} onClick={() => toggle(s.id, !s.active)}>
              {s.active ? (lang === "ar" ? "إخفاء" : "Hide") : lang === "ar" ? "إظهار" : "Show"}
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
