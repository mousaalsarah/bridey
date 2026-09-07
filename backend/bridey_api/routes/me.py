from flask import Blueprint, jsonify, request

from bridey_api import auth, fees, workspace
from bridey_api import db as database
from bridey_api.constants import SESSION_COOKIE
from bridey_api.errors import WorkspaceError
from bridey_api.expire import expire_overdue
from bridey_api.page_theme import clamp_horizon, clamp_notice, normalize_accent, normalize_cover_layout, normalize_page_style, social_handle
from bridey_api.phones import slugify
from bridey_api.serialize import to_json
from bridey_api.specialties import join_specialties
from bridey_api.studio import studio_payload
from bridey_api.models import Artist, Business
from sqlalchemy import select

bp = Blueprint("me", __name__)


def _unavailable():
    return jsonify({"error": "UNAVAILABLE"}), 503


@bp.get("/api/me")
def me_get():
    if database.SessionLocal is None:
        return _unavailable()
    session = database.SessionLocal()
    try:
        artist = auth.get_artist(session, request.cookies.get(SESSION_COOKIE))
        if not artist:
            return jsonify({"error": "UNAUTHORIZED"}), 401
        ws = workspace.require_workspace(session, artist)
        expire_overdue(session, ws["business"].owner_id)
        workspace.sync_service_staff_by_role(session, ws["business"].id)
        payload = studio_payload(session, ws)
        billing = fees.fee_snapshot(session, ws["business"].owner_id) if ws["permissions"]["canViewFees"] else None
        payload["billing"] = billing
        payload["outstanding"] = billing["outstanding"] if billing else 0
        session.commit()
        return jsonify(payload)
    except WorkspaceError as error:
        session.rollback()
        return jsonify({"error": error.args[0]}), error.status
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.patch("/api/me")
def me_patch():
    if database.SessionLocal is None:
        return _unavailable()
    session = database.SessionLocal()
    try:
        artist = auth.get_artist(session, request.cookies.get(SESSION_COOKIE))
        if not artist:
            return jsonify({"error": "UNAUTHORIZED"}), 401
        try:
            ws = workspace.require_workspace(session, artist)
        except WorkspaceError as error:
            return jsonify({"error": error.args[0]}), error.status

        body = request.get_json(silent=True) or {}
        if not isinstance(body, dict):
            body = {}

        if isinstance(body.get("name"), str):
            artist.name = body["name"]
        if isinstance(body.get("bio"), str):
            artist.bio = body["bio"]
        if isinstance(body.get("neighborhood"), str):
            artist.neighborhood = body["neighborhood"]
        if isinstance(body.get("avatarUrl"), str):
            artist.avatar_url = body["avatarUrl"]
        if isinstance(body.get("coverUrl"), str):
            artist.cover_url = body["coverUrl"]
        if isinstance(body.get("tagline"), str):
            artist.tagline = body["tagline"][:80]
        if isinstance(body.get("ctaLabel"), str):
            artist.cta_label = body["ctaLabel"][:80]
        if isinstance(body.get("snapchat"), str):
            artist.snapchat = social_handle(body["snapchat"])
        if isinstance(body.get("instagram"), str):
            artist.instagram = social_handle(body["instagram"])
        if isinstance(body.get("whatsapp"), str):
            artist.whatsapp = body["whatsapp"]
        if isinstance(body.get("pageStyle"), str):
            artist.page_style = normalize_page_style(body["pageStyle"])
        if isinstance(body.get("accent"), str):
            artist.accent = normalize_accent(body["accent"])
        if isinstance(body.get("coverLayout"), str):
            artist.cover_layout = normalize_cover_layout(body["coverLayout"])
        if isinstance(body.get("showHoursOnPage"), bool):
            artist.show_hours_on_page = body["showHoursOnPage"]
        if isinstance(body.get("bookingHorizonDays"), (int, float)):
            artist.booking_horizon_days = clamp_horizon(body["bookingHorizonDays"])
        if isinstance(body.get("minNoticeHours"), (int, float)):
            artist.min_notice_hours = clamp_notice(body["minNoticeHours"])
        if isinstance(body.get("specialties"), list) or isinstance(body.get("specialty"), (list, str)):
            artist.specialty = join_specialties(body.get("specialties") or body.get("specialty"))

        slug_accepted = False
        if isinstance(body.get("slug"), str) and ws["permissions"]["canManageBusiness"]:
            nxt = slugify(body["slug"]) or artist.slug
            taken_artist = session.scalar(select(Artist).where(Artist.slug == nxt, Artist.id != artist.id))
            taken_business = session.scalar(
                select(Business).where(Business.slug == nxt, Business.id != ws["business"].id)
            )
            if not taken_artist and not taken_business:
                artist.slug = nxt
                slug_accepted = True

        session.flush()
        if ws["permissions"]["canManageBusiness"]:
            business = ws["business"]
            if isinstance(body.get("businessName"), str):
                business.name = body["businessName"][:80]
            elif isinstance(body.get("name"), str):
                business.name = artist.name
            if slug_accepted:
                business.slug = artist.slug
            if isinstance(body.get("neighborhood"), str):
                business.neighborhood = artist.neighborhood
            if isinstance(body.get("bio"), str):
                business.bio = artist.bio
            if isinstance(body.get("bookingHorizonDays"), (int, float)):
                business.booking_horizon_days = artist.booking_horizon_days
            if isinstance(body.get("minNoticeHours"), (int, float)):
                business.min_notice_hours = artist.min_notice_hours

        session.commit()
        session.refresh(artist)
        return jsonify(to_json(artist, skip={"passwordHash"}))
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
