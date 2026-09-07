from __future__ import annotations

import os
import unittest
from datetime import datetime, timezone

from bridey_api import create_app
from bridey_api import db as database
from bridey_api.auth import hash_password
from bridey_api.constants import ADMIN_COOKIE, SESSION_COOKIE
from bridey_api.ids import new_id
from bridey_api.models import Admin, Artist, Base, Business, TeamMember
from bridey_api.phones import normalize_phone


class AuthRouteTest(unittest.TestCase):
    def setUp(self) -> None:
        os.environ["AUTH_SECRET"] = "unit-test-secret"
        os.environ.pop("NODE_ENV", None)
        self.app = create_app("sqlite:///:memory:")
        assert database.engine is not None
        Base.metadata.create_all(database.engine)
        self.client = self.app.test_client()

    def test_login_invalid_body(self) -> None:
        res = self.client.post("/api/auth/login", json={"phone": "123", "password": "x"})
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.get_json()["error"], "INVALID")

    def test_login_unknown_user(self) -> None:
        res = self.client.post("/api/auth/login", json={"phone": "0910000001", "password": "secret"})
        self.assertEqual(res.status_code, 401)
        self.assertEqual(res.get_json()["error"], "LOGIN")

    def test_signup_rejects_non_libya_phone(self) -> None:
        res = self.client.post(
            "/api/auth/signup",
            json={"name": "Lina", "phone": "12345678", "password": "secret"},
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.get_json()["error"], "PHONE")

    def test_signup_rejects_short_password(self) -> None:
        res = self.client.post(
            "/api/auth/signup",
            json={"name": "Lina", "phone": "0910000001", "password": "abc"},
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.get_json()["error"], "INVALID")

    def test_signup_login_logout(self) -> None:
        res = self.client.post(
            "/api/auth/signup",
            json={"name": "Lina Makeup", "phone": "0910000001", "password": "secret"},
        )
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertIn("id", body)
        self.assertEqual(body["slug"], "lina-makeup")
        self.assertFalse(body["onboardingComplete"])
        self.assertIn(SESSION_COOKIE, res.headers.get("Set-Cookie", ""))

        session = self.client.get("/api/auth/session")
        self.assertEqual(session.status_code, 200)
        self.assertEqual(session.get_json()["artistId"], body["id"])

        self.client.post("/api/auth/logout")
        res = self.client.post("/api/auth/login", json={"phone": "0910000001", "password": "wrong"})
        self.assertEqual(res.status_code, 401)

        res = self.client.post("/api/auth/login", json={"phone": "0910000001", "password": "secret"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["slug"], "lina-makeup")
        self.assertIn(SESSION_COOKIE, res.headers.get("Set-Cookie", ""))

        logout = self.client.post("/api/auth/logout")
        self.assertEqual(logout.status_code, 200)
        self.assertTrue(logout.get_json()["ok"])

    def test_signup_taken(self) -> None:
        payload = {"name": "Lina", "phone": "0910000001", "password": "secret"}
        self.assertEqual(self.client.post("/api/auth/signup", json=payload).status_code, 200)
        res = self.client.post("/api/auth/signup", json=payload)
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.get_json()["error"], "TAKEN")

    def test_signup_links_team_invite(self) -> None:
        phone = normalize_phone("0910000002")
        db = database.SessionLocal()
        assert db is not None
        try:
            now = datetime.now(timezone.utc)
            owner = Artist(
                id=new_id(),
                name="Owner",
                phone="218910000099",
                password_hash=hash_password("secret"),
                slug="owner",
                created_at=now,
                updated_at=now,
            )
            db.add(owner)
            db.flush()
            business = Business(
                id=new_id(),
                owner_id=owner.id,
                name="Salon",
                slug="salon",
                created_at=now,
                updated_at=now,
            )
            db.add(business)
            db.flush()
            invite = TeamMember(
                id=new_id(),
                business_id=business.id,
                artist_id=None,
                name="Invitee",
                phone=phone,
                status="ACTIVE",
                created_at=now,
                updated_at=now,
            )
            db.add(invite)
            db.commit()
            invite_id = invite.id
        finally:
            db.close()

        res = self.client.post(
            "/api/auth/signup",
            json={"name": "Noor", "phone": "0910000002", "password": "secret"},
        )
        self.assertEqual(res.status_code, 200)
        artist_id = res.get_json()["id"]
        db = database.SessionLocal()
        try:
            member = db.get(TeamMember, invite_id)
            self.assertIsNotNone(member)
            assert member is not None
            self.assertEqual(member.artist_id, artist_id)
        finally:
            db.close()

    def test_admin_login_logout(self) -> None:
        db = database.SessionLocal()
        try:
            admin = Admin(
                id=new_id(),
                email="ops@bridey.ly",
                name="Ops",
                password_hash=hash_password("adminpass"),
                created_at=datetime.now(timezone.utc),
            )
            db.add(admin)
            db.commit()
            admin_id = admin.id
        finally:
            db.close()

        res = self.client.post("/api/admin/login", json={"email": "OPS@bridey.ly", "password": "nope"})
        self.assertEqual(res.status_code, 401)
        res = self.client.post("/api/admin/login", json={"email": "OPS@bridey.ly", "password": "adminpass"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["id"], admin_id)
        self.assertEqual(res.get_json()["name"], "Ops")
        self.assertIn(ADMIN_COOKIE, res.headers.get("Set-Cookie", ""))

        session = self.client.get("/api/admin/session")
        self.assertEqual(session.status_code, 200)
        self.assertEqual(session.get_json()["email"], "ops@bridey.ly")

        logout = self.client.post("/api/admin/logout")
        self.assertEqual(logout.status_code, 200)
        self.assertTrue(logout.get_json()["ok"])


if __name__ == "__main__":
    unittest.main()
