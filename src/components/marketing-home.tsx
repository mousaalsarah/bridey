"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  ClipboardList,
  Clock,
  LayoutDashboard,
  Link2,
  QrCode,
  ScanLine,
  Share2,
  Users,
  Wallet,
} from "lucide-react";
import { Brand, Button, Card, LangToggle, SectionLabel, StatusBadge } from "@/components/ui";
import { useLang } from "@/lib/language";
import type { Dict } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "#how-it-works", key: "navHow" as const },
  { href: "#features", key: "navFeatures" as const },
  { href: "#for-businesses", key: "navBusinesses" as const },
  { href: "#pricing", key: "navPricing" as const },
];

export function MarketingHome() {
  const { t } = useLang();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    document.body.style.overflow = menu ? "hidden" : "";
    if (!menu) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenu(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  return (
    <div className="bridal-bg min-h-screen overflow-x-hidden">
      <a
        href="#content"
        className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-white focus:px-4 focus:py-2"
      >
        {t.homeSkip}
      </a>

      <header className="sticky top-0 z-30 border-b border-champagne/25 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <Brand />
          <nav className="hidden items-center gap-1 lg:flex" aria-label={t.brand}>
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-xl px-3 py-2 text-sm text-espresso/70 transition hover:bg-white hover:text-espresso"
              >
                {t[item.key]}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <LangToggle />
            <Button href="/login" variant="ghost" className="hidden sm:inline-flex">
              {t.login}
            </Button>
            <Button href="/signup" variant="gold">
              {t.getStarted}
            </Button>
            <button
              type="button"
              className="grid h-11 w-11 place-items-center rounded-xl border border-champagne/40 bg-white lg:hidden"
              aria-expanded={menu}
              aria-controls="marketing-menu"
              aria-label={menu ? t.menuClose : t.menuOpen}
              onClick={() => setMenu((v) => !v)}
            >
              <span className="flex w-4 flex-col gap-[5px]" aria-hidden>
                <span className={cn("h-[1.5px] w-full bg-espresso transition", menu && "translate-y-[6.5px] rotate-45")} />
                <span className={cn("h-[1.5px] w-full bg-espresso transition", menu && "opacity-0")} />
                <span className={cn("h-[1.5px] w-full bg-espresso transition", menu && "-translate-y-[6.5px] -rotate-45")} />
              </span>
            </button>
          </div>
        </div>
        {menu ? (
          <div id="marketing-menu" className="border-t border-champagne/25 bg-cream px-5 py-4 lg:hidden">
            <nav className="grid gap-1">
              {NAV.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="rounded-xl px-3 py-3 text-sm text-espresso"
                  onClick={() => setMenu(false)}
                >
                  {t[item.key]}
                </a>
              ))}
              <Button href="/login" variant="ghost" className="mt-2 w-full sm:hidden">
                {t.login}
              </Button>
            </nav>
          </div>
        ) : null}
      </header>

      <main id="content">
        <Hero t={t} />
        <Problem t={t} />
        <Position t={t} />
        <HowItWorks t={t} />
        <Features t={t} />
        <PassSection t={t} />
        <TeamSection t={t} />
        <PaySection t={t} />
        <Compare t={t} />
        <Pricing t={t} />
        <Objection t={t} />
        <Audience t={t} />
        <Cta t={t} />
      </main>

      <footer className="border-t border-champagne/30 bg-cream/50">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Brand />
            <p className="mt-3 max-w-xs text-sm leading-6 text-espresso/65">{t.homeFooterTag}</p>
          </div>
          <div>
            <p className="text-xs font-medium tracking-[0.16em] text-blush uppercase">{t.homeFooterProduct}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="text-espresso/70 hover:text-espresso">
                    {t[item.key]}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-medium tracking-[0.16em] text-blush uppercase">{t.homeFooterBusiness}</p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a href="/signup" className="text-espresso/70 hover:text-espresso">
                  {t.getStarted}
                </a>
              </li>
              <li>
                <a href="/login" className="text-espresso/70 hover:text-espresso">
                  {t.login}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <p className="border-t border-champagne/25 px-5 py-5 text-center text-sm text-taupe">{t.homeCopyright}</p>
      </footer>
    </div>
  );
}

