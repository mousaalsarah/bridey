"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Brand } from "@/components/ui";
import { cn } from "@/lib/utils";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === "/admin/login") return children;

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  const nav = [
    { href: "/admin", label: "الإيرادات" },
    { href: "/admin/payments", label: "الدفعات" },
    { href: "/admin/artists", label: "الخبيرات" },
    { href: "/admin/settings", label: "الإعدادات" },
  ];

  return (
    <div className="bridal-bg min-h-screen">
      <header className="border-b border-champagne/20 bg-ivory/85">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Brand href="/admin" />
          <nav className="flex gap-3 text-sm">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className={cn(pathname === item.href ? "text-espresso" : "text-espresso/50")}>
                {item.label}
              </Link>
            ))}
            <button type="button" onClick={logout} className="text-espresso/50">
              خروج
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
