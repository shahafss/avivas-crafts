import 'server-only';
import { and, desc, gte, inArray, like, lte, sql } from 'drizzle-orm';
import { addDays, isoDateInIsrael } from '@/lib/format-date';
import { db } from '@/server/db/client';
import { analyticsDailyPage, analyticsDailyReferrer, product } from '@/server/db/schema';

export type StatsPeriod = 7 | 30 | 90;

export interface Stats {
  days: StatsPeriod;
  /** One entry per Israel calendar day, oldest first, zero-filled; the last one is today. */
  visitsPerDay: { day: string; visits: number }[];
  topProducts: { slug: string; name: string; views: number }[];
  topReferrers: { host: string; visits: number }[];
}

const TOP = 10;
const PRODUCT_PATH = /^\/(?:he|en)\/product\/(.+)$/;

/** The `?days=` value as a period: 7, 30 or 90; anything else means 30. */
export function parsePeriod(value: unknown): StatsPeriod {
  return value === '7' ? 7 : value === '90' ? 90 : 30;
}

/** Visits, most viewed products and referrers over the last `days` Israel days, today included. */
export async function getStats(days: StatsPeriod, now: Date = new Date()): Promise<Stats> {
  const today = isoDateInIsrael(now);
  const first = addDays(today, 1 - days);

  const visitRows = await db
    .select({
      day: analyticsDailyReferrer.day,
      visits: sql<number>`sum(${analyticsDailyReferrer.visits})::int`,
    })
    .from(analyticsDailyReferrer)
    .where(and(gte(analyticsDailyReferrer.day, first), lte(analyticsDailyReferrer.day, today)))
    .groupBy(analyticsDailyReferrer.day);
  const byDay = new Map(visitRows.map((row) => [row.day, row.visits]));
  const visitsPerDay = Array.from({ length: days }, (_, index) => {
    const day = addDays(first, index);
    return { day, visits: byDay.get(day) ?? 0 };
  });

  // Product paths are summed across both languages in code (at most two rows per product).
  const pathRows = await db
    .select({
      path: analyticsDailyPage.path,
      views: sql<number>`sum(${analyticsDailyPage.views})::int`,
    })
    .from(analyticsDailyPage)
    .where(
      and(
        gte(analyticsDailyPage.day, first),
        lte(analyticsDailyPage.day, today),
        like(analyticsDailyPage.path, '/%/product/%'),
      ),
    )
    .groupBy(analyticsDailyPage.path);
  const perSlug = new Map<string, number>();
  for (const row of pathRows) {
    const slug = PRODUCT_PATH.exec(row.path)?.[1];
    if (slug !== undefined) perSlug.set(slug, (perSlug.get(slug) ?? 0) + row.views);
  }
  const ranked = [...perSlug.entries()]
    .sort(([slugA, a], [slugB, b]) => b - a || slugA.localeCompare(slugB))
    .slice(0, TOP);
  const names =
    ranked.length === 0
      ? []
      : await db
          .select({ slug: product.slug, nameHe: product.nameHe })
          .from(product)
          .where(
            inArray(
              product.slug,
              ranked.map(([slug]) => slug),
            ),
          );
  const nameOf = new Map(names.map((row) => [row.slug, row.nameHe]));
  const topProducts = ranked.map(([slug, views]) => ({
    slug,
    name: nameOf.get(slug) ?? slug,
    views,
  }));

  const visits = sql<number>`sum(${analyticsDailyReferrer.visits})::int`;
  const topReferrers = await db
    .select({ host: analyticsDailyReferrer.referrerHost, visits })
    .from(analyticsDailyReferrer)
    .where(and(gte(analyticsDailyReferrer.day, first), lte(analyticsDailyReferrer.day, today)))
    .groupBy(analyticsDailyReferrer.referrerHost)
    .orderBy(desc(visits), analyticsDailyReferrer.referrerHost)
    .limit(TOP);

  return { days, visitsPerDay, topProducts, topReferrers };
}
