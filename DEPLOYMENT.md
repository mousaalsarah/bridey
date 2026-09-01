# Bridey deployment (Vercel + Supabase)

Free testing setup: Next.js on Vercel, PostgreSQL on the Supabase free plan. Local development stays on SQLite.

Do not copy `prisma/dev.db` into Postgres. Testers create real accounts with `/signup`.

## 1. Create the Supabase PostgreSQL database

1. Open [https://supabase.com](https://supabase.com) and create a project.
2. Wait until the database is ready.
3. In **Project Settings → Database**, open **Connection string**.

## 2. Connection strings

You need **two** URIs:

| Env var | Which Supabase string | Why |
|---|---|---|
| `DATABASE_URL` | **Session pooler** (pooler host, port **5432**) | App queries and interactive booking transactions |
| `DIRECT_URL` | **Direct** connection (`db.<project>.supabase.co`, port **5432**) | `prisma migrate deploy` only |

Add `sslmode=require` if it is not already on the URI.

**Do not use the transaction pooler (port 6543).** Bridey booking uses Prisma interactive transactions (`$transaction(async tx => …)`). Those are not compatible with PgBouncer transaction mode.

URI query examples:

```text
DATABASE_URL="postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres?sslmode=require"
DIRECT_URL="postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres?sslmode=require"
```

If the session pooler UI is labelled “Session mode” / port 5432 on `*.pooler.supabase.com`, that is the correct `DATABASE_URL`.

## 3. Vercel environment variables

In the Vercel project → **Settings → Environment Variables**, set:

| Name | Example | Notes |
|---|---|---|
| `DATABASE_URL` | Session pooler URI | Server-only. Do not prefix with `NEXT_PUBLIC_`. |
| `DIRECT_URL` | Direct URI | Server-only. Required at **build** time so migrations can run. |
| `AUTH_SECRET` | Output of `openssl rand -base64 48` | Required in production. Cookie/JWT signing. |
| `NEXT_PUBLIC_APP_URL` | `https://your-app.vercel.app` | Public origin. Set after the first deploy if you do not know the URL yet, then redeploy. |

Optional, not used by the Vercel build:

| Name | When |
|---|---|
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | Local one-off `npm run db:bootstrap-admin` against the deployed DB |
| `ALLOW_DEMO_SEED=1` | Only if you intentionally want local demo artists (Lina/Noor/Sara) in that database |

The platform fee is **not** an env var. It stays **5 LYD** in `src/lib/constants.ts`.

## 4. Prisma migrations against the deployment database

The first Vercel production build runs:

```text
prisma migrate deploy --schema prisma/postgres/schema.prisma
```

That applies `prisma/postgres/migrations/20260901120000_init` to an **empty** Postgres database. It creates tables, unique indexes (`SlotHold`, `CapacityHold`, `PlatformFee.bookingId`), and integer LYD columns. It does **not** delete data on later deploys; it only applies new migration folders.

Do **not** run `prisma db push --force-reset` against the test/live database.

To run migrations on your machine (optional):

```bash
npx prisma migrate deploy --schema prisma/postgres/schema.prisma
```

with `DATABASE_URL` and `DIRECT_URL` pointing at Supabase.

If you change `prisma/schema.prisma` later:

1. Keep using SQLite locally (`npm run db:push`).
2. Run `npm run db:sync-postgres`.
3. Create a new Postgres migration (see below), commit it, then deploy.

```bash
npm run db:sync-postgres
npx prisma migrate diff --from-migrations prisma/postgres/migrations --to-schema-datamodel prisma/postgres/schema.prisma --script --shadow-database-url "$DIRECT_URL"
```

Put the SQL in a new folder under `prisma/postgres/migrations/<timestamp>_description/migration.sql`. Prefer `prisma migrate deploy`, never `--force-reset`.

## 5. Deploy the Next.js app to Vercel

1. Push this repo to GitHub (already done if you followed the previous upload).
2. [vercel.com/new](https://vercel.com/new) → import `mousaalsarah/bridey`.
3. Framework: Next.js. Build command stays `npm run build`. Output: default.
4. Paste the env vars from section 3 **before** the first production deploy.
5. Deploy.

The build generates the Prisma client from `prisma/postgres/schema.prisma` because `DATABASE_URL` starts with `postgres`.

## 6. Verify the deployment

1. Open `https://<project>.vercel.app` — marketing homepage loads.
2. `/signup` — create a real test business (not the local demo accounts).
3. Complete onboarding, add a service and hours.
4. Open `/a/<slug>` in a private window and request a public booking.
5. Confirm it in the dashboard — **5 LYD** fee, bride phone becomes visible, Bridey Pass QR appears.
6. Scan `/p/<token>` while logged in as that business — appointment flow `CONFIRMED → CHECKED_IN → IN_PROGRESS → COMPLETED`.
7. Record a partial payment after `COMPLETED` — still allowed.
8. Try two overlapping hourly bookings — the second should return unavailable.

**Uploads:** avatar, cover, portfolio, and fee-receipt files will return `STORAGE_UNAVAILABLE` on Vercel. Booking, Pass, and payments still work. See “Known limitations”.

**Admin:** `/admin/login` needs a row in `Admin`. From this repo, with Supabase URLs in your shell (not committed):

```bash
set ADMIN_EMAIL=you@example.com
set ADMIN_PASSWORD=choose-a-strong-password
npm run db:bootstrap-admin
```

On macOS/Linux use `export` instead of `set`.

## 7. Switch later to `bridey.ly`

1. Add the domain in Vercel → **Project → Settings → Domains**.
2. Point DNS as Vercel instructs.
3. Set `NEXT_PUBLIC_APP_URL=https://bridey.ly` and redeploy.
4. Share/QR links generated in the browser already use `window.location.origin`, so existing Pass QR codes encoded with the old `*.vercel.app` origin still open on that host; new QR codes will use `bridey.ly`.

## 8. Local development (SQLite)

Unchanged:

```bash
copy .env.example .env
npm install
npm run setup
npm run dev
```

Keep `DATABASE_URL="file:./dev.db"` in `.env`. Do not put Supabase URLs in the local `.env` unless you are intentionally talking to Postgres (bootstrap admin, etc.).

`prisma/dev.db` is gitignored and is not modified by the Postgres schema copy.

## 9. Known limitations of this free testing setup

- **No persistent image storage.** Vercel’s filesystem is ephemeral. Portfolio/avatar/cover/receipt uploads are blocked on Vercel until a blob store (for example Supabase Storage) is added.
- **Vercel Hobby function timeout is 10 seconds.** Booking routes request 30s (`maxDuration`); Hobby still caps at 10s. Slow cold starts plus a serializable transaction could fail under load. A Pro plan raises this.
- **Supabase free connection limits.** Use the session pooler. Do not connect every serverless invocation with the direct URI.
- **Serializable transactions** abort more often on Postgres than on SQLite. The app retries the existing booking transaction on serialization failures; unique slot/capacity/fee constraints still apply.
- **No production email.** Booking confirmation is in-app only.
- **Demo seed is not applied on Vercel.** Testers sign up themselves.
- **IPv6:** if the direct host fails from some networks, use the connection strings Supabase shows for your platform.

## Schema source of truth

| Environment | Schema | Database command |
|---|---|---|
| Local | `prisma/schema.prisma` (SQLite) | `npm run db:push` / `npm run setup` |
| Vercel | `prisma/postgres/schema.prisma` (PostgreSQL) | `prisma migrate deploy` during `npm run build` |
