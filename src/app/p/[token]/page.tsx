"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Brand, Button, Card, LangToggle } from "@/components/ui";
import { useLang } from "@/lib/language";

export default function PublicPassGatePage() {
  const { t } = useLang();
  const params = useParams<{ token: string }>();
  const [state, setState] = useState<"checking" | "login" | "ok">("checking");
  const next = `/dashboard/pass/${encodeURIComponent(params.token)}`;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me")
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          window.location.replace(next);
          setState("ok");
        } else {
          setState("login");
        }
      })
      .catch(() => {
        if (!cancelled) setState("login");
      });
    return () => {
      cancelled = true;
    };
  }, [next]);

  return (
    <div className="bridal-bg min-h-screen">
      <header className="mx-auto flex max-w-md items-center justify-between px-5 py-5">
        <Brand />
        <LangToggle />
      </header>
      <main className="mx-auto max-w-md px-5 pb-16">
        <Card className="p-6">
          <p className="font-display text-3xl">{t.passTitle}</p>
          <p className="mt-3 text-espresso/70">{t.passLogin}</p>
          {state !== "ok" ? (
            <Button href={`/login?next=${encodeURIComponent(next)}`} variant="gold" className="mt-6 w-full">
              {t.login}
            </Button>
          ) : null}
        </Card>
      </main>
    </div>
  );
}
