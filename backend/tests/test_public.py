from __future__ import annotations

import os
import unittest

from bridey_api import create_app
from bridey_api import db as database
from bridey_api.dates import add_days_iso, today_iso, weekday_of
from bridey_api.models import Base


class PublicRouteTest(unittest.TestCase):
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
        return self.client.get("/api/me").get_json()

    def _next_weekday(self, days: set[int], *, skip_today: bool = False) -> str:
        start = 1 if skip_today else 0
        for offset in range(start, 22):
            candidate = add_days_iso(today_iso(), offset)
            if weekday_of(candidate) in days:
                return candidate
        raise AssertionError("no matching weekday")

    def test_availability_open_closed_and_horizon(self) -> None:
        me = self._signup_and_onboard()
        slug = me["business"]["slug"]
        service_id = me["services"][0]["id"]
        open_date = self._next_weekday({4, 5, 6}, skip_today=True)
        closed_date = self._next_weekday({1})
        far = add_days_iso(today_iso(), 40)

        open_res = self.client.get(
            f"/api/public/availability?slug={slug}&date={open_date}&serviceId={service_id}"
        )
        self.assertEqual(open_res.status_code, 200, open_res.get_json())
        body = open_res.get_json()
        self.assertEqual(body["mode"], "SHIFT")
        self.assertTrue(body["available"])
        self.assertEqual(body["reason"], "OK")
        self.assertGreater(len(body["shifts"]), 0)
        self.assertGreater(body["shifts"][0]["remaining"], 0)

        closed = self.client.get(
            f"/api/public/availability?slug={slug}&date={closed_date}&serviceId={service_id}"
        )
        self.assertEqual(closed.status_code, 200)
        self.assertEqual(closed.get_json()["reason"], "CLOSED")
        self.assertFalse(closed.get_json()["available"])

        horizon = self.client.get(f"/api/public/availability?slug={slug}&date={far}&serviceId={service_id}")
        self.assertEqual(horizon.status_code, 200)
        self.assertEqual(horizon.get_json()["reason"], "HORIZON")

        missing = self.client.get("/api/public/availability?slug=missing&date=2026-09-11&serviceId=x")
        self.assertEqual(missing.status_code, 404)

    def test_slots_and_public_directory(self) -> None:
        me = self._signup_and_onboard()
        slug = me["business"]["slug"]
        service_id = me["services"][0]["id"]
        date = self._next_weekday({4, 5, 6}, skip_today=True)
        slots = self.client.get(f"/api/public/slots?slug={slug}&date={date}&serviceIds={service_id}")
        self.assertEqual(slots.status_code, 200, slots.get_json())
        body = slots.get_json()
        self.assertEqual(body["durationMin"], 120)
        self.assertIsInstance(body["slots"], list)
        self.assertGreater(len(body["slots"]), 0)

        artists = self.client.get("/api/public/artists")
        self.assertEqual(artists.status_code, 200)
        directory = artists.get_json()
        self.assertEqual(len(directory), 1)
        self.assertEqual(directory[0]["slug"], slug)
        self.assertEqual(directory[0]["fromPrice"], 350)
        self.assertEqual(directory[0]["neighborhood"], "fuwayhat")

    def test_track_hides_pass_until_confirm(self) -> None:
        me = self._signup_and_onboard()
        date = self._next_weekday({4, 5, 6}, skip_today=True)
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
        track_code = booked.get_json()["trackCode"]
        pending = self.client.get(f"/api/public/track/{track_code}")
        self.assertEqual(pending.status_code, 200, pending.get_json())
        self.assertEqual(pending.get_json()["status"], "PENDING")
        self.assertFalse(pending.get_json()["passAvailable"])
        self.assertNotIn("passToken", pending.get_json())
        self.assertNotIn("brideName", pending.get_json())

        booking_id = booked.get_json()["id"]
        confirmed = self.client.patch(f"/api/bookings/{booking_id}", json={"status": "CONFIRMED"})
        self.assertEqual(confirmed.status_code, 200, confirmed.get_json())
        shown = self.client.get(f"/api/public/track/{track_code.lower()}")
        self.assertEqual(shown.status_code, 200)
        self.assertTrue(shown.get_json()["passAvailable"])
        self.assertEqual(shown.get_json()["brideName"], "Nora")
        self.assertTrue(shown.get_json()["passToken"])


if __name__ == "__main__":
    unittest.main()
