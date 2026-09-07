from flask import Blueprint, jsonify, request

from bridey_api.errors import FeeError
from bridey_api.fees import fee_snapshot, submit_fee_payment
from bridey_api.media import MediaError, save_public_image
from bridey_api.routes.helpers import open_session, require_artist
from bridey_api.serialize import to_json

bp = Blueprint("fees", __name__)


@bp.get("/api/fees")
def get_fees():
    session, err = open_session()
    if err:
        return err
    try:
        artist, err = require_artist(session)
        if err:
            return err
        payload = fee_snapshot(session, artist.id)
        session.commit()
        return jsonify(payload)
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@bp.post("/api/fees/submit")
def submit_fees():
    session, err = open_session()
    if err:
        return err
    try:
        artist, err = require_artist(session)
        if err:
            return err
        invoice_id = request.form.get("invoiceId") or ""
        method = request.form.get("method") or "BANK_TRANSFER"
        amount_raw = request.form.get("amountLyd") or "0"
        paid_on = request.form.get("paidOn") or ""
        reference = request.form.get("reference") or ""
        note = request.form.get("note") or ""
        try:
            amount_lyd = int(float(amount_raw))
        except ValueError:
            amount_lyd = 0
        receipt_url = ""
        uploaded = request.files.get("receipt")
        if uploaded and uploaded.filename:
            try:
                receipt_url = save_public_image(artist.id, uploaded)
            except MediaError as error:
                return jsonify({"error": error.args[0]}), 400
        payment = submit_fee_payment(
            session,
            artist.id,
            {
                "invoiceId": invoice_id,
                "method": method,
                "amountLyd": amount_lyd,
                "paidOn": paid_on,
                "reference": reference,
                "receiptUrl": receipt_url,
                "note": note,
            },
        )
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
