"use client";

import Link from "next/link";
import { SPECIALTIES } from "@/lib/constants";
import { useLang } from "@/lib/language";
import { cn, parseSpecialties } from "@/lib/utils";

export function Brand({ className, href = "/" }: { className?: string; href?: string }) {
  const { t } = useLang();
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-espresso text-ivory">
        <span className="font-display text-[1.05rem] leading-none tracking-wide">B</span>
      </span>
      <span className="font-display text-xl tracking-[0.04em] text-espresso">{t.brand}</span>
    </Link>
  );
}

export function LangToggle() {
  const { toggle, t } = useLang();
  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-xl border border-champagne/35 bg-white/70 px-3 py-1.5 text-xs font-medium tracking-wide text-espresso/75 transition hover:border-blush/50 hover:bg-white"
    >
      {t.language}
    </button>
  );
}

const BUTTON_STYLES = {
  gold: "bg-blush text-espresso hover:bg-blush/85 active:bg-blush/75",
  ghost: "border border-champagne/45 bg-white/70 text-espresso hover:bg-rose/70",
  dark: "bg-espresso text-ivory hover:bg-ink active:bg-espresso/90",
  rose: "bg-rose text-espresso hover:bg-rose/80",
  danger: "border border-error/30 bg-error/10 text-error hover:bg-error/16",
} as const;

export function Button({
  children,
  href,
  variant = "gold",
  className,
  type = "button",
  disabled,
  loading,
  onClick,
}: {
  children: React.ReactNode;
  href?: string;
  variant?: keyof typeof BUTTON_STYLES;
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
}) {
  const cls = cn(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition duration-150 disabled:pointer-events-none disabled:opacity-45",
    BUTTON_STYLES[variant],
    className,
  );
  const inner = (
    <>
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : null}
      {children}
    </>
  );
  if (href) {
    if (href.startsWith("http")) {
      return (
        <a href={href} target="_blank" rel="noreferrer" className={cls}>
          {inner}
        </a>
      );
    }
    if (href.startsWith("#")) {
      return (
        <a href={href} className={cls}>
          {inner}
        </a>
      );
    }
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} disabled={disabled || loading} onClick={onClick} aria-busy={loading || undefined}>
      {inner}
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-espresso/70">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-taupe">{hint}</span> : null}
    </label>
  );
}

export function inputClass(extra?: string) {
  return cn(
    "w-full rounded-xl border border-champagne/40 bg-white px-4 py-3 text-espresso outline-none transition placeholder:text-espresso/30 focus:border-blush focus:ring-2 focus:ring-blush/25",
    extra,
  );
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-champagne/28 bg-white p-5 shadow-soft", className)}>{children}</div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  body,
  actions,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? <p className="text-xs font-medium tracking-[0.18em] text-blush uppercase">{eyebrow}</p> : null}
        <h1 className="mt-1 font-display text-3xl leading-tight text-espresso sm:text-4xl">{title}</h1>
        {body ? <p className="mt-2 max-w-xl text-sm leading-6 text-espresso/65">{body}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  onClick,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "accent" | "warning";
  onClick?: () => void;
}) {
  const inner = (
    <Card
      className={cn(
        "h-full transition duration-150",
        tone === "accent" && "border-blush/35 bg-rose/50",
        tone === "warning" && "border-warning/25 bg-warning/8",
        onClick && "hover:shadow-lift",
      )}
    >
      <p className="text-xs font-medium text-taupe">{label}</p>
      <p className="mt-2 font-display text-3xl text-espresso">{value}</p>
      {hint ? <p className="mt-1 text-xs text-espresso/50">{hint}</p> : null}
    </Card>
  );
  if (!onClick) return inner;
  return (
    <button type="button" onClick={onClick} className="text-start">
      {inner}
    </button>
  );
}

const STATUS_TONE: Record<string, string> = {
  PENDING: "bg-warning/12 text-warning",
  CONFIRMED: "bg-success/12 text-success",
  CHECKED_IN: "bg-blush/25 text-espresso",
  IN_PROGRESS: "bg-gold/20 text-espresso",
  COMPLETED: "bg-success/10 text-success",
  CANCELLED: "bg-error/10 text-error",
  DECLINED: "bg-error/10 text-error",
  EXPIRED: "bg-taupe/15 text-taupe",
  NO_SHOW: "bg-taupe/15 text-taupe",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const mark = status === "CONFIRMED" || status === "COMPLETED" || status === "CHECKED_IN";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_TONE[status] || "bg-rose text-espresso")}>
      {mark ? <span aria-hidden>✓</span> : null}
      {label}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="px-6 py-10 text-center">
      <p className="font-display text-2xl text-espresso">{title}</p>
      {body ? <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-espresso/60">{body}</p> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("motion-safe:animate-pulse rounded-xl bg-rose/70", className)} />;
}

export function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-9 w-52 max-w-full" />
      <Skeleton className="h-4 w-72 max-w-full" />
      {Array.from({ length: cards }).map((_, i) => (
        <Skeleton key={i} className="h-28" />
      ))}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium tracking-[0.16em] text-blush uppercase">{children}</p>;
}

export function selectTileClass(selected: boolean, disabled?: boolean) {
  return cn(
    "rounded-2xl border p-4 text-start transition",
    disabled
      ? "border-champagne/20 bg-ivory/50 text-espresso/40"
      : selected
        ? "border-blush bg-rose/70"
        : "border-champagne/30 bg-white hover:border-blush/40",
  );
}

export function SpecialtyPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const { lang } = useLang();
  const selected = parseSpecialties(value);

  function toggle(id: string) {
    if (selected.includes(id)) {
      if (selected.length === 1) return;
      onChange(selected.filter((item) => item !== id));
      return;
    }
    onChange([...selected, id]);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {SPECIALTIES.map((s) => {
        const on = selected.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => toggle(s.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm transition",
              on ? "border-blush bg-blush/80 text-espresso" : "border-champagne/40 bg-white text-espresso/70 hover:border-blush/40",
            )}
          >
            {s[lang]}
          </button>
        );
      })}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  body,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow ? <p className="mb-2 text-xs font-medium tracking-[0.22em] text-blush uppercase">{eyebrow}</p> : null}
      <h2 className="font-display text-3xl text-espresso sm:text-4xl">{title}</h2>
      {body ? <p className="mt-3 text-espresso/65">{body}</p> : null}
    </div>
  );
}
