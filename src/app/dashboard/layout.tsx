"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Camera, Clock, Link2, UserRound, Users, Wallet, Briefcase, ScanLine } from "lucide-react";
import { Brand, LangToggle } from "@/components/ui";
import { useAlerts } from "@/lib/use-alerts";
import { useLang } from "@/lib/language";
import { useStudio } from "@/lib/use-studio";
import { cn } from "@/lib/utils";
import { isTeamBusiness } from "@/lib/roles";

const NAV = [
  { href: "/dashboard", key: "dashboard" as const, icon: CalendarDays, perm: null },
  { href: "/dashboard/scan", key: "scanPass" as const, icon: ScanLine, perm: null },
  { href: "/dashboard/team", key: "team" as const, icon: Users, perm: "canManageTeam" as const },
  { href: "/dashboard/share", key: "share" as const, icon: Link2, perm: "canManageBusiness" as const },
  { href: "/dashboard/services", key: "services" as const, icon: Briefcase, perm: "canManageServices" as const },
  { href: "/dashboard/portfolio", key: "portfolio" as const, icon: Camera, perm: "canManageBusiness" as const },
  { href: "/dashboard/hours", key: "hours" as const, icon: Clock, perm: "canManageBusiness" as const },
  { href: "/dashboard/earnings", key: "earnings" as const, icon: Wallet, perm: "canViewFees" as const },
  { href: "/dashboard/profile", key: "profile" as const, icon: UserRound, perm: "canManageBusiness" as const },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLang();
  const { data } = useStudio();
  const pathname = usePathname();
  const router = useRouter();
  const { alerts } = useAlerts();
  const pending = alerts.pendingBookings;
  const previousPending = useRef<number | null>(null);
  const [toast, setToast] = useState(false);
  const perms = data?.permissions;
  const activeMembers = (data?.members || []).filter((row) => row.status === "ACTIVE").length;
  const teamNav = isTeamBusiness(data?.business?.businessType, activeMembers);
  const nav = NAV.filter((item) => {
    if (item.key === "team") return Boolean(data && teamNav && perms?.canManageTeam);
    if (!item.perm) return true;
    return Boolean(perms?.[item.perm]);
  });

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
      <header className="sticky top-0 z-20 border-b border-champagne/25 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
          <Brand href="/dashboard" />
          <div className="flex items-center gap-2">
            {pending > 0 ? (
              <Link
                href="/dashboard?tab=pending"
                className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-rose px-3 py-1.5 text-xs font-medium text-espresso"
              >
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-blush px-1 text-[11px]">{pending}</span>
                <span className="hidden sm:inline">{t.pendingNow}</span>
              </Link>
            ) : null}
            <LangToggle />
            <button type="button" onClick={logout} className="min-h-9 px-2 text-xs text-taupe hover:text-espresso">
              {t.logout}
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-4 py-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <nav className="space-y-0.5">
            {nav.map((item) => {
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
              const Icon = item.icon;
              const showBadge = item.href === "/dashboard" && pending > 0;
              return (
                <Link
                  key={item.href}
                  href={item.href === "/dashboard" && pending > 0 ? "/dashboard?tab=pending" : item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                    active ? "bg-rose text-espresso" : "text-espresso/70 hover:bg-white/80",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <span className="relative">
                    <Icon className="h-4 w-4" />
                    {showBadge ? <span className="absolute -top-1 -end-1 h-2 w-2 rounded-full bg-blush" /> : null}
                  </span>
                  <span className="flex-1">{t[item.key]}</span>
                  {showBadge ? (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-blush/80 px-1 text-[11px] font-medium">
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

      <nav className="fixed inset-x-0 bottom-0 z-20 flex gap-1 overflow-x-auto border-t border-champagne/30 bg-cream/95 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden">
        {nav.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          const Icon = item.icon;
          const showBadge = item.href === "/dashboard" && pending > 0;
          return (
            <Link
              key={item.href}
              href={item.href === "/dashboard" && pending > 0 ? "/dashboard?tab=pending" : item.href}
              className={cn(
                "relative flex min-w-[4.5rem] flex-1 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px]",
                active ? "bg-rose text-espresso" : "text-taupe",
              )}
              aria-current={active ? "page" : undefined}
            >
              <span className="relative">
                <Icon className="h-4 w-4" />
                {showBadge ? (
                  <span className="absolute -top-2 -end-3 grid h-4 min-w-4 place-items-center rounded-full bg-blush px-1 text-[9px] font-medium text-espresso">
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
          className="toast-enter fixed inset-x-4 bottom-20 z-30 rounded-2xl border border-champagne/30 bg-white px-4 py-3 text-espresso shadow-lift md:inset-x-auto md:bottom-6 md:start-auto md:end-6 md:w-80"
        >
          <p className="text-xs font-medium tracking-[0.16em] text-blush uppercase">{t.pending}</p>
          <p className="mt-1 font-display text-xl">{t.pendingNow}</p>
          <p className="mt-1 text-sm text-espresso/60">{t.seePending}</p>
        </Link>
      ) : null}
    </div>
  );
}
