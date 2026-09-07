from __future__ import annotations

import re
from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from bridey_api import auth, workspace
from bridey_api import db as database
from bridey_api.appointment import APPOINTMENT_LOAD, apply_appointment_action, load_appointment
from bridey_api.booking import (
    STATUS_TRANSITIONS,
    TERMINAL_STATUSES,
    charge_bridey_fee,
    create_business_booking,
    has_overlap,
    hold_expires_at,
    lock_artist_schedule,
    reassign_booking,
    release_booking_holds,
    unique_track_code,
)
from bridey_api.constants import PLATFORM_FEE_LYD, SESSION_COOKIE, normalize_booking_source
from bridey_api.dates import add_days_iso, today_iso
from bridey_api.errors import (
    AppointmentError,
    CapacityFullError,
    FeeError,
    NotesContactError,
    PreferredUnavailableError,
    SlotTakenError,
    WorkspaceError,
    is_unique_constraint,
)
from bridey_api.expire import expire_overdue
from bridey_api.fees import write_audit
from bridey_api.models import Booking, BookingAssignment, Service
from bridey_api.pass_tokens import can_access_appointment, present_appointment, unique_pass_token
from bridey_api.phones import is_libya_phone, normalize_phone
from bridey_api.privacy import notes_contain_contact, present_booking
from bridey_api.serialize import to_json
from bridey_api.workspace import lock_business

bp = Blueprint("bookings", __name__)
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
APPOINTMENT_ACTIONS = {"check_in", "start", "complete", "mark_paid", "record_payment"}


def _unavailable_db():
    return jsonify({"error": "UNAVAILABLE"}), 503


def _viewer(ws: dict) -> dict:
    return {"memberId": ws["member"].id, "canManageBusiness": ws["permissions"]["canManageBusiness"]}


def _present_booking(ws, booking: Booking) -> dict:
    payload = to_json(booking)
    payload["service"] = to_json(booking.service) if booking.service else None
    payload["items"] = [to_json(item) for item in booking.items]
    payload["fee"] = to_json(booking.fee) if booking.fee else None
    payload["shift"] = to_json(booking.shift) if booking.shift else None
    payload["assignments"] = []
    for row in booking.assignments:
        payload["assignments"].append(
            {
                "teamMemberId": row.team_member_id,
                "serviceId": row.service_id,
                "teamMember": {"id": row.team_member.id, "name": row.team_member.name, "roles": row.team_member.roles}
                if row.team_member
                else None,
            }
        )
    return present_booking(payload, _viewer(ws))


def _load_booking_full(session, booking_id: str, business_id: str) -> Booking | None:
    return session.scalars(
        select(Booking)
        .where(Booking.id == booking_id, Booking.business_id == business_id)
        .options(
            selectinload(Booking.service),
            selectinload(Booking.items),
            selectinload(Booking.fee),
            selectinload(Booking.shift),
            selectinload(Booking.assignments).selectinload(BookingAssignment.team_member),
        )
    ).first()


