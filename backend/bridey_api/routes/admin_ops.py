from datetime import datetime

from flask import Blueprint, jsonify, request
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from bridey_api.dates import shift_month, today_iso
from bridey_api.errors import FeeError
from bridey_api.fees import admin_override, confirm_payment, ensure_payment_settings, fee_snapshot, refresh_fee_account, reject_payment, write_audit
from bridey_api.models import Artist, ArtistSubscription, AuditLog, PlatformFee, SubscriptionPayment
from bridey_api.revenue import available_months, month_bounds, revenue_for_month, revenue_trend
from bridey_api.routes.helpers import open_session, require_admin
from bridey_api.serialize import to_json

bp = Blueprint("admin_ops", __name__)


def _change(now: int, then: int) -> int:
    if not then and not now:
        return 0
    if not then:
        return 100
    return round(((now - then) / then) * 100)


@bp.get("/api/admin/overview")
def overview():
    session, err = open_session()
    if err:
        return err
    try:
        admin, err = require_admin(session)
        if err:
            return err
        _ = admin
        artist_ids = list(session.scalars(select(Artist.id)))
        for artist_id in artist_ids:
            refresh_fee_account(session, artist_id)
        total_artists = session.scalar(select(func.count()).select_from(Artist)) or 0
        status_rows = session.execute(
            select(ArtistSubscription.status, func.count()).group_by(ArtistSubscription.status)
        ).all()
        counts = {status: count for status, count in status_rows}
        pending_payments = session.scalar(
            select(func.count()).select_from(SubscriptionPayment).where(SubscriptionPayment.status == "PENDING")
        ) or 0
        month_start = datetime.fromisoformat(f"{today_iso()[:7]}-01T00:00:00")
        paid = session.execute(
            select(func.coalesce(func.sum(SubscriptionPayment.amount_lyd), 0), func.count()).where(
                SubscriptionPayment.status == "CONFIRMED",
                SubscriptionPayment.reviewed_at >= month_start,
            )
        ).one()
        outstanding = session.scalar(
            select(func.coalesce(func.sum(PlatformFee.amount_lyd), 0)).where(PlatformFee.status == "UNPAID")
        ) or 0
        session.commit()
        return jsonify(
            {
                "totalArtists": total_artists,
                "active": counts.get("ACTIVE") or 0,
                "paymentDue": counts.get("PAYMENT_DUE") or 0,
                "gracePeriod": counts.get("GRACE_PERIOD") or 0,
                "paymentPending": counts.get("PAYMENT_PENDING") or 0,
                "suspended": counts.get("SUSPENDED") or 0,
                "pendingPayments": pending_payments,
                "monthlyRevenue": int(paid[0] or 0),
                "monthlyPaidCount": int(paid[1] or 0),
                "outstandingFees": int(outstanding or 0),
            }
        )
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.get("/api/admin/artists")
def list_artists():
    session, err = open_session()
    if err:
        return err
    try:
        admin, err = require_admin(session)
        if err:
            return err
        _ = admin
        status = request.args.get("status") or ""
        artists = session.scalars(select(Artist).order_by(Artist.created_at.desc())).all()
        rows = []
        for artist in artists:
            account = refresh_fee_account(session, artist.id)
            if status and account.status != status:
                continue
            outstanding = session.scalar(
                select(func.coalesce(func.sum(PlatformFee.amount_lyd), 0)).where(
                    PlatformFee.artist_id == artist.id,
                    PlatformFee.status == "UNPAID",
                )
            ) or 0
            rows.append(
                {
                    "id": artist.id,
                    "name": artist.name,
                    "slug": artist.slug,
                    "phone": artist.phone,
                    "isDemo": artist.is_demo,
                    "status": account.status,
                    "outstanding": int(outstanding),
                    "nextPaymentDueDate": account.next_payment_due_date,
                    "newBookingsPaused": account.new_bookings_paused,
                }
            )
        session.commit()
        return jsonify(rows)
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.get("/api/admin/artists/<artist_id>")
def get_artist(artist_id: str):
    session, err = open_session()
    if err:
        return err
    try:
        admin, err = require_admin(session)
        if err:
            return err
        _ = admin
        artist = session.get(Artist, artist_id)
        if not artist:
            return jsonify({"error": "NOT_FOUND"}), 404
        billing = fee_snapshot(session, artist_id)
        logs = session.scalars(
            select(AuditLog).where(AuditLog.artist_id == artist_id).order_by(AuditLog.created_at.desc()).limit(30)
        ).all()
        session.commit()
        return jsonify(
            {
                "artist": {
                    "id": artist.id,
                    "name": artist.name,
                    "slug": artist.slug,
                    "phone": artist.phone,
                    "isDemo": artist.is_demo,
                },
                **billing,
                "logs": [to_json(row) for row in logs],
            }
        )
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.post("/api/admin/artists/<artist_id>")
def override_artist(artist_id: str):
    session, err = open_session()
    if err:
        return err
    try:
        admin, err = require_admin(session)
        if err:
            return err
        body = request.get_json(silent=True) or {}
        account = admin_override(
            session,
            artist_id,
            admin.id,
            {"action": body.get("action"), "reason": body.get("reason") or "", "days": body.get("days")},
        )
        session.commit()
        return jsonify(to_json(account))
    except FeeError as error:
        session.rollback()
        return jsonify({"error": error.args[0]}), error.status
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.get("/api/admin/payments")
def list_payments():
    session, err = open_session()
    if err:
        return err
    try:
        admin, err = require_admin(session)
        if err:
            return err
        _ = admin
        status = request.args.get("status") or "PENDING"
        payments = session.scalars(
            select(SubscriptionPayment)
            .where(SubscriptionPayment.status == status)
            .options(selectinload(SubscriptionPayment.artist), selectinload(SubscriptionPayment.invoice))
            .order_by(SubscriptionPayment.submitted_at.desc())
        ).all()
        payload = []
        for payment in payments:
            row = to_json(payment)
            if payment.artist:
                row["artist"] = {
                    "id": payment.artist.id,
                    "name": payment.artist.name,
                    "slug": payment.artist.slug,
                    "phone": payment.artist.phone,
                }
            if payment.invoice:
                row["invoice"] = {
                    "id": payment.invoice.id,
                    "number": payment.invoice.number,
                    "reference": payment.invoice.reference,
                    "dueDate": payment.invoice.due_date,
                    "amountLyd": payment.invoice.amount_lyd,
                }
            payload.append(row)
        return jsonify(payload)
    finally:
        session.close()


