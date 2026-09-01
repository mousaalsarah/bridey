"use client";

import { Button, LangToggle } from "@/components/ui";
import { DAY_LABELS } from "@/lib/constants";
import { useLang } from "@/lib/language";
import { instagramUrl, snapchatUrl } from "@/lib/page-theme";
import { kindLabel, minutesToTime, neighborhoodLabel, specialtyLabel, whatsappLink } from "@/lib/utils";

type Service = {
  id: string;
  nameAr: string;
  nameEn: string;
  description: string;
  kind: string;
  durationMin: number;
  priceLyd: number;
};

type Hour = { dayOfWeek: number; startMin: number; endMin: number };
type Shift = { id: string; nameAr: string; nameEn: string; startMin: number; endMin: number };

export function ArtistPublic({
  artist,
  services,
  portfolio,
  hours,
  shifts = [],
  scheduleMode = "SHIFT",
  bookingOpen = true,
}: {
  artist: {
    name: string;
    slug: string;
    bio: string;
    tagline: string;
    specialty: string;
    neighborhood: string;
    snapchat: string;
    instagram: string;
    whatsapp: string;
    avatarUrl: string;
    coverUrl: string;
    pageStyle: string;
    accent: string;
    coverLayout: string;
    ctaLabel: string;
    bookingHorizonDays: number;
    minNoticeHours: number;
    showHoursOnPage: boolean;
  };
  services: Service[];
  portfolio: { id: string; url: string; caption: string }[];
  hours: Hour[];
  shifts?: Shift[];
  scheduleMode?: string;
  bookingOpen?: boolean;
}) {
  const { t, lang } = useLang();
  const cover = artist.coverUrl || portfolio[0]?.url || "";
  const bookHref = `/a/${artist.slug}/book`;
  const cta = artist.ctaLabel.trim() || t.bookAppointment;
  const layout = artist.coverLayout || "wide";

  return (
    <div
      className="studio-page min-h-screen pb-24"
      data-style={artist.pageStyle || "ivory"}
      data-accent={artist.accent || "gold"}
    >
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-4 sm:px-5">
        <p className="min-w-0 truncate font-display text-lg">{artist.name}</p>
        <div className="flex items-center gap-2">
          <Button href="/track" variant="ghost" className="px-3 py-1 text-xs">
            {t.trackBooking}
          </Button>
          <LangToggle />
        </div>
      </header>

      <Hero name={artist.name} cover={cover} avatarUrl={artist.avatarUrl} layout={layout} />

      <main className="mx-auto max-w-3xl px-5">
        <div className={layout === "wide" ? "-mt-10 flex items-end gap-4" : "mt-6 flex items-end gap-4"}>
          {layout !== "split" ? (
            <Avatar name={artist.name} url={artist.avatarUrl} />
          ) : null}
          <div className="pb-1">
            <h1 className="font-display text-4xl sm:text-5xl">{artist.name}</h1>
            {artist.tagline ? <p className="mt-1 studio-muted">{artist.tagline}</p> : null}
            <p className="mt-1 text-sm studio-muted">
              {specialtyLabel(artist.specialty, lang)} · {neighborhoodLabel(artist.neighborhood, lang)}
            </p>
          </div>
        </div>

        {artist.bio ? <p className="mt-5 max-w-xl text-lg leading-8 studio-muted">{artist.bio}</p> : null}

        {(artist.snapchat || artist.instagram) && (
          <div className="mt-4 flex flex-wrap gap-2 text-sm" dir="ltr">
            {artist.snapchat ? (
              <a href={snapchatUrl(artist.snapchat)} className="studio-chip" target="_blank" rel="noreferrer">
                Snapchat {artist.snapchat}
              </a>
            ) : null}
            {artist.instagram ? (
              <a href={instagramUrl(artist.instagram)} className="studio-chip" target="_blank" rel="noreferrer">
                Instagram {artist.instagram}
              </a>
            ) : null}
          </div>
        )}

        <div className="mt-6">
          {bookingOpen ? (
            <Button href={bookHref} variant="gold" className="studio-cta w-full sm:w-auto">
              {cta}
            </Button>
          ) : (
            <p className="text-sm studio-muted">{t.artistUnavailable}</p>
          )}
        </div>

        <section className="mt-10">
          <h2 className="font-display text-2xl">{t.services}</h2>
          <div className="mt-4 grid gap-3">
            {services.map((s) => (
              <div key={s.id} className="studio-card flex items-center justify-between p-4">
                <div>
                  <p className="text-xs studio-accent-text">{kindLabel(s.kind, lang)}</p>
                  <p className="font-medium">{lang === "ar" ? s.nameAr : s.nameEn}</p>
                  {s.description ? <p className="text-sm studio-muted">{s.description}</p> : null}
                  <p className="text-sm studio-muted">
                    {s.durationMin} {t.minutes}
                  </p>
                </div>
                <p className="font-display text-2xl">
                  {s.priceLyd} <span className="text-sm">{t.lyd}</span>
                </p>
              </div>
            ))}
          </div>
        </section>

        {portfolio.length ? (
          <section className="mt-10">
            <h2 className="font-display text-2xl">{t.portfolio}</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {portfolio.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.id} src={img.url} alt={img.caption} className="aspect-[3/4] w-full rounded-2xl object-cover" />
              ))}
            </div>
          </section>
        ) : null}

        {artist.showHoursOnPage ? (
          <section className="mt-10">
            <h2 className="font-display text-2xl">{t.bookingRules}</h2>
            <p className="mt-2 text-sm studio-muted">
              {lang === "ar"
                ? `احجزي قبل الموعد بـ ${artist.minNoticeHours} ساعة على الأقل · حتى ${artist.bookingHorizonDays} يوم مقدماً.`
                : `Book at least ${artist.minNoticeHours}h ahead · up to ${artist.bookingHorizonDays} days out.`}
            </p>
            <ul className="studio-card mt-4 space-y-2 p-4 text-sm">
              {DAY_LABELS.map((day, i) => {
                const hour = hours.find((h) => h.dayOfWeek === i);
                return (
                  <li key={day.en} className="flex justify-between">
                    <span>{day[lang]}</span>
                    <span className="studio-muted">
                      {hour ? `${minutesToTime(hour.startMin, lang)} – ${minutesToTime(hour.endMin, lang)}` : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {scheduleMode !== "HOURLY" && shifts.length ? (
              <ul className="studio-card mt-3 space-y-2 p-4 text-sm">
                {shifts.map((shift) => (
                  <li key={shift.id} className="flex justify-between">
                    <span>{lang === "ar" ? shift.nameAr : shift.nameEn}</span>
                    <span className="studio-muted">
                      {minutesToTime(shift.startMin, lang)} – {minutesToTime(shift.endMin, lang)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <p className="mt-12 pb-4 text-center text-xs opacity-40">{t.poweredBy}</p>
      </main>

      <div className="studio-dock fixed inset-x-0 bottom-0 p-3 md:hidden">
        <div className="flex gap-2">
          {bookingOpen ? (
            <Button href={bookHref} variant="gold" className="studio-cta flex-1">
              {cta}
            </Button>
          ) : (
            <p className="flex-1 text-center text-sm studio-muted">{t.artistUnavailable}</p>
          )}
          {artist.whatsapp ? (
            <Button href={whatsappLink(artist.whatsapp)} variant="ghost">
              {t.whatsapp}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string }) {
  return (
    <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-[var(--studio-bg)] bg-[var(--studio-fg)] text-2xl text-[var(--studio-bg)]">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        name.slice(0, 1)
      )}
    </div>
  );
}

function Hero({
  name,
  cover,
  avatarUrl,
  layout,
}: {
  name: string;
  cover: string;
  avatarUrl: string;
  layout: string;
}) {
  if (layout === "split") {
    return (
      <div className="mx-auto grid max-w-3xl gap-4 px-5 sm:grid-cols-[minmax(0,0.9fr)_1.1fr] sm:items-stretch">
        <div className="overflow-hidden rounded-[20px]">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="h-64 w-full object-cover sm:h-full" />
          ) : (
            <div className="tile h-64" />
          )}
        </div>
        <div className="studio-card flex flex-col justify-end p-6">
          <Avatar name={name} url={avatarUrl} />
        </div>
      </div>
    );
  }

  if (layout === "portrait") {
    return (
      <div className="mx-auto max-w-sm px-5">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="aspect-[3/4] w-full rounded-[20px] object-cover" />
        ) : (
          <div className="tile aspect-[3/4] rounded-[20px]" />
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-5">
      {cover ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover} alt="" className="h-56 w-full rounded-[20px] object-cover sm:h-72" />
      ) : (
        <div className="tile h-40 rounded-[20px]" />
      )}
    </div>
  );
}
