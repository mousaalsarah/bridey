from __future__ import annotations

import os
import tempfile
import unittest
from io import BytesIO

from bridey_api import create_app
from bridey_api import db as database
from bridey_api.auth import hash_password
from bridey_api.dates import add_days_iso, today_iso, weekday_of
from bridey_api.ids import new_id
from bridey_api.models import Admin, Base
from support import PNG, next_open_date, signup_and_onboard


class RemainingApiTest(unittest.TestCase):
    def setUp(self) -> None:
        os.environ["AUTH_SECRET"] = "unit-test-secret"
        os.environ.pop("NODE_ENV", None)
        os.environ.pop("VERCEL", None)
        self.upload_dir = tempfile.TemporaryDirectory()
        os.environ["BRIDEY_UPLOAD_DIR"] = self.upload_dir.name
        self.app = create_app("sqlite:///:memory:")
        assert database.engine is not None
        Base.metadata.create_all(database.engine)
        self.client = self.app.test_client()

    def tearDown(self) -> None:
        self.upload_dir.cleanup()
        os.environ.pop("BRIDEY_UPLOAD_DIR", None)

    def test_team_services_hours_and_blocked(self) -> None:
        me = signup_and_onboard(self.client)
        created = self.client.post(
            "/api/team",
            json={"name": "Hana Hair", "phone": "0910000099", "roles": ["HAIRSTYLIST"], "dailyCapacity": 5},
        )
        self.assertEqual(created.status_code, 200, created.get_json())
        member_id = created.get_json()["id"]
        studio = self.client.get("/api/me").get_json()
        self.assertEqual(studio["business"]["businessType"], "salon")
        self.assertEqual(len(studio["members"]), 2)

        patched = self.client.patch(f"/api/team/{member_id}", json={"dailyCapacity": 6, "name": "Hana"})
        self.assertEqual(patched.status_code, 200)
        self.assertEqual(patched.get_json()["dailyCapacity"], 6)

        owner_off = self.client.patch(f"/api/team/{me['member']['id']}", json={"status": "INACTIVE"})
        self.assertEqual(owner_off.status_code, 400)
        self.assertEqual(owner_off.get_json()["error"], "OWNER")

        service = self.client.post(
            "/api/services",
            json={"nameAr": "تسريحة عروس", "nameEn": "Bridal hair", "kind": "hair", "durationMin": 60, "priceLyd": 120},
        )
        self.assertEqual(service.status_code, 200, service.get_json())
        service_id = service.get_json()["id"]
        updated = self.client.patch(f"/api/services/{service_id}", json={"priceLyd": 150})
        self.assertEqual(updated.get_json()["priceLyd"], 150)
        deleted = self.client.delete(f"/api/services/{service_id}")
        self.assertEqual(deleted.status_code, 200)
        self.assertTrue(deleted.get_json()["ok"])
        studio = self.client.get("/api/me").get_json()
        self.assertFalse(next(row for row in studio["services"] if row["id"] == service_id)["active"])

        hours = self.client.put("/api/hours", json={"preset": "full-day", "scheduleMode": "SHIFT"})
        self.assertEqual(hours.status_code, 200)
        studio = self.client.get("/api/me").get_json()
        self.assertEqual({row["dayOfWeek"] for row in studio["hours"]}, {0, 1, 2, 3, 4, 5, 6})

        monday = next(add_days_iso(today_iso(), offset) for offset in range(1, 14) if weekday_of(add_days_iso(today_iso(), offset)) == 1)
        blocked = self.client.post("/api/blocked", json={"date": monday, "reason": "off"})
        self.assertEqual(blocked.status_code, 200, blocked.get_json())
        availability = self.client.get(
            f"/api/public/availability?slug={studio['business']['slug']}&date={monday}&serviceId={studio['services'][0]['id']}"
        )
        self.assertEqual(availability.get_json()["reason"], "BLOCKED")
        self.client.delete("/api/blocked", json={"date": monday})
        availability = self.client.get(
            f"/api/public/availability?slug={studio['business']['slug']}&date={monday}&serviceId={studio['services'][0]['id']}"
        )
        self.assertEqual(availability.get_json()["reason"], "OK")

    def test_alerts_pass_media_and_qr(self) -> None:
        me = signup_and_onboard(self.client)
        date = next_open_date()
        booked = self.client.post(
            "/api/public/book",
            json={
                "slug": me["business"]["slug"],
                "serviceIds": [me["services"][0]["id"]],
                "date": date,
                "shiftId": me["shifts"][0]["id"],
                "brideName": "Nora",
                "bridePhone": "0911111111",
            },
        )
        self.assertEqual(booked.status_code, 200, booked.get_json())
        alerts = self.client.get("/api/alerts")
        self.assertEqual(alerts.status_code, 200)
        self.assertEqual(alerts.get_json()["pendingBookings"], 1)
        self.assertEqual(alerts.get_json()["latest"][0]["brideName"], "Nora")

        booking_id = booked.get_json()["id"]
        self.assertEqual(self.client.patch(f"/api/bookings/{booking_id}", json={"status": "CONFIRMED"}).status_code, 200)
        track = self.client.get(f"/api/public/track/{booked.get_json()['trackCode']}").get_json()
        token = track["passToken"]
        scanned = self.client.get(f"/api/pass/{token}")
        self.assertEqual(scanned.status_code, 200, scanned.get_json())
        self.assertEqual(scanned.get_json()["brideName"], "Nora")
        self.assertEqual(scanned.headers.get("Cache-Control"), "no-store")
        bad = self.client.get("/api/pass/short")
        self.assertEqual(bad.status_code, 404)
        self.assertEqual(bad.get_json()["error"], "INVALID_PASS")

        media = self.client.post(
            "/api/media",
            data={"kind": "avatar", "file": (BytesIO(PNG), "avatar.png")},
            content_type="multipart/form-data",
        )
        self.assertEqual(media.status_code, 200, media.get_json())
        self.assertEqual(media.get_json()["kind"], "avatar")
        self.assertTrue(media.get_json()["url"].startswith("/uploads/"))
        portfolio = self.client.post(
            "/api/portfolio",
            data={"caption": "look", "file": (BytesIO(PNG), "look.png")},
            content_type="multipart/form-data",
        )
        self.assertEqual(portfolio.status_code, 200, portfolio.get_json())
        image_id = portfolio.get_json()["id"]
        self.assertEqual(self.client.delete(f"/api/portfolio/{image_id}").status_code, 200)

        qr = self.client.get("/api/qr?data=https://evil.example/phish")
        self.assertEqual(qr.status_code, 400)
        self.assertEqual(qr.get_json()["error"], "INVALID")

    def test_fees_and_admin_ops(self) -> None:
        me = signup_and_onboard(self.client)
        date = next_open_date()
        booked = self.client.post(
            "/api/public/book",
            json={
                "slug": me["business"]["slug"],
                "serviceIds": [me["services"][0]["id"]],
                "date": date,
                "shiftId": me["shifts"][0]["id"],
                "brideName": "Nora",
                "bridePhone": "0911111111",
            },
        )
        booking_id = booked.get_json()["id"]
        self.assertEqual(self.client.patch(f"/api/bookings/{booking_id}", json={"status": "CONFIRMED"}).status_code, 200)
        fees = self.client.get("/api/fees")
        self.assertEqual(fees.status_code, 200)
        self.assertEqual(fees.get_json()["outstanding"], 5)
        invoice_id = fees.get_json()["openInvoice"]["id"]
        submitted = self.client.post(
            "/api/fees/submit",
            data={"invoiceId": invoice_id, "method": "BANK_TRANSFER", "amountLyd": "5", "paidOn": today_iso()},
        )
        self.assertEqual(submitted.status_code, 200, submitted.get_json())
        payment_id = submitted.get_json()["id"]

        db = database.SessionLocal()
        try:
            db.add(
                Admin(
                    id=new_id(),
                    email="ops@bridey.ly",
                    name="Ops",
                    password_hash=hash_password("adminpass"),
                )
            )
            db.commit()
        finally:
            db.close()
        login = self.client.post("/api/admin/login", json={"email": "ops@bridey.ly", "password": "adminpass"})
        self.assertEqual(login.status_code, 200)

        overview = self.client.get("/api/admin/overview")
        self.assertEqual(overview.status_code, 200, overview.get_json())
        self.assertEqual(overview.get_json()["pendingPayments"], 1)
        self.assertEqual(overview.get_json()["outstandingFees"], 5)

        artists = self.client.get("/api/admin/artists")
        self.assertEqual(artists.status_code, 200)
        self.assertEqual(artists.get_json()[0]["outstanding"], 5)

        payments = self.client.get("/api/admin/payments?status=PENDING")
        self.assertEqual(len(payments.get_json()), 1)
        confirmed = self.client.post(f"/api/admin/payments/{payment_id}/confirm")
        self.assertEqual(confirmed.status_code, 200, confirmed.get_json())
        self.assertEqual(confirmed.get_json()["status"], "CONFIRMED")

        fees = self.client.get("/api/fees")
        self.assertEqual(fees.get_json()["outstanding"], 0)

        settings = self.client.get("/api/admin/settings")
        self.assertEqual(settings.status_code, 200)
        patched = self.client.patch("/api/admin/settings", json={"bankName": "NCB", "reminderDays": 5})
        self.assertEqual(patched.get_json()["bankName"], "NCB")
        self.assertEqual(patched.get_json()["reminderDays"], 5)

        suspended = self.client.post(
            f"/api/admin/artists/{me['artist']['id']}",
            json={"action": "suspend", "reason": "late fees"},
        )
        self.assertEqual(suspended.status_code, 200, suspended.get_json())
        blocked = self.client.post(
            "/api/public/book",
            json={
                "slug": me["business"]["slug"],
                "serviceIds": [me["services"][0]["id"]],
                "date": date,
                "shiftId": me["shifts"][0]["id"],
                "brideName": "Mona",
                "bridePhone": "0912223334",
            },
        )
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.get_json()["error"], "ARTIST_UNAVAILABLE")

        revenue = self.client.get("/api/admin/revenue")
        self.assertEqual(revenue.status_code, 200)
        self.assertIn("current", revenue.get_json())
        detail = self.client.get(f"/api/admin/artists/{me['artist']['id']}")
        self.assertEqual(detail.status_code, 200)
        self.assertTrue(detail.get_json()["logs"])


if __name__ == "__main__":
    unittest.main()
