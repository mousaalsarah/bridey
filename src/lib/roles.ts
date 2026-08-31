import { MANAGEMENT_ROLES, TEAM_ROLES } from "./constants";

export type TeamRole = (typeof TEAM_ROLES)[number]["id"];

export function parseRoles(raw: string | null | undefined): string[] {
  return [...new Set((raw || "")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter((item) => TEAM_ROLES.some((role) => role.id === item)))];
}

export function joinRoles(roles: string[]) {
  const unique = parseRoles(roles.join(","));
  return unique.length ? unique.join(",") : "OTHER";
}

export function hasManagementRole(roles: string[] | string) {
  const parsed = Array.isArray(roles) ? roles : parseRoles(roles);
  return parsed.some((role) => (MANAGEMENT_ROLES as readonly string[]).includes(role));
}

export function isProviderRole(roles: string[] | string) {
  const parsed = Array.isArray(roles) ? roles : parseRoles(roles);
  return parsed.some((role) => role !== "OWNER" && role !== "MANAGER") || parsed.includes("OWNER");
}

export function roleLabel(id: string, lang: "ar" | "en") {
  const row = TEAM_ROLES.find((role) => role.id === id);
  return row ? row[lang] : id;
}

export function rolesFromSpecialty(specialty: string) {
  const parts = specialty.split(",").map((item) => item.trim());
  const roles = new Set<string>(["OWNER"]);
  for (const part of parts) {
    if (part === "hair") roles.add("HAIRSTYLIST");
    else if (part === "nails") roles.add("NAIL_ARTIST");
    else if (part === "makeup" || part === "henna" || part === "skincare" || part === "photo" || !part) {
      roles.add("MAKEUP_ARTIST");
    } else roles.add("OTHER");
  }
  if (roles.size === 1) roles.add("MAKEUP_ARTIST");
  return joinRoles([...roles]);
}

export function defaultCapacityForRoles(roles: string[] | string) {
  const parsed = Array.isArray(roles) ? roles : parseRoles(roles);
  if (parsed.includes("HAIRSTYLIST") && !parsed.includes("MAKEUP_ARTIST")) return 5;
  return 4;
}

export function rolesForServiceKind(kind: string) {
  switch (kind) {
    case "hair":
      return ["HAIRSTYLIST"];
    case "nails":
      return ["NAIL_ARTIST"];
    case "henna":
      return ["MAKEUP_ARTIST", "OTHER"];
    case "other":
      return ["MAKEUP_ARTIST", "HAIRSTYLIST", "NAIL_ARTIST", "LASH_ARTIST", "OTHER"];
    default:
      return ["MAKEUP_ARTIST"];
  }
}

export function memberMatchesServiceKind(roles: string[] | string, kind: string) {
  const parsed = Array.isArray(roles) ? roles : parseRoles(roles);
  return rolesForServiceKind(kind).some((role) => parsed.includes(role));
}

/** Salon type, or more than one active member (solo expert who has started hiring). */
export function isTeamBusiness(businessType?: string | null, activeMemberCount = 0) {
  return businessType === "salon" || activeMemberCount > 1;
}
