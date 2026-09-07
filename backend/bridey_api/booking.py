from __future__ import annotations

import re
import secrets
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, selectinload

from bridey_api.capacity import assign_staff, claim_capacity_seats, staff_snapshots
from bridey_api.constants import BLOCKING_STATUSES, BOOKING_REQUEST_TIMEOUT_MINUTES, PLATFORM_FEE_LYD
from bridey_api.dates import weekday_of
from bridey_api.errors import CapacityFullError, NotesContactError, SlotTakenError, is_unique_constraint
from bridey_api.expire import expire_overdue
from bridey_api.fees import assert_can_create_booking, attach_fee_to_invoice
from bridey_api.ids import new_id
from bridey_api.models import (
    Artist,
    Booking,
    BookingAssignment,
    BookingItem,
    CapacityHold,
    PlatformFee,
    SlotHold,
)
from bridey_api.pass_tokens import unique_pass_token
from bridey_api.privacy import notes_contain_contact
from bridey_api.slots import occupy_slot_starts
from bridey_api.workspace import load_business, lock_business, lock_team_members

STATUS_TRANSITIONS = {
    "PENDING": ["CONFIRMED", "DECLINED", "CANCELLED", "EXPIRED"],
    "CONFIRMED": ["CHECKED_IN", "CANCELLED", "NO_SHOW"],
    "CHECKED_IN": ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
    "IN_PROGRESS": ["COMPLETED", "CANCELLED"],
    "COMPLETED": [],
    "DECLINED": [],
    "CANCELLED": [],
    "NO_SHOW": [],
    "EXPIRED": [],
}
TERMINAL_STATUSES = ("DECLINED", "CANCELLED", "EXPIRED", "COMPLETED", "NO_SHOW")
ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
BOOKING_TX_ATTEMPTS = 4


def hold_expires_at(from_time: datetime | None = None) -> datetime:
    start = from_time or datetime.now(timezone.utc)
    return start + timedelta(minutes=BOOKING_REQUEST_TIMEOUT_MINUTES)


def random_track_code() -> str:
    return "BR" + "".join(secrets.choice(ALPHABET) for _ in range(10))


