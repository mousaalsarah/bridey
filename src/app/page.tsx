"use client";

import Link from "next/link";
import { CalendarHeart, Sparkles, Link2, Camera, BadgeCheck, Wallet } from "lucide-react";
import { Brand, Button, LangToggle, SectionTitle } from "@/components/ui";
import { useLang } from "@/lib/language";

export default function HomePage() {
  const { t, lang } = useLang();

  return (
    <div className="bridal-bg min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Brand />
        <div className="flex items-center gap-2">
          <LangToggle />
          <Button href="/login" variant="ghost" className="hidden sm:inline-flex">
            {t.login}
          </Button>
          <Button href="/signup" variant="dark">
            {t.signup}
          </Button>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-6 lg:grid-cols-2 lg:pt-12">
        <div>
          <p className="mb-3 text-xs tracking-[0.28em] text-gold uppercase">
            {t.city} · {t.brand}
          </p>
          <h1 className="font-display text-4xl leading-tight text-espresso sm:text-6xl">
            {t.heroTitle}
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-espresso/70">{t.heroBody}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/signup" variant="gold">
              {t.heroCtaArtist}
            </Button>
            <Button href="/login" variant="ghost">
              {t.login}
            </Button>
          </div>
          <p className="mt-6 text-sm text-espresso/50">{t.feeNote}</p>
        </div>

        <div className="relative">
          <div className="tile absolute -inset-4 rounded-[2.2rem] opacity-70" />
          <div className="relative overflow-hidden rounded-[2rem] border border-champagne/40 bg-white/70 p-6 shadow-soft">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gold tracking-widest">SNAP LINK</p>
                <p className="font-display text-2xl">bridey.app/a/اسمك</p>
              </div>
              <span className="rounded-full bg-rose px-3 py-1 text-xs">١٠ د.ل / تأكيد</span>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {(lang === "ar"
                ? ["صفحتك", "باقاتك", "معرض أعمالك", "مواعيدك"]
                : ["Your page", "Your packages", "Your portfolio", "Your hours"]
              ).map((item) => (
                <div key={item} className="rounded-2xl bg-ivory p-4">
                  <p className="text-sm text-espresso/80">{item}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 rounded-2xl bg-espresso px-4 py-3 text-center text-ivory">
              {lang === "ar" ? "العروس تحجز من رابطك" : "The bride books from your link"}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <SectionTitle eyebrow={t.brand} title={t.howTitle} />
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <HowCard
            title={t.howArtist}
            steps={[t.step1a, t.step2a, t.step3a]}
            icons={[Sparkles, Link2, Wallet]}
          />
          <HowCard
            title={t.howBride}
            steps={[t.step1b, t.step2b, t.step3b]}
            icons={[Link2, CalendarHeart, BadgeCheck]}
          />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="overflow-hidden rounded-[2rem] border border-champagne/40 bg-espresso text-ivory">
          <div className="grid gap-8 p-8 md:grid-cols-2 md:p-12">
            <div>
              <p className="text-xs tracking-[0.28em] text-champagne uppercase">{t.feeTitle}</p>
              <h3 className="mt-3 font-display text-3xl">{t.feeBody}</h3>
              <p className="mt-4 text-ivory/70">{t.feeNote}</p>
            </div>
            <div className="grid gap-3 self-center">
              {[
                lang === "ar" ? "بدون اشتراك شهري" : "No monthly fee",
                lang === "ar" ? "الرابط جاهز للمشاركة على السناب" : "Snapchat-ready booking link",
                lang === "ar" ? "معرض أعمال داخل الملف" : "Portfolio on your profile",
                lang === "ar" ? "تأكيد بضغطة · والعروس على واتساب" : "One-tap confirm · WhatsApp the bride",
              ].map((line) => (
                <div key={line} className="flex items-center gap-3 rounded-2xl bg-white/5 px-4 py-3">
                  <Camera className="h-4 w-4 text-champagne" />
                  <span>{line}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 pb-20 text-center">
        <h2 className="font-display text-4xl text-espresso">{t.ctaTitle}</h2>
        <p className="mt-3 text-espresso/65">{t.ctaBody}</p>
        <div className="mt-8 flex justify-center gap-3">
          <Button href="/signup" variant="gold">
            {t.signup}
          </Button>
          <Button href="/login" variant="ghost">
            {t.login}
          </Button>
        </div>
      </section>

      <footer className="border-t border-champagne/30 px-5 py-8 text-center text-sm text-espresso/50">
        <Link href="/" className="font-display text-espresso">
          {t.brand}
        </Link>
        <span className="mx-2">·</span>
        {t.city} 2026
      </footer>
    </div>
  );
}

function HowCard({
  title,
  steps,
  icons,
}: {
  title: string;
  steps: string[];
  icons: Array<typeof Link2>;
}) {
  return (
    <div className="rounded-[2rem] border border-champagne/30 bg-white/70 p-6 shadow-soft">
      <h3 className="font-display text-2xl text-espresso">{title}</h3>
      <ol className="mt-6 space-y-4">
        {steps.map((step, i) => {
          const Icon = icons[i];
          return (
            <li key={step} className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-rose text-espresso">
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs text-gold">{String(i + 1).padStart(2, "0")}</p>
                <p className="text-espresso/80">{step}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
