from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from bridey_api.booking import release_booking_holds
from bridey_api.errors import AppointmentError
from bridey_api.fees import write_audit
from bridey_api.models import Booking, BookingAssignment
from bridey_api.pass_tokens import booking_total_lyd

APPOINTMENT_LOAD = (
    selectinload(Booking.service),
    selectinload(Booking.items),
    selectinload(Booking.shift),
    selectinload(Booking.assignments).selectinload(BookingAssignment.team_member),
    selectinload(Booking.assignments).selectinload(BookingAssignment.service),
    selectinload(Booking.fee),
)


def load_appointment(session: Session, booking_id: str, business_id: str) -> Booking:
    booking = session.scalars(
        select(Booking).where(Booking.id == booking_id, Booking.business_id == business_id).options(*APPOINTMENT_LOAD)
    ).first()
    if not booking:
        raise AppointmentError("NOT_FOUND", 404)
    return booking


def apply_appointment_action(session: Session, args: dict) -> Booking:
    current = load_appointment(session, args["bookingId"], args["businessId"])
    action = args["action"]
    if current.status == "CANCELLED" and action in {"check_in", "start", "complete"}:
        raise AppointmentError("INVALID_STATUS", 400)

    if action == "check_in":
        if current.status in {"CHECKED_IN", "IN_PROGRESS", "COMPLETED"}:
            return current
        if current.status != "CONFIRMED":
            raise AppointmentError("INVALID_STATUS", 400)
        if current.status == "CONFIRMED":
            current.status = "CHECKED_IN"
            current.checked_in_at = current.checked_in_at or datetime.now(timezone.utc)
            current.checked_in_by_id = current.checked_in_by_id or args["memberId"]
            session.flush()
        write_audit(
            session,
            {
                "actorType": "artist",
                "actorId": args["artistId"],
                "action": "booking.checked_in",
                "artistId": args["ownerArtistId"],
                "reason": f"booking:{current.id}",
            },
        )
        return load_appointment(session, args["bookingId"], args["businessId"])

    if action == "start":
        if current.status in {"IN_PROGRESS", "COMPLETED"}:
            return current
        if current.status != "CHECKED_IN":
            raise AppointmentError("INVALID_STATUS", 400)
        current.status = "IN_PROGRESS"
        current.started_at = current.started_at or datetime.now(timezone.utc)
        current.started_by_id = current.started_by_id or args["memberId"]
        session.flush()
        write_audit(
            session,
            {
                "actorType": "artist",
                "actorId": args["artistId"],
                "action": "booking.started",
                "artistId": args["ownerArtistId"],
                "reason": f"booking:{current.id}",
            },
        )
        return load_appointment(session, args["bookingId"], args["businessId"])

    if action == "complete":
        if current.status == "COMPLETED":
            return current
        if current.status != "IN_PROGRESS":
            raise AppointmentError("INVALID_STATUS", 400)
        current.status = "COMPLETED"
        current.completed_at = current.completed_at or datetime.now(timezone.utc)
        current.completed_by_id = current.completed_by_id or args["memberId"]
        current.expires_at = None
        session.flush()
        release_booking_holds(session, current.id)
        write_audit(
            session,
            {
                "actorType": "artist",
                "actorId": args["artistId"],
                "action": "booking.completed",
                "artistId": args["ownerArtistId"],
                "reason": f"booking:{current.id}",
            },
        )
        return load_appointment(session, args["bookingId"], args["businessId"])

    if action in {"mark_paid", "record_payment"}:
        if current.status not in {"CONFIRMED", "CHECKED_IN", "IN_PROGRESS", "COMPLETED"}:
            raise AppointmentError("INVALID_STATUS", 400)
        total = booking_total_lyd(current)
        paid = current.paid_lyd or 0
        if paid >= total and total > 0:
            return current
        add = max(0, total - paid) if action == "mark_paid" else max(0, int(args.get("amountLyd") or 0))
        if add <= 0:
            return current
        next_paid = min(total, paid + add)
        deposit = args.get("depositLyd")
        if isinstance(deposit, (int, float)) and deposit >= 0:
            current.deposit_lyd = int(deposit)
        elif paid == 0 and next_paid < total:
            current.deposit_lyd = next_paid
        current.paid_lyd = next_paid
        current.paid_at = datetime.now(timezone.utc)
        current.paid_by_id = args["memberId"]
        session.flush()
        write_audit(
            session,
            {
                "actorType": "artist",
                "actorId": args["artistId"],
                "action": "booking.payment_recorded",
                "artistId": args["ownerArtistId"],
                "reason": f"booking:{current.id};paid:{next_paid};total:{total}",
            },
        )
        return load_appointment(session, args["bookingId"], args["businessId"])

    raise AppointmentError("INVALID", 400)
