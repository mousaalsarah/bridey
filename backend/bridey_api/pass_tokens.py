from __future__ import annotations

import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from bridey_api.constants import PASS_HIDDEN_STATUSES
from bridey_api.errors import is_unique_constraint
from bridey_api.models import Booking


def random_pass_token() -> str:
    return secrets.token_urlsafe(32)


def unique_pass_token(session: Session) -> str:
    for _ in range(12):
        token = random_pass_token()
        exists = session.scalar(select(Booking.id).where(Booking.bridey_pass_token == token))
        if not exists:
            return token
    return random_pass_token()


def ensure_pass_token(session: Session, booking: Booking) -> str:
    if booking.status in PASS_HIDDEN_STATUSES:
        return booking.bridey_pass_token or ""
    if booking.bridey_pass_token:
        return booking.bridey_pass_token
    for _ in range(8):
        token = unique_pass_token(session)
        try:
            with session.begin_nested():
                booking.bridey_pass_token = token
                session.flush()
            return token
        except Exception as error:
            if not is_unique_constraint(error, "brideyPassToken"):
                raise
    raise RuntimeError("PASS_TOKEN_FAILED")


def pass_is_available(booking) -> bool:
    if not booking.bridey_pass_token:
        return False
    if booking.status in PASS_HIDDEN_STATUSES:
        return False
    return bool(booking.confirmed_at) or booking.status in {
        "CONFIRMED",
        "CHECKED_IN",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELLED",
        "NO_SHOW",
    }


def booking_total_lyd(booking) -> int:
    if booking.items:
        return sum(item.price_lyd or 0 for item in booking.items)
    return booking.service.price_lyd if booking.service else 0


def payment_snapshot(booking) -> dict:
    total_lyd = booking_total_lyd(booking)
    deposit_lyd = max(0, booking.deposit_lyd or 0)
    paid_lyd = max(0, min(total_lyd, booking.paid_lyd or 0))
    remaining_lyd = max(0, total_lyd - paid_lyd)
    status = "paid" if remaining_lyd <= 0 and total_lyd > 0 else "partial" if paid_lyd > 0 else "unpaid"
    return {
        "totalLyd": total_lyd,
        "depositLyd": deposit_lyd,
        "paidLyd": paid_lyd,
        "remainingLyd": remaining_lyd,
        "depositPaid": deposit_lyd > 0 and paid_lyd >= deposit_lyd,
        "status": status,
    }


def can_access_appointment(workspace: dict, booking) -> bool:
    same_business = (
        booking.business_id == workspace["business"].id
        if booking.business_id
        else booking.artist_id == workspace["business"].owner_id
    )
    if not same_business:
        return False
    if workspace["permissions"]["canManageBusiness"]:
        return True
    member_id = workspace["member"].id
    return any(row.team_member_id == member_id for row in (booking.assignments or []))


def appointment_actions(status: str) -> dict:
    return {
        "canCheckIn": status == "CONFIRMED",
        "canStart": status == "CHECKED_IN",
        "canComplete": status == "IN_PROGRESS",
        "canRecordPayment": status in {"CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"},
    }


def present_appointment(booking, viewer: dict, business_name: str = "") -> dict:
    from bridey_api.privacy import present_booking
    from bridey_api.serialize import iso, to_json

    payload = to_json(booking)
    payload["assignments"] = [
        {"teamMemberId": row.team_member_id, "serviceId": row.service_id} for row in booking.assignments
    ]
    presented = present_booking(payload, viewer)
    payment = payment_snapshot(booking)
    items = booking.items or []
    services = [
        {
            "nameAr": item.name_ar,
            "nameEn": item.name_en,
            "durationMin": item.duration_min,
            "priceLyd": item.price_lyd,
        }
        for item in items
    ] or [
        {
            "nameAr": booking.service.name_ar,
            "nameEn": booking.service.name_en,
            "durationMin": booking.service.duration_min,
            "priceLyd": booking.service.price_lyd,
        }
    ]
    return {
        "id": booking.id,
        "status": booking.status,
        "origin": booking.origin,
        "brideName": booking.bride_name,
        "bridePhone": presented["bridePhone"],
        "contactAvailable": presented["contactAvailable"],
        "notes": presented["notes"],
        "date": booking.date,
        "startMin": booking.start_min,
        "endMin": booking.end_min,
        "scheduleMode": booking.schedule_mode,
        "trackCode": booking.track_code,
        "shift": {
            "nameAr": booking.shift.name_ar,
            "nameEn": booking.shift.name_en,
            "startMin": booking.shift.start_min,
            "endMin": booking.shift.end_min,
        }
        if booking.shift
        else None,
        "businessName": business_name,
        "assignments": [
            {
                "teamMemberId": row.team_member_id,
                "serviceId": row.service_id,
                "staffName": row.team_member.name if row.team_member else "",
                "serviceAr": row.service.name_ar if row.service else "",
                "serviceEn": row.service.name_en if row.service else "",
            }
            for row in booking.assignments
        ],
        "services": services,
        "payment": payment,
        "checkedInAt": iso(booking.checked_in_at),
        "startedAt": iso(booking.started_at),
        "completedAt": iso(booking.completed_at),
        "cancelledAt": iso(booking.cancelled_at),
        "actions": appointment_actions(booking.status),
    }
