from __future__ import annotations

from bridey_api.capacity import member_can_perform, remaining_bookings_for_services, remaining_of, staff_snapshots
from bridey_api.dates import add_days_iso, now_minutes_tripoli, today_iso, weekday_of
from bridey_api.expire import expire_overdue
from bridey_api.workspace import active_members, load_business


def public_availability(session, business, *, date: str, service_ids: list[str]) -> dict:
    expire_overdue(session, business.owner_id)
    fresh = load_business(session, business.id)
    blocked = any(row.date == date for row in fresh.blocked)
    open_day = any(row.day_of_week == weekday_of(date) for row in fresh.hours)
    mode = "HOURLY" if fresh.schedule_mode == "HOURLY" else "DAY" if fresh.schedule_mode == "DAY" else "SHIFT"
    min_notice = now_minutes_tripoli() + fresh.min_notice_hours * 60 if date == today_iso() else 0
    last_day = add_days_iso(today_iso(), fresh.booking_horizon_days - 1)
    in_horizon = today_iso() <= date <= last_day

    empty = {"mode": mode, "remainingDay": 0, "shifts": [], "staff": []}
    if not in_horizon:
        return {**empty, "available": False, "reason": "HORIZON"}
    if blocked:
        return {**empty, "available": False, "reason": "BLOCKED"}
    if not open_day:
        return {**empty, "available": False, "reason": "CLOSED"}

    day_staff = staff_snapshots(session, fresh, date, None)
    remaining_day = remaining_bookings_for_services(fresh, day_staff, service_ids)

    shifts = []
    if mode == "SHIFT":
        for shift in [row for row in fresh.shifts if row.active]:
            if date == today_iso() and shift.end_min <= min_notice:
                continue
            staff = staff_snapshots(session, fresh, date, shift.id)
            remaining = remaining_bookings_for_services(fresh, staff, service_ids)
            shifts.append(
                {
                    "id": shift.id,
                    "key": shift.key,
                    "nameAr": shift.name_ar,
                    "nameEn": shift.name_en,
                    "startMin": shift.start_min,
                    "endMin": shift.end_min,
                    "remaining": remaining,
                    "capacity": shift.capacity,
                }
            )

    def service_kind(service_id: str) -> str | None:
        service = next((row for row in fresh.services if row.id == service_id), None)
        return service.kind if service else None

    staff = []
    for member in active_members(fresh):
        if not any(member_can_perform(member, service_id, service_kind(service_id)) for service_id in service_ids):
            continue
        row = next((item for item in day_staff if item["id"] == member.id), None)
        staff.append(
            {
                "id": member.id,
                "name": member.name,
                "remaining": remaining_of(row) if row else 0,
                "serviceIds": [service_id for service_id in service_ids if member_can_perform(member, service_id, service_kind(service_id))],
            }
        )

    available = any(shift["remaining"] > 0 for shift in shifts) if mode == "SHIFT" else remaining_day > 0
    return {
        "mode": mode,
        "remainingDay": remaining_day,
        "shifts": shifts,
        "staff": staff,
        "available": available,
        "reason": "OK" if available else "FULL",
    }
