"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Brand, Button, Field, LangToggle, SpecialtyPicker, inputClass } from "@/components/ui";
import { HOUR_PRESETS, NEIGHBORHOODS, SERVICE_KINDS } from "@/lib/constants";
import { useLang } from "@/lib/language";

type DraftService = {
  nameAr: string;
  kind: string;
  durationMin: number;
  priceLyd: number;
};

function emptyService(kind = "bridal"): DraftService {
  return { nameAr: "", kind, durationMin: 90, priceLyd: 200 };
}

export default function OnboardingPage() {
  const { t, lang } = useLang();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [specialties, setSpecialties] = useState<string[]>(["makeup"]);
  const [neighborhood, setNeighborhood] = useState("fuwayhat");
  const [bio, setBio] = useState("");
  const [snapchat, setSnapchat] = useState("");
  const [services, setServices] = useState<DraftService[]>([
    { nameAr: lang === "ar" ? "مكياج عروس كامل" : "Full bridal makeup", kind: "bridal", durationMin: 120, priceLyd: 350 },
  ]);
  const [hoursPreset, setHoursPreset] = useState("bride-days");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.artist?.onboardingComplete) router.replace("/dashboard");
      });
  }, [router]);

  function updateService(index: number, patch: Partial<DraftService>) {
    setServices((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function finish() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        specialties,
        neighborhood,
        bio,
        snapchat,
        services: services
          .filter((s) => s.nameAr.trim().length >= 2)
          .map((s) => ({ ...s, nameEn: s.nameAr })),
        hoursPreset,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      setError(t.required);
      return;
    }
    router.push("/dashboard/share");
  }

  return (
    <div className="bridal-bg min-h-screen">
      <header className="mx-auto flex max-w-xl items-center justify-between px-5 py-5">
        <Brand href="/dashboard" />
        <LangToggle />
      </header>
      <main className="mx-auto max-w-xl px-5 pb-16">
        <p className="text-xs tracking-[0.25em] text-gold uppercase">0{step + 1} / 03</p>
        <h1 className="mt-2 font-display text-4xl">{t.onboardingTitle}</h1>

        <div className="mt-8 rounded-[2rem] border border-champagne/30 bg-white/75 p-6 shadow-soft">
          {step === 0 ? (
            <div className="space-y-4">
              <Field label={t.specialty}>
                <SpecialtyPicker value={specialties} onChange={setSpecialties} />
              </Field>
              <Field label={t.neighborhood}>
                <select className={inputClass()} value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)}>
                  {NEIGHBORHOODS.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n[lang]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t.bio}>
                <textarea className={inputClass("min-h-24")} value={bio} onChange={(e) => setBio(e.target.value)} />
              </Field>
              <Field label={t.snapchat} hint={lang === "ar" ? "يظهر على صفحتك العامة" : "Shown on your public page"}>
                <input className={inputClass()} dir="ltr" value={snapchat} onChange={(e) => setSnapchat(e.target.value)} placeholder="@yourname" />
              </Field>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="space-y-4">
              <p className="text-sm text-espresso/60">{t.packageHint}</p>
              {services.map((service, index) => (
                <div key={index} className="space-y-3 rounded-2xl border border-champagne/30 bg-ivory/60 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gold">
                      {t.services} 0{index + 1}
                    </p>
                    {services.length > 1 ? (
                      <button type="button" className="text-xs text-espresso/50" onClick={() => setServices((rows) => rows.filter((_, i) => i !== index))}>
                        {lang === "ar" ? "حذف" : "Remove"}
                      </button>
                    ) : null}
                  </div>
                  <Field label={t.serviceKind}>
                    <select className={inputClass()} value={service.kind} onChange={(e) => updateService(index, { kind: e.target.value })}>
                      {SERVICE_KINDS.map((k) => (
                        <option key={k.id} value={k.id}>
                          {k[lang]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={lang === "ar" ? "اسم الباقة" : "Package name"}>
                    <input className={inputClass()} value={service.nameAr} onChange={(e) => updateService(index, { nameAr: e.target.value })} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={`${t.duration} (${t.minutes})`}>
                      <input className={inputClass()} type="number" min={30} step={30} value={service.durationMin} onChange={(e) => updateService(index, { durationMin: Number(e.target.value) })} />
                    </Field>
                    <Field label={`${t.price} (${t.lyd})`}>
                      <input className={inputClass()} type="number" min={1} value={service.priceLyd} onChange={(e) => updateService(index, { priceLyd: Number(e.target.value) })} />
                    </Field>
                  </div>
                </div>
              ))}
              {services.length < 8 ? (
                <Button variant="ghost" className="w-full" onClick={() => setServices((rows) => [...rows, emptyService("evening")])}>
                  {t.addAnother}
                </Button>
              ) : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              {HOUR_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setHoursPreset(p.id)}
                  className={`w-full rounded-2xl border p-4 text-start ${hoursPreset === p.id ? "border-gold bg-rose/50" : "border-champagne/30 bg-white"}`}
                >
                  <p className="font-medium">{p[lang]}</p>
                  <p className="text-sm text-espresso/55">{lang === "ar" ? p.hintAr : p.hintEn}</p>
                </button>
              ))}
            </div>
          ) : null}

          {error ? <p className="mt-4 text-sm text-red-700">{error}</p> : null}

          <div className="mt-6 flex gap-3">
            {step > 0 ? (
              <Button variant="ghost" className="flex-1" onClick={() => setStep((s) => s - 1)}>
                {t.back}
              </Button>
            ) : null}
            {step < 2 ? (
              <Button variant="gold" className="flex-1" onClick={() => setStep((s) => s + 1)}>
                {t.next}
              </Button>
            ) : (
              <Button variant="gold" className="flex-1" disabled={loading} onClick={finish}>
                {t.finish}
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
