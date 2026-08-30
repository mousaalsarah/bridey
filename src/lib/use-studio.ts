"use client";

import { useCallback, useEffect, useState } from "react";

export type StudioService = {
  id: string;
  nameAr: string;
  nameEn: string;
  description: string;
  kind: string;
  durationMin: number;
  priceLyd: number;
  active: boolean;
};

export type StudioBooking = {
  id: string;
  trackCode: string | null;
  origin: string;
  source: string;
  brideName: string;
  bridePhone: string;
  notes: string;
  artistNotes: string;
  date: string;
  startMin: number;
  endMin: number;
  status: string;
  platformFeeLyd: number;
  feeStatus: string;
  expiresAt: string | null;
  service: StudioService;
  items: Array<{ nameAr: string; nameEn: string; durationMin: number; priceLyd: number }>;
};

export type StudioFee = {
  id: string;
  bookingId: string;
  amountLyd: number;
  status: string;
  createdAt: string;
  paidAt: string | null;
  booking: { id: string; brideName: string; date: string; trackCode: string | null; origin: string };
};

export type Studio = {
  artist: {
    id: string;
    name: string;
    phone: string;
    slug: string;
    bio: string;
    specialty: string;
    neighborhood: string;
    snapchat: string;
    instagram: string;
    whatsapp: string;
    avatarUrl: string;
    coverUrl: string;
    tagline: string;
    pageStyle: string;
    accent: string;
    coverLayout: string;
    ctaLabel: string;
    bookingHorizonDays: number;
    minNoticeHours: number;
    showHoursOnPage: boolean;
    onboardingComplete: boolean;
    isDemo: boolean;
  };
  services: StudioService[];
  portfolio: { id: string; url: string; caption: string }[];
  hours: { dayOfWeek: number; startMin: number; endMin: number }[];
  blocked: { date: string; reason: string }[];
  bookings: StudioBooking[];
  fees: StudioFee[];
  outstanding: number;
  billing?: {
    account: {
      status: string;
      newBookingsPaused: boolean;
      canCreateBookings: boolean;
      nextPaymentDueDate: string;
      gracePeriodEndDate: string;
      graceDaysLeft: number;
      daysUntilDue: number;
    };
    settings: {
      bankName: string;
      accountName: string;
      accountNumber: string;
      instructions: string;
      supportedMethods: string[];
    };
    openInvoice: {
      id: string;
      number: string;
      reference: string;
      amountLyd: number;
      dueDate: string;
      status: string;
    } | null;
    invoices: Array<{
      id: string;
      number: string;
      reference: string;
      amountLyd: number;
      dueDate: string;
      status: string;
    }>;
    notices: Array<{ id: string; kind: string; bodyAr: string; bodyEn: string }>;
    outstanding: number;
  };
};

export function useStudio() {
  const [data, setData] = useState<Studio | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        setData(await res.json());
        setError("");
      } else if (res.status === 401) {
        setError("UNAUTHORIZED");
        window.location.assign(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      } else {
        setError("NETWORK");
      }
    } catch {
      setError("NETWORK");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload };
}