@bp.post("/api/bookings")
def create_manual_booking():
    if database.SessionLocal is None:
        return _unavailable_db()
    session = database.SessionLocal()
    try:
        artist = auth.get_artist(session, request.cookies.get(SESSION_COOKIE))
        if not artist:
            return jsonify({"error": "UNAUTHORIZED"}), 401
        ws = workspace.require_workspace(session, artist)
        if not ws["permissions"]["canManageBusiness"]:
            return jsonify({"error": "FORBIDDEN"}), 403
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return jsonify({"error": "INVALID"}), 400
        bride_name = body.get("brideName")
        bride_phone = body.get("bridePhone")
        date = body.get("date")
        service_ids = body.get("serviceIds")
        source = body.get("source")
        if (
            not isinstance(bride_name, str)
            or not (2 <= len(bride_name) <= 80)
            or not isinstance(bride_phone, str)
            or not (8 <= len(bride_phone) <= 20)
            or not isinstance(date, str)
            or not DATE_RE.match(date)
            or not isinstance(service_ids, list)
            or not (1 <= len(service_ids) <= 8)
            or not isinstance(source, str)
        ):
            return jsonify({"error": "INVALID"}), 400
        phone = normalize_phone(bride_phone)
        if not is_libya_phone(phone):
            return jsonify({"error": "PHONE"}), 400
        unique_ids = list(dict.fromkeys(item for item in service_ids if isinstance(item, str)))
        services = session.scalars(
            select(Service).where(Service.business_id == ws["business"].id, Service.id.in_(unique_ids), Service.active.is_(True))
        ).all()
        if len(services) != len(unique_ids):
            return jsonify({"error": "NOT_FOUND"}), 404
        ordered = [next(service for service in services if service.id == sid) for sid in unique_ids]
        duration = body.get("durationMin") if isinstance(body.get("durationMin"), int) else sum(s.duration_min for s in ordered)
        start_min = body.get("startMin") if isinstance(body.get("startMin"), int) else None
        end_min = body.get("endMin") if isinstance(body.get("endMin"), int) else None
        if end_min is not None and start_min is not None and end_min > start_min:
            pass
        elif start_min is not None:
            end_min = start_min + duration
        else:
            end_min = None
        assignments = None
        if isinstance(body.get("assignments"), list):
            assignments = [
                {"serviceId": row.get("serviceId"), "teamMemberId": row.get("teamMemberId")}
                for row in body["assignments"]
                if isinstance(row, dict)
            ]
        booking = create_business_booking(
            session,
            {
                "business": ws["business"],
                "services": ordered,
                "date": date,
                "shiftId": body.get("shiftId") if isinstance(body.get("shiftId"), str) else None,
                "startMin": start_min,
                "endMin": end_min,
                "preferredMemberId": body.get("preferredMemberId") if isinstance(body.get("preferredMemberId"), str) else None,
                "preferredByService": body.get("preferredByService") if isinstance(body.get("preferredByService"), dict) else None,
                "assignments": assignments,
                "brideName": bride_name.strip(),
                "bridePhone": phone,
                "notes": body.get("notes") if isinstance(body.get("notes"), str) else "",
                "artistNotes": body.get("artistNotes") if isinstance(body.get("artistNotes"), str) else "",
                "origin": "manual",
                "source": normalize_booking_source(source),
                "status": "CONFIRMED",
                "expiresAt": None,
            },
        )
        session.commit()
        loaded = _load_booking_full(session, booking.id, ws["business"].id)
        return jsonify(_present_booking(ws, loaded) if loaded else {})
    except WorkspaceError as error:
        session.rollback()
        return jsonify({"error": error.args[0]}), error.status
    except PreferredUnavailableError:
        session.rollback()
        return jsonify({"error": "PREFERRED_UNAVAILABLE"}), 409
    except (CapacityFullError, SlotTakenError):
        session.rollback()
        return jsonify({"error": "UNAVAILABLE"}), 409
    except FeeError as error:
        session.rollback()
        return jsonify({"error": error.args[0]}), error.status
    except Exception as error:
        session.rollback()
        if is_unique_constraint(error):
            return jsonify({"error": "UNAVAILABLE"}), 409
        raise
    finally:
        session.close()


@bp.get("/api/bookings/<booking_id>")
@bp.get("/api/bookings/<booking_id>/appointment")
def get_booking(booking_id: str):
    if database.SessionLocal is None:
        return _unavailable_db()
    session = database.SessionLocal()
    try:
        artist = auth.get_artist(session, request.cookies.get(SESSION_COOKIE))
        if not artist:
            return jsonify({"error": "UNAUTHORIZED"}), 401
        ws = workspace.require_workspace(session, artist)
        booking = session.scalars(
            select(Booking).where(Booking.id == booking_id, Booking.business_id == ws["business"].id).options(*APPOINTMENT_LOAD)
        ).first()
        if not booking or not can_access_appointment(ws, booking):
            return jsonify({"error": "NOT_FOUND"}), 404
        return jsonify(present_appointment(booking, _viewer(ws), ws["business"].name))
    except WorkspaceError as error:
        return jsonify({"error": error.args[0]}), error.status
    finally:
        session.close()


