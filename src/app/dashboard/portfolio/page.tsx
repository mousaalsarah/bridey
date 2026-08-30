"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { useLang } from "@/lib/language";
import { useStudio } from "@/lib/use-studio";

export default function PortfolioPage() {
  const { t, lang } = useLang();
  const { data, loading, reload } = useStudio();
  const [busy, setBusy] = useState(false);

  if (loading || !data) {
    return <p className="text-espresso/50">{lang === "ar" ? "لحظات…" : "Loading…"}</p>;
  }

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const form = new FormData();
    form.set("file", file);
    await fetch("/api/portfolio", { method: "POST", body: form });
    setBusy(false);
    e.target.value = "";
    reload();
  }

  async function remove(id: string) {
    await fetch(`/api/portfolio/${id}`, { method: "DELETE" });
    reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-4xl">{t.portfolio}</h1>
        <label className="inline-flex cursor-pointer items-center rounded-full bg-gold px-5 py-2.5 text-sm text-espresso">
          {busy ? "…" : t.uploadPhotos}
          <input type="file" accept="image/*" className="hidden" onChange={upload} />
        </label>
      </div>
      {data.portfolio.length === 0 ? (
        <Card>
          <p className="text-espresso/60">
            {lang === "ar" ? "ارفعي صور أعمالك حتى العروس تشوف أسلوبك قبل ما تحجز." : "Upload your work so brides see your style before they book."}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {data.portfolio.map((img) => (
            <div key={img.id} className="overflow-hidden rounded-3xl border border-champagne/30 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="aspect-[3/4] w-full object-cover" />
              <div className="flex flex-wrap justify-end gap-1 p-2">
                <Button
                  variant="ghost"
                  className="px-3 py-1 text-xs"
                  onClick={async () => {
                    await fetch("/api/me", {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ coverUrl: img.url }),
                    });
                    reload();
                  }}
                >
                  {t.useAsCover}
                </Button>
                <Button variant="ghost" className="px-3 py-1 text-xs" onClick={() => remove(img.id)}>
                  {lang === "ar" ? "حذف" : "Remove"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