function Reveal({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setOn(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setOn(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={cn("home-reveal", on && "home-reveal-on", className)}>
      {children}
    </div>
  );
}

function Hero({ t }: { t: Dict }) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 lg:grid-cols-2 lg:pt-14">
      <div>
        <p className="mb-3 text-xs font-medium tracking-[0.22em] text-blush uppercase">{t.homeEyebrow}</p>
        <h1 className="font-display text-4xl leading-tight text-espresso sm:text-6xl">{t.homeHeroTitle}</h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-espresso/70">{t.homeHeroBody}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button href="/signup" variant="gold">
            {t.getStarted}
          </Button>
          <Button href="#how-it-works" variant="ghost">
            {t.seeHow}
          </Button>
        </div>
        <p className="mt-6 text-sm text-espresso/55">{t.homeTrustFee}</p>
      </div>
      <div className="home-hero-visual relative min-w-0">
        <div className="tile pointer-events-none absolute -inset-4 rounded-[20px] opacity-70" aria-hidden />
        <DashboardPreview t={t} />
      </div>
    </section>
  );
}

function DashboardPreview({ t }: { t: Dict }) {
  return (
    <div className="relative overflow-hidden rounded-[20px] border border-champagne/30 bg-cream shadow-lift">
      <div className="flex items-center gap-2 border-b border-champagne/25 bg-white/80 px-4 py-2.5">
        <span className="h-2 w-2 rounded-full bg-champagne" aria-hidden />
        <span className="h-2 w-2 rounded-full bg-champagne" aria-hidden />
        <span className="h-2 w-2 rounded-full bg-blush" aria-hidden />
        <span className="ms-2 truncate text-xs text-taupe">Bridey</span>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="font-display text-xl text-espresso">{t.homeMockGreeting}</p>
          <p className="text-xs text-taupe">{t.todayOverview}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            [t.todaysBookings, "12"],
            [t.confirmed, "9"],
            [t.pending, "2"],
            [t.completed, "1"],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-champagne/25 bg-white px-2 py-2 text-center">
              <p className="text-[10px] text-taupe">{label}</p>
              <p className="font-display text-lg text-espresso">{value}</p>
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-blush/35 bg-rose/70 px-3 py-2.5">
          <p className="text-[10px] font-medium tracking-[0.14em] text-blush uppercase">{t.bookingRequests}</p>
          <p className="text-sm text-espresso">2 {t.requestsWaiting}</p>
        </div>
        <MockBooking
          time="09:00"
          name={t.homeMockBride}
          service={`${t.homeMockMakeup} + ${t.homeMockHair}`}
          team={`${t.homeMockMakeupArtist} · ${t.homeMockHairArtist}`}
          status="CONFIRMED"
          statusLabel={t.confirmed}
          pay={`300 ${t.lyd} ${t.homeMockRemaining}`}
        />
        <MockBooking
          time={t.homeMockShift}
          name={t.homeMockBride}
          service={t.homeMockMakeup}
          team={t.homeMockMakeupArtist}
          status="PENDING"
          statusLabel={t.pending}
        />
      </div>
    </div>
  );
}

function MockBooking({
  time,
  name,
  service,
  team,
  status,
  statusLabel,
  pay,
}: {
  time: string;
  name: string;
  service: string;
  team: string;
  status: string;
  statusLabel: string;
  pay?: string;
}) {
  return (
    <div className="rounded-2xl border border-champagne/25 bg-white px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-espresso/70">{time}</p>
        <StatusBadge status={status} label={statusLabel} />
      </div>
      <p className="mt-1 font-display text-lg text-espresso">{name}</p>
      <p className="text-xs text-espresso/65">{service}</p>
      <p className="mt-1 text-xs text-taupe">{team}</p>
      {pay ? <p className="mt-1 text-xs font-medium text-espresso">{pay}</p> : null}
    </div>
  );
}

