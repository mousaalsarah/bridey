"use client";

import { Card } from "@/components/ui";
import { useLang } from "@/lib/language";
import { studioMonthStats } from "@/lib/studio-stats";
import type { StudioBooking, StudioFee } from "@/lib/use-studio";
import { todayISO } from "@/lib/utils";

export function StudioRevenuePeek({ bookings, fees }: { bookings: StudioBooking[]; fees: StudioFee[] }) {
  const { t } = useLang();
  const month = todayISO().slice(0, 7);
  const current = studioMonthStats(bookings, fees, month);

  return (
    <Card className="bg-espresso text-ivory">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs tracking-[0.2em] text-gold uppercase">{t.studioRevenue}</p>
          <p className="mt-1 font-display text-3xl">
            {current.revenueLyd} {t.lyd}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-ivory/50">{t.brideyCount}</p>
            <p className="font-display text-2xl text-gold">{current.brideyCount}</p>
          </div>
          <div>
            <p className="text-ivory/50">{t.manualCount}</p>
            <p className="font-display text-2xl">{current.manualCount}</p>
          </div>
          <div>
            <p className="text-ivory/50">{t.netAfterFees}</p>
            <p className="font-display text-xl">{current.netLyd}</p>
          </div>
          <div>
            <p className="text-ivory/50">{t.avgTicket}</p>
            <p className="font-display text-xl">{current.avgTicketLyd}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
