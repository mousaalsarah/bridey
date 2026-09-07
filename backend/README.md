# Bridey Flask API (Phase 1)

This is the start of the backend split. The Next.js UI and `src/app/api` routes are unchanged and still serve the live app.

Frozen originals:

- Git tag `backup/nextjs-fullstack-2026-09-07`
- Git branch `backup/nextjs-fullstack`
- Folder `Pictures/Bridey-backup-nextjs-fullstack-2026-09-07`
- Zip `Pictures/Bridey-backup-nextjs-fullstack-2026-09-07.zip`

## Run locally

Python 3.12+. From `backend/`:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy ..\.env .env
python app.py
```

Health check: `http://127.0.0.1:5000/health`

Cookie check (after logging in to the Next.js app on `:3000`):

```powershell
curl.exe http://127.0.0.1:5000/api/auth/session -H "Cookie: bridey_session=PASTE_COOKIE"
```

Flask reads `AUTH_SECRET` and `DATABASE_URL` from `backend/.env` or the repo-root `.env`. Use the same values as Next.js so JWTs match.

## What is implemented

- `GET /health` and `GET /api/health`
- `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout`
- `POST /api/admin/login`, `POST /api/admin/logout`
- `GET /api/auth/session` and `GET /api/admin/session`
- `POST /api/onboarding`
- `GET /api/me` and `PATCH /api/me` (studio payload, phone privacy, fee snapshot)
- `POST /api/bookings` (manual, confirmed, 0 LYD fee)
- `POST /api/public/book` (pending public request, 30-minute hold, `NOTES_CONTACT`)
- `GET`/`PATCH /api/bookings/<id>` (confirm public requests → 5 LYD fee + pass token)
- `GET`/`POST /api/bookings/<id>/appointment` (`CONFIRMED → CHECKED_IN → IN_PROGRESS → COMPLETED`, payment after complete)
- `GET /api/public/availability`, `GET /api/public/slots`, `GET /api/public/artists`, `GET /api/public/track/<code>`
- `POST /api/team`, `PATCH /api/team/<id>`
- `POST /api/services`, `PATCH`/`DELETE /api/services/<id>`
- `PUT /api/hours`, `POST`/`DELETE /api/blocked`
- `GET /api/alerts`, `GET /api/pass/<token>`, `GET /api/qr`
- `POST /api/media`, `POST`/`DELETE /api/portfolio/<id>` (local `public/uploads`; `STORAGE_UNAVAILABLE` on Vercel/Lambda)
- `GET /api/fees`, `POST /api/fees/submit`
- Admin: overview, artists, payments confirm/reject, revenue, settings
- Same JSON error codes as Next.js (`INVALID`, `LOGIN`, `PHONE`, `TAKEN`) and the same `bridey_session` / `bridey_admin` cookies
- SQLAlchemy models that map Prisma table names and camelCase columns
- Dockerfile for AWS Lambda Web Adapter (not deployed yet)

Prisma still owns migrations. Do not run `create_all()` against the live database. Do not point Vercel `/api/*` at this Flask app until a deliberate cutover.
