from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session, selectinload

from bridey_api.capacity import claim_capacity_seats
from bridey_api.constants import BLOCKING_STATUSES, DEFAULT_DAILY_CAPACITY
from bridey_api.errors import CapacityFullError, WorkspaceError
from bridey_api.ids import new_id
from bridey_api.models import (
    Artist,
    BlockedDate,
    Booking,
    BookingAssignment,
    Business,
    PlatformFee,
    Service,
    Shift,
    TeamMember,
    TeamMemberService,
    WeeklyHour,
)
from bridey_api.roles import default_capacity_for_roles, has_management_role, member_matches_service_kind, parse_roles, roles_from_specialty
from bridey_api.shifts import derive_shifts_from_window, typical_window

BUSINESS_LOAD = (
    selectinload(Business.owner),
    selectinload(Business.members).selectinload(TeamMember.services),
    selectinload(Business.members).selectinload(TeamMember.artist),
    selectinload(Business.shifts),
    selectinload(Business.hours),
    selectinload(Business.blocked),
    selectinload(Business.services),
)


def permissions_for(roles: list[str]) -> dict:
    manage = has_management_role(roles)
    return {
        "canManageBusiness": manage,
        "canManageTeam": manage,
        "canManageServices": manage,
        "canViewFees": manage,
        "canAssign": manage,
        "canSeeBrideContact": manage,
    }


def load_business(session: Session, business_id: str) -> Business:
    business = session.scalars(select(Business).where(Business.id == business_id).options(*BUSINESS_LOAD)).one()
    business.shifts.sort(key=lambda row: row.sort_order)
    return business


def unique_business_slug(session: Session, preferred: str, artist_id: str) -> str:
    slug = preferred
    for i in range(8):
        taken = session.scalar(select(Business).where(Business.slug == slug))
        if not taken:
            return slug
        slug = f"{preferred}-{artist_id[-4:].lower()}{'' if i == 0 else i}"
    return f"{preferred}-{int(datetime.now(timezone.utc).timestamp() * 1000):x}"


def sync_shifts_from_hours(session: Session, artist: Artist, business_id: str) -> list[Shift]:
    existing = session.scalars(select(Shift).where(Shift.business_id == business_id)).all()
    if existing:
        return sorted(existing, key=lambda row: row.sort_order)
    hours = session.scalars(
        select(WeeklyHour).where(or_(WeeklyHour.artist_id == artist.id, WeeklyHour.business_id == business_id))
    ).all()
    window = typical_window(hours)
    drafts = derive_shifts_from_window(window["startMin"], window["endMin"])
    for draft in drafts:
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
                capacity=None,
                active=True,
            )
        )
    session.flush()
    return session.scalars(select(Shift).where(Shift.business_id == business_id).order_by(Shift.sort_order.asc())).all()


