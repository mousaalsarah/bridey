from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from bridey_api.dates import add_days_iso, days_between, month_end_iso, month_start_iso, next_month_start_iso, today_iso
from bridey_api.ids import new_id
from bridey_api.models import (
    ArtistNotice,
    ArtistSubscription,
    AuditLog,
    NumberSequence,
    PaymentSettings,
    PlatformFee,
    SubscriptionInvoice,
)
from bridey_api.serialize import to_json

GRACE_DAYS = 3
DUE_REMINDER_DAYS = 7


def can_create_new_bookings(account: ArtistSubscription) -> bool:
    if account.manual_suspend or account.new_bookings_paused:
        return False
    return account.status != "SUSPENDED"


def derive_status(
    *,
    status: str,
    next_payment_due_date: str,
    grace_period_end_date: str,
    reminder_days: int | None = None,
    today: str | None = None,
    has_open_balance: bool | None = None,
) -> str:
    if status == "PAYMENT_PENDING":
        return "PAYMENT_PENDING"
    if has_open_balance is False:
        return "ACTIVE"
    day = today or today_iso()
    reminder = reminder_days if reminder_days is not None else DUE_REMINDER_DAYS
    if day >= grace_period_end_date:
        return "SUSPENDED"
    if day > next_payment_due_date:
        return "GRACE_PERIOD"
    if day >= next_payment_due_date or days_between(day, next_payment_due_date) <= reminder:
        return "PAYMENT_DUE"
    return "ACTIVE"


def period_dates(iso: str) -> dict[str, str]:
    start = month_start_iso(iso)
    end = month_end_iso(iso)
    due = next_month_start_iso(iso)
    return {"start": start, "end": end, "due": due, "grace": add_days_iso(due, GRACE_DAYS)}


def next_document_number(session: Session, kind: str) -> str:
    year = today_iso()[:4]
    key = f"{kind}-{year}"
    row = session.get(NumberSequence, key)
    if row is None:
        row = NumberSequence(key=key, value=1)
        session.add(row)
    else:
        row.value += 1
    session.flush()
    return f"{kind}-{year}-{str(row.value).zfill(6)}"


def write_audit(session: Session, data: dict) -> None:
    session.add(
        AuditLog(
            id=new_id(),
            actor_type=data["actorType"],
            actor_id=data["actorId"],
            action=data["action"],
            artist_id=data.get("artistId") or "",
            payment_id=data.get("paymentId") or "",
            invoice_id=data.get("invoiceId") or "",
            reason=data.get("reason") or "",
        )
    )


def notify(session: Session, artist_id: str, kind: str, body_ar: str, body_en: str) -> None:
    session.add(ArtistNotice(id=new_id(), artist_id=artist_id, kind=kind, body_ar=body_ar, body_en=body_en))


def ensure_payment_settings(session: Session) -> PaymentSettings:
    row = session.get(PaymentSettings, "default")
    if row:
        return row
    row = PaymentSettings(
        id="default",
        bank_name="مصرف التجارة والتنمية",
        account_name="Bridey",
        account_number="1234567890",
        instructions="حوّلي المبلغ الظاهر بالضبط واحتفظي بإيصال التحويل.",
        supported_methods="BANK_TRANSFER,E_PAYMENT,CASH",
        reminder_days=7,
    )
    session.add(row)
    session.flush()
    return row


def ensure_fee_account(session: Session, artist_id: str) -> ArtistSubscription:
    today = today_iso()
    period = period_dates(today)
    existing = session.scalar(select(ArtistSubscription).where(ArtistSubscription.artist_id == artist_id))
    if existing:
        existing.current_period_start = period["start"]
        existing.current_period_end = period["end"]
        session.flush()
        return existing
    account = ArtistSubscription(
        id=new_id(),
        artist_id=artist_id,
        status="ACTIVE",
        new_bookings_paused=False,
        start_date=today,
        current_period_start=period["start"],
        current_period_end=period["end"],
        next_payment_due_date=period["due"],
        grace_period_end_date=period["grace"],
    )
    session.add(account)
    session.flush()
    return account


def _cancel_orphan_invoices(session: Session, artist_id: str) -> None:
    orphans = session.scalars(
        select(SubscriptionInvoice)
        .where(
            SubscriptionInvoice.artist_id == artist_id,
            SubscriptionInvoice.status.in_(["UNPAID", "OVERDUE", "PAYMENT_PENDING"]),
        )
        .options(selectinload(SubscriptionInvoice.fees))
    ).all()
    for invoice in orphans:
        if not invoice.fees:
            invoice.status = "CANCELLED"


