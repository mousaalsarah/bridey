export const PLATFORM_FEE_LYD = 10;
export const CITY = "Benghazi";
export const TIMEZONE = "Africa/Tripoli";
export const SLOT_STEP_MIN = 30;
export const BOOKING_REQUEST_TIMEOUT_MINUTES = 30;

export const BLOCKING_STATUSES = ["PENDING", "CONFIRMED"] as const;

export const BOOKING_SOURCES = [
  { id: "bridey", ar: "برايدي", en: "Bridey" },
  { id: "snapchat", ar: "سناب شات", en: "Snapchat" },
  { id: "instagram", ar: "إنستغرام", en: "Instagram" },
  { id: "whatsapp", ar: "واتساب", en: "WhatsApp" },
  { id: "phone", ar: "اتصال", en: "Phone" },
  { id: "walk_in", ar: "حضوري", en: "Walk-in" },
  { id: "other", ar: "أخرى", en: "Other" },
] as const;

export const MANUAL_SOURCES = BOOKING_SOURCES.filter((s) => s.id !== "bridey");

export function normalizeBookingSource(raw: string) {
  const id = raw === "walkin" ? "walk_in" : raw;
  return BOOKING_SOURCES.some((s) => s.id === id) ? id : "other";
}

export const SERVICE_KINDS = [
  { id: "bridal", ar: "عروس", en: "Bridal" },
  { id: "trial", ar: "تجربة", en: "Trial" },
  { id: "evening", ar: "سهرة", en: "Evening" },
  { id: "hair", ar: "شعر", en: "Hair" },
  { id: "henna", ar: "حناء", en: "Henna" },
  { id: "nails", ar: "أظافر", en: "Nails" },
  { id: "skincare", ar: "بشرة", en: "Skincare" },
  { id: "photo", ar: "تصوير", en: "Photo" },
  { id: "other", ar: "أخرى", en: "Other" },
] as const;

export const SPECIALTIES = [
  { id: "makeup", ar: "مكياج عرائس", en: "Bridal makeup" },
  { id: "hair", ar: "شعر وتسريحات", en: "Hair & styling" },
  { id: "henna", ar: "حناء", en: "Henna" },
  { id: "nails", ar: "أظافر", en: "Nails" },
  { id: "skincare", ar: "عناية بالبشرة", en: "Skincare" },
  { id: "photo", ar: "تصوير", en: "Photography" },
] as const;

export const NEIGHBORHOODS = [
  { id: "fuwayhat", ar: "الفويهات", en: "Al-Fuwayhat" },
  { id: "berka", ar: "البركة", en: "Al-Berka" },
  { id: "sabri", ar: "الصابري", en: "Al-Sabri" },
  { id: "garyounis", ar: "قاريونس", en: "Garyounis" },
  { id: "hadaek", ar: "الحدائق", en: "Al-Hadaek" },
  { id: "laithi", ar: "الليثي", en: "Laithi" },
  { id: "beloun", ar: "بلعون", en: "Beloun" },
  { id: "hawari", ar: "الهواري", en: "Al-Hawari" },
  { id: "tabalino", ar: "تبعلينو", en: "Tabalino" },
  { id: "center", ar: "وسط المدينة", en: "City Center" },
  { id: "sidi-hussein", ar: "سيدي حسين", en: "Sidi Hussein" },
  { id: "major", ar: "المايور", en: "Al-Major" },
] as const;

export const HOUR_PRESETS = [
  {
    id: "evenings",
    ar: "أمسيات",
    en: "Evenings",
    hintAr: "كل يوم من ٢ ظهراً إلى ١٠ مساءً",
    hintEn: "Every day, 2pm–10pm",
    days: [0, 1, 2, 3, 4, 5, 6],
    startMin: 14 * 60,
    endMin: 22 * 60,
  },
  {
    id: "bride-days",
    ar: "أيام العرائس",
    en: "Bride days",
    hintAr: "الخميس إلى السبت من ١٠ صباحاً إلى ١٠ مساءً",
    hintEn: "Thu–Sat, 10am–10pm",
    days: [4, 5, 6],
    startMin: 10 * 60,
    endMin: 22 * 60,
  },
  {
    id: "full-day",
    ar: "يوم كامل",
    en: "Full days",
    hintAr: "كل يوم من ١٠ صباحاً إلى ٨ مساءً",
    hintEn: "Every day, 10am–8pm",
    days: [0, 1, 2, 3, 4, 5, 6],
    startMin: 10 * 60,
    endMin: 20 * 60,
  },
] as const;

export const DAY_LABELS = [
  { ar: "الأحد", en: "Sun" },
  { ar: "الاثنين", en: "Mon" },
  { ar: "الثلاثاء", en: "Tue" },
  { ar: "الأربعاء", en: "Wed" },
  { ar: "الخميس", en: "Thu" },
  { ar: "الجمعة", en: "Fri" },
  { ar: "السبت", en: "Sat" },
] as const;
