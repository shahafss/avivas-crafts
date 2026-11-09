import 'server-only';
import { createHmac } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { rateLimitBucket } from '@/server/db/schema';
import { getEnv } from '@/server/env';

export interface RateLimitOptions {
  limit: number;
  windowSec: number;
  /** Test hook. */
  now?: Date;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

function hmac(key: Buffer | string, message: string): Buffer {
  return createHmac('sha256', key).update(message).digest();
}

/**
 * Fixed-window counter. The subject (an IP, an admin id, ...) is never stored: it is reduced to
 * HMAC-SHA256(dailyKey, subject), where the daily key rotates every UTC day, so buckets of
 * different days cannot be linked. `windowSec` must divide 86400 so windows align with the
 * UTC-midnight key rotation (otherwise a throw).
 */
export async function checkRateLimit(
  scope: string,
  subject: string,
  { limit, windowSec, now = new Date() }: RateLimitOptions,
): Promise<RateLimitResult> {
  // Buckets are keyed by a daily-rotating hash, so a window must never span UTC midnight.
  if (!Number.isInteger(windowSec) || windowSec < 1 || 86_400 % windowSec !== 0) {
    throw new Error('windowSec must be a positive divisor of 86400');
  }
  const day = now.toISOString().slice(0, 10);
  const dailyKey = hmac(Buffer.from(getEnv().SECRET_HMAC_KEY, 'base64'), `rl:${day}`);
  const subjectHash = hmac(dailyKey, subject).toString('hex');

  const nowSec = Math.floor(now.getTime() / 1000);
  const windowStart = Math.floor(nowSec / windowSec) * windowSec;
  const windowEnd = windowStart + windowSec;
  const key = `${scope}:${subjectHash}:${String(windowStart)}`;

  const [row] = await db
    .insert(rateLimitBucket)
    .values({ key, count: 1, expiresAt: new Date(windowEnd * 1000) })
    .onConflictDoUpdate({
      target: rateLimitBucket.key,
      set: { count: sql`${rateLimitBucket.count} + 1` },
    })
    .returning({ count: rateLimitBucket.count });

  const count = row?.count ?? 1;
  return { allowed: count <= limit, retryAfterSec: Math.max(1, windowEnd - nowSec) };
}