def normalize_track_code(raw: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", raw.strip().upper())


def unique_track_code(session: Session) -> str:
    for _ in range(16):
        code = random_track_code()
        if not session.scalar(select(Booking.id).where(Booking.track_code == code)):
            return code
    return f"BR{int(datetime.now(timezone.utc).timestamp()):X}{secrets.randbelow(36):X}"


def ranges_overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    return a_start < b_end and a_end > b_start


def is_retryable_tx_error(error: BaseException) -> bool:
    msg = str(error).lower()
    return "serialize" in msg or "deadlock" in msg or "40001" in msg or "40p01" in msg


def lock_artist_schedule(session: Session, artist_id: str) -> None:
    artist = session.get(Artist, artist_id)
    if artist:
        artist.updated_at = datetime.now(timezone.utc)
        session.flush()


def release_booking_holds(session: Session, booking_id: str) -> None:
    session.execute(delete(SlotHold).where(SlotHold.booking_id == booking_id))
    session.execute(delete(CapacityHold).where(CapacityHold.booking_id == booking_id))


def claim_slot_holds(session: Session, *, artist_id: str, date: str, start_min: int, end_min: int, booking_id: str) -> None:
    starts = occupy_slot_starts(start_min, end_min)
    if not starts:
        raise SlotTakenError()
    try:
        for start in starts:
            session.add(SlotHold(id=new_id(), artist_id=artist_id, date=date, start_min=start, booking_id=booking_id))
        session.flush()
    except Exception as error:
        if is_unique_constraint(error):
            raise SlotTakenError() from error
        raise


def has_overlap(session: Session, *, artist_id: str, date: str, start_min: int, end_min: int, exclude_id: str | None = None) -> bool:
    now = datetime.now(timezone.utc)
    query = select(Booking).where(
        Booking.artist_id == artist_id,
        Booking.date == date,
        Booking.schedule_mode == "HOURLY",
        Booking.status.in_(list(BLOCKING_STATUSES)),
    )
    if exclude_id:
        query = query.where(Booking.id != exclude_id)
    rows = session.scalars(query).all()
    return any(
        not (row.status == "PENDING" and row.expires_at and (row.expires_at.replace(tzinfo=timezone.utc) if row.expires_at.tzinfo is None else row.expires_at) <= now)
        and ranges_overlap(start_min, end_min, row.start_min, row.end_min)
        for row in rows
    )


def resolve_window(business, date: str, shift_id: str | None, start_min: int | None, end_min: int | None) -> dict:
    mode = "HOURLY" if business.schedule_mode == "HOURLY" else "DAY" if business.schedule_mode == "DAY" else "SHIFT"
    day_hours = next((row for row in business.hours if row.day_of_week == weekday_of(date)), None)
    if not day_hours and mode != "HOURLY":
        raise CapacityFullError("CLOSED")
    if mode == "HOURLY":
        if start_min is None or end_min is None or end_min <= start_min:
            raise CapacityFullError("UNAVAILABLE")
        return {"mode": mode, "shiftId": None, "startMin": start_min, "endMin": end_min}
    if mode == "DAY":
        start = day_hours.start_min if day_hours else 10 * 60
        end = day_hours.end_min if day_hours else 20 * 60
        return {"mode": mode, "shiftId": None, "startMin": start, "endMin": end}
    shift = next((row for row in business.shifts if row.id == shift_id and row.active), None) if shift_id else next(
        (row for row in business.shifts if row.active), None
    )
    if not shift:
        raise CapacityFullError("UNAVAILABLE")
    return {"mode": mode, "shiftId": shift.id, "startMin": shift.start_min, "endMin": shift.end_min}


def charge_bridey_fee(session: Session, booking: Booking):
    if booking.origin != "public":
        return None
    existing = session.scalar(select(PlatformFee).where(PlatformFee.booking_id == booking.id))
    if existing:
        return existing
    try:
        fee = PlatformFee(
            id=new_id(),
            artist_id=booking.artist_id,
            business_id=booking.business_id,
            booking_id=booking.id,
            amount_lyd=PLATFORM_FEE_LYD,
            status="UNPAID",
            created_at=datetime.now(timezone.utc),
        )
        session.add(fee)
        booking.platform_fee_lyd = PLATFORM_FEE_LYD
        booking.fee_status = "UNPAID"
        session.flush()
        attach_fee_to_invoice(session, booking.artist_id, fee.id)
        return fee
    except Exception as error:
        if is_unique_constraint(error):
            return session.scalar(select(PlatformFee).where(PlatformFee.booking_id == booking.id))
        raise


def create_business_booking(session: Session, args: dict) -> Booking:
    if args["origin"] == "public" and notes_contain_contact(args.get("notes") or ""):
        raise NotesContactError()
    lock_business(session, args["business"].id)
    lock_artist_schedule(session, args["business"].owner_id)
    assert_can_create_booking(session, args["business"].owner_id)
    expire_overdue(session, args["business"].owner_id)
    business = load_business(session, args["business"].id)

    if any(row.date == args["date"] for row in business.blocked):
        raise CapacityFullError("UNAVAILABLE")
    open_day = any(row.day_of_week == weekday_of(args["date"]) for row in business.hours)
    if not open_day and business.schedule_mode != "HOURLY":
        raise CapacityFullError("UNAVAILABLE")

    window = resolve_window(business, args["date"], args.get("shiftId"), args.get("startMin"), args.get("endMin"))
    staff = staff_snapshots(session, business, args["date"], window["shiftId"])
    service_ids = [service.id for service in args["services"]]
    assignments = args.get("assignments") or assign_staff(
        service_ids=service_ids,
        staff=staff,
        preferred_member_id=args.get("preferredMemberId"),
        preferred_by_service=args.get("preferredByService"),
        business=business,
    )
    member_ids = list(dict.fromkeys(row["teamMemberId"] for row in assignments))
    lock_team_members(session, member_ids)
    shift = next((row for row in business.shifts if row.id == window["shiftId"]), None) if window["shiftId"] else None

    now = datetime.now(timezone.utc)
    booking = Booking(
        id=new_id(),
        artist_id=business.owner_id,
        business_id=business.id,
        service_id=args["services"][0].id,
        shift_id=window["shiftId"],
        schedule_mode=window["mode"],
        track_code=args.get("trackCode"),
        origin=args["origin"],
        source=args["source"],
        bride_name=args["brideName"],
        bride_phone=args["bridePhone"],
        notes=args.get("notes") or "",
        artist_notes=args.get("artistNotes") or "",
        date=args["date"],
        start_min=window["startMin"],
        end_min=window["endMin"],
        status=args["status"],
        confirmed_at=now if args["status"] == "CONFIRMED" else None,
        expires_at=args.get("expiresAt"),
        request_id=args.get("requestId"),
        bridey_pass_token=unique_pass_token(session) if args["status"] == "CONFIRMED" else None,
        created_at=now,
    )
    session.add(booking)
    session.flush()
    for service in args["services"]:
        member_id = next((row["teamMemberId"] for row in assignments if row["serviceId"] == service.id), None)
        session.add(
            BookingItem(
                id=new_id(),
                booking_id=booking.id,
                service_id=service.id,
                team_member_id=member_id,
                name_ar=service.name_ar,
                name_en=service.name_en,
                duration_min=service.duration_min,
                price_lyd=service.price_lyd,
            )
        )
    for row in assignments:
        session.add(
            BookingAssignment(
                id=new_id(),
                booking_id=booking.id,
                team_member_id=row["teamMemberId"],
                service_id=row["serviceId"],
            )
        )
    session.flush()
    try:
        claim_capacity_seats(
            session,
            date=args["date"],
            shift_id=window["shiftId"],
            booking_id=booking.id,
            member_ids=member_ids,
            members=[{"id": member.id, "dailyCapacity": member.daily_capacity} for member in business.members],
            shift_capacity=shift.capacity if shift else None,
        )
    except Exception as error:
        session.delete(booking)
        session.flush()
        if isinstance(error, CapacityFullError):
            raise
        if is_unique_constraint(error):
            raise CapacityFullError() from error
        raise
    if window["mode"] == "HOURLY":
        try:
            claim_slot_holds(
                session,
                artist_id=business.owner_id,
                date=args["date"],
                start_min=window["startMin"],
                end_min=window["endMin"],
                booking_id=booking.id,
            )
        except Exception as error:
            session.delete(booking)
            session.flush()
            raise error if isinstance(error, SlotTakenError) else SlotTakenError() from error
    session.flush()
    return session.scalars(
        select(Booking)
        .where(Booking.id == booking.id)
        .options(
            selectinload(Booking.items),
            selectinload(Booking.service),
            selectinload(Booking.assignments).selectinload(BookingAssignment.team_member),
            selectinload(Booking.shift),
            selectinload(Booking.fee),
        )
    ).one()


def reassign_booking(session: Session, *, booking_id: str, business, assignments: list[dict]) -> Booking:
    booking = session.scalar(select(Booking).where(Booking.id == booking_id, Booking.business_id == business.id))
    if not booking:
        raise LookupError("NOT_FOUND")
    if booking.status not in {"PENDING", "CONFIRMED"}:
        raise CapacityFullError("UNAVAILABLE")
    lock_business(session, business.id)
    member_ids = list(dict.fromkeys(row["teamMemberId"] for row in assignments))
    lock_team_members(session, member_ids)
    release_booking_holds(session, booking.id)
    session.execute(delete(BookingAssignment).where(BookingAssignment.booking_id == booking.id))
    for row in assignments:
        session.add(
            BookingAssignment(
                id=new_id(),
                booking_id=booking.id,
                team_member_id=row["teamMemberId"],
                service_id=row["serviceId"],
            )
        )
        for item in session.scalars(select(BookingItem).where(BookingItem.booking_id == booking.id, BookingItem.service_id == row["serviceId"])):
            item.team_member_id = row["teamMemberId"]
    shift = next((row for row in business.shifts if row.id == booking.shift_id), None) if booking.shift_id else None
    claim_capacity_seats(
        session,
        date=booking.date,
        shift_id=booking.shift_id if booking.schedule_mode == "SHIFT" else None,
        booking_id=booking.id,
        member_ids=member_ids,
        members=[{"id": member.id, "dailyCapacity": member.daily_capacity} for member in business.members],
        shift_capacity=shift.capacity if shift else None,
    )
    session.flush()
    return session.scalars(
        select(Booking)
        .where(Booking.id == booking.id)
        .options(
            selectinload(Booking.items),
            selectinload(Booking.service),
            selectinload(Booking.assignments),
            selectinload(Booking.shift),
            selectinload(Booking.fee),
        )
    ).one()


def run_booking_transaction(session_factory, fn):
    last: BaseException | None = None
    for attempt in range(BOOKING_TX_ATTEMPTS):
        session = session_factory()
        try:
            result = fn(session)
            session.commit()
            return result
        except Exception as error:
            session.rollback()
            last = error
            if not is_retryable_tx_error(error) or attempt == BOOKING_TX_ATTEMPTS - 1:
                raise
            time.sleep(0.04 * (attempt + 1) * (attempt + 1))
        finally:
            session.close()
    raise last  # pragma: no cover
