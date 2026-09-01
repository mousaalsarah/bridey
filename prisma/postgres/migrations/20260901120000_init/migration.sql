-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."Artist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "specialty" TEXT NOT NULL DEFAULT 'makeup',
    "neighborhood" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT 'Benghazi',
    "avatarUrl" TEXT NOT NULL DEFAULT '',
    "coverUrl" TEXT NOT NULL DEFAULT '',
    "tagline" TEXT NOT NULL DEFAULT '',
    "snapchat" TEXT NOT NULL DEFAULT '',
    "instagram" TEXT NOT NULL DEFAULT '',
    "whatsapp" TEXT NOT NULL DEFAULT '',
    "pageStyle" TEXT NOT NULL DEFAULT 'ivory',
    "accent" TEXT NOT NULL DEFAULT 'gold',
    "coverLayout" TEXT NOT NULL DEFAULT 'wide',
    "ctaLabel" TEXT NOT NULL DEFAULT '',
    "bookingHorizonDays" INTEGER NOT NULL DEFAULT 21,
    "minNoticeHours" INTEGER NOT NULL DEFAULT 2,
    "showHoursOnPage" BOOLEAN NOT NULL DEFAULT true,
    "onboardingComplete" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Business" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "businessType" TEXT NOT NULL DEFAULT 'independent',
    "scheduleMode" TEXT NOT NULL DEFAULT 'SHIFT',
    "assignmentMode" TEXT NOT NULL DEFAULT 'AUTO',
    "neighborhood" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT 'Benghazi',
    "phone" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "bookingHorizonDays" INTEGER NOT NULL DEFAULT 21,
    "minNoticeHours" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Business_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TeamMember" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "artistId" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "roles" TEXT NOT NULL DEFAULT 'MAKEUP_ARTIST',
    "dailyCapacity" INTEGER NOT NULL DEFAULT 4,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TeamMemberService" (
    "teamMemberId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

    CONSTRAINT "TeamMemberService_pkey" PRIMARY KEY ("teamMemberId","serviceId")
);

