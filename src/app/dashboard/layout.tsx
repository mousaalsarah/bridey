"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Camera, Clock, Link2, Menu, UserRound, Users, Wallet, Briefcase, ScanLine, X } from "lucide-react";
import { Brand, LangToggle } from "@/components/ui";
import { useAlerts } from "@/lib/use-alerts";
import { useLang } from "@/lib/language";
import { useStudio } from "@/lib/use-studio";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", key: "dashboard" as const, icon: CalendarDays, perm: null },
  { href: "/dashboard/share", key: "share" as const, icon: Link2, perm: "canManageBusiness" as const },
  { href: "/dashboard/team", key: "team" as const, icon: Users, perm: "canManageTeam" as const },
  { href: "/dashboard/scan", key: "scanPass" as const, icon: ScanLine, perm: null },
  { href: "/dashboard/services", key: "services" as const, icon: Briefcase, perm: "canManageServices" as const },
  { href: "/dashboard/portfolio", key: "portfolio" as const, icon: Camera, perm: "canManageBusiness" as const },
  { href: "/dashboard/hours", key: "hours" as const, icon: Clock, perm: "canManageBusiness" as const },
  { href: "/dashboard/earnings", key: "earnings" as const, icon: Wallet, perm: "canViewFees" as const },
  { href: "/dashboard/profile", key: "profile" as const, icon: UserRound, perm: "canManageBusiness" as const },
];

const MOBILE_TAB_HREFS = ["/dashboard", "/dashboard/share", "/dashboard/team"];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
}

function navHref(href: string, pending: number) {
  return href === "/dashboard" && pending > 0 ? "/dashboard?tab=pending" : href;
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { t } = useLang();
  const { data } = useStudio();
  const pathname = usePathname();
  const router = useRouter();
  const { alerts } = useAlerts();
  const pending = alerts.pendingBookings;
  const previousPending = useRef<number | null>(null);
  const [toast, setToast] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const perms = data?.permissions;
  const nav = NAV.filter((item) => {
    if (!item.perm) return true;
    if (!data || !perms) return true;
    return Boolean(perms[item.perm]);
  });
  const mobileTabs = nav.filter((item) => MOBILE_TAB_HREFS.includes(item.href));
  const drawerItems = nav.filter((item) => !MOBILE_TAB_HREFS.includes(item.href));

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

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  }

  function NavLinks({ items, onPick }: { items: typeof nav; onPick?: () => void }) {
    return (
      <nav className="space-y-0.5">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          const showBadge = item.href === "/dashboard" && pending > 0;
          return (
            <Link
              key={item.href}
              href={navHref(item.href, pending)}
              onClick={onPick}
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
              <span className="min-w-0 flex-1 truncate">{t[item.key]}</span>
              {showBadge ? (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-blush/80 px-1 text-[11px] font-medium">
                  {pending}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="bridal-bg min-h-screen overflow-x-hidden pb-24 md:pb-0">
      <header className="sticky top-0 z-20 border-b border-champagne/25 bg-cream/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 py-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-champagne/40 bg-white md:hidden"
              aria-expanded={menuOpen}
              aria-controls="dashboard-menu"
              aria-label={menuOpen ? t.menuClose : t.menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <Brand href="/dashboard" className="min-w-0" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
            <button type="button" onClick={logout} className="hidden min-h-9 px-2 text-xs text-taupe hover:text-espresso md:inline">
              {t.logout}
            </button>
          </div>
        </div>
      </header>

      {menuOpen ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <button type="button" className="absolute inset-0 bg-espresso/25" aria-label={t.menuClose} onClick={() => setMenuOpen(false)} />
          <div
            id="dashboard-menu"
            className="absolute inset-y-0 start-0 flex w-[min(18rem,86vw)] flex-col border-e border-champagne/30 bg-cream px-3 py-4 shadow-lift"
          >
            <p className="px-3 pb-3 text-xs font-medium tracking-[0.18em] text-blush uppercase">{t.menuOpen}</p>
            <NavLinks items={drawerItems} onPick={() => setMenuOpen(false)} />
            <button type="button" onClick={logout} className="mt-auto px-3 py-3 text-start text-sm text-taupe hover:text-espresso">
              {t.logout}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mx-auto flex max-w-6xl gap-8 px-3 py-5 sm:px-4 sm:py-6">
        <aside className="hidden w-56 shrink-0 md:block">
          <NavLinks items={nav} />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>

      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-20 gap-1 border-t border-champagne/30 bg-cream/95 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden",
          mobileTabs.length === 3 ? "grid grid-cols-3" : "flex",
        )}
      >
        {mobileTabs.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          const showBadge = item.href === "/dashboard" && pending > 0;
          return (
            <Link
              key={item.href}
              href={navHref(item.href, pending)}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-1 py-1.5 text-[11px] leading-tight",
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
              <span className="max-w-full truncate">{t[item.key]}</span>
            </Link>
          );
        })}
      </nav>

      {toast && pending > 0 ? (
        <Link
          href="/dashboard?tab=pending"
          className="toast-enter fixed inset-x-4 bottom-24 z-30 rounded-2xl border border-champagne/30 bg-white px-4 py-3 text-espresso shadow-lift md:inset-x-auto md:bottom-6 md:start-auto md:end-6 md:w-80"
        >
          <p className="text-xs font-medium tracking-[0.16em] text-blush uppercase">{t.pending}</p>
          <p className="mt-1 font-display text-xl">{t.pendingNow}</p>
          <p className="mt-1 text-sm text-espresso/60">{t.seePending}</p>
        </Link>
      ) : null}
    </div>
  );
}