def attach_existing_rows(session: Session, artist: Artist, business_id: str, member_id: str) -> None:
    session.execute(update(WeeklyHour).where(WeeklyHour.artist_id == artist.id, WeeklyHour.business_id.is_(None)).values(business_id=business_id))
    session.execute(update(BlockedDate).where(BlockedDate.artist_id == artist.id, BlockedDate.business_id.is_(None)).values(business_id=business_id))
    session.execute(update(Service).where(Service.artist_id == artist.id, Service.business_id.is_(None)).values(business_id=business_id))
    session.execute(update(Booking).where(Booking.artist_id == artist.id, Booking.business_id.is_(None)).values(business_id=business_id))
    session.execute(update(PlatformFee).where(PlatformFee.artist_id == artist.id, PlatformFee.business_id.is_(None)).values(business_id=business_id))
    session.flush()

    services = session.scalars(select(Service).where(Service.business_id == business_id)).all()
    for service in services:
        assigned = session.scalar(
            select(TeamMemberService).where(TeamMemberService.service_id == service.id)
        )
        if assigned:
            continue
        session.merge(TeamMemberService(team_member_id=member_id, service_id=service.id))

    shifts = session.scalars(select(Shift).where(Shift.business_id == business_id, Shift.active.is_(True))).all()
    bookings = session.scalars(
        select(Booking)
        .where(Booking.business_id == business_id)
        .options(selectinload(Booking.items), selectinload(Booking.assignments), selectinload(Booking.capacity_holds))
    ).all()
    member = session.get(TeamMember, member_id)
    for booking in bookings:
        if not booking.assignments:
            service_ids = [item.service_id for item in booking.items] if booking.items else [booking.service_id]
            for service_id in service_ids:
                exists = session.scalar(
                    select(BookingAssignment).where(
                        BookingAssignment.booking_id == booking.id,
                        BookingAssignment.service_id == service_id,
                    )
                )
                if not exists:
                    session.add(
                        BookingAssignment(
                            id=new_id(),
                            booking_id=booking.id,
                            team_member_id=member_id,
                            service_id=service_id,
                        )
                    )
        covering = [shift for shift in shifts if booking.start_min >= shift.start_min and booking.start_min < shift.end_min]
        shift_id = (covering[0].id if covering else None) or (shifts[0].id if shifts else None)
        if not booking.shift_id and shift_id and booking.schedule_mode != "HOURLY":
            booking.shift_id = shift_id
        if member and booking.status in BLOCKING_STATUSES and not booking.capacity_holds:
            try:
                claim_capacity_seats(
                    session,
                    date=booking.date,
                    shift_id=shift_id,
                    booking_id=booking.id,
                    member_ids=[member_id],
                    members=[{"id": member.id, "dailyCapacity": member.daily_capacity}],
                    shift_capacity=(covering[0].capacity if covering else None) or (shifts[0].capacity if shifts else None),
                )
            except CapacityFullError:
                pass
    session.flush()


def create_owned_business(session: Session, artist: Artist, input: dict | None = None) -> str:
    payload = input or {}
    slug = unique_business_slug(session, payload.get("slug") or artist.slug, artist.id)
    now = datetime.now(timezone.utc)
    business = Business(
        id=new_id(),
        owner_id=artist.id,
        name=(payload.get("name") or "").strip() or artist.name,
        slug=slug,
        business_type="salon" if payload.get("businessType") == "salon" else "independent",
        schedule_mode="SHIFT",
        assignment_mode="AUTO",
        neighborhood=artist.neighborhood,
        city=artist.city,
        phone=artist.phone,
        bio=artist.bio,
        booking_horizon_days=artist.booking_horizon_days,
        min_notice_hours=artist.min_notice_hours,
        created_at=now,
        updated_at=now,
    )
    session.add(business)
    session.flush()
    member = TeamMember(
        id=new_id(),
        business_id=business.id,
        artist_id=artist.id,
        name=artist.name,
        phone=artist.phone,
        roles=roles_from_specialty(artist.specialty),
        daily_capacity=DEFAULT_DAILY_CAPACITY,
        status="ACTIVE",
        created_at=now,
        updated_at=now,
    )
    session.add(member)
    session.flush()
    sync_shifts_from_hours(session, artist, business.id)
    attach_existing_rows(session, artist, business.id, member.id)
    return business.id


def load_workspace_by_member(session: Session, artist: Artist, member_id: str) -> dict:
    member_row = session.get(TeamMember, member_id)
    if not member_row or member_row.status != "ACTIVE":
        raise WorkspaceError("UNAUTHORIZED", 401)
    business = load_business(session, member_row.business_id)
    hydrated = next((row for row in business.members if row.id == member_row.id), None)
    if not hydrated:
        raise WorkspaceError("UNAUTHORIZED", 401)
    return {
        "artist": artist,
        "business": business,
        "member": hydrated,
        "permissions": permissions_for(parse_roles(hydrated.roles)),
    }


