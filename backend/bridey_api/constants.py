"""Keep these in lockstep with src/lib/constants.ts. Do not change fee or status rules here."""

PLATFORM_FEE_LYD = 5
CITY = "Benghazi"
TIMEZONE = "Africa/Tripoli"
SLOT_STEP_MIN = 30
BOOKING_REQUEST_TIMEOUT_MINUTES = 30
DAY_BUCKET = "DAY"
DEFAULT_DAILY_CAPACITY = 4
DEFAULT_HAIR_CAPACITY = 5

BLOCKING_STATUSES = ("PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS")
LIVE_BOOKING_STATUSES = ("PENDING", "CONFIRMED", "CHECKED_IN", "IN_PROGRESS")
PASS_HIDDEN_STATUSES = ("PENDING", "DECLINED", "EXPIRED")

SESSION_COOKIE = "bridey_session"
ADMIN_COOKIE = "bridey_admin"
SESSION_DAYS = 30
ADMIN_SESSION_DAYS = 7

MANAGEMENT_ROLES = ("OWNER", "MANAGER")
TEAM_ROLES = (
    "OWNER",
    "MANAGER",
    "MAKEUP_ARTIST",
    "HAIRSTYLIST",
    "NAIL_ARTIST",
    "LASH_ARTIST",
    "OTHER",
)
SPECIALTIES = ("makeup", "hair", "henna", "nails", "skincare", "photo")
BOOKING_SOURCES = ("bridey", "snapchat", "instagram", "whatsapp", "phone", "walk_in", "other")


def normalize_booking_source(raw: str) -> str:
    source_id = "walk_in" if raw == "walkin" else raw
    return source_id if source_id in BOOKING_SOURCES else "other"


HOUR_PRESETS = (
    {"id": "evenings", "days": (0, 1, 2, 3, 4, 5, 6), "startMin": 14 * 60, "endMin": 22 * 60},
    {"id": "bride-days", "days": (4, 5, 6), "startMin": 10 * 60, "endMin": 22 * 60},
    {"id": "full-day", "days": (0, 1, 2, 3, 4, 5, 6), "startMin": 10 * 60, "endMin": 20 * 60},
)
