"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui";
import { monthLabel, neighborhoodLabel } from "@/lib/utils";

type Overview = {
  totalArtists: number;
  active: number;
  paymentDue: number;
  gracePeriod: number;
  paymentPending: number;
  suspended: number;
  pendingPayments: number;
  monthlyRevenue: number;
  outstandingFees: number;
};

type ArtistRow = {
  artistId: string;
  name: string;
  slug: string;
  neighborhood: string;
  generatedLyd: number;
  bookingCount: number;
  collectedLyd: number;
  outstandingLyd: number;
  rank: number;
  share: number;
};

type Revenue = {
  month: string;
  months: string[];
  current: {
    generatedLyd: number;
    collectedLyd: number;
    bookingCount: number;
    artistCount: number;
    collectionRate: number;
    topArtist: { artistId: string; name: string; generatedLyd: number; share: number } | null;
    artists: ArtistRow[];
  };
  previous: { generatedLyd: number; collectedLyd: number; bookingCount: number };
  change: { generated: number; collected: number; bookings: number };
  trend: Array<{ month: string; generatedLyd: number; collectedLyd: number }>;
};

export default function AdminHomePage() {
  const [data, setData] = useState<Overview | null>(null);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [month, setMonth] = useState("");

  useEffect(() => {
    fetch("/api/admin/overview")
      .then((r) => r.json())
      .then(setData);
  }, []);

  useEffect(() => {
    const q = month ? `?month=${month}` : "";
    fetch(`/api/admin/revenue${q}`)
      .then((r) => r.json())
      .then((body) => {
        setRevenue(body);
        if (!month && body.month) setMonth(body.month);
      });
  }, [month]);

  if (!data) return <p>لحظات…</p>;

  const cards = [
    ["كل الخبيرات", data.totalArtists],
    ["حسابات سليمة", data.active],
    ["قرب الاستحقاق", data.paymentDue],
    ["مهلة", data.gracePeriod],
    ["قيد المراجعة", data.paymentPending],
    ["متوقف", data.suspended],
    ["دفعات تنتظر", data.pendingPayments],
    ["رسوم غير مسددة", `${data.outstandingFees} د.ل`],
    ["محصّل هذا الشهر", `${data.monthlyRevenue} د.ل`],
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-4xl">رسوم الحجوزات</h1>
        <p className="mt-2 text-sm text-espresso/55">
          المبلغ = ١٠ د.ل × الحجوزات المؤكدة من صفحة برايدي. ما فيه اشتراك شهري ثابت.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs text-espresso/50">{label}</p>
            <p className="mt-1 font-display text-3xl">{value}</p>
          </Card>
        ))}
      </div>

      {revenue ? <RevenueAnalysis data={revenue} month={month} onMonth={setMonth} /> : <p className="text-espresso/50">نجهّز تحليل الإيرادات…</p>}
    </div>
  );
}