function Problem({ t }: { t: Dict }) {
  const items = [
    { title: t.homeProblem1Title, body: t.homeProblem1Body },
    { title: t.homeProblem2Title, body: t.homeProblem2Body },
    { title: t.homeProblem3Title, body: t.homeProblem3Body },
    { title: t.homeProblem4Title, body: t.homeProblem4Body },
  ];
  return (
    <section className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16">
      <Reveal>
        <SectionTitleBlock title={t.homeProblemTitle} body={t.homeProblemBody} />
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <Card key={item.title} className="p-6">
              <h3 className="font-display text-xl text-espresso">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-espresso/65">{item.body}</p>
            </Card>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

function Position({ t }: { t: Dict }) {
  const steps = [
    t.homeFlowChannel,
    t.homeFlowLink,
    t.homeFlowBook,
    t.homeFlowConfirm,
    t.homeFlowOrganize,
    t.homeFlowAppointment,
    t.homeFlowPayment,
  ];
  return (
    <section className="mx-auto max-w-6xl scroll-mt-24 px-5 py-8">
      <Reveal>
        <div className="overflow-hidden rounded-[20px] border border-champagne/30 bg-white p-6 shadow-soft sm:p-10">
          <SectionTitleBlock title={t.homePositionTitle} body={t.homePositionBody} />
          <ol className="mx-auto mt-10 max-w-md space-y-0">
            {steps.map((step, i) => (
              <li key={step} className="flex flex-col items-center">
                <div
                  className={cn(
                    "w-full rounded-2xl border px-4 py-3 text-center text-sm",
                    i === 1 || i === 4 ? "border-blush bg-rose/70 font-medium text-espresso" : "border-champagne/30 bg-cream text-espresso/80",
                  )}
                >
                  {step}
                </div>
                {i < steps.length - 1 ? (
                  <span className="my-1 text-blush" aria-hidden>
                    ↓
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      </Reveal>
    </section>
  );
}

function HowItWorks({ t }: { t: Dict }) {
  const steps = [
    { n: "01", title: t.homeHow1Title, body: t.homeHow1Body, icon: Share2 },
    { n: "02", title: t.homeHow2Title, body: t.homeHow2Body, icon: ClipboardList },
    { n: "03", title: t.homeHow3Title, body: t.homeHow3Body, icon: Check },
    { n: "04", title: t.homeHow4Title, body: t.homeHow4Body, icon: QrCode },
    { n: "05", title: t.homeHow5Title, body: t.homeHow5Body, icon: ScanLine },
    { n: "06", title: t.homeHow6Title, body: t.homeHow6Body, icon: Wallet },
  ];
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16">
      <Reveal>
        <SectionTitleBlock title={t.homeHowTitle} />
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <Card key={step.n} className="p-6">
                <div className="flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose text-espresso">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <span className="text-xs tracking-[0.18em] text-blush">{step.n}</span>
                </div>
                <h3 className="mt-4 font-display text-xl text-espresso">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-espresso/65">{step.body}</p>
              </Card>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}

function Features({ t }: { t: Dict }) {
  const items = [
    { title: t.homeFeat1Title, body: t.homeFeat1Body, icon: CalendarDays },
    { title: t.homeFeat2Title, body: t.homeFeat2Body, icon: Users },
    { title: t.homeFeat3Title, body: t.homeFeat3Body, icon: Clock },
    { title: t.homeFeat4Title, body: t.homeFeat4Body, icon: QrCode },
    { title: t.homeFeat5Title, body: t.homeFeat5Body, icon: ScanLine },
    { title: t.homeFeat6Title, body: t.homeFeat6Body, icon: Wallet },
    { title: t.homeFeat7Title, body: t.homeFeat7Body, icon: LayoutDashboard },
    { title: t.homeFeat8Title, body: t.homeFeat8Body, icon: Link2 },
  ];
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-8">
      <Reveal>
        <SectionTitleBlock title={t.homeFeaturesTitle} />
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Card key={item.title} className="p-5 transition duration-150 hover:shadow-lift">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose text-espresso">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <h3 className="mt-3 font-medium text-espresso">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-espresso/65">{item.body}</p>
              </Card>
            );
          })}
        </div>
      </Reveal>
    </section>
  );
}

function PassSection({ t }: { t: Dict }) {
  return (
    <section className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16">
      <Reveal>
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <SectionLabel>{t.homeFeat4Title}</SectionLabel>
            <h2 className="mt-2 font-display text-3xl text-espresso sm:text-4xl">{t.homePassTitle}</h2>
            <p className="mt-4 max-w-xl text-espresso/65">{t.homePassBody}</p>
          </div>
          <PassPreview t={t} />
        </div>
      </Reveal>
    </section>
  );
}

function PassPreview({ t }: { t: Dict }) {
  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-[20px] border border-champagne/30 bg-white shadow-lift">
      <div className="bg-espresso px-6 py-6 text-center text-ivory">
        <p className="text-[11px] font-medium tracking-[0.38em] text-blush">BRIDEY</p>
        <p className="mt-2 font-display text-3xl">{t.passTitle}</p>
      </div>
      <div className="space-y-2 px-6 py-7 text-center">
        <p className="font-display text-3xl text-espresso">{t.homeMockBride}</p>
        <p className="text-espresso/70">{t.homeMockBusiness}</p>
        <p className="text-sm text-espresso/65">
          {t.homeMockMakeup}
          <br />
          {t.homeMockHair}
        </p>
        <p className="text-sm text-taupe">
          {t.homeMockDay} · {t.homeMockShift}
        </p>
        <div className="mx-auto w-48 max-w-full rounded-2xl bg-cream p-3">
          <MockQr />
        </div>
        <StatusBadge status="CONFIRMED" label={t.confirmed} />
      </div>
    </div>
  );
}

function MockQr() {
  const finders = [
    [0, 0],
    [14, 0],
    [0, 14],
  ];
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      const finder = finders.find(([ox, oy]) => x >= ox && x <= ox + 6 && y >= oy && y <= oy + 6);
      if (finder) {
        const lx = x - finder[0];
        const ly = y - finder[1];
        const edge = lx === 0 || ly === 0 || lx === 6 || ly === 6;
        const inner = lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4;
        if (edge || inner) cells.push({ x, y });
        continue;
      }
      if ((x * 3 + y * 5 + x * y) % 7 < 3) cells.push({ x, y });
    }
  }
  return (
    <svg viewBox="0 0 21 21" className="h-auto w-full text-espresso" aria-hidden>
      {cells.map((c) => (
        <rect key={`${c.x}-${c.y}`} x={c.x} y={c.y} width="1" height="1" fill="currentColor" />
      ))}
    </svg>
  );
}

