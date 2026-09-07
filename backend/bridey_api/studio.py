from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from bridey_api.models import BlockedDate, Booking, BookingAssignment, PlatformFee, PortfolioImage, Service, WeeklyHour
from bridey_api.privacy import present_booking
from bridey_api.roles import parse_roles
from bridey_api.serialize import to_json


def studio_payload(session: Session, workspace: dict) -> dict:
    artist = workspace["artist"]
    business = workspace["business"]
    member = workspace["member"]
    permissions = workspace["permissions"]

    services = session.scalars(
        select(Service)
        .where(Service.business_id == business.id)
        .options(selectinload(Service.staff))
        .order_by(Service.created_at.asc())
    ).all()
    portfolio = session.scalars(
        select(PortfolioImage).where(PortfolioImage.artist_id == business.owner_id).order_by(PortfolioImage.created_at.desc())
    ).all()

    booking_query = (
        select(Booking)
        .where(Booking.business_id == business.id)
        .options(
            selectinload(Booking.service),
            selectinload(Booking.items),
            selectinload(Booking.fee),
            selectinload(Booking.shift),
            selectinload(Booking.assignments).selectinload(BookingAssignment.team_member),
        )
        .order_by(Booking.date.asc(), Booking.start_min.asc())
    )
    if not permissions["canManageBusiness"]:
        booking_query = booking_query.where(
            Booking.assignments.any(BookingAssignment.team_member_id == member.id)
        )
    bookings = session.scalars(booking_query).all()

    fees: list = []
    if permissions["canViewFees"]:
        fee_rows = session.scalars(
            select(PlatformFee)
            .where(PlatformFee.business_id == business.id)
            .options(selectinload(PlatformFee.booking))
            .order_by(PlatformFee.created_at.desc())
        ).all()
        for fee in fee_rows:
            row = to_json(fee)
            if fee.booking:
                row["booking"] = {
                    "id": fee.booking.id,
                    "brideName": fee.booking.bride_name,
                    "date": fee.booking.date,
                    "trackCode": fee.booking.track_code,
                    "origin": fee.booking.origin,
                }
            fees.append(row)

    hours = [to_json(row) for row in business.hours] or [
        to_json(row)
        for row in session.scalars(select(WeeklyHour).where(WeeklyHour.artist_id == business.owner_id)).all()
    ]
    blocked = [to_json(row) for row in business.blocked] or [
        to_json(row)
        for row in session.scalars(select(BlockedDate).where(BlockedDate.artist_id == business.owner_id)).all()
    ]

    if permissions["canManageTeam"]:
        members = [
            {
                "id": row.id,
                "artistId": row.artist_id,
                "name": row.name,
                "phone": row.phone,
                "roles": parse_roles(row.roles),
                "dailyCapacity": row.daily_capacity,
                "status": row.status,
                "serviceIds": [item.service_id for item in row.services],
            }
            for row in business.members
        ]
    else:
        members = [
            {
                "id": row.id,
                "artistId": row.artist_id,
                "name": row.name,
                "phone": "",
                "roles": parse_roles(row.roles),
                "dailyCapacity": row.daily_capacity,
                "status": row.status,
                "serviceIds": [item.service_id for item in row.services],
            }
            for row in business.members
            if row.status == "ACTIVE"
        ]

    viewer = {"memberId": member.id, "canManageBusiness": permissions["canManageBusiness"]}
    presented = []
    for booking in bookings:
        payload = to_json(booking)
        payload["service"] = to_json(booking.service)
        payload["items"] = [to_json(item) for item in booking.items]
        payload["fee"] = to_json(booking.fee) if booking.fee else None
        payload["shift"] = to_json(booking.shift) if booking.shift else None
        payload["assignments"] = []
        for assignment in booking.assignments:
            payload["assignments"].append(
                {
                    "id": assignment.id,
                    "bookingId": assignment.booking_id,
                    "teamMemberId": assignment.team_member_id,
                    "serviceId": assignment.service_id,
                    "teamMember": {
                        "id": assignment.team_member.id,
                        "name": assignment.team_member.name,
                        "roles": assignment.team_member.roles,
                    }
                    if assignment.team_member
                    else None,
                }
            )
        presented.append(present_booking(payload, viewer))

    return {
        "artist": to_json(artist, skip={"passwordHash"}),
        "business": {
            "id": business.id,
            "name": business.name,
            "slug": business.slug,
            "businessType": business.business_type,
            "scheduleMode": business.schedule_mode,
            "assignmentMode": business.assignment_mode,
            "neighborhood": business.neighborhood,
        },
        "member": {
            "id": member.id,
            "name": member.name,
            "roles": parse_roles(member.roles),
            "dailyCapacity": member.daily_capacity,
            "status": member.status,
        },
        "permissions": permissions,
        "members": members,
        "shifts": [to_json(row) for row in sorted(business.shifts, key=lambda item: item.sort_order)],
        "services": [
            {**to_json(service), "staffIds": [row.team_member_id for row in service.staff], "staff": [to_json(row) for row in service.staff]}
            for service in services
        ],
        "portfolio": [to_json(row) for row in portfolio],
        "hours": hours,
        "blocked": blocked,
        "bookings": presented,
        "fees": fees,
    }
