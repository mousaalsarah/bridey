from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from bridey_api.constants import DAY_BUCKET
from bridey_api.errors import CapacityFullError, PreferredUnavailableError, is_unique_constraint
from bridey_api.ids import new_id
from bridey_api.models import CapacityHold


def claim_capacity_seats(
    session: Session,
    *,
    date: str,
    shift_id: str | None,
    booking_id: str,
    member_ids: list[str],
    members: list[dict],
    shift_capacity: int | None,
) -> None:
    unique_ids = list(dict.fromkeys(member_ids))
    for member_id in unique_ids:
        member = next((row for row in members if row["id"] == member_id), None)
        if not member:
            raise CapacityFullError()
        _claim_bucket(
            session,
            team_member_id=member_id,
            date=date,
            bucket=DAY_BUCKET,
            capacity=member["dailyCapacity"],
            booking_id=booking_id,
        )
        if shift_id:
            _claim_bucket(
                session,
                team_member_id=member_id,
                date=date,
                bucket=shift_id,
                capacity=shift_capacity if shift_capacity is not None else member["dailyCapacity"],
                booking_id=booking_id,
            )


def _claim_bucket(
    session: Session,
    *,
    team_member_id: str,
    date: str,
    bucket: str,
    capacity: int,
    booking_id: str,
) -> None:
    if capacity <= 0:
        raise CapacityFullError()
    existing = session.scalars(
        select(CapacityHold).where(
            CapacityHold.team_member_id == team_member_id,
            CapacityHold.date == date,
            CapacityHold.bucket == bucket,
        )
    ).all()
    taken = {row.seat for row in existing}
    for seat in range(capacity):
        if seat in taken:
            continue
        try:
            with session.begin_nested():
                session.add(
                    CapacityHold(
                        id=new_id(),
                        team_member_id=team_member_id,
                        date=date,
                        bucket=bucket,
                        seat=seat,
                        booking_id=booking_id,
                    )
                )
                session.flush()
            return
        except Exception as error:
            if is_unique_constraint(error):
                continue
            raise
    raise CapacityFullError()


def remaining_of(staff: dict) -> int:
    return max(0, min(staff["remainingDay"], staff["remainingShift"]))


def used_seats(session: Session, *, team_member_id: str, date: str, bucket: str) -> int:
    rows = session.scalars(
        select(CapacityHold).where(
            CapacityHold.team_member_id == team_member_id,
            CapacityHold.date == date,
            CapacityHold.bucket == bucket,
        )
    ).all()
    return len(rows)


def staff_snapshots(session: Session, business, date: str, shift_id: str | None) -> list[dict]:
    shift = next((row for row in business.shifts if row.id == shift_id and row.active), None) if shift_id else None
    members = [member for member in business.members if member.status == "ACTIVE"]
    rows = []
    for member in members:
        used_day = used_seats(session, team_member_id=member.id, date=date, bucket=DAY_BUCKET)
        used_shift = used_seats(session, team_member_id=member.id, date=date, bucket=shift.id) if shift else 0
        shift_cap = shift.capacity if shift and shift.capacity is not None else member.daily_capacity
        rows.append(
            {
                "id": member.id,
                "name": member.name,
                "dailyCapacity": member.daily_capacity,
                "shiftCapacity": shift.capacity if shift else None,
                "serviceIds": [item.service_id for item in member.services],
                "remainingDay": max(0, member.daily_capacity - used_day),
                "remainingShift": max(0, shift_cap - used_shift),
            }
        )
    return rows


def member_can_perform(member, service_id: str, kind: str | None = None) -> bool:
    from bridey_api.roles import member_matches_service_kind, parse_roles

    if kind:
        return member_matches_service_kind(parse_roles(member.roles), kind)
    return any(row.service_id == service_id for row in member.services)


def assign_staff(
    *,
    service_ids: list[str],
    staff: list[dict],
    preferred_member_id: str | None = None,
    preferred_by_service: dict | None = None,
    business,
) -> list[dict]:
    from bridey_api.errors import PreferredUnavailableError

    remaining = {row["id"]: remaining_of(row) for row in staff}
    assigned_this_booking: set[str] = set()
    result: list[dict] = []

    def kind_of(service_id: str) -> str | None:
        service = next((row for row in business.services if row.id == service_id), None)
        return service.kind if service else None

    def capable(service_id: str):
        return [
            row
            for row in staff
            if (member := next((item for item in business.members if item.id == row["id"]), None))
            and member_can_perform(member, service_id, kind_of(service_id))
        ]

    def take_member(member_id: str, service_id: str) -> None:
        if member_id not in assigned_this_booking:
            left = remaining.get(member_id, 0)
            if left < 1:
                raise CapacityFullError()
            remaining[member_id] = left - 1
            assigned_this_booking.add(member_id)
        result.append({"serviceId": service_id, "teamMemberId": member_id})

    preferred_map: dict[str, str] = {}
    if preferred_by_service:
        for service_id in service_ids:
            member_id = (preferred_by_service.get(service_id) or "").strip()
            if member_id:
                preferred_map[service_id] = member_id
    preferred = next((row for row in staff if row["id"] == preferred_member_id), None) if preferred_member_id else None
    if preferred_member_id and not preferred:
        raise PreferredUnavailableError()
    if preferred:
        for service_id in service_ids:
            member = next((item for item in business.members if item.id == preferred["id"]), None)
            if not preferred_map.get(service_id) and member and member_can_perform(member, service_id, kind_of(service_id)):
                preferred_map[service_id] = preferred["id"]

    leftover: list[str] = []
    for service_id in service_ids:
        preferred_id = preferred_map.get(service_id)
        if not preferred_id:
            leftover.append(service_id)
            continue
        snapshot = next((row for row in staff if row["id"] == preferred_id), None)
        biz_member = next((item for item in business.members if item.id == preferred_id), None)
        if not snapshot or not biz_member or not member_can_perform(biz_member, service_id, kind_of(service_id)):
            raise PreferredUnavailableError()
        if remaining_of(snapshot) < 1 and snapshot["id"] not in assigned_this_booking:
            raise PreferredUnavailableError()
        try:
            take_member(snapshot["id"], service_id)
        except CapacityFullError as error:
            raise PreferredUnavailableError() from error

    for service_id in leftover:
        options = capable(service_id)
        if not options:
            raise CapacityFullError("NO_STAFF")
        ranked = sorted(
            options,
            key=lambda row: (
                -(999 if row["id"] in assigned_this_booking else remaining.get(row["id"], 0)),
                row["name"],
            ),
        )
        pick = next((row for row in ranked if row["id"] in assigned_this_booking or remaining.get(row["id"], 0) > 0), None)
        if not pick:
            raise CapacityFullError()
        take_member(pick["id"], service_id)
    return result


def remaining_bookings_for_services(business, staff: list[dict], service_ids: list[str]) -> int:
    count = 0
    clone = [dict(row) for row in staff]
    for _ in range(40):
        try:
            assigned = assign_staff(service_ids=service_ids, staff=clone, business=business)
            used = {row["teamMemberId"] for row in assigned}
            for member_id in used:
                row = next((item for item in clone if item["id"] == member_id), None)
                if not row:
                    continue
                row["remainingDay"] = max(0, row["remainingDay"] - 1)
                row["remainingShift"] = max(0, row["remainingShift"] - 1)
            count += 1
        except (CapacityFullError, PreferredUnavailableError):
            break
    return count