function TeamSection({ t }: { t: Dict }) {
  return (
    <section id="for-businesses" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-8">
      <Reveal>
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div className="lg:order-2">
            <h2 className="font-display text-3xl text-espresso sm:text-4xl">{t.homeTeamTitle}</h2>
            <p className="mt-4 max-w-xl text-espresso/65">{t.homeTeamBody}</p>
          </div>
          <Card className="p-6">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-2xl text-espresso">{t.homeMockBride}</p>
                <p className="text-sm text-espresso/65">{t.homeMockMakeup}</p>
              </div>
              <StatusBadge status="CONFIRMED" label={t.confirmed} />
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-ivory px-4 py-3">
                <p className="text-xs text-taupe">{t.homeMockMakeup}</p>
                <p className="mt-1 font-medium text-espresso">{t.homeMockMakeupArtist}</p>
              </div>
              <div className="rounded-2xl bg-ivory px-4 py-3">
                <p className="text-xs text-taupe">{t.homeMockHair}</p>
                <p className="mt-1 font-medium text-espresso">{t.homeMockHairArtist}</p>
              </div>
            </div>
          </Card>
        </div>
      </Reveal>
    </section>
  );
}

function PaySection({ t }: { t: Dict }) {
  return (
    <section className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16">
      <Reveal>
        <SectionTitleBlock title={t.homePayTitle} body={t.homePayBody} />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <SectionLabel>{t.appointmentSection}</SectionLabel>
            <p className="mt-2 font-display text-2xl">{t.homeMockBride}</p>
            <div className="mt-5 grid grid-cols-3 gap-3 text-center">
              <div>
                <p className="font-display text-2xl">500</p>
                <p className="text-xs text-taupe">
                  {t.total} {t.lyd}
                </p>
              </div>
              <div>
                <p className="font-display text-2xl">200</p>
                <p className="text-xs text-taupe">
                  {t.deposit} {t.lyd}
                </p>
              </div>
              <div>
                <p className="font-display text-3xl">300</p>
                <p className="text-xs text-taupe">
                  {t.remaining} {t.lyd}
                </p>
              </div>
            </div>
            <p className="mt-4 rounded-xl bg-warning/12 px-3 py-2 text-sm font-medium text-espresso">
              {t.outstandingPayment}: 300 {t.lyd}
            </p>
          </Card>
          <Card className="p-6">
            <SectionLabel>{t.appointmentSection}</SectionLabel>
            <p className="mt-2 font-display text-2xl">{t.homeMockBride}</p>
            <div className="mt-5 grid grid-cols-2 gap-3 text-center">
              <div>
                <p className="font-display text-2xl">500</p>
                <p className="text-xs text-taupe">
                  {t.total} {t.lyd}
                </p>
              </div>
              <div>
                <p className="font-display text-2xl text-success">500</p>
                <p className="text-xs text-taupe">
                  {t.paidLabel} {t.lyd}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-success">{t.homeMockPaidFull}</p>
          </Card>
        </div>
        <p className="mt-4 text-center text-sm text-taupe">{t.homePayIndependent}</p>
      </Reveal>
    </section>
  );
}

