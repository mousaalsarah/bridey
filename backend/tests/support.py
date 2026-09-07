from __future__ import annotations

from bridey_api.dates import add_days_iso, today_iso, weekday_of

PNG = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082"
)


def signup_and_onboard(client, phone: str = "0910000001") -> dict:
    signup = client.post("/api/auth/signup", json={"name": "Lina Makeup", "phone": phone, "password": "secret"})
    assert signup.status_code == 200, signup.get_json()
    onboard = client.post(
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
    assert onboard.status_code == 200, onboard.get_json()
    me = client.get("/api/me")
    assert me.status_code == 200
    return me.get_json()


def next_open_date(*, skip_today: bool = True) -> str:
    start = 1 if skip_today else 0
    for offset in range(start, 22):
        candidate = add_days_iso(today_iso(), offset)
        if weekday_of(candidate) in {4, 5, 6}:
            return candidate
    raise AssertionError("no open date")
