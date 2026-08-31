"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Brand, Button, Card, Field, LangToggle, inputClass } from "@/components/ui";
import { useLang } from "@/lib/language";

function LoginForm() {
  const { t } = useLang();
  const router = useRouter();
  const params = useSearchParams();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error === "LOGIN" ? t.invalidLogin : t.required);
      return;
    }
    const next = params.get("next");
    const safeNext =
      next && next.startsWith("/") && !next.startsWith("//") && !next.includes("://") ? next : "";
    router.push(safeNext || (data.onboardingComplete ? "/dashboard" : "/onboarding"));
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label={t.phone}>
        <input className={inputClass()} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="091xxxxxxx" dir="ltr" />
      </Field>
      <Field label={t.password}>
        <input className={inputClass()} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error ? <p className="text-sm text-error">{error}</p> : null}
      <Button type="submit" variant="gold" className="w-full" disabled={loading} loading={loading}>
        {t.login}
      </Button>
      <p className="text-center text-xs text-espresso/45">{t.demoHint}</p>
    </form>
  );
}

export default function LoginPage() {
  const { t } = useLang();
  return (
    <div className="bridal-bg flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-md items-center justify-between px-5 py-5">
        <Brand />
        <LangToggle />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pb-16">
        <h1 className="font-display text-4xl text-espresso">{t.loginTitle}</h1>
        <p className="mt-2 text-espresso/60">{t.tagline}</p>
        <Card className="mt-8 p-6">
          <Suspense>
            <LoginForm />
          </Suspense>
        </Card>
        <Button href="/signup" variant="ghost" className="mt-5 w-full">
          {t.orSignup}
        </Button>
      </main>
    </div>
  );
}
