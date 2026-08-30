"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Brand, Button, Field, LangToggle, inputClass } from "@/components/ui";
import { useLang } from "@/lib/language";

export default function SignupPage() {
  const { t } = useLang();
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(
        data.error === "TAKEN" ? t.phoneTaken : data.error === "PHONE" ? t.invalidPhone : data.error === "INVALID" && password.length < 4 ? t.weakPassword : t.required,
      );
      return;
    }
    router.push("/onboarding");
  }

  return (
    <div className="bridal-bg flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-md items-center justify-between px-5 py-5">
        <Brand />
        <LangToggle />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pb-16">
        <h1 className="font-display text-4xl text-espresso">{t.signupTitle}</h1>
        <p className="mt-2 text-espresso/60">{t.signupHint}</p>
        <form onSubmit={submit} className="mt-8 space-y-4 rounded-[2rem] border border-champagne/30 bg-white/75 p-6 shadow-soft">
          <Field label={t.name}>
            <input className={inputClass()} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label={t.phone}>
            <input className={inputClass()} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="091xxxxxxx" dir="ltr" />
          </Field>
          <Field label={t.password}>
            <input className={inputClass()} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <Button type="submit" variant="gold" className="w-full" disabled={loading}>
            {t.signup}
          </Button>
        </form>
        <Button href="/login" variant="ghost" className="mt-5 w-full">
          {t.orLogin}
        </Button>
      </main>
    </div>
  );
}
