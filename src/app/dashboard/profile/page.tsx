"use client";

import { useEffect, useState } from "react";
import { Button, Card, Field, SpecialtyPicker, inputClass } from "@/components/ui";
import { NEIGHBORHOODS } from "@/lib/constants";
import { useLang } from "@/lib/language";
import { COVER_LAYOUTS, PAGE_ACCENTS, PAGE_STYLES } from "@/lib/page-theme";
import { useStudio } from "@/lib/use-studio";
import { cn, parseSpecialties } from "@/lib/utils";

export default function ProfilePage() {
  const { t, lang } = useLang();
  const { data, loading, reload } = useStudio();
  const [form, setForm] = useState({
    name: "",
    tagline: "",
    bio: "",
    specialties: ["makeup"] as string[],
    neighborhood: "",
    slug: "",
    snapchat: "",
    instagram: "",
    whatsapp: "",
    pageStyle: "ivory",
    accent: "gold",
    coverLayout: "wide",
    ctaLabel: "",
    bookingHorizonDays: 21,
    minNoticeHours: 2,
    showHoursOnPage: true,
  });
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    if (!data) return;
    setForm({
      name: data.artist.name,
      tagline: data.artist.tagline,
      bio: data.artist.bio,
      specialties: parseSpecialties(data.artist.specialty),
      neighborhood: data.artist.neighborhood,
      slug: data.artist.slug,
      snapchat: data.artist.snapchat,
      instagram: data.artist.instagram,
      whatsapp: data.artist.whatsapp,
      pageStyle: data.artist.pageStyle,
      accent: data.artist.accent,
      coverLayout: data.artist.coverLayout,
      ctaLabel: data.artist.ctaLabel,
      bookingHorizonDays: data.artist.bookingHorizonDays,
      minNoticeHours: data.artist.minNoticeHours,
      showHoursOnPage: data.artist.showHoursOnPage,
    });
  }, [data]);

  if (loading || !data) {
    return <p className="text-espresso/50">{lang === "ar" ? "لحظات…" : "Loading…"}</p>;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaved(true);
    reload();
    setTimeout(() => setSaved(false), 2000);
  }

  async function upload(kind: "avatar" | "cover", file?: File) {
    if (!file) return;
    setBusy(kind);
    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    await fetch("/api/media", { method: "POST", body });
    setBusy("");
    reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">{t.profile}</h1>
          <p className="mt-2 max-w-xl text-sm text-espresso/60">{t.yourWebsite}</p>
        </div>
        <Button href={`/a/${data.artist.slug}`} variant="gold">
          {t.viewPage}
        </Button>
      </div>

      <Card>
        <p className="font-display text-xl">{t.photos}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <PhotoSlot
            label={t.profilePhoto}
            url={data.artist.avatarUrl}
            busy={busy === "avatar"}
            onFile={(file) => upload("avatar", file)}
          />
          <PhotoSlot
            label={t.coverPhoto}
            url={data.artist.coverUrl}
            busy={busy === "cover"}
            tall
            onFile={(file) => upload("cover", file)}
          />
        </div>
      </Card>

      <Card>
        <form onSubmit={save} className="space-y-4">
          <Field label={t.name}>
            <input className={inputClass()} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label={t.pageTagline}>
            <input className={inputClass()} value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} maxLength={80} />
          </Field>
          <Field label={t.bio}>
            <textarea className={inputClass("min-h-24")} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
          </Field>
          <Field label={t.specialty}>
            <SpecialtyPicker value={form.specialties} onChange={(specialties) => setForm({ ...form, specialties })} />
          </Field>
          <Field label={t.neighborhood}>
            <select className={inputClass()} value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}>
              {NEIGHBORHOODS.map((n) => (
                <option key={n.id} value={n.id}>
                  {n[lang]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Slug">
            <input className={inputClass()} dir="ltr" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t.snapchat}>
              <input className={inputClass()} dir="ltr" value={form.snapchat} onChange={(e) => setForm({ ...form, snapchat: e.target.value })} />
            </Field>
            <Field label="Instagram">
              <input className={inputClass()} dir="ltr" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} />
            </Field>
            <Field label={t.whatsapp}>
              <input className={inputClass()} dir="ltr" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
            </Field>
          </div>
          <Field label={t.ctaLabel}>
            <input className={inputClass()} value={form.ctaLabel} onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })} placeholder={t.bookAppointment} />
          </Field>

          <div>
            <p className="mb-2 text-sm text-espresso/70">{t.pageStyle}</p>
            <ChoiceRow
              options={PAGE_STYLES.map((s) => ({ id: s.id, label: s[lang] }))}
              value={form.pageStyle}
              onChange={(pageStyle) => setForm({ ...form, pageStyle })}
            />
          </div>
          <div>
            <p className="mb-2 text-sm text-espresso/70">{t.accentColor}</p>
            <ChoiceRow
              options={PAGE_ACCENTS.map((s) => ({ id: s.id, label: s[lang] }))}
              value={form.accent}
              onChange={(accent) => setForm({ ...form, accent })}
            />
          </div>
          <div>
            <p className="mb-2 text-sm text-espresso/70">{t.coverLayout}</p>
            <ChoiceRow
              options={COVER_LAYOUTS.map((s) => ({ id: s.id, label: s[lang] }))}
              value={form.coverLayout}
              onChange={(coverLayout) => setForm({ ...form, coverLayout })}
            />
          </div>
          <p className="text-xs text-espresso/45">{t.pageSoon}</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t.bookingHorizon}>
              <input
                className={inputClass()}
                type="number"
                min={7}
                max={60}
                value={form.bookingHorizonDays}
                onChange={(e) => setForm({ ...form, bookingHorizonDays: Number(e.target.value) })}
              />
            </Field>
            <Field label={t.minNotice}>
              <input
                className={inputClass()}
                type="number"
                min={0}
                max={48}
                value={form.minNoticeHours}
                onChange={(e) => setForm({ ...form, minNoticeHours: Number(e.target.value) })}
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.showHoursOnPage}
              onChange={(e) => setForm({ ...form, showHoursOnPage: e.target.checked })}
            />
            {t.showHours}
          </label>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button type="submit" variant="gold">
              {saved ? t.copied : t.save}
            </Button>
            <Button href="/dashboard/services" variant="ghost">
              {t.services}
            </Button>
            <Button href="/dashboard/portfolio" variant="ghost">
              {t.portfolio}
            </Button>
            <Button href="/dashboard/hours" variant="ghost">
              {t.hours}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function PhotoSlot({
  label,
  url,
  busy,
  tall,
  onFile,
}: {
  label: string;
  url: string;
  busy: boolean;
  tall?: boolean;
  onFile: (file?: File) => void;
}) {
  return (
    <label className="block cursor-pointer">
      <p className="mb-2 text-sm text-espresso/70">{label}</p>
      <div className={cn("overflow-hidden rounded-3xl border border-champagne/40 bg-ivory", tall ? "aspect-[16/9]" : "aspect-square max-w-40")}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="tile grid h-full place-items-center text-sm text-espresso/40">{busy ? "…" : "+"}</div>
        )}
      </div>
      <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
    </label>
  );
}

function ChoiceRow({
  options,
  value,
  onChange,
}: {
  options: Array<{ id: string; label: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={cn(
            "rounded-full px-3 py-1.5 text-sm",
            value === opt.id ? "bg-espresso text-ivory" : "bg-ivory text-espresso/70",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
