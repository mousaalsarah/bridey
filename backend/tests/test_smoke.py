from __future__ import annotations

import os
import unittest

from bridey_api import create_app
from bridey_api.auth import create_admin_token, create_artist_token
from bridey_api.constants import ADMIN_COOKIE, PLATFORM_FEE_LYD, SESSION_COOKIE


class FlaskSmokeTest(unittest.TestCase):
    def setUp(self) -> None:
        os.environ["AUTH_SECRET"] = "unit-test-secret"
        self.app = create_app("")
        self.client = self.app.test_client()

    def test_health(self) -> None:
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["service"], "bridey-flask")
        self.assertEqual(body["platformFeeLyd"], PLATFORM_FEE_LYD)

    def test_health_api_alias(self) -> None:
        res = self.client.get("/api/health")
        self.assertEqual(res.status_code, 200)

    def test_session_unauthorized(self) -> None:
        res = self.client.get("/api/auth/session")
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.get_json()["error"], "UNAUTHORIZED")

    def test_session_rejects_bad_token(self) -> None:
        self.client.set_cookie(SESSION_COOKIE, "not-a-jwt")
        res = self.client.get("/api/auth/session")
        self.assertEqual(res.status_code, 401)

    def test_session_accepts_artist_jwt(self) -> None:
        token = create_artist_token("artist_test_1")
        self.client.set_cookie(SESSION_COOKIE, token)
        res = self.client.get("/api/auth/session")
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertTrue(body["ok"])
        self.assertEqual(body["artistId"], "artist_test_1")

    def test_admin_session_requires_role(self) -> None:
        artist_token = create_artist_token("artist_test_1")
        self.client.set_cookie(ADMIN_COOKIE, artist_token)
        res = self.client.get("/api/admin/session")
        self.assertEqual(res.status_code, 401)

    def test_admin_session_accepts_admin_jwt(self) -> None:
        token = create_admin_token("admin_test_1")
        self.client.set_cookie(ADMIN_COOKIE, token)
        res = self.client.get("/api/admin/session")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["adminId"], "admin_test_1")


if __name__ == "__main__":
    unittest.main()
