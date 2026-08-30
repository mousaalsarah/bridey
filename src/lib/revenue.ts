import { db } from "./db";
import { shiftMonth, todayISO } from "./utils";

/** Libya is UTC+2 year-round. */
export function monthBounds(month: string) {
  const safe = /^\d{4}-\d{2}$/.test(month) ? month : todayISO().slice(0, 7);
  const next = shiftMonth(safe, 1);
  return {
    month: safe,
    start: new Date(`${safe}-01T00:00:00+02:00`),
    end: new Date(`${next}-01T00:00:00+02:00`),
    next,
  };
}

export async function availableMonths() {
  const current = todayISO().slice(0, 7);
  const [firstFee, firstPay] = await Promise.all([
    db.platformFee.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.subscriptionPayment.findFirst({
      where: { status: "CONFIRMED", reviewedAt: { not: null } },
      orderBy: { reviewedAt: "asc" },
      select: { reviewedAt: true },
    }),
  ]);
  const starts = [firstFee?.createdAt, firstPay?.reviewedAt].filter(Boolean) as Date[];
  const earliest = starts.length
    ? starts.reduce((min, d) => (d < min ? d : min)).toISOString().slice(0, 7)
    : current;
  const months: string[] = [];
  let cursor = earliest;
  while (cursor <= current) {
    months.push(cursor);
    cursor = shiftMonth(cursor, 1);
  }
  return months.reverse();
}

export async function revenueForMonth(month: string) {
  const { start, end } = monthBounds(month);
  const [feeGroups, payGroups, outstandingGroups] = await Promise.all([
    db.platformFee.groupBy({
      by: ["artistId"],
      where: { createdAt: { gte: start, lt: end } },
      _sum: { amountLyd: true },
      _count: { _all: true },
    }),
    db.subscriptionPayment.groupBy({
      by: ["artistId"],
      where: { status: "CONFIRMED", reviewedAt: { gte: start, lt: end } },
      _sum: { amountLyd: true },
      _count: { _all: true },
    }),
    db.platformFee.groupBy({
      by: ["artistId"],
      where: { status: "UNPAID" },
      _sum: { amountLyd: true },
    }),
  ]);

  const ids = [...new Set([...feeGroups.map((g) => g.artistId), ...payGroups.map((g) => g.artistId)])];
  const artists = ids.length
    ? await db.artist.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, slug: true, neighborhood: true },
      })
    : [];
  const byId = Object.fromEntries(artists.map((a) => [a.id, a]));
  const payById = Object.fromEntries(payGroups.map((g) => [g.artistId, g]));
  const dueById = Object.fromEntries(outstandingGroups.map((g) => [g.artistId, g._sum.amountLyd || 0]));

  const rows = feeGroups
    .map((g) => {
      const artist = byId[g.artistId];
      const collected = payById[g.artistId]?._sum.amountLyd || 0;
      return {
        artistId: g.artistId,
        name: artist?.name || "خبيرة",
        slug: artist?.slug || "",
        neighborhood: artist?.neighborhood || "",
        generatedLyd: g._sum.amountLyd || 0,
        bookingCount: g._count._all,
        collectedLyd: collected,
        outstandingLyd: dueById[g.artistId] || 0,
      };
    })
    .concat(
      payGroups
        .filter((g) => !feeGroups.some((f) => f.artistId === g.artistId))
        .map((g) => {
          const artist = byId[g.artistId];
          return {
            artistId: g.artistId,
            name: artist?.name || "خبيرة",
            slug: artist?.slug || "",
            neighborhood: artist?.neighborhood || "",
            generatedLyd: 0,
            bookingCount: 0,
            collectedLyd: g._sum.amountLyd || 0,
            outstandingLyd: dueById[g.artistId] || 0,
          };
        }),
    )
    .sort((a, b) => b.generatedLyd - a.generatedLyd || b.collectedLyd - a.collectedLyd);

  const generatedLyd = rows.reduce((sum, row) => sum + row.generatedLyd, 0);
  const collectedLyd = rows.reduce((sum, row) => sum + row.collectedLyd, 0);
  const bookingCount = rows.reduce((sum, row) => sum + row.bookingCount, 0);
  const top = rows[0] || null;

  return {
    month,
    generatedLyd,
    collectedLyd,
    bookingCount,
    artistCount: rows.length,
    collectionRate: generatedLyd ? Math.round((collectedLyd / generatedLyd) * 100) : collectedLyd ? 100 : 0,
    topArtist: top
      ? {
          artistId: top.artistId,
          name: top.name,
          slug: top.slug,
          generatedLyd: top.generatedLyd,
          share: generatedLyd ? Math.round((top.generatedLyd / generatedLyd) * 100) : 0,
        }
      : null,
    artists: rows.map((row, index) => ({
      ...row,
      rank: index + 1,
      share: generatedLyd ? Math.round((row.generatedLyd / generatedLyd) * 100) : 0,
    })),
  };
}

export async function revenueTrend(endMonth: string, count = 6) {
  const months: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) months.push(shiftMonth(endMonth, -i));
  const points = [];
  for (const month of months) {
    const { start, end } = monthBounds(month);
    const [generated, collected] = await Promise.all([
      db.platformFee.aggregate({
        where: { createdAt: { gte: start, lt: end } },
        _sum: { amountLyd: true },
        _count: true,
      }),
      db.subscriptionPayment.aggregate({
        where: { status: "CONFIRMED", reviewedAt: { gte: start, lt: end } },
        _sum: { amountLyd: true },
      }),
    ]);
    points.push({
      month,
      generatedLyd: generated._sum.amountLyd || 0,
      collectedLyd: collected._sum.amountLyd || 0,
      bookingCount: generated._count,
    });
  }
  return points;
}
