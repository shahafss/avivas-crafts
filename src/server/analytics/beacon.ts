import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { isoDateInIsrael } from '@/lib/format-date';
import {
  normaliseReferrer,
  parseCountablePath,
  type CountablePath,
} from '@/lib/analytics/normalise-path';
import { db } from '@/server/db/client';
import { analyticsDailyPage, analyticsDailyReferrer, category, product } from '@/server/db/schema';
import { getEnv } from '@/server/env';
import { checkRateLimit } from '@/server/security/rate-limit';

const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse/i;

/** True for crawlers, link previewers and headless browsers. */
export function isBot(userAgent: string): boolean {
  return BOT.test(userAgent);
}

export interface BeaconContext {
  /** The request's `Origin` header. */
  origin: string | null;
  /** The trusted client IP; used only for the rate limit (hashed, never stored). */
  ip: string | null;
  userAgent: string | null;
  now?: Date;
}

/** FR-024: a path is counted only when it leads to something that exists and is public. */
async function exists(target: CountablePath): Promise<boolean> {
  if (target.kind === 'product') {
    const [row] = await db
      .select({ id: product.id })
      .from(product)
      .where(and(eq(product.slug, target.slug ?? ''), eq(product.state, 'published')))
      .limit(1);
    return row !== undefined;
  }
  if (target.kind === 'category') {
    const [row] = await db
      .select({ id: category.id })
      .from(category)
      .where(eq(category.slug, target.slug ?? ''))
      .limit(1);
    return row !== undefined;
  }
  return true;
}

/**
 * Counts one page view (and, with `r`, one arrival) in the daily aggregates. Cookieless: nothing
 * about the visitor is stored. Anything that is not a plain same-origin view of a known, existing
 * page is dropped silently.
 */
export async function recordView(
  input: unknown,
  { origin, ip, userAgent, now = new Date() }: BeaconContext,
): Promise<void> {
  const env = getEnv();
  // CSRF / forged counters: only our own pages may count (constitution IV).
  if (origin === null || origin !== env.APP_ORIGIN) return;
  if (userAgent !== null && isBot(userAgent)) return;
  const limit = await checkRateLimit('beacon', ip ?? 'unknown', {
    limit: 60,
    windowSec: 60,
    now,
  });
  if (!limit.allowed) return;

  const { p, r } =
    typeof input === 'object' && input !== null ? (input as { p?: unknown; r?: unknown }) : {};
  const target = parseCountablePath(p);
  if (target === null || !(await exists(target))) return;

  const day = isoDateInIsrael(now);
  await db
    .insert(analyticsDailyPage)
    .values({ day, path: target.path, views: 1 })
    .onConflictDoUpdate({
      target: [analyticsDailyPage.day, analyticsDailyPage.path],
      set: { views: sql`${analyticsDailyPage.views} + 1` },
    });

  const host = normaliseReferrer(r, {
    ownHost: new URL(env.APP_ORIGIN).host,
    paymentHost: env.PAYPLUS_PAYMENT_HOST,
  });
  if (host === null) return;
  await db
    .insert(analyticsDailyReferrer)
    .values({ day, referrerHost: host, visits: 1 })
    .onConflictDoUpdate({
      target: [analyticsDailyReferrer.day, analyticsDailyReferrer.referrerHost],
      set: { visits: sql`${analyticsDailyReferrer.visits} + 1` },
    });
}
