from __future__ import annotations

from datetime import datetime, timezone

from flask import Blueprint, jsonify, request
from sqlalchemy import or_, select

from bridey_api.constants import HOUR_PRESETS, TEAM_ROLES
from bridey_api.ids import new_id
from bridey_api.models import Artist, BlockedDate, Service, Shift, TeamMember, TeamMemberService, WeeklyHour
from bridey_api.phones import is_libya_phone, normalize_phone
from bridey_api.roles import default_capacity_for_roles, join_roles, member_matches_service_kind, parse_roles
from bridey_api.routes.helpers import open_session, require_artist, require_ws
from bridey_api.serialize import to_json
from bridey_api.shifts import derive_shifts_from_window, typical_window
from bridey_api.workspace import promote_to_salon_if_team, sync_service_staff_by_role

bp = Blueprint("studio", __name__)


@bp.post("/api/team")
def create_team_member():
    session, err = open_session()
    if err:
        return err
    try:
        artist, err = require_artist(session)
        if err:
            return err
        ws, err = require_ws(session, artist, "canManageTeam")
        if err:
            return err
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return jsonify({"error": "INVALID"}), 400
        name = body.get("name")
        roles_in = body.get("roles")
        if not isinstance(name, str) or not (2 <= len(name) <= 80) or not isinstance(roles_in, list) or not roles_in:
            return jsonify({"error": "INVALID"}), 400
        roles = join_roles([role for role in roles_in if isinstance(role, str) and role in TEAM_ROLES])
        raw_phone = body.get("phone") if isinstance(body.get("phone"), str) else ""
        phone = normalize_phone(raw_phone) if raw_phone else ""
        if phone and not is_libya_phone(phone):
            return jsonify({"error": "PHONE"}), 400
        if phone and (phone == artist.phone or phone == ws["member"].phone):
            return jsonify({"error": "DUPLICATE"}), 409
        if phone:
            duplicate = session.scalars(
                select(TeamMember)
                .where(TeamMember.business_id == ws["business"].id, TeamMember.status == "ACTIVE")
                .where(or_(TeamMember.phone == phone, TeamMember.artist.has(Artist.phone == phone)))
            ).first()
            if duplicate:
                return jsonify({"error": "DUPLICATE"}), 409
        linked = session.scalar(select(Artist).where(Artist.phone == phone)) if phone else None
        now = datetime.now(timezone.utc)
        capacity = body.get("dailyCapacity")
        if not isinstance(capacity, int):
            capacity = default_capacity_for_roles(parse_roles(roles))
        else:
            capacity = min(20, max(1, capacity))
        member = TeamMember(
            id=new_id(),
            business_id=ws["business"].id,
            artist_id=linked.id if linked else None,
            name=name.strip(),
            phone=phone or (linked.phone if linked else ""),
            roles=roles,
            daily_capacity=capacity,
            status="ACTIVE",
            created_at=now,
            updated_at=now,
        )
        session.add(member)
        session.flush()
        service_ids = [item for item in (body.get("serviceIds") or []) if isinstance(item, str) and item]
        if service_ids:
            services = session.scalars(
                select(Service).where(Service.business_id == ws["business"].id, Service.id.in_(service_ids))
            ).all()
        else:
            services = [
                service
                for service in session.scalars(
                    select(Service).where(Service.business_id == ws["business"].id, Service.active.is_(True))
                ).all()
                if member_matches_service_kind(parse_roles(roles), service.kind)
            ]
        for service in services:
            session.add(TeamMemberService(team_member_id=member.id, service_id=service.id))
        promote_to_salon_if_team(session, ws["business"].id)
        session.commit()
        session.refresh(member)
        return jsonify(to_json(member))
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.patch("/api/team/<member_id>")
def patch_team_member(member_id: str):
    session, err = open_session()
    if err:
        return err
    try:
        artist, err = require_artist(session)
        if err:
            return err
        ws, err = require_ws(session, artist, "canManageTeam")
        if err:
            return err
        member = session.scalar(
            select(TeamMember).where(TeamMember.id == member_id, TeamMember.business_id == ws["business"].id)
        )
        if not member:
            return jsonify({"error": "NOT_FOUND"}), 404
        body = request.get_json(silent=True) or {}
        if not isinstance(body, dict):
            body = {}
        if isinstance(body.get("name"), str) and len(body["name"].strip()) >= 2:
            member.name = body["name"].strip()
        if isinstance(body.get("dailyCapacity"), (int, float)):
            member.daily_capacity = min(20, max(1, round(body["dailyCapacity"])))
        if isinstance(body.get("status"), str) and body["status"] in {"ACTIVE", "INACTIVE"}:
            if member.artist_id == ws["business"].owner_id and body["status"] == "INACTIVE":
                return jsonify({"error": "OWNER"}), 400
            member.status = body["status"]
        if isinstance(body.get("roles"), list):
            roles = join_roles([role for role in body["roles"] if isinstance(role, str) and role in TEAM_ROLES])
            if member.artist_id == ws["business"].owner_id and "OWNER" not in parse_roles(roles):
                member.roles = f"OWNER,{roles}"
            else:
                member.roles = roles
        session.flush()
        if isinstance(body.get("roles"), list) and not isinstance(body.get("serviceIds"), list):
            session.query(TeamMemberService).filter(TeamMemberService.team_member_id == member_id).delete()
            services = session.scalars(
                select(Service).where(Service.business_id == ws["business"].id, Service.active.is_(True))
            ).all()
            for service in services:
                if member_matches_service_kind(parse_roles(member.roles), service.kind):
                    session.add(TeamMemberService(team_member_id=member_id, service_id=service.id))
        if isinstance(body.get("serviceIds"), list):
            session.query(TeamMemberService).filter(TeamMemberService.team_member_id == member_id).delete()
            services = session.scalars(
                select(Service).where(Service.business_id == ws["business"].id, Service.id.in_(body["serviceIds"] or [""]))
            ).all()
            for service in services:
                session.add(TeamMemberService(team_member_id=member_id, service_id=service.id))
        session.commit()
        session.refresh(member)
        return jsonify(to_json(member))
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.post("/api/services")
def create_service():
    session, err = open_session()
    if err:
        return err
    try:
        artist, err = require_artist(session)
        if err:
            return err
        ws, err = require_ws(session, artist, "canManageServices")
        if err:
            return err
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return jsonify({"error": "INVALID"}), 400
        name_ar = body.get("nameAr")
        duration = body.get("durationMin")
        price = body.get("priceLyd")
        if not isinstance(name_ar, str) or len(name_ar) < 2 or not isinstance(duration, (int, float)) or not (30 <= duration <= 480) or not isinstance(price, (int, float)) or price < 1:
            return jsonify({"error": "INVALID"}), 400
        kind = body.get("kind") if isinstance(body.get("kind"), str) else "other"
        name_en = body.get("nameEn") if isinstance(body.get("nameEn"), str) and body.get("nameEn") else name_ar
        service = Service(
            id=new_id(),
            artist_id=ws["business"].owner_id,
            business_id=ws["business"].id,
            name_ar=name_ar,
            name_en=name_en,
            description=body.get("description") if isinstance(body.get("description"), str) else "",
            kind=kind,
            duration_min=int(duration),
            price_lyd=int(price),
            created_at=datetime.now(timezone.utc),
        )
        session.add(service)
        session.flush()
        all_members = session.scalars(
            select(TeamMember).where(TeamMember.business_id == ws["business"].id, TeamMember.status == "ACTIVE")
        ).all()
        staff_ids = body.get("staffIds") if isinstance(body.get("staffIds"), list) and body.get("staffIds") else [
            member.id for member in all_members if member_matches_service_kind(parse_roles(member.roles), kind)
        ]
        members = [member for member in all_members if member.id in staff_ids]
        if members:
            for member in members:
                session.add(TeamMemberService(team_member_id=member.id, service_id=service.id))
        else:
            session.add(TeamMemberService(team_member_id=ws["member"].id, service_id=service.id))
        session.commit()
        session.refresh(service)
        return jsonify(to_json(service))
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.patch("/api/services/<service_id>")
def patch_service(service_id: str):
    session, err = open_session()
    if err:
        return err
    try:
        artist, err = require_artist(session)
        if err:
            return err
        ws, err = require_ws(session, artist, "canManageServices")
        if err:
            return err
        service = session.scalar(
            select(Service).where(Service.id == service_id, Service.business_id == ws["business"].id)
        )
        if not service:
            return jsonify({"error": "NOT_FOUND"}), 404
        body = request.get_json(silent=True) or {}
        if not isinstance(body, dict):
            body = {}
        if isinstance(body.get("nameAr"), str):
            service.name_ar = body["nameAr"]
        if isinstance(body.get("nameEn"), str):
            service.name_en = body["nameEn"]
        if isinstance(body.get("description"), str):
            service.description = body["description"]
        if isinstance(body.get("kind"), str):
            service.kind = body["kind"]
        if isinstance(body.get("durationMin"), (int, float)):
            service.duration_min = int(body["durationMin"])
        if isinstance(body.get("priceLyd"), (int, float)):
            service.price_lyd = int(body["priceLyd"])
        if isinstance(body.get("active"), bool):
            service.active = body["active"]
        session.flush()
        if isinstance(body.get("kind"), str) and not isinstance(body.get("staffIds"), list):
            sync_service_staff_by_role(session, ws["business"].id)
        if isinstance(body.get("staffIds"), list):
            session.query(TeamMemberService).filter(TeamMemberService.service_id == service_id).delete()
            kind = body["kind"] if isinstance(body.get("kind"), str) else service.kind
            members = session.scalars(
                select(TeamMember).where(
                    TeamMember.business_id == ws["business"].id,
                    TeamMember.id.in_(body["staffIds"] or [""]),
                    TeamMember.status == "ACTIVE",
                )
            ).all()
            for member in members:
                if member_matches_service_kind(parse_roles(member.roles), kind):
                    session.add(TeamMemberService(team_member_id=member.id, service_id=service_id))
        session.commit()
        session.refresh(service)
        return jsonify(to_json(service))
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.delete("/api/services/<service_id>")
def delete_service(service_id: str):
    session, err = open_session()
    if err:
        return err
    try:
        artist, err = require_artist(session)
        if err:
            return err
        ws, err = require_ws(session, artist, "canManageServices")
        if err:
            return err
        service = session.scalar(
            select(Service).where(Service.id == service_id, Service.business_id == ws["business"].id)
        )
        if not service:
            return jsonify({"error": "NOT_FOUND"}), 404
        service.active = False
        session.commit()
        return jsonify({"ok": True})
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.put("/api/hours")
def put_hours():
    session, err = open_session()
    if err:
        return err
    try:
        artist, err = require_artist(session)
        if err:
            return err
        ws, err = require_ws(session, artist, "canManageBusiness")
        if err:
            return err
        body = request.get_json(silent=True) or {}
        if not isinstance(body, dict):
            body = {}
        owner_id = ws["business"].owner_id
        business_id = ws["business"].id
        if isinstance(body.get("preset"), str):
            preset = next((row for row in HOUR_PRESETS if row["id"] == body["preset"]), None)
            if not preset:
                return jsonify({"error": "INVALID"}), 400
            session.query(WeeklyHour).filter(or_(WeeklyHour.artist_id == owner_id, WeeklyHour.business_id == business_id)).delete()
            for day in preset["days"]:
                session.add(
                    WeeklyHour(
                        id=new_id(),
                        artist_id=owner_id,
                        business_id=business_id,
                        day_of_week=day,
                        start_min=preset["startMin"],
                        end_min=preset["endMin"],
                    )
                )
            session.query(Shift).filter(Shift.business_id == business_id).delete()
            for draft in derive_shifts_from_window(preset["startMin"], preset["endMin"]):
                session.add(
                    Shift(
                        id=new_id(),
                        business_id=business_id,
                        key=draft["key"],
                        name_ar=draft["nameAr"],
                        name_en=draft["nameEn"],
                        start_min=draft["startMin"],
                        end_min=draft["endMin"],
                        sort_order=draft["sortOrder"],
                        active=True,
                    )
                )
        elif isinstance(body.get("hours"), list):
            session.query(WeeklyHour).filter(or_(WeeklyHour.artist_id == owner_id, WeeklyHour.business_id == business_id)).delete()
            rows = []
            for item in body["hours"]:
                if not isinstance(item, dict):
                    continue
                day = item.get("dayOfWeek")
                start = item.get("startMin")
                end = item.get("endMin")
                if isinstance(day, int) and isinstance(start, int) and isinstance(end, int) and end > start:
                    rows.append((day, start, end))
                    session.add(
                        WeeklyHour(
                            id=new_id(),
                            artist_id=owner_id,
                            business_id=business_id,
                            day_of_week=day,
                            start_min=start,
                            end_min=end,
                        )
                    )
            if not ws["business"].shifts:
                window = typical_window([(start, end) for _day, start, end in rows])
                for draft in derive_shifts_from_window(window["startMin"], window["endMin"]):
                    session.add(
                        Shift(
                            id=new_id(),
                            business_id=business_id,
                            key=draft["key"],
                            name_ar=draft["nameAr"],
                            name_en=draft["nameEn"],
                            start_min=draft["startMin"],
                            end_min=draft["endMin"],
                            sort_order=draft["sortOrder"],
                            active=True,
                        )
                    )
        if body.get("scheduleMode") in {"DAY", "SHIFT", "HOURLY"}:
            ws["business"].schedule_mode = body["scheduleMode"]
        if body.get("assignmentMode") in {"AUTO", "MANUAL"}:
            ws["business"].assignment_mode = body["assignmentMode"]
        if isinstance(body.get("dailyCapacity"), (int, float)):
            ws["member"].daily_capacity = min(20, max(1, round(body["dailyCapacity"])))
        if isinstance(body.get("shifts"), list):
            for shift in body["shifts"]:
                if not isinstance(shift, dict) or not isinstance(shift.get("id"), str):
                    continue
                existing = session.scalar(select(Shift).where(Shift.id == shift["id"], Shift.business_id == business_id))
                if not existing:
                    continue
                if isinstance(shift.get("nameAr"), str):
                    existing.name_ar = shift["nameAr"]
                if isinstance(shift.get("nameEn"), str):
                    existing.name_en = shift["nameEn"]
                if isinstance(shift.get("startMin"), int):
                    existing.start_min = shift["startMin"]
                if isinstance(shift.get("endMin"), int):
                    existing.end_min = shift["endMin"]
                if shift.get("capacity") in (None, ""):
                    existing.capacity = None
                elif isinstance(shift.get("capacity"), int):
                    existing.capacity = shift["capacity"]
                if isinstance(shift.get("active"), bool):
                    existing.active = shift["active"]
        session.commit()
        return jsonify({"ok": True})
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.post("/api/blocked")
def add_blocked():
    session, err = open_session()
    if err:
        return err
    try:
        artist, err = require_artist(session)
        if err:
            return err
        ws, err = require_ws(session, artist, "canManageBusiness")
        if err:
            return err
        body = request.get_json(silent=True) or {}
        date = body.get("date") if isinstance(body, dict) else None
        if not isinstance(date, str):
            return jsonify({"error": "INVALID"}), 400
        reason = body.get("reason") if isinstance(body.get("reason"), str) else ""
        row = session.scalar(
            select(BlockedDate).where(BlockedDate.artist_id == ws["business"].owner_id, BlockedDate.date == date)
        )
        if row:
            row.reason = reason
            row.business_id = ws["business"].id
        else:
            row = BlockedDate(
                id=new_id(),
                artist_id=ws["business"].owner_id,
                business_id=ws["business"].id,
                date=date,
                reason=reason,
            )
            session.add(row)
        session.commit()
        session.refresh(row)
        return jsonify(to_json(row))
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.delete("/api/blocked")
def remove_blocked():
    session, err = open_session()
    if err:
        return err
    try:
        artist, err = require_artist(session)
        if err:
            return err
        ws, err = require_ws(session, artist, "canManageBusiness")
        if err:
            return err
        body = request.get_json(silent=True) or {}
        date = body.get("date") if isinstance(body, dict) else None
        if not isinstance(date, str):
            return jsonify({"error": "INVALID"}), 400
        session.query(BlockedDate).filter(BlockedDate.date == date).filter(
            or_(BlockedDate.artist_id == ws["business"].owner_id, BlockedDate.business_id == ws["business"].id)
        ).delete()
        session.commit()
        return jsonify({"ok": True})
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