@bp.post("/api/bookings/<booking_id>/appointment")
def appointment_action(booking_id: str):
    if database.SessionLocal is None:
        return _unavailable_db()
    session = database.SessionLocal()
    try:
        artist = auth.get_artist(session, request.cookies.get(SESSION_COOKIE))
        if not artist:
            return jsonify({"error": "UNAUTHORIZED"}), 401
        ws = workspace.require_workspace(session, artist)
        body = request.get_json(silent=True)
        if not isinstance(body, dict) or body.get("action") not in APPOINTMENT_ACTIONS:
            return jsonify({"error": "INVALID"}), 400
        amount = body.get("amountLyd")
        deposit = body.get("depositLyd")
        if amount is not None and (not isinstance(amount, int) or not (1 <= amount <= 50000)):
            return jsonify({"error": "INVALID"}), 400
        if deposit is not None and (not isinstance(deposit, int) or not (0 <= deposit <= 50000)):
            return jsonify({"error": "INVALID"}), 400
        existing = session.scalars(
            select(Booking)
            .where(Booking.id == booking_id, Booking.business_id == ws["business"].id)
            .options(selectinload(Booking.assignments))
        ).first()
        if not existing or not can_access_appointment(ws, existing):
            return jsonify({"error": "NOT_FOUND"}), 404
        lock_business(session, ws["business"].id)
        apply_appointment_action(
            session,
            {
                "bookingId": booking_id,
                "businessId": ws["business"].id,
                "memberId": ws["member"].id,
                "artistId": artist.id,
                "ownerArtistId": ws["business"].owner_id,
                "action": body["action"],
                "amountLyd": amount if isinstance(amount, int) else None,
                "depositLyd": deposit if isinstance(deposit, int) else None,
            },
        )
        session.commit()
        booking = load_appointment(session, booking_id, ws["business"].id)
        return jsonify(present_appointment(booking, _viewer(ws), ws["business"].name))
    except WorkspaceError as error:
        session.rollback()
        return jsonify({"error": error.args[0]}), error.status
    except AppointmentError as error:
        session.rollback()
        return jsonify({"error": error.args[0]}), error.status
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.patch("/api/bookings/<booking_id>")
def patch_booking(booking_id: str):
    if database.SessionLocal is None:
        return _unavailable_db()
    session = database.SessionLocal()
    try:
        artist = auth.get_artist(session, request.cookies.get(SESSION_COOKIE))
        if not artist:
            return jsonify({"error": "UNAUTHORIZED"}), 401
        ws = workspace.require_workspace(session, artist)
        booking = session.scalars(
            select(Booking).where(Booking.id == booking_id, Booking.business_id == ws["business"].id).options(
                selectinload(Booking.assignments)
            )
        ).first()
        if not booking:
            return jsonify({"error": "NOT_FOUND"}), 404
        if not ws["permissions"]["canManageBusiness"] and not any(
            row.team_member_id == ws["member"].id for row in booking.assignments
        ):
            return jsonify({"error": "NOT_FOUND"}), 404
        body = request.get_json(silent=True) or {}
        if not isinstance(body, dict):
            body = {}
        if isinstance(body.get("assignments"), list):
            if not ws["permissions"]["canAssign"]:
                return jsonify({"error": "FORBIDDEN"}), 403
            updated = reassign_booking(
                session,
                booking_id=booking_id,
                business=ws["business"],
                assignments=[
                    {"serviceId": row.get("serviceId"), "teamMemberId": row.get("teamMemberId")}
                    for row in body["assignments"]
                    if isinstance(row, dict)
                ],
            )
            session.commit()
            loaded = _load_booking_full(session, updated.id, ws["business"].id)
            return jsonify(_present_booking(ws, loaded) if loaded else {})
        if isinstance(body.get("artistNotes"), str):
            booking.artist_notes = body["artistNotes"][:500]
            session.flush()
        status = body.get("status") if isinstance(body.get("status"), str) else None
        if not status:
            session.commit()
            loaded = _load_booking_full(session, booking_id, ws["business"].id)
            return jsonify(_present_booking(ws, loaded) if loaded else {})
        allowed = STATUS_TRANSITIONS.get(booking.status) or []
        if status not in allowed:
            return jsonify({"error": "INVALID_STATUS"}), 400
        lock_business(session, ws["business"].id)
        lock_artist_schedule(session, ws["business"].owner_id)
        expire_overdue(session, ws["business"].owner_id)
        current = session.get(Booking, booking_id)
        if not current:
            return jsonify({"error": "NOT_FOUND"}), 404
        if status not in (STATUS_TRANSITIONS.get(current.status) or []):
            return jsonify({"error": "INVALID_STATUS"}), 400
        if status == "CONFIRMED":
            if current.schedule_mode == "HOURLY" and has_overlap(
                session,
                artist_id=current.artist_id,
                date=current.date,
                start_min=current.start_min,
                end_min=current.end_min,
                exclude_id=current.id,
            ):
                return jsonify({"error": "UNAVAILABLE"}), 409
            issued = not current.bridey_pass_token
            current.status = "CONFIRMED"
            current.confirmed_at = current.confirmed_at or datetime.now(timezone.utc)
            current.expires_at = None
            current.bridey_pass_token = current.bridey_pass_token or unique_pass_token(session)
            session.flush()
            if current.origin == "public":
                fee = charge_bridey_fee(session, current)
                if not fee:
                    raise RuntimeError("FEE_FAILED")
            write_audit(
                session,
                {
                    "actorType": "artist",
                    "actorId": artist.id,
                    "action": "booking.confirmed",
                    "artistId": ws["business"].owner_id,
                    "reason": f"booking:{booking_id};fee:{PLATFORM_FEE_LYD if current.origin == 'public' else 0};contactUnlocked:1",
                },
            )
            if issued:
                write_audit(
                    session,
                    {
                        "actorType": "artist",
                        "actorId": artist.id,
                        "action": "pass.generated",
                        "artistId": ws["business"].owner_id,
                        "reason": f"booking:{booking_id}",
                    },
                )
        else:
            if status in TERMINAL_STATUSES:
                release_booking_holds(session, booking_id)
            current.status = status
            if status == "CANCELLED":
                current.cancelled_at = datetime.now(timezone.utc)
            current.expires_at = None
        session.commit()
        loaded = _load_booking_full(session, booking_id, ws["business"].id)
        return jsonify(_present_booking(ws, loaded) if loaded else {})
    except WorkspaceError as error:
        session.rollback()
        return jsonify({"error": error.args[0]}), error.status
    except LookupError:
        session.rollback()
        return jsonify({"error": "NOT_FOUND"}), 404
    except (CapacityFullError, SlotTakenError):
        session.rollback()
        return jsonify({"error": "UNAVAILABLE"}), 409
    except RuntimeError as error:
        session.rollback()
        if str(error) == "FEE_FAILED":
            return jsonify({"error": "FEE_FAILED"}), 500
        raise
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.post("/api/public/book")
def public_book():
    if database.SessionLocal is None:
        return _unavailable_db()
    session = database.SessionLocal()
    request_id = None
    try:
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return jsonify({"error": "INVALID"}), 400
        slug = body.get("slug")
        service_ids = body.get("serviceIds")
        date = body.get("date")
        bride_name = body.get("brideName")
        bride_phone = body.get("bridePhone")
        if (
            not isinstance(slug, str)
            or not isinstance(service_ids, list)
            or not (1 <= len(service_ids) <= 8)
            or not isinstance(date, str)
            or not DATE_RE.match(date)
            or not isinstance(bride_name, str)
            or not (2 <= len(bride_name) <= 80)
            or not isinstance(bride_phone, str)
            or not (8 <= len(bride_phone) <= 20)
        ):
            return jsonify({"error": "INVALID"}), 400
        notes = body.get("notes") if isinstance(body.get("notes"), str) else ""
        if len(notes) > 500:
            return jsonify({"error": "INVALID"}), 400
        phone = normalize_phone(bride_phone)
        if not is_libya_phone(phone):
            return jsonify({"error": "PHONE"}), 400
        if notes_contain_contact(notes):
            return jsonify({"error": "NOTES_CONTACT"}), 400
        request_id = body.get("requestId") if isinstance(body.get("requestId"), str) else None
        if request_id and not UUID_RE.match(request_id):
            return jsonify({"error": "INVALID"}), 400
        if request_id:
            existing = session.scalar(select(Booking).where(Booking.request_id == request_id))
            if existing and existing.origin == "public":
                return jsonify({"id": existing.id, "trackCode": existing.track_code})
        unique_ids = list(dict.fromkeys(item for item in service_ids if isinstance(item, str)))
        business = workspace.find_business_by_slug(session, slug)
        if not business or not business.owner.onboarding_complete:
            return jsonify({"error": "NOT_FOUND"}), 404
        services = session.scalars(
            select(Service).where(Service.business_id == business.id, Service.id.in_(unique_ids), Service.active.is_(True))
        ).all()
        if len(services) != len(unique_ids):
            return jsonify({"error": "NOT_FOUND"}), 404
        ordered = [next(service for service in services if service.id == sid) for sid in unique_ids]
        last_day = add_days_iso(today_iso(), business.booking_horizon_days - 1)
        if date < today_iso() or date > last_day:
            return jsonify({"error": "UNAVAILABLE"}), 409
        shift_id = body.get("shiftId") if isinstance(body.get("shiftId"), str) else None
        if business.schedule_mode == "SHIFT" and not shift_id:
            only = [row for row in business.shifts if row.active]
            if len(only) != 1:
                return jsonify({"error": "SHIFT_REQUIRED"}), 400
            shift_id = only[0].id
        booking = create_business_booking(
            session,
            {
                "business": business,
                "services": ordered,
                "date": date,
                "shiftId": shift_id,
                "startMin": body.get("startMin") if isinstance(body.get("startMin"), int) else None,
                "preferredMemberId": body.get("preferredMemberId") if isinstance(body.get("preferredMemberId"), str) else None,
                "preferredByService": body.get("preferredByService") if isinstance(body.get("preferredByService"), dict) else None,
                "brideName": bride_name.strip(),
                "bridePhone": phone,
                "notes": notes,
                "origin": "public",
                "source": "bridey",
                "status": "PENDING",
                "expiresAt": hold_expires_at(),
                "requestId": request_id,
                "trackCode": unique_track_code(session),
            },
        )
        session.commit()
        return jsonify({"id": booking.id, "trackCode": booking.track_code})
    except NotesContactError:
        session.rollback()
        return jsonify({"error": "NOTES_CONTACT"}), 400
    except PreferredUnavailableError:
        session.rollback()
        return jsonify({"error": "PREFERRED_UNAVAILABLE"}), 409
    except (CapacityFullError, SlotTakenError):
        session.rollback()
        return jsonify({"error": "UNAVAILABLE"}), 409
    except FeeError:
        session.rollback()
        return jsonify({"error": "ARTIST_UNAVAILABLE"}), 403
    except Exception as error:
        session.rollback()
        if request_id and is_unique_constraint(error, "requestId"):
            existing = session.scalar(select(Booking).where(Booking.request_id == request_id))
            if existing:
                return jsonify({"id": existing.id, "trackCode": existing.track_code})
        raise
    finally:
        session.close()
