"use client";

import { useEffect, useState } from "react";
import { useLang } from "@/lib/language";
import { formatDate, minutesToTime } from "@/lib/utils";
import { StatusBadge } from "@/components/ui";

export type PublicPass = {
  brideName: string;
  artistName: string;
  trackCode: string;
  status: string;
  date: string;
  startMin: number;
  endMin: number;
  shift?: { nameAr: string; nameEn: string } | null;
  services: Array<{ nameAr: string; nameEn: string }>;
  passToken: string;
};

export function BrideyPassCard({ data }: { data: PublicPass }) {
  const { t, lang } = useLang();
  const [qr, setQr] = useState("");
  const services = data.services.map((s) => (lang === "ar" ? s.nameAr : s.nameEn)).join(" · ");
  const when = data.shift
    ? `${formatDate(data.date, lang)} · ${lang === "ar" ? data.shift.nameAr : data.shift.nameEn}`
    : `${formatDate(data.date, lang)} · ${minutesToTime(data.startMin, lang)}`;
  const statusLabel =
    data.status === "COMPLETED"
      ? t.passCompleted
      : data.status === "CANCELLED" || data.status === "NO_SHOW"
        ? t[data.status === "NO_SHOW" ? "noShow" : "cancelled"]
        : data.status === "CHECKED_IN"
          ? t.checkedIn
          : data.status === "IN_PROGRESS"
            ? t.appointmentInProgress
            : t.confirmed;

  useEffect(() => {
    const url = `${window.location.origin}/p/${data.passToken}`;
    let cancelled = false;
    import("qrcode").then((QRCode) =>
      QRCode.toDataURL(url, {
        width: 400,
        margin: 1,
        color: { dark: "#2c2422", light: "#fbf7f3" },
        errorCorrectionLevel: "M",
      }).then((src) => {
        if (!cancelled) setQr(src);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [data.passToken]);

  return (
    <div className="overflow-hidden rounded-[20px] border border-champagne/30 bg-white shadow-lift">
      <div className="bg-espresso px-6 py-6 text-center text-ivory">
        <p className="text-[11px] font-medium tracking-[0.38em] text-blush">BRIDEY</p>
        <p className="mt-2 font-display text-3xl">{t.passTitle}</p>
      </div>
      <div className="space-y-3 px-6 py-7 text-center">
        <p className="font-display text-3xl text-espresso">{data.brideName}</p>
        <p className="text-espresso/70">{data.artistName}</p>
        <p className="text-sm text-espresso/65">{services}</p>
        <p className="text-sm text-taupe">{when}</p>
        <div className="mx-auto w-72 max-w-full rounded-2xl bg-cream p-3">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Bridey Pass QR" className="h-auto w-full" />
          ) : (
            <div className="grid aspect-square place-items-center text-taupe">{t.loading}</div>
          )}
        </div>
        <StatusBadge status={data.status} label={statusLabel} />
        <p className="text-xs text-taupe">
          {t.bookingNumber}:{" "}
          <span className="font-mono tracking-widest" dir="ltr">
            {data.trackCode}
          </span>
        </p>
      </div>
    </div>
  );
}
