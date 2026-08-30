"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type StudioAlert = {
  pendingBookings: number;
  latest: Array<{ id: string; brideName: string; date: string }>;
};

export function useAlerts() {
  const [alerts, setAlerts] = useState<StudioAlert>({ pendingBookings: 0, latest: [] });
  const lastCount = useRef<number | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      if (!res.ok) return;
      const body = await res.json();
      const next: StudioAlert = {
        pendingBookings: Number(body.pendingBookings) || 0,
        latest: Array.isArray(body.latest) ? body.latest : [],
      };
      if (lastCount.current !== null && lastCount.current !== next.pendingBookings) {
        window.dispatchEvent(new Event("bridey:bookings"));
      }
      lastCount.current = next.pendingBookings;
      setAlerts(next);
    } catch {
      /* keep last known count */
    }
  }, []);

  useEffect(() => {
    reload();
    const id = window.setInterval(reload, 15000);
    const onFocus = () => reload();
    const onRefresh = () => reload();
    window.addEventListener("focus", onFocus);
    window.addEventListener("bridey:alerts", onRefresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("bridey:alerts", onRefresh);
    };
  }, [reload]);

  return { alerts, reload };
}
