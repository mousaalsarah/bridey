"use client";

import { useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { useLang } from "@/lib/language";
import { parsePassToken } from "@/lib/pass-token";

export function PassScanner({ onToken }: { onToken: (token: string) => void }) {
  const { t } = useLang();
  const hostId = useRef(`bridey-scan-${Math.random().toString(36).slice(2, 8)}`).current;
  const [error, setError] = useState("");

  useEffect(() => {
    let instance: Html5Qrcode | null = null;
    let cancelled = false;
    let handled = false;

    async function safeStop() {
      const scanner = instance;
      if (!scanner) return;
      try {
        if (scanner.isScanning) await scanner.stop();
      } catch {
        /* already stopped or never started */
      }
      try {
        scanner.clear();
      } catch {
        /* ignore */
      }
    }

    async function start() {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled) return;
        instance = new Html5Qrcode(hostId, false);
        await instance.start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 240, height: 240 } },
          (text) => {
            const token = parsePassToken(text);
            if (!token || handled || cancelled) return;
            handled = true;
            onToken(token);
          },
          () => undefined,
        );
        if (cancelled) await safeStop();
      } catch {
        if (cancelled) {
          await safeStop();
          return;
        }
        setError(t.cameraError);
      }
    }

    void start();
    return () => {
      cancelled = true;
      void safeStop();
    };
  }, [hostId, onToken, t.cameraError]);

  return (
    <div className="overflow-hidden rounded-2xl border border-champagne/30 bg-white p-4 shadow-soft">
      <div id={hostId} className="overflow-hidden rounded-xl bg-espresso/10" />
      {error ? (
        <p className="mt-3 text-sm text-espresso/70">{error}</p>
      ) : (
        <p className="mt-3 text-center text-xs text-taupe">{t.scanCameraHint}</p>
      )}
    </div>
  );
}