-- CreateTable
CREATE TABLE "public"."Shift" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "capacity" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Service" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "businessId" TEXT,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'bridal',
    "durationMin" INTEGER NOT NULL,
    "priceLyd" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PortfolioImage" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WeeklyHour" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "businessId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,

    CONSTRAINT "WeeklyHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BlockedDate" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "businessId" TEXT,
    "date" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "BlockedDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Booking" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "businessId" TEXT,
    "serviceId" TEXT NOT NULL,
    "shiftId" TEXT,
    "scheduleMode" TEXT NOT NULL DEFAULT 'HOURLY',
    "trackCode" TEXT,
    "origin" TEXT NOT NULL DEFAULT 'public',
    "source" TEXT NOT NULL DEFAULT 'bridey',
    "brideName" TEXT NOT NULL,
    "bridePhone" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "artistNotes" TEXT NOT NULL DEFAULT '',
    "date" TEXT NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "platformFeeLyd" INTEGER NOT NULL DEFAULT 0,
    "feeStatus" TEXT NOT NULL DEFAULT 'NONE',
    "confirmedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "brideyPassToken" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "checkedInById" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3),
    "startedById" TEXT NOT NULL DEFAULT '',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT NOT NULL DEFAULT '',
    "depositLyd" INTEGER NOT NULL DEFAULT 0,
    "paidLyd" INTEGER NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT NOT NULL DEFAULT '',
    "requestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BookingAssignment" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,

    CONSTRAINT "BookingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CapacityHold" (
    "id" TEXT NOT NULL,
    "teamMemberId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "seat" INTEGER NOT NULL,
    "bookingId" TEXT NOT NULL,

    CONSTRAINT "CapacityHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SlotHold" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "startMin" INTEGER NOT NULL,
    "bookingId" TEXT NOT NULL,

    CONSTRAINT "SlotHold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PlatformFee" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "businessId" TEXT,
    "bookingId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "amountLyd" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PlatformFee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BookingItem" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "teamMemberId" TEXT,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "priceLyd" INTEGER NOT NULL,

    CONSTRAINT "BookingItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Admin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL DEFAULT '',
    "nameAr" TEXT NOT NULL,
    "priceLyd" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LYD',
    "billingInterval" TEXT NOT NULL DEFAULT 'monthly',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ArtistSubscription" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "planId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "newBookingsPaused" BOOLEAN NOT NULL DEFAULT false,
    "manualSuspend" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TEXT NOT NULL,
    "currentPeriodStart" TEXT NOT NULL,
    "currentPeriodEnd" TEXT NOT NULL,
    "nextPaymentDueDate" TEXT NOT NULL,
    "gracePeriodEndDate" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArtistSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SubscriptionInvoice" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "planId" TEXT NOT NULL DEFAULT '',
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "amountLyd" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LYD',
    "dueDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNPAID',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountLyd" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LYD',
    "method" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reference" TEXT NOT NULL DEFAULT '',
    "receiptUrl" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "paidOn" TEXT NOT NULL DEFAULT '',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT NOT NULL DEFAULT '',
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PaymentSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "bankName" TEXT NOT NULL DEFAULT '',
    "accountName" TEXT NOT NULL DEFAULT '',
    "accountNumber" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "supportedMethods" TEXT NOT NULL DEFAULT 'BANK_TRANSFER,E_PAYMENT,CASH',
    "reminderDays" INTEGER NOT NULL DEFAULT 7,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ArtistNotice" (
    "id" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "bodyAr" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtistNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "artistId" TEXT NOT NULL DEFAULT '',
    "paymentId" TEXT NOT NULL DEFAULT '',
    "invoiceId" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NumberSequence" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NumberSequence_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Artist_phone_key" ON "public"."Artist"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "Artist_slug_key" ON "public"."Artist"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Business_slug_key" ON "public"."Business"("slug");

-- CreateIndex
CREATE INDEX "Business_ownerId_idx" ON "public"."Business"("ownerId");

-- CreateIndex
CREATE INDEX "TeamMember_businessId_status_idx" ON "public"."TeamMember"("businessId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_businessId_artistId_key" ON "public"."TeamMember"("businessId", "artistId");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_businessId_key_key" ON "public"."Shift"("businessId", "key");

-- CreateIndex
CREATE INDEX "Service_businessId_idx" ON "public"."Service"("businessId");

-- CreateIndex
CREATE INDEX "WeeklyHour_businessId_idx" ON "public"."WeeklyHour"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyHour_artistId_dayOfWeek_key" ON "public"."WeeklyHour"("artistId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "BlockedDate_businessId_idx" ON "public"."BlockedDate"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "BlockedDate_artistId_date_key" ON "public"."BlockedDate"("artistId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_trackCode_key" ON "public"."Booking"("trackCode");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_brideyPassToken_key" ON "public"."Booking"("brideyPassToken");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_requestId_key" ON "public"."Booking"("requestId");

-- CreateIndex
CREATE INDEX "Booking_artistId_date_status_idx" ON "public"."Booking"("artistId", "date", "status");

-- CreateIndex
CREATE INDEX "Booking_businessId_date_status_idx" ON "public"."Booking"("businessId", "date", "status");

-- CreateIndex
CREATE INDEX "BookingAssignment_teamMemberId_idx" ON "public"."BookingAssignment"("teamMemberId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingAssignment_bookingId_serviceId_key" ON "public"."BookingAssignment"("bookingId", "serviceId");

-- CreateIndex
CREATE INDEX "CapacityHold_bookingId_idx" ON "public"."CapacityHold"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "CapacityHold_teamMemberId_date_bucket_seat_key" ON "public"."CapacityHold"("teamMemberId", "date", "bucket", "seat");

-- CreateIndex
CREATE INDEX "SlotHold_bookingId_idx" ON "public"."SlotHold"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "SlotHold_artistId_date_startMin_key" ON "public"."SlotHold"("artistId", "date", "startMin");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformFee_bookingId_key" ON "public"."PlatformFee"("bookingId");

-- CreateIndex
CREATE INDEX "PlatformFee_invoiceId_idx" ON "public"."PlatformFee"("invoiceId");

-- CreateIndex
CREATE INDEX "PlatformFee_businessId_idx" ON "public"."PlatformFee"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "public"."Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ArtistSubscription_artistId_key" ON "public"."ArtistSubscription"("artistId");

-- CreateIndex
CREATE INDEX "ArtistSubscription_status_idx" ON "public"."ArtistSubscription"("status");

-- CreateIndex
CREATE INDEX "ArtistSubscription_nextPaymentDueDate_idx" ON "public"."ArtistSubscription"("nextPaymentDueDate");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_number_key" ON "public"."SubscriptionInvoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionInvoice_reference_key" ON "public"."SubscriptionInvoice"("reference");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_subscriptionId_periodStart_idx" ON "public"."SubscriptionInvoice"("subscriptionId", "periodStart");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_artistId_status_idx" ON "public"."SubscriptionInvoice"("artistId", "status");

-- CreateIndex
CREATE INDEX "SubscriptionInvoice_status_dueDate_idx" ON "public"."SubscriptionInvoice"("status", "dueDate");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_artistId_idx" ON "public"."SubscriptionPayment"("artistId");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_status_idx" ON "public"."SubscriptionPayment"("status");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_invoiceId_idx" ON "public"."SubscriptionPayment"("invoiceId");

-- CreateIndex
CREATE INDEX "ArtistNotice_artistId_read_idx" ON "public"."ArtistNotice"("artistId", "read");

-- CreateIndex
CREATE INDEX "AuditLog_artistId_idx" ON "public"."AuditLog"("artistId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "public"."AuditLog"("action");

-- AddForeignKey
ALTER TABLE "public"."Business" ADD CONSTRAINT "Business_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."Artist"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeamMember" ADD CONSTRAINT "TeamMember_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeamMember" ADD CONSTRAINT "TeamMember_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "public"."Artist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeamMemberService" ADD CONSTRAINT "TeamMemberService_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "public"."TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeamMemberService" ADD CONSTRAINT "TeamMemberService_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "public"."Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Shift" ADD CONSTRAINT "Shift_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Service" ADD CONSTRAINT "Service_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "public"."Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Service" ADD CONSTRAINT "Service_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PortfolioImage" ADD CONSTRAINT "PortfolioImage_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "public"."Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WeeklyHour" ADD CONSTRAINT "WeeklyHour_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "public"."Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WeeklyHour" ADD CONSTRAINT "WeeklyHour_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BlockedDate" ADD CONSTRAINT "BlockedDate_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "public"."Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BlockedDate" ADD CONSTRAINT "BlockedDate_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "public"."Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "public"."Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Booking" ADD CONSTRAINT "Booking_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "public"."Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingAssignment" ADD CONSTRAINT "BookingAssignment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingAssignment" ADD CONSTRAINT "BookingAssignment_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "public"."TeamMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingAssignment" ADD CONSTRAINT "BookingAssignment_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "public"."Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CapacityHold" ADD CONSTRAINT "CapacityHold_teamMemberId_fkey" FOREIGN KEY ("teamMemberId") REFERENCES "public"."TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CapacityHold" ADD CONSTRAINT "CapacityHold_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SlotHold" ADD CONSTRAINT "SlotHold_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlatformFee" ADD CONSTRAINT "PlatformFee_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "public"."Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlatformFee" ADD CONSTRAINT "PlatformFee_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "public"."Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlatformFee" ADD CONSTRAINT "PlatformFee_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PlatformFee" ADD CONSTRAINT "PlatformFee_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."SubscriptionInvoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingItem" ADD CONSTRAINT "BookingItem_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BookingItem" ADD CONSTRAINT "BookingItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "public"."Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArtistSubscription" ADD CONSTRAINT "ArtistSubscription_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "public"."Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArtistSubscription" ADD CONSTRAINT "ArtistSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "public"."Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SubscriptionInvoice" ADD CONSTRAINT "SubscriptionInvoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."ArtistSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "public"."Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."ArtistSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."SubscriptionInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ArtistNotice" ADD CONSTRAINT "ArtistNotice_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "public"."Artist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
