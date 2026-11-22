import 'server-only';
import { randomBytes } from 'node:crypto';

export { isRandomSlug, slugify } from '@/lib/slug';

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** `length` random lowercase base32 characters (no padding). */
export function randomBase32(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += BASE32.charAt((bytes[i] ?? 0) % 32);
  return out;
}

/** `<prefix>-<8 random base32 chars>`: the fallback when there is no English name. */
export function randomSlug(prefix: 'p' | 'c'): string {
  return `${prefix}-${randomBase32(8)}`;
}

/** First free slug of `base`, `base-2`, `base-3`, ... (each within 60 characters). */
export async function uniqueSlug(
  base: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  if (!(await isTaken(base))) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${String(n)}`;
    const candidate = `${base.slice(0, 60 - suffix.length).replace(/-+$/g, '')}${suffix}`;
    if (!(await isTaken(candidate))) return candidate;
  }
}