def _create_fee_invoice(session: Session, args: dict) -> SubscriptionInvoice:
    invoice = SubscriptionInvoice(
        id=new_id(),
        number=next_document_number(session, "INV"),
        reference=next_document_number(session, "BRD"),
        artist_id=args["artistId"],
        subscription_id=args["subscriptionId"],
        period_start=args["periodStart"],
        period_end=args["periodEnd"],
        amount_lyd=0,
        due_date=args["dueDate"],
        status="UNPAID",
    )
    session.add(invoice)
    session.flush()
    return invoice


def _sync_invoice_amount(session: Session, invoice_id: str) -> SubscriptionInvoice | None:
    fees = session.scalars(
        select(PlatformFee).where(PlatformFee.invoice_id == invoice_id, PlatformFee.status == "UNPAID")
    ).all()
    amount = sum(fee.amount_lyd for fee in fees)
    invoice = session.get(SubscriptionInvoice, invoice_id)
    if invoice is None:
        return None
    if amount == 0 and invoice.status in {"UNPAID", "OVERDUE"}:
        invoice.amount_lyd = 0
        invoice.status = "CANCELLED"
        return None
    today = today_iso()
    if invoice.status not in {"PAYMENT_PENDING", "PAID", "CANCELLED"}:
        invoice.status = "OVERDUE" if today > invoice.due_date else "UNPAID"
    invoice.amount_lyd = amount
    return invoice


def _collect_unpaid_fees(session: Session, artist_id: str) -> None:
    account = ensure_fee_account(session, artist_id)
    _cancel_orphan_invoices(session, artist_id)
    loose = session.scalars(
        select(PlatformFee)
        .where(PlatformFee.artist_id == artist_id, PlatformFee.status == "UNPAID", PlatformFee.invoice_id.is_(None))
        .order_by(PlatformFee.created_at.asc())
    ).all()
    if not loose:
        return
    today = today_iso()
    current = period_dates(today)
    open_current = session.scalar(
        select(SubscriptionInvoice)
        .where(
            SubscriptionInvoice.subscription_id == account.id,
            SubscriptionInvoice.period_start == current["start"],
            SubscriptionInvoice.status.in_(["UNPAID", "OVERDUE"]),
        )
        .order_by(SubscriptionInvoice.created_at.desc())
    )
    invoice = open_current or _create_fee_invoice(
        session,
        {
            "artistId": artist_id,
            "subscriptionId": account.id,
            "periodStart": current["start"],
            "periodEnd": current["end"],
            "dueDate": current["due"],
        },
    )
    for fee in loose:
        fee.invoice_id = invoice.id
    _sync_invoice_amount(session, invoice.id)


def _notice_for_status(status: str, days_left: int, amount: int) -> dict | None:
    if status == "PAYMENT_DUE" and days_left == 0:
        return {
            "kind": "due_today",
            "ar": f"رسوم برايدي ({amount} د.ل) مستحقة اليوم.",
            "en": f"Your Bridey platform fees ({amount} LYD) are due today.",
        }
    if status == "PAYMENT_DUE":
        return {
            "kind": "due_soon",
            "ar": f"رسوم برايدي المتراكمة ({amount} د.ل) قرب موعد سدادها.",
            "en": f"Your accumulated Bridey fees ({amount} LYD) are due soon.",
        }
    if status == "GRACE_PERIOD":
        return {
            "kind": "grace",
            "ar": f"رسوم برايدي متأخرة. باقي {days_left} يوم قبل ما يتوقف استقبال الحجوزات الجديدة.",
            "en": f"Your platform fees are overdue. You have {days_left} days remaining before new booking access is paused.",
        }
    if status == "SUSPENDED":
        return {
            "kind": "suspended",
            "ar": "رسوم برايدي متأخرة، واستقبال الحجوزات الجديدة متوقف مؤقتاً. حجوزاتك الحالية باقية.",
            "en": "Your platform fees are overdue and new booking access has been paused. Existing bookings remain available.",
        }
    return None


