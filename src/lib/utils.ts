import { BOOKING_SOURCES, NEIGHBORHOODS, SERVICE_KINDS, SPECIALTIES } from "./constants";

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function slugify(name: string) {
  const latin = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (latin.length >= 3) return latin.slice(0, 32);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `artist-${suffix}`;
}

export function normalizePhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("218")) return digits;
  if (digits.startsWith("0") && digits.length >= 9) return `218${digits.slice(1)}`;
  if (digits.startsWith("9") && digits.length >= 8) return `218${digits}`;
  return digits;
}

export function displayPhone(phone: string) {
  const n = normalizePhone(phone);
  if (n.startsWith("218") && n.length >= 12) {
    return `0${n.slice(3, 5)} ${n.slice(5, 8)} ${n.slice(8)}`;
  }
  return phone;
}

export function whatsappLink(phone: string, text?: string) {
  const n = normalizePhone(phone);
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${n}${q}`;
}

export function minutesToTime(min: number, lang: "ar" | "en" = "ar") {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const hh = ((h + 11) % 12) + 1;
  const mm = m.toString().padStart(2, "0");
  if (lang === "ar") {
    const suffix = h < 12 ? "صباحاً" : h === 12 ? "ظهراً" : "مساءً";
    return `${hh}:${mm} ${suffix}`;
  }
  const suffix = h < 12 ? "am" : "pm";
  return `${hh}:${mm} ${suffix}`;
}

export function formatDate(iso: string, lang: "ar" | "en") {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(lang === "ar" ? "ar-LY" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const MONTH_AR = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const MONTH_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthLabel(month: string, lang: "ar" | "en" = "ar") {
  const [year, mm] = month.split("-").map(Number);
  const name = (lang === "ar" ? MONTH_AR : MONTH_EN)[(mm || 1) - 1] || month;
  return lang === "ar" ? `${name} ${year}` : `${name} ${year}`;
}

export function shiftMonth(month: string, delta: number) {
  const [year, mm] = month.split("-").map(Number);
  const date = new Date(year, (mm || 1) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function todayISO() {
  const now = new Date();
  const tripoli = new Date(now.toLocaleString("en-US", { timeZone: "Africa/Tripoli" }));
  const y = tripoli.getFullYear();
  const m = String(tripoli.getMonth() + 1).padStart(2, "0");
  const d = String(tripoli.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function minutesUntil(iso: string | Date) {
  const target = iso instanceof Date ? iso.getTime() : new Date(iso).getTime();
  if (Number.isNaN(target)) return 0;
  return Math.max(0, Math.ceil((target - Date.now()) / 60000));
}

export function addDaysISO(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function weekdayOf(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

export function parseSpecialties(raw: string | string[] | null | undefined) {
  const list = Array.isArray(raw) ? raw : (raw || "").split(",");
  const ids = list.map((id) => id.trim()).filter(Boolean);
  const known = ids.filter((id) => SPECIALTIES.some((s) => s.id === id));
  return known.length ? [...new Set(known)] : ["makeup"];
}

export function joinSpecialties(ids: string | string[] | null | undefined) {
  return parseSpecialties(ids).join(",");
}

export function specialtyLabel(id: string, lang: "ar" | "en") {
  return parseSpecialties(id)
    .map((item) => SPECIALTIES.find((s) => s.id === item)?.[lang] || item)
    .join(" · ");
}

export function neighborhoodLabel(id: string, lang: "ar" | "en") {
  const item = NEIGHBORHOODS.find((n) => n.id === id);
  return item ? item[lang] : id;
}

export function kindLabel(id: string, lang: "ar" | "en") {
  const item = SERVICE_KINDS.find((k) => k.id === id);
  return item ? item[lang] : id;
}

export function sourceLabel(id: string, lang: "ar" | "en") {
  const key = id === "walkin" ? "walk_in" : id;
  const item = BOOKING_SOURCES.find((s) => s.id === key);
  return item ? item[lang] : id;
}

export function bookingServiceNames(
  booking: {
    items?: Array<{ nameAr: string; nameEn: string }>;
    service?: { nameAr: string; nameEn: string } | null;
  },
  lang: "ar" | "en",
) {
  const rows = booking.items?.length
    ? booking.items
    : booking.service
      ? [booking.service]
      : [];
  return rows.map((s) => (lang === "ar" ? s.nameAr : s.nameEn)).join(" · ");
}

export function formatClock(iso: string | Date | null | undefined, lang: "ar" | "en" = "ar") {
  if (!iso) return "";
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(lang === "ar" ? "ar-LY" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Africa/Tripoli",
  });
}

export function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

export function artistUrl(slug: string) {
  return `${appUrl()}/a/${slug}`;
}

export function isLibyaPhone(raw: string) {
  const n = normalizePhone(raw);
  return /^2189\d{8}$/.test(n);
}
