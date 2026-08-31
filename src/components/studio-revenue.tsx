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
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-xs font-medium tracking-[0.16em] text-blush uppercase">{t.studioRevenue}</p>
          <p className="mt-1 font-display text-3xl font-semibold text-espresso">
            {current.revenueLyd} {t.lyd}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
          <div>
            <p className="font-medium text-espresso">{t.brideyCount}</p>
            <p className="font-display text-2xl text-espresso">{current.brideyCount}</p>
          </div>
          <div>
            <p className="font-medium text-espresso">{t.manualCount}</p>
            <p className="font-display text-2xl text-espresso">{current.manualCount}</p>
          </div>
          <div>
            <p className="font-medium text-espresso">{t.netAfterFees}</p>
            <p className="font-display text-xl text-espresso">{current.netLyd}</p>
          </div>
          <div>
            <p className="font-medium text-espresso">{t.avgTicket}</p>
            <p className="font-display text-xl text-espresso">{current.avgTicketLyd}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
