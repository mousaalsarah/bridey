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
  staffIds?: string[];
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
  contactAvailable?: boolean;
  scheduleMode?: string;
  shift?: { id: string; nameAr: string; nameEn: string; startMin: number; endMin: number } | null;
  assignments?: Array<{ teamMemberId: string; serviceId: string; teamMember: { id: string; name: string; roles: string } }>;
  service: StudioService;
  items: Array<{ serviceId?: string; nameAr: string; nameEn: string; durationMin: number; priceLyd: number; teamMemberId?: string | null }>;
  paidLyd?: number;
  depositLyd?: number;
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
  business?: {
    id: string;
    name: string;
    slug: string;
    businessType: string;
    scheduleMode: string;
    assignmentMode: string;
    neighborhood: string;
  };
  member?: {
    id: string;
    name: string;
    roles: string[];
    dailyCapacity: number;
    status: string;
  };
  permissions?: {
    canManageBusiness: boolean;
    canManageTeam: boolean;
    canManageServices: boolean;
    canViewFees: boolean;
    canAssign: boolean;
    canSeeBrideContact: boolean;
  };
  members?: Array<{
    id: string;
    artistId: string | null;
    name: string;
    phone: string;
    roles: string[];
    dailyCapacity: number;
    status: string;
    serviceIds: string[];
  }>;
  shifts?: Array<{
    id: string;
    key: string;
    nameAr: string;
    nameEn: string;
    startMin: number;
    endMin: number;
    capacity: number | null;
    sortOrder: number;
    active: boolean;
  }>;
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

  const reload = useCallback(async (broadcast = true) => {
    try {
      const res = await fetch("/api/me");
      if (res.ok) {
        setData(await res.json());
        setError("");
        if (broadcast && typeof window !== "undefined") {
          window.dispatchEvent(new Event("bridey-studio"));
        }
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
    reload(false);
    const onReload = () => reload(false);
    window.addEventListener("bridey-studio", onReload);
    return () => window.removeEventListener("bridey-studio", onReload);
  }, [reload]);

  return { data, loading, error, reload };
}
