# Bridey

Booking and appointment software for beauty businesses. Artists share a booking link; brides request a date. Bridey charges **5 LYD** per confirmed public booking (no monthly subscription). Manual bookings add no platform fee.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4
- Prisma + **SQLite locally** / **PostgreSQL on Vercel** (Supabase)
- Cookie sessions (jose) + bcrypt
- Arabic-first RTL, English toggle, Africa/Tripoli dates, LYD

## Run locally

```bash
copy .env.example .env
npm install
npm run setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Demo artist: `0910000001` / `bridey123`  
Public booking page: [http://localhost:3000/a/lina](http://localhost:3000/a/lina)

## Deploy for testing

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Vercel + Supabase. Do not run `npm run setup` against the live Postgres database (it seeds local demo accounts).
