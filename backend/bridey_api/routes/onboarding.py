from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from sqlalchemy import delete, or_, select

from bridey_api import auth, workspace
from bridey_api import db as database
from bridey_api.constants import HOUR_PRESETS, SESSION_COOKIE
from bridey_api.ids import new_id
from bridey_api.models import Artist, Business, Service, Shift, TeamMemberService, WeeklyHour
from bridey_api.phones import slugify
from bridey_api.shifts import derive_shifts_from_window
from bridey_api.specialties import join_specialties

bp = Blueprint("onboarding", __name__)


def _preset(hours_preset: str) -> dict:
    return next((row for row in HOUR_PRESETS if row["id"] == hours_preset), HOUR_PRESETS[0])


def _valid_service(row) -> dict | None:
    if not isinstance(row, dict):
        return None
    name_ar = row.get("nameAr")
    duration = row.get("durationMin")
    price = row.get("priceLyd")
    if not isinstance(name_ar, str) or len(name_ar) < 2:
        return None
    if not isinstance(duration, (int, float)) or duration < 30 or duration > 480:
        return None
    if not isinstance(price, (int, float)) or price < 1 or price > 50000:
        return None
    name_en = row.get("nameEn") if isinstance(row.get("nameEn"), str) and row.get("nameEn") else name_ar
    kind = row.get("kind") if isinstance(row.get("kind"), str) and row.get("kind") else "bridal"
    return {
        "nameAr": name_ar,
        "nameEn": name_en,
        "kind": kind,
        "durationMin": int(duration),
        "priceLyd": int(price),
    }


@bp.post("/api/onboarding")
def onboarding():
    if database.SessionLocal is None:
        return jsonify({"error": "UNAVAILABLE"}), 503
    session = database.SessionLocal()
    try:
        artist = auth.get_artist(session, request.cookies.get(SESSION_COOKIE))
        if not artist:
            return jsonify({"error": "UNAUTHORIZED"}), 401
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return jsonify({"error": "INVALID"}), 400
        neighborhood = body.get("neighborhood")
        hours_preset = body.get("hoursPreset")
        services_raw = body.get("services")
        if not isinstance(neighborhood, str) or not isinstance(hours_preset, str) or not isinstance(services_raw, list):
            return jsonify({"error": "INVALID"}), 400
        services = [parsed for parsed in (_valid_service(row) for row in services_raw) if parsed]
        if not services or len(services_raw) < 1 or len(services_raw) > 8 or len(services) != len(services_raw):
            return jsonify({"error": "INVALID"}), 400

        preset = _preset(hours_preset)
        slug = slugify(body["slug"]) if isinstance(body.get("slug"), str) and body.get("slug") else artist.slug
        taken = session.scalar(select(Artist).where(Artist.slug == slug, Artist.id != artist.id))
        taken_biz = session.scalar(select(Business).where(Business.slug == slug))
        if taken or (taken_biz and taken_biz.owner_id != artist.id):
            slug = f"{slug}-{artist.phone[-4:]}"

        artist.specialty = join_specialties(body.get("specialties") or body.get("specialty") or ["makeup"])
        artist.neighborhood = neighborhood
        artist.bio = body.get("bio") if isinstance(body.get("bio"), str) else ""
        artist.snapchat = body.get("snapchat") if isinstance(body.get("snapchat"), str) else ""
        artist.slug = slug
        artist.onboarding_complete = True
        session.flush()

        ws = workspace.ensure_workspace(session, artist)
        if ws["business"].owner_id != artist.id:
            workspace.create_owned_business(
                session,
                artist,
                {
                    "name": body.get("businessName"),
                    "businessType": body.get("businessType"),
                    "slug": slug,
                },
            )
            session.refresh(artist)
            ws = workspace.ensure_workspace(session, artist)

        business = ws["business"]
        business.name = (body.get("businessName") or "").strip() if isinstance(body.get("businessName"), str) else artist.name
        if isinstance(body.get("businessName"), str) and body["businessName"].strip():
            business.name = body["businessName"].strip()
        else:
            business.name = artist.name
        business.slug = slug
        business.business_type = "salon" if body.get("businessType") == "salon" else "independent"
        business.neighborhood = neighborhood
        business.bio = artist.bio
        session.flush()

        session.execute(
            delete(WeeklyHour).where(or_(WeeklyHour.artist_id == artist.id, WeeklyHour.business_id == business.id))
        )
        now = datetime.now(timezone.utc)
        for day in preset["days"]:
            session.add(
                WeeklyHour(
                    id=new_id(),
                    artist_id=artist.id,
                    business_id=business.id,
                    day_of_week=day,
                    start_min=preset["startMin"],
                    end_min=preset["endMin"],
                )
            )
        session.execute(delete(Shift).where(Shift.business_id == business.id))
        for index, shift in enumerate(derive_shifts_from_window(preset["startMin"], preset["endMin"])):
            session.add(
                Shift(
                    id=new_id(),
                    business_id=business.id,
                    key=shift["key"],
                    name_ar=shift["nameAr"],
                    name_en=shift["nameEn"],
                    start_min=shift["startMin"],
                    end_min=shift["endMin"],
                    sort_order=shift["sortOrder"],
                    active=True,
                )
            )
            _ = index
        for service in services:
            created = Service(
                id=new_id(),
                artist_id=artist.id,
                business_id=business.id,
                name_ar=service["nameAr"],
                name_en=service["nameEn"],
                kind=service["kind"],
                duration_min=service["durationMin"],
                price_lyd=service["priceLyd"],
                created_at=now,
            )
            session.add(created)
            session.flush()
            link = session.get(TeamMemberService, (ws["member"].id, created.id))
            if not link:
                session.add(TeamMemberService(team_member_id=ws["member"].id, service_id=created.id))

        session.commit()
        return jsonify({"slug": slug, "ok": True})
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
