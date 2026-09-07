from __future__ import annotations

import os
import unittest
import uuid

from bridey_api import create_app
from bridey_api import db as database
from bridey_api.dates import add_days_iso, today_iso, weekday_of
from bridey_api.models import Base


class BookingRouteTest(unittest.TestCase):
    def setUp(self) -> None:
        os.environ["AUTH_SECRET"] = "unit-test-secret"
        os.environ.pop("NODE_ENV", None)
        self.app = create_app("sqlite:///:memory:")
        assert database.engine is not None
        Base.metadata.create_all(database.engine)
        self.client = self.app.test_client()

    def _signup_and_onboard(self) -> dict:
        signup = self.client.post(
            "/api/auth/signup",
            json={"name": "Lina Makeup", "phone": "0910000001", "password": "secret"},
        )
        self.assertEqual(signup.status_code, 200)
        onboard = self.client.post(
            "/api/onboarding",
            json={
                "specialties": ["makeup"],
                "neighborhood": "fuwayhat",
                "bio": "Bridal makeup",
                "snapchat": "lina",
                "services": [
                    {
                        "nameAr": "مكياج عروس كامل",
                        "nameEn": "Full bridal makeup",
                        "kind": "bridal",
                        "durationMin": 120,
                        "priceLyd": 350,
                    }
                ],
                "hoursPreset": "bride-days",
                "businessType": "independent",
            },
        )
        self.assertEqual(onboard.status_code, 200)
        me = self.client.get("/api/me")
        self.assertEqual(me.status_code, 200)
        return me.get_json()

    def _next_open_date(self) -> str:
        for offset in range(1, 22):
            candidate = add_days_iso(today_iso(), offset)
            if weekday_of(candidate) in {4, 5, 6}:
                return candidate
        raise AssertionError("no open date in horizon")

    def test_manual_booking_has_no_fee_and_visible_phone(self) -> None:
        me = self._signup_and_onboard()
        date = self._next_open_date()
        shift_id = me["shifts"][0]["id"]
        service_id = me["services"][0]["id"]
        res = self.client.post(
            "/api/bookings",
            json={
                "brideName": "Sara",
                "bridePhone": "0912345678",
                "date": date,
                "shiftId": shift_id,
                "serviceIds": [service_id],
                "source": "walk_in",
            },
        )
        self.assertEqual(res.status_code, 200, res.get_json())
        body = res.get_json()
        self.assertEqual(body["status"], "CONFIRMED")
        self.assertEqual(body["origin"], "manual")
        self.assertEqual(body["platformFeeLyd"], 0)
        self.assertEqual(body["feeStatus"], "NONE")
        self.assertTrue(body["contactAvailable"])
        self.assertEqual(body["bridePhone"], "218912345678")
        self.assertNotIn("brideyPassToken", body)

        studio = self.client.get("/api/me").get_json()
        self.assertEqual(len(studio["bookings"]), 1)
        self.assertEqual(studio["bookings"][0]["bridePhone"], "218912345678")
        self.assertEqual(studio["outstanding"], 0)

    def test_public_request_hides_phone_until_confirm(self) -> None:
        me = self._signup_and_onboard()
        date = self._next_open_date()
        shift_id = me["shifts"][0]["id"]
        service_id = me["services"][0]["id"]
        slug = me["business"]["slug"]
        request_id = str(uuid.uuid4())

        blocked = self.client.post(
            "/api/public/book",
            json={
                "slug": slug,
                "serviceIds": [service_id],
                "date": date,
                "shiftId": shift_id,
                "brideName": "Nora",
                "bridePhone": "0911111111",
                "notes": "call 0912223334 please",
            },
        )
        self.assertEqual(blocked.status_code, 400)
        self.assertEqual(blocked.get_json()["error"], "NOTES_CONTACT")

        created = self.client.post(
            "/api/public/book",
            json={
                "slug": slug,
                "serviceIds": [service_id],
                "date": date,
                "shiftId": shift_id,
                "brideName": "Nora",
                "bridePhone": "0911111111",
                "notes": "prefer evening",
                "requestId": request_id,
            },
        )
        self.assertEqual(created.status_code, 200, created.get_json())
        payload = created.get_json()
        self.assertTrue(payload["id"])
        self.assertTrue(str(payload["trackCode"]).startswith("BR"))

        replay = self.client.post(
            "/api/public/book",
            json={
                "slug": slug,
                "serviceIds": [service_id],
                "date": date,
                "shiftId": shift_id,
                "brideName": "Nora",
                "bridePhone": "0911111111",
                "requestId": request_id,
            },
        )
        self.assertEqual(replay.status_code, 200)
        self.assertEqual(replay.get_json()["id"], payload["id"])

        studio = self.client.get("/api/me").get_json()
        booking = studio["bookings"][0]
        self.assertEqual(booking["status"], "PENDING")
        self.assertEqual(booking["origin"], "public")
        self.assertFalse(booking["contactAvailable"])
        self.assertEqual(booking["bridePhone"], "")
        self.assertEqual(booking["platformFeeLyd"], 0)

        skipped = self.client.post(f"/api/bookings/{payload['id']}/appointment", json={"action": "check_in"})
        self.assertEqual(skipped.status_code, 400)
        self.assertEqual(skipped.get_json()["error"], "INVALID_STATUS")

        confirmed = self.client.patch(f"/api/bookings/{payload['id']}", json={"status": "CONFIRMED"})
        self.assertEqual(confirmed.status_code, 200, confirmed.get_json())
        body = confirmed.get_json()
        self.assertEqual(body["status"], "CONFIRMED")
        self.assertEqual(body["platformFeeLyd"], 5)
        self.assertEqual(body["feeStatus"], "UNPAID")
        self.assertTrue(body["contactAvailable"])
        self.assertEqual(body["bridePhone"], "218911111111")
        self.assertNotIn("brideyPassToken", body)

        studio = self.client.get("/api/me").get_json()
        self.assertEqual(studio["bookings"][0]["bridePhone"], "218911111111")
        self.assertEqual(studio["outstanding"], 5)

        appointment = self.client.get(f"/api/bookings/{payload['id']}/appointment")
        self.assertEqual(appointment.status_code, 200)
        self.assertTrue(appointment.get_json()["actions"]["canCheckIn"])
        self.assertEqual(appointment.get_json()["bridePhone"], "218911111111")

    def test_appointment_states_then_payment_after_complete(self) -> None:
        me = self._signup_and_onboard()
        date = self._next_open_date()
        created = self.client.post(
            "/api/bookings",
            json={
                "brideName": "Hala",
                "bridePhone": "0912345678",
                "date": date,
                "shiftId": me["shifts"][0]["id"],
                "serviceIds": [me["services"][0]["id"]],
                "source": "phone",
            },
        )
        self.assertEqual(created.status_code, 200, created.get_json())
        booking_id = created.get_json()["id"]

        too_soon = self.client.post(f"/api/bookings/{booking_id}/appointment", json={"action": "start"})
        self.assertEqual(too_soon.status_code, 400)
        self.assertEqual(too_soon.get_json()["error"], "INVALID_STATUS")

        checked = self.client.post(f"/api/bookings/{booking_id}/appointment", json={"action": "check_in"})
        self.assertEqual(checked.status_code, 200, checked.get_json())
        self.assertEqual(checked.get_json()["status"], "CHECKED_IN")
        self.assertTrue(checked.get_json()["actions"]["canStart"])

        started = self.client.post(f"/api/bookings/{booking_id}/appointment", json={"action": "start"})
        self.assertEqual(started.status_code, 200)
        self.assertEqual(started.get_json()["status"], "IN_PROGRESS")

        completed = self.client.post(f"/api/bookings/{booking_id}/appointment", json={"action": "complete"})
        self.assertEqual(completed.status_code, 200)
        self.assertEqual(completed.get_json()["status"], "COMPLETED")
        self.assertEqual(completed.get_json()["payment"]["status"], "unpaid")
        self.assertEqual(completed.get_json()["payment"]["totalLyd"], 350)

        paid = self.client.post(f"/api/bookings/{booking_id}/appointment", json={"action": "mark_paid"})
        self.assertEqual(paid.status_code, 200, paid.get_json())
        self.assertEqual(paid.get_json()["payment"]["status"], "paid")
        self.assertEqual(paid.get_json()["payment"]["paidLyd"], 350)
        self.assertEqual(paid.get_json()["payment"]["remainingLyd"], 0)


if __name__ == "__main__":
    unittest.main()