@bp.post("/api/admin/payments/<payment_id>/confirm")
def confirm(payment_id: str):
    session, err = open_session()
    if err:
        return err
    try:
        admin, err = require_admin(session)
        if err:
            return err
        payment = confirm_payment(session, payment_id, admin.id, "admin")
        session.commit()
        session.refresh(payment)
        return jsonify(to_json(payment))
    except FeeError as error:
        session.rollback()
        return jsonify({"error": error.args[0]}), error.status
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.post("/api/admin/payments/<payment_id>/reject")
def reject(payment_id: str):
    session, err = open_session()
    if err:
        return err
    try:
        admin, err = require_admin(session)
        if err:
            return err
        body = request.get_json(silent=True) or {}
        reason = body.get("reason").strip() if isinstance(body.get("reason"), str) and body.get("reason").strip() else "ما قدرنا نتحقق من الدفعة."
        payment = reject_payment(session, payment_id, admin.id, reason)
        session.commit()
        session.refresh(payment)
        return jsonify(to_json(payment))
    except FeeError as error:
        session.rollback()
        return jsonify({"error": error.args[0]}), error.status
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.get("/api/admin/revenue")
def revenue():
    session, err = open_session()
    if err:
        return err
    try:
        admin, err = require_admin(session)
        if err:
            return err
        _ = admin
        requested = request.args.get("month") or today_iso()[:7]
        month = month_bounds(requested)["month"]
        previous_month = shift_month(month, -1)
        current = revenue_for_month(session, month)
        previous = revenue_for_month(session, previous_month)
        trend = revenue_trend(session, month, 6)
        months = available_months(session)
        return jsonify(
            {
                "month": month,
                "previousMonth": previous_month,
                "months": months,
                "current": current,
                "previous": {
                    "generatedLyd": previous["generatedLyd"],
                    "collectedLyd": previous["collectedLyd"],
                    "bookingCount": previous["bookingCount"],
                },
                "change": {
                    "generated": _change(current["generatedLyd"], previous["generatedLyd"]),
                    "collected": _change(current["collectedLyd"], previous["collectedLyd"]),
                    "bookings": _change(current["bookingCount"], previous["bookingCount"]),
                },
                "trend": trend,
            }
        )
    finally:
        session.close()


@bp.get("/api/admin/settings")
def get_settings():
    session, err = open_session()
    if err:
        return err
    try:
        admin, err = require_admin(session)
        if err:
            return err
        _ = admin
        settings = ensure_payment_settings(session)
        session.commit()
        return jsonify({"settings": to_json(settings)})
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.patch("/api/admin/settings")
def patch_settings():
    session, err = open_session()
    if err:
        return err
    try:
        admin, err = require_admin(session)
        if err:
            return err
        body = request.get_json(silent=True) or {}
        settings = ensure_payment_settings(session)
        if isinstance(body.get("bankName"), str):
            settings.bank_name = body["bankName"]
        if isinstance(body.get("accountName"), str):
            settings.account_name = body["accountName"]
        if isinstance(body.get("accountNumber"), str):
            settings.account_number = body["accountNumber"]
        if isinstance(body.get("instructions"), str):
            settings.instructions = body["instructions"]
        if isinstance(body.get("supportedMethods"), str):
            settings.supported_methods = body["supportedMethods"]
        if isinstance(body.get("reminderDays"), (int, float)):
            settings.reminder_days = min(30, max(1, int(body["reminderDays"])))
        write_audit(
            session,
            {
                "actorType": "admin",
                "actorId": admin.id,
                "action": "payment_settings_changed",
                "reason": "Updated bank/payment settings",
            },
        )
        session.commit()
        session.refresh(settings)
        return jsonify(to_json(settings))
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
