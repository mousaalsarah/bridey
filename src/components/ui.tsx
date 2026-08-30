"use client";

import Link from "next/link";
import { SPECIALTIES } from "@/lib/constants";
import { useLang } from "@/lib/language";
import { cn, parseSpecialties } from "@/lib/utils";

export function Brand({ className, href = "/" }: { className?: string; href?: string }) {
  const { t } = useLang();
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2", className)}>
      <span className="grid h-9 w-9 place-items-center rounded-full bg-espresso text-ivory shadow-gold">
        <span className="font-display text-lg leading-none">B</span>
      </span>
      <span className="font-display text-xl tracking-wide text-espresso">{t.brand}</span>
    </Link>
  );
}

export function LangToggle() {
  const { toggle, t } = useLang();
  return (
    <button
      type="button"
      onClick={toggle}
      className="rounded-full border border-champagne/40 bg-white/60 px-3 py-1 text-xs tracking-wide text-espresso/80 hover:border-gold"
    >
      {t.language}
    </button>
  );
}

export function Button({
  children,
  href,
  variant = "gold",
  className,
  type = "button",
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  href?: string;
  variant?: "gold" | "ghost" | "dark" | "rose";
  className?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
}) {
  const styles = {
    gold: "bg-gold text-espresso hover:bg-champagne",
    ghost: "border border-champagne/50 bg-transparent text-espresso hover:bg-rose/40",
    dark: "bg-espresso text-ivory hover:bg-espresso/90",
    rose: "bg-blush text-espresso hover:bg-blush/80",
  }[variant];
  const cls = cn(
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition disabled:opacity-50",
    styles,
    className,
  );
  if (href) {
    if (href.startsWith("http")) {
      return (
        <a href={href} target="_blank" rel="noreferrer" className={cls}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={cls} disabled={disabled} onClick={onClick}>
      {children}
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
      <span className="text-sm text-espresso/70">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-espresso/45">{hint}</span> : null}
    </label>
  );
}

export function inputClass(extra?: string) {
  return cn(
    "w-full rounded-2xl border border-champagne/40 bg-white/80 px-4 py-3 text-espresso outline-none ring-gold/30 placeholder:text-espresso/30 focus:border-gold focus:ring-2",
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
    <div className={cn("rounded-3xl border border-champagne/30 bg-white/70 p-5 shadow-soft", className)}>
      {children}
    </div>
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
              "rounded-full border px-3 py-1.5 text-sm",
              on ? "border-gold bg-gold text-espresso" : "border-champagne/40 bg-white text-espresso/70",
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
      {eyebrow ? (
        <p className="mb-2 text-xs tracking-[0.25em] text-gold uppercase">{eyebrow}</p>
      ) : null}
      <h2 className="font-display text-3xl text-espresso sm:text-4xl">{title}</h2>
      {body ? <p className="mt-3 text-espresso/65">{body}</p> : null}
    </div>
  );
}
