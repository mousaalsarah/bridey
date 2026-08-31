"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Brand, Button, Card, Field, LangToggle, inputClass } from "@/components/ui";
import { useLang } from "@/lib/language";

export default function TrackLookupPage() {
  const { t } = useLang();
  const router = useRouter();
  const [code, setCode] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const next = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (next.length < 6) return;
    router.push(`/track/${next}`);
  }

  return (
    <div className="bridal-bg min-h-screen">
      <header className="mx-auto flex max-w-md items-center justify-between px-5 py-5">
        <Brand />
        <LangToggle />
      </header>
      <main className="mx-auto max-w-md px-5 pb-16">
        <h1 className="font-display text-4xl">{t.trackTitle}</h1>
        <p className="mt-2 text-espresso/65">{t.trackHint}</p>
        <form onSubmit={submit} className="mt-8 space-y-4">
          <Card className="space-y-4 p-6">
          <Field label={t.trackCode}>
            <input className={inputClass("font-mono tracking-widest")} dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BR7K4M2" />
          </Field>
          <Button type="submit" variant="gold" className="w-full">
            {t.trackLookup}
          </Button>
          </Card>
        </form>
      </main>
    </div>
  );
}
