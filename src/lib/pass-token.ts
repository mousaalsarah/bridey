export function passUrl(token: string, origin?: string) {
  const base = (origin || "").replace(/\/$/, "");
  return `${base}/p/${token}`;
}

export function parsePassToken(raw: string) {
  const text = (raw || "").trim();
  if (!text) return "";
  try {
    const url = new URL(text);
    const parts = url.pathname.split("/").filter(Boolean);
    const idx = parts.findIndex((part) => part === "p" || part === "pass");
    if (idx >= 0 && parts[idx + 1]) return decodeURIComponent(parts[idx + 1]);
  } catch {
    /* not a URL */
  }
  const path = text.match(/\/(?:p|pass)\/([^/?#]+)/i);
  if (path?.[1]) return decodeURIComponent(path[1]);
  if (/^[A-Za-z0-9_-]{32,}$/.test(text)) return text;
  return "";
}
