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
- `GET /api/auth/session` — verifies `bridey_session` (HS256, same secret as Next.js)
- `GET /api/admin/session` — verifies `bridey_admin`
- SQLAlchemy models that map Prisma table names and camelCase columns
- Dockerfile for AWS Lambda Web Adapter (not deployed yet)

Prisma still owns migrations. Do not run `create_all()` against the live database.

## What is not implemented yet

Booking, fees, passes, team, uploads, and the rest of the 37 Next.js API routes. Do not point Vercel `/api/*` at this Flask app until those routes exist.
