"""SQLAlchemy mapping of prisma/schema.prisma table names and camelCase columns.

Do not call Base.metadata.create_all() against the live database. Prisma remains
the schema owner until a later Alembic cutover.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Artist(Base):
    __tablename__ = "Artist"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column("passwordHash", String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    bio: Mapped[str] = mapped_column(String, default="")
    specialty: Mapped[str] = mapped_column(String, default="makeup")
    neighborhood: Mapped[str] = mapped_column(String, default="")
    city: Mapped[str] = mapped_column(String, default="Benghazi")
    avatar_url: Mapped[str] = mapped_column("avatarUrl", String, default="")
    cover_url: Mapped[str] = mapped_column("coverUrl", String, default="")
    tagline: Mapped[str] = mapped_column(String, default="")
    snapchat: Mapped[str] = mapped_column(String, default="")
    instagram: Mapped[str] = mapped_column(String, default="")
    whatsapp: Mapped[str] = mapped_column(String, default="")
    page_style: Mapped[str] = mapped_column("pageStyle", String, default="ivory")
    accent: Mapped[str] = mapped_column(String, default="gold")
    cover_layout: Mapped[str] = mapped_column("coverLayout", String, default="wide")
    cta_label: Mapped[str] = mapped_column("ctaLabel", String, default="")
    booking_horizon_days: Mapped[int] = mapped_column("bookingHorizonDays", Integer, default=21)
    min_notice_hours: Mapped[int] = mapped_column("minNoticeHours", Integer, default=2)
    show_hours_on_page: Mapped[bool] = mapped_column("showHoursOnPage", Boolean, default=True)
    onboarding_complete: Mapped[bool] = mapped_column("onboardingComplete", Boolean, default=False)
    is_demo: Mapped[bool] = mapped_column("isDemo", Boolean, default=False)
    created_at: Mapped[datetime | None] = mapped_column("createdAt", DateTime)
    updated_at: Mapped[datetime | None] = mapped_column("updatedAt", DateTime)

    owned_businesses: Mapped[list[Business]] = relationship(
        back_populates="owner",
        foreign_keys="Business.owner_id",
    )
    memberships: Mapped[list[TeamMember]] = relationship(back_populates="artist")


class Business(Base):
    __tablename__ = "Business"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    owner_id: Mapped[str] = mapped_column("ownerId", ForeignKey("Artist.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    business_type: Mapped[str] = mapped_column("businessType", String, default="independent")
    schedule_mode: Mapped[str] = mapped_column("scheduleMode", String, default="SHIFT")
    assignment_mode: Mapped[str] = mapped_column("assignmentMode", String, default="AUTO")
    neighborhood: Mapped[str] = mapped_column(String, default="")
    city: Mapped[str] = mapped_column(String, default="Benghazi")
    phone: Mapped[str] = mapped_column(String, default="")
    bio: Mapped[str] = mapped_column(String, default="")
    booking_horizon_days: Mapped[int] = mapped_column("bookingHorizonDays", Integer, default=21)
    min_notice_hours: Mapped[int] = mapped_column("minNoticeHours", Integer, default=2)
    status: Mapped[str] = mapped_column(String, default="ACTIVE")
    created_at: Mapped[datetime | None] = mapped_column("createdAt", DateTime)
    updated_at: Mapped[datetime | None] = mapped_column("updatedAt", DateTime)

    owner: Mapped[Artist] = relationship(back_populates="owned_businesses", foreign_keys=[owner_id])
    members: Mapped[list[TeamMember]] = relationship(back_populates="business")
    shifts: Mapped[list[Shift]] = relationship(back_populates="business", order_by="Shift.sort_order")
    hours: Mapped[list[WeeklyHour]] = relationship(back_populates="business")
    blocked: Mapped[list[BlockedDate]] = relationship(back_populates="business")
    services: Mapped[list[Service]] = relationship(back_populates="business")


class TeamMember(Base):
    __tablename__ = "TeamMember"
    __table_args__ = (UniqueConstraint("businessId", "artistId"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    business_id: Mapped[str] = mapped_column("businessId", ForeignKey("Business.id"), nullable=False, index=True)
    artist_id: Mapped[str | None] = mapped_column("artistId", ForeignKey("Artist.id"))
    name: Mapped[str] = mapped_column(String, nullable=False)
    phone: Mapped[str] = mapped_column(String, default="")
    roles: Mapped[str] = mapped_column(String, default="MAKEUP_ARTIST")
    daily_capacity: Mapped[int] = mapped_column("dailyCapacity", Integer, default=4)
    status: Mapped[str] = mapped_column(String, default="ACTIVE")
    created_at: Mapped[datetime | None] = mapped_column("createdAt", DateTime)
    updated_at: Mapped[datetime | None] = mapped_column("updatedAt", DateTime)

    business: Mapped[Business] = relationship(back_populates="members")
    artist: Mapped[Artist | None] = relationship(back_populates="memberships")
    services: Mapped[list[TeamMemberService]] = relationship(back_populates="team_member")
    assignments: Mapped[list[BookingAssignment]] = relationship(back_populates="team_member")
    holds: Mapped[list[CapacityHold]] = relationship(back_populates="team_member")


class TeamMemberService(Base):
    __tablename__ = "TeamMemberService"

    team_member_id: Mapped[str] = mapped_column("teamMemberId", ForeignKey("TeamMember.id"), primary_key=True)
    service_id: Mapped[str] = mapped_column("serviceId", ForeignKey("Service.id"), primary_key=True)

    team_member: Mapped[TeamMember] = relationship(back_populates="services")
    service: Mapped[Service] = relationship(back_populates="staff")


class Shift(Base):
    __tablename__ = "Shift"
    __table_args__ = (UniqueConstraint("businessId", "key"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    business_id: Mapped[str] = mapped_column("businessId", ForeignKey("Business.id"), nullable=False)
    key: Mapped[str] = mapped_column(String, nullable=False)
    name_ar: Mapped[str] = mapped_column("nameAr", String, nullable=False)
    name_en: Mapped[str] = mapped_column("nameEn", String, nullable=False)
    start_min: Mapped[int] = mapped_column("startMin", Integer, nullable=False)
    end_min: Mapped[int] = mapped_column("endMin", Integer, nullable=False)
    capacity: Mapped[int | None] = mapped_column(Integer)
    sort_order: Mapped[int] = mapped_column("sortOrder", Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    business: Mapped[Business] = relationship(back_populates="shifts")
    bookings: Mapped[list[Booking]] = relationship(back_populates="shift")


class Service(Base):
    __tablename__ = "Service"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    artist_id: Mapped[str] = mapped_column("artistId", ForeignKey("Artist.id"), nullable=False)
    business_id: Mapped[str | None] = mapped_column("businessId", ForeignKey("Business.id"), index=True)
    name_ar: Mapped[str] = mapped_column("nameAr", String, nullable=False)
    name_en: Mapped[str] = mapped_column("nameEn", String, nullable=False)
    description: Mapped[str] = mapped_column(String, default="")
    kind: Mapped[str] = mapped_column(String, default="bridal")
    duration_min: Mapped[int] = mapped_column("durationMin", Integer, nullable=False)
    price_lyd: Mapped[int] = mapped_column("priceLyd", Integer, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime | None] = mapped_column("createdAt", DateTime)

    business: Mapped[Business | None] = relationship(back_populates="services")
    staff: Mapped[list[TeamMemberService]] = relationship(back_populates="service")
    bookings: Mapped[list[Booking]] = relationship(back_populates="service")
    items: Mapped[list[BookingItem]] = relationship(back_populates="service")
    assignments: Mapped[list[BookingAssignment]] = relationship(back_populates="service")


class PortfolioImage(Base):
    __tablename__ = "PortfolioImage"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    artist_id: Mapped[str] = mapped_column("artistId", ForeignKey("Artist.id"), nullable=False)
    url: Mapped[str] = mapped_column(String, nullable=False)
    caption: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime | None] = mapped_column("createdAt", DateTime)


class WeeklyHour(Base):
    __tablename__ = "WeeklyHour"
    __table_args__ = (UniqueConstraint("artistId", "dayOfWeek"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    artist_id: Mapped[str] = mapped_column("artistId", ForeignKey("Artist.id"), nullable=False)
    business_id: Mapped[str | None] = mapped_column("businessId", ForeignKey("Business.id"), index=True)
    day_of_week: Mapped[int] = mapped_column("dayOfWeek", Integer, nullable=False)
    start_min: Mapped[int] = mapped_column("startMin", Integer, nullable=False)
    end_min: Mapped[int] = mapped_column("endMin", Integer, nullable=False)

    business: Mapped[Business | None] = relationship(back_populates="hours")


class BlockedDate(Base):
    __tablename__ = "BlockedDate"
    __table_args__ = (UniqueConstraint("artistId", "date"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    artist_id: Mapped[str] = mapped_column("artistId", ForeignKey("Artist.id"), nullable=False)
    business_id: Mapped[str | None] = mapped_column("businessId", ForeignKey("Business.id"), index=True)
    date: Mapped[str] = mapped_column(String, nullable=False)
    reason: Mapped[str] = mapped_column(String, default="")

    business: Mapped[Business | None] = relationship(back_populates="blocked")


class Booking(Base):
    __tablename__ = "Booking"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    artist_id: Mapped[str] = mapped_column("artistId", ForeignKey("Artist.id"), nullable=False, index=True)
    business_id: Mapped[str | None] = mapped_column("businessId", ForeignKey("Business.id"), index=True)
    service_id: Mapped[str] = mapped_column("serviceId", ForeignKey("Service.id"), nullable=False)
    shift_id: Mapped[str | None] = mapped_column("shiftId", ForeignKey("Shift.id"))
    schedule_mode: Mapped[str] = mapped_column("scheduleMode", String, default="HOURLY")
    track_code: Mapped[str | None] = mapped_column("trackCode", String, unique=True)
    origin: Mapped[str] = mapped_column(String, default="public")
    source: Mapped[str] = mapped_column(String, default="bridey")
    bride_name: Mapped[str] = mapped_column("brideName", String, nullable=False)
    bride_phone: Mapped[str] = mapped_column("bridePhone", String, nullable=False)
    notes: Mapped[str] = mapped_column(String, default="")
    artist_notes: Mapped[str] = mapped_column("artistNotes", String, default="")
    date: Mapped[str] = mapped_column(String, nullable=False)
    start_min: Mapped[int] = mapped_column("startMin", Integer, nullable=False)
    end_min: Mapped[int] = mapped_column("endMin", Integer, nullable=False)
    status: Mapped[str] = mapped_column(String, default="PENDING")
    platform_fee_lyd: Mapped[int] = mapped_column("platformFeeLyd", Integer, default=0)
    fee_status: Mapped[str] = mapped_column("feeStatus", String, default="NONE")
    confirmed_at: Mapped[datetime | None] = mapped_column("confirmedAt", DateTime)
    cancelled_at: Mapped[datetime | None] = mapped_column("cancelledAt", DateTime)
    expires_at: Mapped[datetime | None] = mapped_column("expiresAt", DateTime)
    bridey_pass_token: Mapped[str | None] = mapped_column("brideyPassToken", String, unique=True)
    checked_in_at: Mapped[datetime | None] = mapped_column("checkedInAt", DateTime)
    checked_in_by_id: Mapped[str] = mapped_column("checkedInById", String, default="")
    started_at: Mapped[datetime | None] = mapped_column("startedAt", DateTime)
    started_by_id: Mapped[str] = mapped_column("startedById", String, default="")
    completed_at: Mapped[datetime | None] = mapped_column("completedAt", DateTime)
    completed_by_id: Mapped[str] = mapped_column("completedById", String, default="")
    deposit_lyd: Mapped[int] = mapped_column("depositLyd", Integer, default=0)
    paid_lyd: Mapped[int] = mapped_column("paidLyd", Integer, default=0)
    paid_at: Mapped[datetime | None] = mapped_column("paidAt", DateTime)
    paid_by_id: Mapped[str] = mapped_column("paidById", String, default="")
    request_id: Mapped[str | None] = mapped_column("requestId", String, unique=True)
    created_at: Mapped[datetime | None] = mapped_column("createdAt", DateTime)

    service: Mapped[Service] = relationship(back_populates="bookings")
    shift: Mapped[Shift | None] = relationship(back_populates="bookings")
    items: Mapped[list[BookingItem]] = relationship(back_populates="booking")
    assignments: Mapped[list[BookingAssignment]] = relationship(back_populates="booking")
    fee: Mapped[PlatformFee | None] = relationship(back_populates="booking")
    holds: Mapped[list[SlotHold]] = relationship(back_populates="booking")
    capacity_holds: Mapped[list[CapacityHold]] = relationship(back_populates="booking")


class BookingAssignment(Base):
    __tablename__ = "BookingAssignment"
    __table_args__ = (UniqueConstraint("bookingId", "serviceId"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    booking_id: Mapped[str] = mapped_column("bookingId", ForeignKey("Booking.id"), nullable=False)
    team_member_id: Mapped[str] = mapped_column("teamMemberId", ForeignKey("TeamMember.id"), nullable=False, index=True)
    service_id: Mapped[str] = mapped_column("serviceId", ForeignKey("Service.id"), nullable=False)

    booking: Mapped[Booking] = relationship(back_populates="assignments")
    team_member: Mapped[TeamMember] = relationship(back_populates="assignments")
    service: Mapped[Service] = relationship(back_populates="assignments")


class CapacityHold(Base):
    __tablename__ = "CapacityHold"
    __table_args__ = (UniqueConstraint("teamMemberId", "date", "bucket", "seat"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    team_member_id: Mapped[str] = mapped_column("teamMemberId", ForeignKey("TeamMember.id"), nullable=False)
    date: Mapped[str] = mapped_column(String, nullable=False)
    bucket: Mapped[str] = mapped_column(String, nullable=False)
    seat: Mapped[int] = mapped_column(Integer, nullable=False)
    booking_id: Mapped[str] = mapped_column("bookingId", ForeignKey("Booking.id"), nullable=False, index=True)

    team_member: Mapped[TeamMember] = relationship(back_populates="holds")
    booking: Mapped[Booking] = relationship(back_populates="capacity_holds")


class SlotHold(Base):
    __tablename__ = "SlotHold"
    __table_args__ = (UniqueConstraint("artistId", "date", "startMin"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    artist_id: Mapped[str] = mapped_column("artistId", String, nullable=False)
    date: Mapped[str] = mapped_column(String, nullable=False)
    start_min: Mapped[int] = mapped_column("startMin", Integer, nullable=False)
    booking_id: Mapped[str] = mapped_column("bookingId", ForeignKey("Booking.id"), nullable=False, index=True)

    booking: Mapped[Booking] = relationship(back_populates="holds")


class PlatformFee(Base):
    __tablename__ = "PlatformFee"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    artist_id: Mapped[str] = mapped_column("artistId", ForeignKey("Artist.id"), nullable=False)
    business_id: Mapped[str | None] = mapped_column("businessId", ForeignKey("Business.id"), index=True)
    booking_id: Mapped[str] = mapped_column("bookingId", ForeignKey("Booking.id"), unique=True, nullable=False)
    invoice_id: Mapped[str | None] = mapped_column("invoiceId", ForeignKey("SubscriptionInvoice.id"), index=True)
    amount_lyd: Mapped[int] = mapped_column("amountLyd", Integer, nullable=False)
    status: Mapped[str] = mapped_column(String, default="UNPAID")
    created_at: Mapped[datetime | None] = mapped_column("createdAt", DateTime)
    paid_at: Mapped[datetime | None] = mapped_column("paidAt", DateTime)

    booking: Mapped[Booking] = relationship(back_populates="fee")
    invoice: Mapped[SubscriptionInvoice | None] = relationship(back_populates="fees")


class BookingItem(Base):
    __tablename__ = "BookingItem"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    booking_id: Mapped[str] = mapped_column("bookingId", ForeignKey("Booking.id"), nullable=False)
    service_id: Mapped[str] = mapped_column("serviceId", ForeignKey("Service.id"), nullable=False)
    team_member_id: Mapped[str | None] = mapped_column("teamMemberId", String)
    name_ar: Mapped[str] = mapped_column("nameAr", String, nullable=False)
    name_en: Mapped[str] = mapped_column("nameEn", String, nullable=False)
    duration_min: Mapped[int] = mapped_column("durationMin", Integer, nullable=False)
    price_lyd: Mapped[int] = mapped_column("priceLyd", Integer, nullable=False)

    booking: Mapped[Booking] = relationship(back_populates="items")
    service: Mapped[Service] = relationship(back_populates="items")


class Admin(Base):
    __tablename__ = "Admin"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    password_hash: Mapped[str] = mapped_column("passwordHash", String, nullable=False)
    created_at: Mapped[datetime | None] = mapped_column("createdAt", DateTime)


class SubscriptionPlan(Base):
    __tablename__ = "SubscriptionPlan"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    name_en: Mapped[str] = mapped_column("nameEn", String, default="")
    name_ar: Mapped[str] = mapped_column("nameAr", String, nullable=False)
    price_lyd: Mapped[int] = mapped_column("priceLyd", Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String, default="LYD")
    billing_interval: Mapped[str] = mapped_column("billingInterval", String, default="monthly")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime | None] = mapped_column("createdAt", DateTime)
    updated_at: Mapped[datetime | None] = mapped_column("updatedAt", DateTime)


class ArtistSubscription(Base):
    __tablename__ = "ArtistSubscription"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    artist_id: Mapped[str] = mapped_column("artistId", ForeignKey("Artist.id"), unique=True, nullable=False)
    plan_id: Mapped[str | None] = mapped_column("planId", ForeignKey("SubscriptionPlan.id"))
    status: Mapped[str] = mapped_column(String, default="ACTIVE", index=True)
    new_bookings_paused: Mapped[bool] = mapped_column("newBookingsPaused", Boolean, default=False)
    manual_suspend: Mapped[bool] = mapped_column("manualSuspend", Boolean, default=False)
    start_date: Mapped[str] = mapped_column("startDate", String, nullable=False)
    current_period_start: Mapped[str] = mapped_column("currentPeriodStart", String, nullable=False)
    current_period_end: Mapped[str] = mapped_column("currentPeriodEnd", String, nullable=False)
    next_payment_due_date: Mapped[str] = mapped_column("nextPaymentDueDate", String, nullable=False, index=True)
    grace_period_end_date: Mapped[str] = mapped_column("gracePeriodEndDate", String, nullable=False)
    created_at: Mapped[datetime | None] = mapped_column("createdAt", DateTime)
    updated_at: Mapped[datetime | None] = mapped_column("updatedAt", DateTime)


class SubscriptionInvoice(Base):
    __tablename__ = "SubscriptionInvoice"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    number: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    reference: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    artist_id: Mapped[str] = mapped_column("artistId", ForeignKey("Artist.id"), nullable=False, index=True)
    subscription_id: Mapped[str] = mapped_column("subscriptionId", ForeignKey("ArtistSubscription.id"), nullable=False)
    plan_id: Mapped[str] = mapped_column("planId", String, default="")
    period_start: Mapped[str] = mapped_column("periodStart", String, nullable=False)
    period_end: Mapped[str] = mapped_column("periodEnd", String, nullable=False)
    amount_lyd: Mapped[int] = mapped_column("amountLyd", Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String, default="LYD")
    due_date: Mapped[str] = mapped_column("dueDate", String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="UNPAID")
    created_at: Mapped[datetime | None] = mapped_column("createdAt", DateTime)
    updated_at: Mapped[datetime | None] = mapped_column("updatedAt", DateTime)

    fees: Mapped[list[PlatformFee]] = relationship(back_populates="invoice")
    payments: Mapped[list[SubscriptionPayment]] = relationship(back_populates="invoice")


class SubscriptionPayment(Base):
    __tablename__ = "SubscriptionPayment"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    artist_id: Mapped[str] = mapped_column("artistId", ForeignKey("Artist.id"), nullable=False, index=True)
    subscription_id: Mapped[str] = mapped_column("subscriptionId", ForeignKey("ArtistSubscription.id"), nullable=False)
    invoice_id: Mapped[str] = mapped_column("invoiceId", ForeignKey("SubscriptionInvoice.id"), nullable=False, index=True)
    amount_lyd: Mapped[int] = mapped_column("amountLyd", Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String, default="LYD")
    method: Mapped[str] = mapped_column(String, default="BANK_TRANSFER")
    status: Mapped[str] = mapped_column(String, default="PENDING", index=True)
    reference: Mapped[str] = mapped_column(String, default="")
    receipt_url: Mapped[str] = mapped_column("receiptUrl", String, default="")
    note: Mapped[str] = mapped_column(String, default="")
    paid_on: Mapped[str] = mapped_column("paidOn", String, default="")
    submitted_at: Mapped[datetime | None] = mapped_column("submittedAt", DateTime)
    reviewed_at: Mapped[datetime | None] = mapped_column("reviewedAt", DateTime)
    reviewed_by: Mapped[str] = mapped_column("reviewedBy", String, default="")
    rejection_reason: Mapped[str] = mapped_column("rejectionReason", String, default="")
    created_at: Mapped[datetime | None] = mapped_column("createdAt", DateTime)
    updated_at: Mapped[datetime | None] = mapped_column("updatedAt", DateTime)

    invoice: Mapped[SubscriptionInvoice] = relationship(back_populates="payments")
    artist: Mapped[Artist] = relationship(foreign_keys=[artist_id])


class PaymentSettings(Base):
    __tablename__ = "PaymentSettings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default="default")
    bank_name: Mapped[str] = mapped_column("bankName", String, default="")
    account_name: Mapped[str] = mapped_column("accountName", String, default="")
    account_number: Mapped[str] = mapped_column("accountNumber", String, default="")
    instructions: Mapped[str] = mapped_column(String, default="")
    supported_methods: Mapped[str] = mapped_column("supportedMethods", String, default="BANK_TRANSFER,E_PAYMENT,CASH")
    reminder_days: Mapped[int] = mapped_column("reminderDays", Integer, default=7)
    updated_at: Mapped[datetime | None] = mapped_column("updatedAt", DateTime)


class ArtistNotice(Base):
    __tablename__ = "ArtistNotice"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    artist_id: Mapped[str] = mapped_column("artistId", ForeignKey("Artist.id"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String, nullable=False)
    body_ar: Mapped[str] = mapped_column("bodyAr", String, nullable=False)
    body_en: Mapped[str] = mapped_column("bodyEn", String, nullable=False)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime | None] = mapped_column("createdAt", DateTime)


class AuditLog(Base):
    __tablename__ = "AuditLog"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    actor_type: Mapped[str] = mapped_column("actorType", String, nullable=False)
    actor_id: Mapped[str] = mapped_column("actorId", String, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False, index=True)
    artist_id: Mapped[str] = mapped_column("artistId", String, default="", index=True)
    payment_id: Mapped[str] = mapped_column("paymentId", String, default="")
    invoice_id: Mapped[str] = mapped_column("invoiceId", String, default="")
    reason: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime | None] = mapped_column("createdAt", DateTime)


class NumberSequence(Base):
    __tablename__ = "NumberSequence"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[int] = mapped_column(Integer, default=0)