def ensure_workspace(session: Session, artist: Artist) -> dict:
    owned = session.scalar(select(Business).where(Business.owner_id == artist.id).order_by(Business.created_at.asc()))
    if owned:
        member = session.scalar(
            select(TeamMember).where(
                TeamMember.business_id == owned.id,
                TeamMember.artist_id == artist.id,
                TeamMember.status == "ACTIVE",
            )
        )
        if not member:
            now = datetime.now(timezone.utc)
            created = TeamMember(
                id=new_id(),
                business_id=owned.id,
                artist_id=artist.id,
                name=artist.name,
                phone=artist.phone,
                roles=roles_from_specialty(artist.specialty),
                daily_capacity=default_capacity_for_roles(roles_from_specialty(artist.specialty)),
                status="ACTIVE",
                created_at=now,
                updated_at=now,
            )
            session.add(created)
            session.flush()
            attach_existing_rows(session, artist, owned.id, created.id)
            sync_shifts_from_hours(session, artist, owned.id)
            return load_workspace_by_member(session, artist, created.id)
        sync_shifts_from_hours(session, artist, owned.id)
        attach_existing_rows(session, artist, owned.id, member.id)
        return load_workspace_by_member(session, artist, member.id)

    invited = session.scalar(
        select(TeamMember)
        .where(
            TeamMember.status == "ACTIVE",
            or_(TeamMember.artist_id == artist.id, (TeamMember.phone == artist.phone) & TeamMember.artist_id.is_(None)),
        )
        .order_by(TeamMember.created_at.asc())
    )
    if invited:
        if not invited.artist_id:
            invited.artist_id = artist.id
            invited.name = invited.name or artist.name
            invited.phone = artist.phone
            session.flush()
        return load_workspace_by_member(session, artist, invited.id)

    business_id = create_owned_business(session, artist)
    member = session.scalars(
        select(TeamMember).where(TeamMember.business_id == business_id, TeamMember.artist_id == artist.id)
    ).one()
    return load_workspace_by_member(session, artist, member.id)


def require_workspace(session: Session, artist: Artist) -> dict:
    return ensure_workspace(session, artist)


def sync_service_staff_by_role(session: Session, business_id: str) -> None:
    members = session.scalars(select(TeamMember).where(TeamMember.business_id == business_id, TeamMember.status == "ACTIVE")).all()
    services = session.scalars(
        select(Service).where(Service.business_id == business_id).options(selectinload(Service.staff))
    ).all()
    for service in services:
        eligible = {member.id for member in members if member_matches_service_kind(parse_roles(member.roles), service.kind)}
        current = {row.team_member_id for row in service.staff}
        to_add = eligible - current
        to_remove = current - eligible
        if to_remove:
            for row in list(service.staff):
                if row.team_member_id in to_remove:
                    session.delete(row)
        for team_member_id in to_add:
            session.add(TeamMemberService(team_member_id=team_member_id, service_id=service.id))
    session.flush()


def lock_business(session: Session, business_id: str) -> None:
    business = session.get(Business, business_id)
    if business:
        business.updated_at = datetime.now(timezone.utc)
        session.flush()


def lock_team_members(session: Session, ids: list[str]) -> None:
    now = datetime.now(timezone.utc)
    for member_id in dict.fromkeys(ids):
        member = session.get(TeamMember, member_id)
        if member:
            member.updated_at = now
    session.flush()


def find_business_by_slug(session: Session, slug: str):
    direct = session.scalars(select(Business).where(Business.slug == slug).options(*BUSINESS_LOAD)).first()
    if direct:
        direct.shifts.sort(key=lambda row: row.sort_order)
        return direct
    artist = session.scalar(select(Artist).where(Artist.slug == slug))
    if not artist:
        return None
    owned = session.scalar(select(Business).where(Business.owner_id == artist.id))
    if not owned and not artist.onboarding_complete:
        return None
    ws = ensure_workspace(session, artist)
    if ws["business"].owner_id != artist.id:
        return None
    return load_business(session, ws["business"].id)
