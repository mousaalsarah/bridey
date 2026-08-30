export const PAGE_STYLES = [
  { id: "ivory", ar: "عاجي", en: "Ivory" },
  { id: "ink", ar: "غامق", en: "Ink" },
  { id: "rose", ar: "وردي", en: "Rose" },
] as const;

export const PAGE_ACCENTS = [
  { id: "gold", ar: "ذهبي", en: "Gold" },
  { id: "blush", ar: "خوخي", en: "Blush" },
  { id: "champagne", ar: "شمبانيا", en: "Champagne" },
] as const;

export const COVER_LAYOUTS = [
  { id: "wide", ar: "عريض", en: "Wide" },
  { id: "portrait", ar: "عمودي", en: "Portrait" },
  { id: "split", ar: "مقسوم", en: "Split" },
] as const;

const STYLE_IDS = PAGE_STYLES.map((s) => s.id);
const ACCENT_IDS = PAGE_ACCENTS.map((s) => s.id);
const LAYOUT_IDS = COVER_LAYOUTS.map((s) => s.id);

export function normalizePageStyle(raw: string) {
  return STYLE_IDS.includes(raw as (typeof STYLE_IDS)[number]) ? raw : "ivory";
}

export function normalizeAccent(raw: string) {
  return ACCENT_IDS.includes(raw as (typeof ACCENT_IDS)[number]) ? raw : "gold";
}

export function normalizeCoverLayout(raw: string) {
  return LAYOUT_IDS.includes(raw as (typeof LAYOUT_IDS)[number]) ? raw : "wide";
}

export function clampHorizon(n: number) {
  if (!Number.isFinite(n)) return 21;
  return Math.min(60, Math.max(7, Math.round(n)));
}

export function clampNotice(n: number) {
  if (!Number.isFinite(n)) return 2;
  return Math.min(48, Math.max(0, Math.round(n)));
}

export function socialHandle(raw: string) {
  return raw.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?(instagram|snapchat)\.com\/(add\/)?/i, "").split(/[/?#]/)[0];
}

export function snapchatUrl(handle: string) {
  const id = socialHandle(handle);
  return id ? `https://www.snapchat.com/add/${id}` : "";
}

export function instagramUrl(handle: string) {
  const id = socialHandle(handle);
  return id ? `https://instagram.com/${id}` : "";
}