def refresh_fee_account(session: Session, artist_id: str) -> ArtistSubscription:
    ensure_payment_settings(session)
    settings = session.get(PaymentSettings, "default")
    account = ensure_fee_account(session, artist_id)
    _collect_unpaid_fees(session, artist_id)

    open_invoices = session.scalars(
        select(SubscriptionInvoice)
        .where(
            SubscriptionInvoice.artist_id == artist_id,
            SubscriptionInvoice.status.in_(["UNPAID", "OVERDUE", "PAYMENT_PENDING"]),
            SubscriptionInvoice.amount_lyd > 0,
        )
        .order_by(SubscriptionInvoice.due_date.asc())
    ).all()
    for invoice in open_invoices:
        _sync_invoice_amount(session, invoice.id)
    open_rows = session.scalars(
        select(SubscriptionInvoice)
        .where(
            SubscriptionInvoice.artist_id == artist_id,
            SubscriptionInvoice.status.in_(["UNPAID", "OVERDUE", "PAYMENT_PENDING"]),
            SubscriptionInvoice.amount_lyd > 0,
        )
        .order_by(SubscriptionInvoice.due_date.asc())
    ).all()
    oldest = open_rows[0] if open_rows else None
    today = today_iso()
    due = oldest.due_date if oldest else account.next_payment_due_date
    grace = add_days_iso(oldest.due_date, GRACE_DAYS) if oldest else account.grace_period_end_date
    pending = any(invoice.status == "PAYMENT_PENDING" for invoice in open_rows) or account.status == "PAYMENT_PENDING"
    nxt = (
        "SUSPENDED"
        if account.manual_suspend
        else derive_status(
            status="PAYMENT_PENDING" if pending else "ACTIVE",
            next_payment_due_date=due,
            grace_period_end_date=grace,
            reminder_days=settings.reminder_days if settings else None,
            today=today,
            has_open_balance=bool(oldest),
        )
    )
    paused = account.manual_suspend or nxt == "SUSPENDED"
    if (
        nxt != account.status
        or paused != account.new_bookings_paused
        or due != account.next_payment_due_date
        or grace != account.grace_period_end_date
    ):
        account.status = nxt
        account.new_bookings_paused = paused
        account.next_payment_due_date = due
        account.grace_period_end_date = grace
        days_left = max(0, days_between(today, grace))
        note = _notice_for_status(nxt, days_left, oldest.amount_lyd if oldest else 0)
        if note and nxt != "PAYMENT_PENDING":
            notify(session, artist_id, note["kind"], note["ar"], note["en"])
        if nxt == "SUSPENDED":
            write_audit(session, {"actorType": "system", "actorId": "system", "action": "fees_suspended", "artistId": artist_id})
    session.flush()
    return session.scalars(select(ArtistSubscription).where(ArtistSubscription.artist_id == artist_id)).one()


def fee_snapshot(session: Session, artist_id: str) -> dict:
    account = refresh_fee_account(session, artist_id)
    settings = ensure_payment_settings(session)
    invoices = session.scalars(
        select(SubscriptionInvoice)
        .where(SubscriptionInvoice.artist_id == artist_id, SubscriptionInvoice.status != "CANCELLED")
        .options(selectinload(SubscriptionInvoice.payments), selectinload(SubscriptionInvoice.fees).selectinload(PlatformFee.booking))
        .order_by(SubscriptionInvoice.created_at.desc())
    ).all()
    notices = session.scalars(
        select(ArtistNotice)
        .where(ArtistNotice.artist_id == artist_id, ArtistNotice.read.is_(False))
        .order_by(ArtistNotice.created_at.desc())
        .limit(8)
    ).all()
    open_invoice = next((invoice for invoice in invoices if invoice.status in {"UNPAID", "PAYMENT_PENDING", "OVERDUE"}), None)
    today = today_iso()
    unpaid = session.scalars(
        select(PlatformFee).where(PlatformFee.artist_id == artist_id, PlatformFee.status == "UNPAID")
    ).all()
    outstanding = sum(fee.amount_lyd for fee in unpaid)
    account_json = to_json(account)
    account_json["canCreateBookings"] = can_create_new_bookings(account)
    account_json["daysUntilDue"] = days_between(today, account.next_payment_due_date)
    account_json["graceDaysLeft"] = max(0, days_between(today, account.grace_period_end_date))
    return {
        "account": account_json,
        "settings": {
            "bankName": settings.bank_name,
            "accountName": settings.account_name,
            "accountNumber": settings.account_number,
            "instructions": settings.instructions,
            "supportedMethods": [item for item in settings.supported_methods.split(",") if item],
        },
        "openInvoice": _invoice_json(open_invoice) if open_invoice else None,
        "invoices": [_invoice_json(invoice) for invoice in invoices],
        "notices": [to_json(notice) for notice in notices],
        "outstanding": outstanding,
    }


def _invoice_json(invoice: SubscriptionInvoice) -> dict:
    payload = to_json(invoice)
    payload["payments"] = [to_json(row) for row in invoice.payments]
    payload["fees"] = []
    for fee in invoice.fees:
        row = to_json(fee)
        if fee.booking:
            row["booking"] = {
                "id": fee.booking.id,
                "brideName": fee.booking.bride_name,
                "date": fee.booking.date,
                "trackCode": fee.booking.track_code,
            }
        payload["fees"].append(row)
    return payload
