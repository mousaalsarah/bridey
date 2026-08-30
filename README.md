# Bridey

SaaS booking platform for beauty artists in Benghazi. Artists share a Snapchat-ready link; brides book a date. Bridey charges **10 LYD** to the artist on each confirmed booking.

## Stack

- Next.js 16 (App Router) + TypeScript
- Tailwind CSS 4
- Prisma + SQLite (swap `DATABASE_URL` to PostgreSQL for production)
- Cookie sessions (jose) + bcrypt
- Arabic-first RTL, English toggle, Africa/Tripoli dates, LYD

## Run locally

```bash
npm install
npm run setup
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Demo artist: `0910000001` / `bridey123`  
Public booking page: [http://localhost:3000/a/lina](http://localhost:3000/a/lina)
