from __future__ import annotations

import os
import unittest

from bridey_api import create_app
from bridey_api import db as database
from bridey_api.models import Base


class StudioRouteTest(unittest.TestCase):
    def setUp(self) -> None:
        os.environ["AUTH_SECRET"] = "unit-test-secret"
        os.environ.pop("NODE_ENV", None)
        self.app = create_app("sqlite:///:memory:")
        assert database.engine is not None
        Base.metadata.create_all(database.engine)
        self.client = self.app.test_client()

    def _signup(self) -> dict:
        res = self.client.post(
            "/api/auth/signup",
            json={"name": "Lina Makeup", "phone": "0910000001", "password": "secret"},
        )
        self.assertEqual(res.status_code, 200)
        return res.get_json()

    def test_me_unauthorized(self) -> None:
        res = self.client.get("/api/me")
        self.assertEqual(res.status_code, 401)

    def test_signup_then_me_creates_workspace(self) -> None:
        self._signup()
        res = self.client.get("/api/me")
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertFalse(body["artist"]["onboardingComplete"])
        self.assertEqual(body["artist"]["name"], "Lina Makeup")
        self.assertNotIn("passwordHash", body["artist"])
        self.assertEqual(body["business"]["businessType"], "independent")
        self.assertTrue(body["permissions"]["canManageBusiness"])
        self.assertEqual(body["services"], [])
        self.assertEqual(body["outstanding"], 0)
        self.assertTrue(body["billing"]["account"]["canCreateBookings"])
        self.assertIn("OWNER", body["member"]["roles"])

    def test_onboarding_then_me(self) -> None:
        self._signup()
        res = self.client.post(
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
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()["ok"])

        me = self.client.get("/api/me").get_json()
        self.assertTrue(me["artist"]["onboardingComplete"])
        self.assertEqual(me["artist"]["neighborhood"], "fuwayhat")
        self.assertEqual(me["artist"]["snapchat"], "lina")
        self.assertEqual(len(me["services"]), 1)
        self.assertEqual(me["services"][0]["priceLyd"], 350)
        self.assertEqual(me["services"][0]["staffIds"], [me["member"]["id"]])
        self.assertEqual({hour["dayOfWeek"] for hour in me["hours"]}, {4, 5, 6})
        self.assertGreaterEqual(len(me["shifts"]), 1)
        self.assertEqual(me["bookings"], [])

    def test_onboarding_invalid_service(self) -> None:
        self._signup()
        res = self.client.post(
            "/api/onboarding",
            json={
                "neighborhood": "fuwayhat",
                "hoursPreset": "full-day",
                "services": [{"nameAr": "x", "durationMin": 120, "priceLyd": 10}],
            },
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.get_json()["error"], "INVALID")

    def test_patch_me(self) -> None:
        self._signup()
        res = self.client.patch("/api/me", json={"name": "Lina Studio", "tagline": "Benghazi bridal"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["name"], "Lina Studio")
        self.assertEqual(res.get_json()["tagline"], "Benghazi bridal")
        me = self.client.get("/api/me").get_json()
        self.assertEqual(me["artist"]["name"], "Lina Studio")
        self.assertEqual(me["business"]["name"], "Lina Studio")


if __name__ == "__main__":
    unittest.main()
