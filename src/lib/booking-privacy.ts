const REVEAL_STATUSES = new Set(["CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED", "NO_SHOW"]);

export type ContactBooking = {
  status: string;
  origin?: string | null;
  confirmedAt?: Date | string | null;
  bridePhone?: string | null;
  notes?: string | null;
  artistNotes?: string | null;
  assignments?: Array<{ teamMemberId: string }>;
};

export type ContactViewer = {
  memberId: string;
  canManageBusiness: boolean;
};

export class NotesContactError extends Error {
  constructor() {
    super("NOTES_CONTACT");
    this.name = "NotesContactError";
  }
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_CHUNK_RE = /(?:\+?\d[\d\s()./-]{6,20}\d)/g;
const WA_RE = /(?:wa\.me|api\.whatsapp\.com\/send\?phone=)\/?0*(?:218)?9\d{8}/i;

function foldDigits(raw: string) {
  return raw.replace(/[٠-٩۰-۹]/g, (ch) => {
    const eastern = "٠١٢٣٤٥٦٧٨٩".indexOf(ch);
    if (eastern >= 0) return String(eastern);
    const persian = "۰۱۲۳۴۵۶۷۸۹".indexOf(ch);
    return persian >= 0 ? String(persian) : ch;
  });
}

function nationalMobileDigits(raw: string) {
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("218")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/** Libyan mobile: 09XXXXXXXX / +2189XXXXXXXX / 002189XXXXXXXX and spaced variants. */
export function looksLikeLibyaMobile(raw: string) {
  return /^9\d{8}$/.test(nationalMobileDigits(foldDigits(raw)));
}

export function notesContainContact(raw: string) {
  const text = foldDigits(raw || "");
  if (!text.trim()) return false;
  if (EMAIL_RE.test(text)) return true;
  if (WA_RE.test(text.replace(/\s/g, ""))) return true;
  const chunks = text.match(PHONE_CHUNK_RE) || [];
  return chunks.some((chunk) => looksLikeLibyaMobile(chunk));
}

export function redactContactInNotes(raw: string) {
  const text = foldDigits(raw || "");
  if (!notesContainContact(text)) return raw || "";
  let out = text.replace(EMAIL_RE, "").replace(WA_RE, "");
  out = out.replace(PHONE_CHUNK_RE, (chunk) => (looksLikeLibyaMobile(chunk) ? "" : chunk));
  return out.replace(/\s{2,}/g, " ").trim();
}

/** Manual/off-platform bookings already have the phone. Public Bridey requests unlock after confirm. */
export function contactIsUnlocked(booking: ContactBooking) {
  if (booking.origin && booking.origin !== "public") return true;
  if (REVEAL_STATUSES.has(booking.status)) return true;
  if (booking.status === "CANCELLED" && booking.confirmedAt) return true;
  return false;
}

export function viewerCanSeeBrideContact(booking: ContactBooking, viewer: ContactViewer) {
  if (!contactIsUnlocked(booking)) return false;
  if (viewer.canManageBusiness) return true;
  return (booking.assignments || []).some((row) => row.teamMemberId === viewer.memberId);
}

export function presentBooking<T extends ContactBooking>(booking: T, viewer: ContactViewer): T & { contactAvailable: boolean; bridePhone: string } {
  const allowed = viewerCanSeeBrideContact(booking, viewer);
  const rest = { ...booking } as T & { brideyPassToken?: string };
  delete rest.brideyPassToken;
  return {
    ...rest,
    bridePhone: allowed ? booking.bridePhone || "" : "",
    notes: allowed ? booking.notes || "" : redactContactInNotes(booking.notes || ""),
    artistNotes: viewer.canManageBusiness ? booking.artistNotes || "" : "",
    contactAvailable: allowed,
  };
}

export function payloadContainsPhone(payload: unknown, phone: string) {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 8) return false;
  const blob = JSON.stringify(payload);
  if (blob.includes(digits)) return true;
  const national = nationalMobileDigits(digits);
  return national.length >= 9 && blob.includes(national);
}