function Compare({ t }: { t: Dict }) {
  const oldItems = [t.homeCompareOld1, t.homeCompareOld2, t.homeCompareOld3, t.homeCompareOld4, t.homeCompareOld5, t.homeCompareOld6];
  const newItems = [t.homeCompareNew1, t.homeCompareNew2, t.homeCompareNew3, t.homeCompareNew4, t.homeCompareNew5, t.homeCompareNew6];
  return (
    <section className="mx-auto max-w-6xl scroll-mt-24 px-5 py-8">
      <Reveal>
        <SectionTitleBlock title={t.homeMoreTitle} body={t.homeMoreBody} />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <Card className="p-6">
            <h3 className="font-display text-2xl text-espresso/70">{t.homeCompareOld}</h3>
            <ul className="mt-4 space-y-2 text-sm text-espresso/65">
              {oldItems.map((item) => (
                <li key={item} className="rounded-xl bg-ivory px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="border-blush/35 bg-rose/40 p-6">
            <h3 className="font-display text-2xl text-espresso">{t.homeCompareNew}</h3>
            <ul className="mt-4 space-y-2 text-sm text-espresso">
              {newItems.map((item) => (
                <li key={item} className="rounded-xl bg-white/80 px-3 py-2">
                  {item}
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <p className="mt-6 text-center text-sm text-espresso/60">{t.homeCompareTone}</p>
      </Reveal>
    </section>
  );
}

function Pricing({ t }: { t: Dict }) {
  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16">
      <Reveal>
        <div className="overflow-hidden rounded-[20px] border border-champagne/30 bg-espresso px-6 py-10 text-ivory sm:px-12">
          <p className="text-xs font-medium tracking-[0.22em] text-blush uppercase">{t.homePriceTitle}</p>
          <h2 className="mt-3 font-display text-4xl sm:text-5xl">{t.homePriceLead}</h2>
          <p className="mt-4 max-w-xl text-ivory/70">{t.homePriceBody}</p>
          <ol className="mt-8 max-w-sm space-y-0">
            {[t.homePriceFlow1, t.homePriceFlow2, t.homePriceFlow3].map((step, i, all) => (
              <li key={step} className="flex flex-col items-start">
                <span className="rounded-xl bg-white/8 px-4 py-2 text-sm">{step}</span>
                {i < all.length - 1 ? (
                  <span className="my-1 px-4 text-blush" aria-hidden>
                    ↓
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-ivory/70">{t.homePriceNoBride}</p>
          <p className="mt-2 text-sm text-ivory/70">{t.homePriceFreeRequests}</p>
          <div className="mt-8">
            <Button href="/signup" variant="gold">
              {t.getStarted}
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Objection({ t }: { t: Dict }) {
  const inbound = [t.homeObjectIn1, t.homeObjectIn2, t.homeObjectIn3, t.homeObjectIn4, t.homeObjectIn5];
  const outbound = [t.homeObjectOut1, t.homeObjectOut2, t.homeObjectOut3, t.homeObjectOut4, t.homeObjectOut5];
  return (
    <section className="mx-auto max-w-6xl scroll-mt-24 px-5 py-8">
      <Reveal>
        <p className="text-center text-sm text-espresso/55">{t.homeObjectTitle}</p>
        <h2 className="mt-2 text-center font-display text-3xl text-espresso sm:text-5xl">{t.homeObjectAnswer}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-espresso/65">{t.homeObjectBody}</p>
        <div className="mx-auto mt-10 max-w-xl">
          <div className="flex flex-wrap justify-center gap-2">
            {inbound.map((item) => (
              <span key={item} className="rounded-full border border-champagne/35 bg-white px-3 py-1.5 text-sm text-espresso/80">
                {item}
              </span>
            ))}
          </div>
          <p className="my-3 text-center text-blush" aria-hidden>
            ↓
          </p>
          <p className="mx-auto w-fit rounded-2xl bg-espresso px-6 py-3 font-display text-xl tracking-[0.2em] text-ivory">
            BRIDEY
          </p>
          <p className="my-3 text-center text-blush" aria-hidden>
            ↓
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {outbound.map((item) => (
              <span key={item} className="rounded-full bg-rose px-3 py-1.5 text-sm text-espresso">
                {item}
              </span>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Audience({ t }: { t: Dict }) {
  const items = [
    { title: t.homeFor1Title, body: t.homeFor1Body },
    { title: t.homeFor2Title, body: t.homeFor2Body },
    { title: t.homeFor3Title, body: t.homeFor3Body },
    { title: t.homeFor4Title, body: t.homeFor4Body },
  ];
  return (
    <section className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16">
      <Reveal>
        <SectionTitleBlock title={t.homeForTitle} />
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {items.map((item) => (
            <Card key={item.title} className="p-6">
              <h3 className="font-display text-2xl text-espresso">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-espresso/65">{item.body}</p>
            </Card>
          ))}
        </div>
      </Reveal>
    </section>
  );
}

function Cta({ t }: { t: Dict }) {
  return (
    <section className="mx-auto max-w-3xl px-5 pb-20 text-center">
      <Reveal>
        <h2 className="font-display text-4xl text-espresso">{t.homeCtaTitle}</h2>
        <p className="mt-3 text-espresso/65">{t.homeCtaBody}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button href="/signup" variant="gold">
            {t.getStarted}
          </Button>
          <Button href="#how-it-works" variant="ghost">
            {t.seeHow}
          </Button>
        </div>
      </Reveal>
    </section>
  );
}

function SectionTitleBlock({ title, body }: { title: string; body?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="font-display text-3xl text-espresso sm:text-4xl">{title}</h2>
      {body ? <p className="mt-3 text-espresso/65">{body}</p> : null}
    </div>
  );
}
