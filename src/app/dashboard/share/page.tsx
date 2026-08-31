"use client";

import { useMemo, useState } from "react";
import { Button, Card, PageHeader, PageSkeleton } from "@/components/ui";
import { useLang } from "@/lib/language";
import { buildShareCard, copyImage, downloadBlob, shareImage } from "@/lib/share-card";
import { useStudio } from "@/lib/use-studio";
import { artistUrl } from "@/lib/utils";

export default function SharePage() {
  const { t, lang } = useLang();
  const { data, loading } = useStudio();
  const [copied, setCopied] = useState<"link" | "qr" | "">("");
  const [busy, setBusy] = useState(false);

  const url = data ? artistUrl(data.artist.slug) : "";
  const qrSrc = useMemo(() => (url ? `/api/qr?data=${encodeURIComponent(url)}` : ""), [url]);

  if (loading || !data) {
    return <PageSkeleton cards={2} />;
  }

  const artist = data.artist;

  async function card() {
    return buildShareCard(url, artist.name);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied("link");
    setTimeout(() => setCopied(""), 2000);
  }

  async function copyQr() {
    setBusy(true);
    try {
      await copyImage(await card());
      setCopied("qr");
      setTimeout(() => setCopied(""), 2000);
    } catch {
      downloadBlob(await card(), `bridey-${artist.slug}.png`);
    } finally {
      setBusy(false);
    }
  }

  async function saveQr() {
    setBusy(true);
    try {
      const blob = await card();
      const shared = await shareImage(blob, `bridey-${artist.slug}.png`, artist.name);
      if (!shared) downloadBlob(blob, `bridey-${artist.slug}.png`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t.share} body={t.shareHint} />

      <Card className="overflow-hidden p-0">
        <div className="bg-espresso px-6 py-8 text-ivory">
          <p className="text-xs font-medium tracking-[0.28em] text-blush">BRIDEY · {t.city.toUpperCase()}</p>
          <p className="mt-2 font-display text-3xl">{data.artist.name}</p>
          <p className="mt-4 break-all font-mono text-sm text-ivory/80" dir="ltr">
            {url}
          </p>
        </div>
        <div className="flex flex-wrap gap-3 p-6">
          <Button variant="gold" onClick={copyLink}>
            {copied === "link" ? t.copied : t.copyLink}
          </Button>
          <Button variant="dark" disabled={busy} onClick={copyQr}>
            {copied === "qr" ? t.copied : t.copyQr}
          </Button>
          <Button href={`/a/${data.artist.slug}`} variant="ghost">
            {t.publicProfile}
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <p className="font-display text-xl">{lang === "ar" ? "للستوري" : "For your story"}</p>
          <p className="mt-2 text-sm text-espresso/60">{t.qrHint}</p>
          <ol className="mt-3 list-decimal space-y-2 ps-5 text-sm text-espresso/70">
            <li>{lang === "ar" ? "انسخ الرابط أو احفظي صورة الـ QR" : "Copy the link or save the QR image"}</li>
            <li>{lang === "ar" ? "حطيها في ستوري السناب" : "Add it to your Snapchat story"}</li>
            <li>{lang === "ar" ? "العروس تمسح الكود أو تضغط الرابط وتحجز" : "The bride scans or taps and books"}</li>
          </ol>
          <Button variant="gold" className="mt-5 w-full" disabled={busy} onClick={saveQr}>
            {t.shareQr}
          </Button>
          <Button variant="ghost" className="mt-2 w-full" disabled={busy} onClick={async () => downloadBlob(await card(), `bridey-${data.artist.slug}.png`)}>
            {t.saveQr}
          </Button>
        </Card>
        <Card className="grid place-items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="QR" src={qrSrc} className="h-48 w-48 rounded-2xl bg-white p-3" />
        </Card>
      </div>
    </div>
  );
}
