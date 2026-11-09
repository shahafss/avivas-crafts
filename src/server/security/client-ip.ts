import 'server-only';
import { getEnv } from '@/server/env';

/**
 * The client IP from `X-Forwarded-For`: the entry `TRUSTED_PROXY_HOPS` from the right (each
 * trusted proxy appends the address it saw). Left-most entries are client-controlled and ignored.
 * Returns null when no trusted hop is configured or the header is too short. Never log the result.
 */
export function getClientIp(
  headers: Headers,
  hops: number = getEnv().TRUSTED_PROXY_HOPS,
): string | null {
  if (hops < 1) return null;
  const header = headers.get('x-forwarded-for');
  if (header === null) return null;
  const entries = header
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries[entries.length - hops] ?? null;
}
