"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Camera, Clock, Link2, UserRound, Wallet, Briefcase } from "lucide-react";
import { Brand, LangToggle } from "@/components/ui";
import { useAlerts } from "@/lib/use-alerts";
import { useLang } from "@/lib/language";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", key: "dashboard" as const, icon: CalendarDays },
  { href: "/dashboard/share", key: "share" as const, icon: Link2 },
  { href: "/dashboard/services", key: "services" as const, icon: Briefcase },
  { href: "/dashboard/portfolio", key: "portfolio" as const, icon: Camera },
  { href: "/dashboard/hours", key: "hours" as const, icon: Clock },
  { href: "/dashboard/earnings", key: "earnings" as const, icon: Wallet },
  { href: "/dashboard/profile", key: "profile" as const, icon: UserRound },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLang();
  const pathname = usePathname();
  const router = useRouter();
  const { alerts } = useAlerts();
  const pending = alerts.pendingBookings;
  const previousPending = useRef<number | null>(null);
  const [toast, setToast] = useState(false);

  useEffect(() => {
    if (previousPending.current !== null && pending > previousPending.current) {
      setToast(true);
      const id = window.setTimeout(() => setToast(false), 8000);
      previousPending.current = pending;
      return () => window.clearTimeout(id);
    }
    previousPending.current = pending;
  }, [pending]);

  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");
    document.title = pending > 0 ? `(${pending}) ${base}` : base;
  }, [pending, pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  return (
    <div className="bridal-bg min-h-screen pb-24 md:pb-0">
      <header className="sticky top-0 z-20 border-b border-champagne/20 bg-ivory/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
          <Brand href="/dashboard" />
          <div className="flex items-center gap-2">
            {pending > 0 ? (
              <Link
                href="/dashboard?tab=pending"
                className="inline-flex items-center gap-2 rounded-full bg-espresso px-3 py-1.5 text-xs text-ivory shadow-gold"
              >
                <span className="alert-pulse grid h-5 min-w-5 place-items-center rounded-full bg-gold px-1 font-medium text-espresso">
                  {pending}
                </span>
                <span className="hidden sm:inline">{t.pendingNow}</span>
              </Link>
            ) : null}
            <LangToggle />
            <button type="button" onClick={logout} className="text-xs text-espresso/55 hover:text-espresso">
              {t.logout}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="space-y-1">
            {NAV.map((item) => {
              const active = pathname === item.href;
              const Icon = item.icon;
              const showBadge = item.href === "/dashboard" && pending > 0;
              return (
                <Link
                  key={item.href}
                  href={item.href === "/dashboard" && pending > 0 ? "/dashboard?tab=pending" : item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm",
                    showBadge && !active ? "bg-gold/25 text-espresso" : "",
                    active ? "bg-espresso text-ivory" : "text-espresso/70 hover:bg-white/70",
                  )}
                >
                  <span className="relative">
                    <Icon className="h-4 w-4" />
                    {showBadge ? <span className="alert-pulse absolute -top-1 -end-1 h-2.5 w-2.5 rounded-full bg-gold" /> : null}
                  </span>
                  <span className="flex-1">{t[item.key]}</span>
                  {showBadge ? (
                    <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px] font-medium", active ? "bg-gold text-espresso" : "bg-espresso text-ivory")}>
                      {pending}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-7 border-t border-champagne/30 bg-ivory/95 px-1 py-2 md:hidden">
        {NAV.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          const showBadge = item.href === "/dashboard" && pending > 0;
          return (
            <Link
              key={item.href}
              href={item.href === "/dashboard" && pending > 0 ? "/dashboard?tab=pending" : item.href}
              className={cn(
                "relative flex flex-col items-center gap-1 rounded-xl py-1 text-[10px]",
                showBadge ? "bg-gold/35 text-espresso" : active ? "text-espresso" : "text-espresso/45",
              )}
            >
              <span className="relative">
                <Icon className="h-4 w-4" />
                {showBadge ? (
                  <span className="alert-pulse absolute -top-2 -end-3 grid h-4 min-w-4 place-items-center rounded-full bg-espresso px-1 text-[9px] font-medium text-ivory">
                    {pending}
                  </span>
                ) : null}
              </span>
              {t[item.key]}
            </Link>
          );
        })}
      </nav>

      {toast && pending > 0 ? (
        <Link
          href="/dashboard?tab=pending"
          className="alert-pulse fixed inset-x-4 bottom-20 z-30 rounded-3xl bg-espresso px-4 py-3 text-ivory shadow-gold md:inset-x-auto md:bottom-6 md:start-auto md:end-6 md:w-80"
        >
          <p className="text-xs tracking-[0.2em] text-gold uppercase">{t.pending}</p>
          <p className="font-display text-xl">{t.pendingNow}</p>
          <p className="mt-1 text-sm text-ivory/70">{t.seePending}</p>
        </Link>
      ) : null}
    </div>
  );
}