function RevenueAnalysis({
  data,
  month,
  onMonth,
}: {
  data: Revenue;
  month: string;
  onMonth: (month: string) => void;
}) {
  const maxTrend = Math.max(1, ...data.trend.map((p) => Math.max(p.generatedLyd, p.collectedLyd)));
  const maxArtist = Math.max(1, ...data.current.artists.map((a) => a.generatedLyd));

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.2em] text-gold uppercase">تحليل الإيراد</p>
          <h2 className="font-display text-3xl">من تجيب لبرايدي أكثر؟</h2>
          <p className="mt-1 text-sm text-espresso/55">
            ترتيب الخبيرات حسب الرسوم اللي تولّدت من حجوزات صفحتهن في {monthLabel(data.month, "ar")}.
          </p>
        </div>
        <label className="text-sm text-espresso/60">
          الشهر
          <select
            className="ms-2 rounded-full border border-champagne/40 bg-white/80 px-3 py-1.5"
            value={month || data.month}
            onChange={(e) => onMonth(e.target.value)}
          >
            {(data.months.length ? data.months : [data.month]).map((value) => (
              <option key={value} value={value}>
                {monthLabel(value, "ar")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        <Kpi
          label="تولّد هذا الشهر"
          value={`${data.current.generatedLyd} د.ل`}
          hint={`${data.current.bookingCount} حجز مؤكد`}
          change={data.change.generated}
        />
        <Kpi
          label="تحصّل فعلاً"
          value={`${data.current.collectedLyd} د.ل`}
          hint={`نسبة التحصيل ${data.current.collectionRate}%`}
          change={data.change.collected}
        />
        <Kpi
          label="خبيرات ولّدن رسوم"
          value={String(data.current.artistCount)}
          hint={`مقابل ${data.previous.bookingCount} حجز الشهر اللي فات`}
          change={data.change.bookings}
        />
        <Card className="bg-espresso text-ivory">
          <p className="text-xs text-champagne">الأولى هذا الشهر</p>
          {data.current.topArtist ? (
            <>
              <p className="mt-2 font-display text-2xl">{data.current.topArtist.name}</p>
              <p className="mt-1 text-sm text-ivory/70">
                {data.current.topArtist.generatedLyd} د.ل · {data.current.topArtist.share}% من إيراد الشهر
              </p>
              <Link href={`/admin/artists/${data.current.topArtist.artistId}`} className="mt-3 inline-block text-sm text-gold">
                فتح حسابها
              </Link>
            </>
          ) : (
            <p className="mt-2 text-sm text-ivory/70">ما تولّدت رسوم في هذا الشهر بعد.</p>
          )}
        </Card>
      </div>

      <Card>
        <p className="text-xs text-espresso/50">آخر ٦ أشهر · تولّد مقابل تحصّل</p>
        <div className="mt-4 grid grid-cols-6 items-end gap-2">
          {data.trend.map((point) => (
            <div key={point.month} className="text-center">
              <div className="mx-auto flex h-28 w-full max-w-[3rem] items-end justify-center gap-1">
                <span
                  className="w-3 rounded-t bg-gold"
                  style={{ height: `${Math.max(6, (point.generatedLyd / maxTrend) * 100)}%` }}
                  title={`تولّد ${point.generatedLyd}`}
                />
                <span
                  className="w-3 rounded-t bg-espresso/70"
                  style={{ height: `${Math.max(6, (point.collectedLyd / maxTrend) * 100)}%` }}
                  title={`تحصّل ${point.collectedLyd}`}
                />
              </div>
              <p className="mt-2 text-[11px] text-espresso/55">{monthLabel(point.month, "ar").split(" ")[0]}</p>
              <p className="text-[11px] text-espresso/40">{point.generatedLyd}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-espresso/45">ذهبي = رسوم تولّدت من التأكيد · داكن = مبالغ تأكد استلامها</p>
      </Card>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-2xl">ترتيب الخبيرات</h3>
          <p className="text-xs text-espresso/45">الأعلى توليداً لرسوم برايدي أولاً</p>
        </div>
        {data.current.artists.length === 0 ? (
          <p className="text-espresso/55">ما فيه حجوزات مؤكدة من الصفحات في هذا الشهر.</p>
        ) : (
          <div className="space-y-3">
            {data.current.artists.map((row) => (
              <Link
                key={row.artistId}
                href={`/admin/artists/${row.artistId}`}
                className="block rounded-2xl bg-ivory/80 p-3 transition hover:bg-white"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className={`grid h-8 w-8 place-items-center rounded-full text-sm ${row.rank <= 3 ? "bg-gold text-espresso" : "bg-white text-espresso/60"}`}>
                      {row.rank}
                    </span>
                    <div>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-espresso/50">
                        {neighborhoodLabel(row.neighborhood, "ar")} · {row.bookingCount} حجز · {row.share}% من الشهر
                      </p>
                    </div>
                  </div>
                  <div className="text-end text-sm">
                    <p className="font-display text-xl">{row.generatedLyd} د.ل</p>
                    <p className="text-xs text-espresso/45">
                      تحصّل {row.collectedLyd} · باقي {row.outstandingLyd}
                    </p>
                  </div>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(4, (row.generatedLyd / maxArtist) * 100)}%` }} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

function Kpi({ label, value, hint, change }: { label: string; value: string; hint: string; change: number }) {
  const up = change > 0;
  const flat = change === 0;
  return (
    <Card>
      <p className="text-xs text-espresso/50">{label}</p>
      <p className="mt-1 font-display text-3xl">{value}</p>
      <p className="mt-2 text-xs text-espresso/50">{hint}</p>
      <p className={`mt-1 text-xs ${flat ? "text-espresso/40" : up ? "text-emerald-800" : "text-red-700"}`}>
        {flat ? "نفس الشهر اللي فات" : `${up ? "+" : ""}${change}% عن الشهر اللي فات`}
      </p>
    </Card>
  );
}
