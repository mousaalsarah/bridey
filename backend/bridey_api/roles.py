from __future__ import annotations

from bridey_api.constants import MANAGEMENT_ROLES, TEAM_ROLES


def parse_roles(raw: str | list[str] | None) -> list[str]:
    if isinstance(raw, list):
        parts = raw
    else:
        parts = (raw or "").split(",")
    seen: list[str] = []
    for item in parts:
        role = item.strip().upper()
        if role in TEAM_ROLES and role not in seen:
            seen.append(role)
    return seen


def join_roles(roles: list[str]) -> str:
    unique = parse_roles(",".join(roles))
    return ",".join(unique) if unique else "OTHER"


def has_management_role(roles: list[str] | str) -> bool:
    parsed = roles if isinstance(roles, list) else parse_roles(roles)
    return any(role in MANAGEMENT_ROLES for role in parsed)


def roles_from_specialty(specialty: str) -> str:
    parts = [item.strip() for item in specialty.split(",")]
    roles = {"OWNER"}
    for part in parts:
        if part == "hair":
            roles.add("HAIRSTYLIST")
        elif part == "nails":
            roles.add("NAIL_ARTIST")
        elif part in {"makeup", "henna", "skincare", "photo", ""}:
            roles.add("MAKEUP_ARTIST")
        else:
            roles.add("OTHER")
    if len(roles) == 1:
        roles.add("MAKEUP_ARTIST")
    return join_roles(list(roles))


def default_capacity_for_roles(roles: list[str] | str) -> int:
    parsed = roles if isinstance(roles, list) else parse_roles(roles)
    if "HAIRSTYLIST" in parsed and "MAKEUP_ARTIST" not in parsed:
        return 5
    return 4


def roles_for_service_kind(kind: str) -> list[str]:
    if kind == "hair":
        return ["HAIRSTYLIST"]
    if kind == "nails":
        return ["NAIL_ARTIST"]
    if kind == "henna":
        return ["MAKEUP_ARTIST", "OTHER"]
    if kind == "other":
        return ["MAKEUP_ARTIST", "HAIRSTYLIST", "NAIL_ARTIST", "LASH_ARTIST", "OTHER"]
    return ["MAKEUP_ARTIST"]


def member_matches_service_kind(roles: list[str] | str, kind: str) -> bool:
    parsed = roles if isinstance(roles, list) else parse_roles(roles)
    return any(role in parsed for role in roles_for_service_kind(kind))
