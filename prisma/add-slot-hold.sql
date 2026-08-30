-- Additive: temporary slot holds for public booking requests.
-- Nullable requestId unique allows many NULL rows (existing bookings).

ALTER TABLE "Booking" ADD COLUMN "expiresAt" DATETIME;
ALTER TABLE "Booking" ADD COLUMN "requestId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Booking_requestId_key" ON "Booking"("requestId");
CREATE INDEX IF NOT EXISTS "Booking_artistId_date_status_idx" ON "Booking"("artistId", "date", "status");

CREATE TABLE IF NOT EXISTS "SlotHold" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "artistId" TEXT NOT NULL,
  "date" TEXT NOT NULL,
  "startMin" INTEGER NOT NULL,
  "bookingId" TEXT NOT NULL,
  CONSTRAINT "SlotHold_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "SlotHold_artistId_date_startMin_key" ON "SlotHold"("artistId", "date", "startMin");
CREATE INDEX IF NOT EXISTS "SlotHold_bookingId_idx" ON "SlotHold"("bookingId");
