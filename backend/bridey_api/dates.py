from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from bridey_api.constants import TIMEZONE

TZ = ZoneInfo(TIMEZONE)


def weekday_of(iso: str) -> int:
    y, m, d = (int(part) for part in iso.split("-"))
    return datetime(y, m, d).isoweekday() % 7


def today_iso() -> str:
    now = datetime.now(TZ)
    return f"{now.year:04d}-{now.month:02d}-{now.day:02d}"


def now_minutes_tripoli() -> int:
    now = datetime.now(TZ)
    return now.hour * 60 + now.minute


def add_days_iso(iso: str, days: int) -> str:
    y, m, d = (int(part) for part in iso.split("-"))
    date = datetime(y, m, d) + timedelta(days=days)
    return f"{date.year:04d}-{date.month:02d}-{date.day:02d}"


def add_months_iso(iso: str, months: int) -> str:
    y, m, d = (int(part) for part in iso.split("-"))
    month_index = m - 1 + months
    year = y + month_index // 12
    month = month_index % 12 + 1
    if month == 12:
        last = (datetime(year + 1, 1, 1) - timedelta(days=1)).day
    else:
        last = (datetime(year, month + 1, 1) - timedelta(days=1)).day
    day = min(d, last)
    return f"{year:04d}-{month:02d}-{day:02d}"


def month_start_iso(iso: str) -> str:
    return f"{iso[:7]}-01"


def next_month_start_iso(iso: str) -> str:
    return add_months_iso(month_start_iso(iso), 1)


def month_end_iso(iso: str) -> str:
    return add_days_iso(next_month_start_iso(iso), -1)


def days_between(from_iso: str, to_iso: str) -> int:
    fy, fm, fd = (int(part) for part in from_iso.split("-"))
    ty, tm, td = (int(part) for part in to_iso.split("-"))
    return round((datetime(ty, tm, td) - datetime(fy, fm, fd)).total_seconds() / 86400)
