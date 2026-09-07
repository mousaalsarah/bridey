from __future__ import annotations

import re

from flask import Blueprint, jsonify, request
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from bridey_api import workspace
from bridey_api import db as database
from bridey_api.availability import public_availability
from bridey_api.booking import normalize_track_code
from bridey_api.constants import PASS_HIDDEN_STATUSES
from bridey_api.dates import now_minutes_tripoli, today_iso
from bridey_api.expire import expire_overdue
from bridey_api.models import Artist, BlockedDate, Booking, BookingAssignment, Business, PortfolioImage, Service, WeeklyHour
from bridey_api.pass_tokens import ensure_pass_token, pass_is_available
from bridey_api.serialize import iso
from bridey_api.slots import generate_slot_states

bp = Blueprint("public", __name__)
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TRACK_LOAD = (
    selectinload(Booking.items),
    selectinload(Booking.service),
    selectinload(Booking.shift),
    selectinload(Booking.assignments).selectinload(BookingAssignment.team_member),
    selectinload(Booking.assignments).selectinload(BookingAssignment.service),
)


def _unavailable_db():
    return jsonify({"error": "UNAVAILABLE"}), 503


def _service_ids() -> list[str]:
    ids = list(request.args.getlist("serviceId"))
    bundled = request.args.get("serviceIds") or ""
    ids.extend(part.strip() for part in bundled.split(","))
    seen = []
    for item in ids:
        value = item.strip()
        if value and value not in seen:
            seen.append(value)
    return seen


@bp.get("/api/public/availability")
def availability():
    if database.SessionLocal is None:
        return _unavailable_db()
    slug = request.args.get("slug")
    date = request.args.get("date")
    ids = _service_ids()
    if not slug or not date or not DATE_RE.match(date) or not ids:
        return jsonify({"error": "INVALID"}), 400
    session = database.SessionLocal()
    try:
        business = workspace.find_business_by_slug(session, slug)
        if not business or not business.owner.onboarding_complete:
            return jsonify({"error": "NOT_FOUND"}), 404
        services = session.scalars(
            select(Service).where(Service.business_id == business.id, Service.id.in_(ids), Service.active.is_(True))
        ).all()
        if len(services) != len(ids):
            return jsonify({"error": "NOT_FOUND"}), 404
        payload = public_availability(session, business, date=date, service_ids=ids)
        session.commit()
        return jsonify(payload)
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.get("/api/public/slots")
def slots():
    if database.SessionLocal is None:
        return _unavailable_db()
    slug = request.args.get("slug")
    date = request.args.get("date")
    ids = _service_ids()
    if not slug or not date or not DATE_RE.match(date) or not ids:
        return jsonify({"error": "INVALID"}), 400
    session = database.SessionLocal()
    try:
        artist = session.scalar(select(Artist).where(Artist.slug == slug))
        if not artist:
            return jsonify({"error": "NOT_FOUND"}), 404
        services = session.scalars(
            select(Service).where(Service.artist_id == artist.id, Service.id.in_(ids), Service.active.is_(True))
        ).all()
        if len(services) != len(ids):
            return jsonify({"error": "NOT_FOUND"}), 404
        expire_overdue(session, artist.id)
        duration_min = sum(service.duration_min for service in services)
        bookings = session.scalars(select(Booking).where(Booking.artist_id == artist.id, Booking.date == date)).all()
        hours = session.scalars(select(WeeklyHour).where(WeeklyHour.artist_id == artist.id)).all()
        blocked = [row.date for row in session.scalars(select(BlockedDate).where(BlockedDate.artist_id == artist.id))]
        min_start = now_minutes_tripoli() + artist.min_notice_hours * 60 if date == today_iso() else 0
        states = generate_slot_states(date, duration_min, hours, bookings, blocked, min_start)
        session.commit()
        return jsonify({"slots": states["available"], "held": states["held"], "durationMin": duration_min})
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.get("/api/public/artists")
def artists():
    if database.SessionLocal is None:
        return _unavailable_db()
    session = database.SessionLocal()
    try:
        businesses = session.scalars(
            select(Business)
            .join(Business.owner)
            .where(Artist.onboarding_complete.is_(True))
            .options(selectinload(Business.owner), selectinload(Business.services))
            .order_by(Business.created_at.desc())
        ).all()
        owner_ids = [row.owner_id for row in businesses]
        covers = []
        if owner_ids:
            covers = session.scalars(
                select(PortfolioImage)
                .where(PortfolioImage.artist_id.in_(owner_ids))
                .order_by(PortfolioImage.created_at.desc())
            ).all()
        cover_by_owner: dict[str, str] = {}
        for image in covers:
            cover_by_owner.setdefault(image.artist_id, image.url)
        payload = []
        for row in businesses:
            active_services = sorted(
                [service for service in row.services if service.active],
                key=lambda service: service.price_lyd,
            )
            payload.append(
                {
                    "name": row.name,
                    "slug": row.slug,
                    "specialty": row.owner.specialty,
                    "neighborhood": row.neighborhood or row.owner.neighborhood,
                    "bio": row.bio or row.owner.bio,
                    "avatarUrl": row.owner.avatar_url,
                    "cover": row.owner.cover_url or cover_by_owner.get(row.owner_id) or "",
                    "fromPrice": active_services[0].price_lyd if active_services else None,
                }
            )
        return jsonify(payload)
    finally:
        session.close()


@bp.get("/api/public/track/<code>")
def track(code: str):
    if database.SessionLocal is None:
        return _unavailable_db()
    track_code = normalize_track_code(code)
    if len(track_code) < 6:
        return jsonify({"error": "NOT_FOUND"}), 404
    session = database.SessionLocal()
    try:
        expire_overdue(session)
        booking = session.scalars(select(Booking).where(Booking.track_code == track_code).options(*TRACK_LOAD)).first()
        if not booking or booking.origin != "public":
            return jsonify({"error": "NOT_FOUND"}), 404
        if (
            not booking.bridey_pass_token
            and booking.confirmed_at
            and booking.status not in PASS_HIDDEN_STATUSES
        ):
            ensure_pass_token(session, booking)
            session.flush()
            booking = session.scalars(select(Booking).where(Booking.track_code == track_code).options(*TRACK_LOAD)).one()
        session.commit()
        artist = session.get(Artist, booking.artist_id)
        business = session.get(Business, booking.business_id) if booking.business_id else None
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
        available = pass_is_available(booking)
        payload = {
            "trackCode": booking.track_code,
            "status": booking.status,
            "date": booking.date,
            "startMin": booking.start_min,
            "endMin": booking.end_min,
            "expiresAt": iso(booking.expires_at),
            "scheduleMode": booking.schedule_mode,
            "shift": {
                "nameAr": booking.shift.name_ar,
                "nameEn": booking.shift.name_en,
                "startMin": booking.shift.start_min,
                "endMin": booking.shift.end_min,
            }
            if booking.shift
            else None,
            "artistName": (business.name if business else None) or (artist.name if artist else ""),
            "artistSlug": (business.slug if business else None) or (artist.slug if artist else ""),
            "assignments": [
                {
                    "serviceAr": row.service.name_ar if row.service else "",
                    "serviceEn": row.service.name_en if row.service else "",
                    "staffName": row.team_member.name if row.team_member else "",
                }
                for row in booking.assignments
            ],
            "services": services,
            "passAvailable": available,
        }
        if available:
            payload["brideName"] = booking.bride_name
            payload["passToken"] = booking.bridey_pass_token
        return jsonify(payload)
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
