import { CONTENT_SLUGS } from '@/server/content/slugs';

// Pure rules of the cookieless page-view beacon (003 research R12). Only known public route shapes
// are accepted, so order-page tokens, admin paths and anything made up never reach the tables.

/** Pages served at `/{locale}/pages/{slug}`; `contact` has its own route (`/{locale}/contact`). */
const PAGE_SLUGS: readonly string[] = CONTENT_SLUGS.filter((slug) => slug !== 'contact');

const MAX_PATH = 300;
const MAX_HOST = 255;
const SLUG = /^[a-z0-9-]{1,80}$/;
const HOST = /^[a-z0-9.:[\]-]+$/;
export const DIRECT = '(direct)';

export interface CountablePath {
  /** The normalised path that is counted. */
  path: string;
  kind: 'home' | 'shop' | 'search' | 'contact' | 'category' | 'product' | 'page';
  /** The product, category or page slug the server checks against the database. */
  slug?: string;
}

/** Normalises a visited path, or returns null when it must not be counted. */
export function parseCountablePath(raw: unknown): CountablePath | null {
  if (typeof raw !== 'string' || raw.length > MAX_PATH || !raw.startsWith('/')) return null;
  const bare = raw.split('#')[0]?.split('?')[0] ?? '';
  let decoded: string;
  try {
    decoded = decodeURIComponent(bare);
  } catch {
    return null;
  }
  const trimmed = decoded.length > 1 && decoded.endsWith('/') ? decoded.slice(0, -1) : decoded;
  const parts = trimmed.split('/'); // ['', locale, ...]
  const locale = parts[1];
  if (locale !== 'he' && locale !== 'en') return null;
  const rest = parts.slice(2);
  const path = trimmed;

  if (rest.length === 0) return { path, kind: 'home' };
  if (rest.length === 1) {
    if (rest[0] === 'shop') return { path, kind: 'shop' };
    if (rest[0] === 'search') return { path, kind: 'search' };
    if (rest[0] === 'contact') return { path, kind: 'contact' };
    return null;
  }
  if (rest.length === 2) {
    const [area, slug] = rest;
    if (slug === undefined || !SLUG.test(slug)) return null;
    if (area === 'product') return { path, kind: 'product', slug };
    if (area === 'category') return { path, kind: 'category', slug };
    if (area === 'pages' && PAGE_SLUGS.includes(slug)) return { path, kind: 'page', slug };
  }
  return null;
}

export function normalisePath(raw: unknown): string | null {
  return parseCountablePath(raw)?.path ?? null;
}

/**
 * The referrer host to count an arrival for, or null when no arrival is counted: no `r` at all, the
 * shop itself, the payment page (a visitor coming back from paying), or something that is not a
 * host. `""` (no referrer) is a direct arrival.
 */
export function normaliseReferrer(
  raw: unknown,
  { ownHost, paymentHost }: { ownHost: string; paymentHost?: string | undefined },
): string | null {
  if (typeof raw !== 'string') return null;
  if (raw === '') return DIRECT;
  const host = raw.toLowerCase();
  if (host.length > MAX_HOST || !HOST.test(host)) return null;
  if (host === ownHost.toLowerCase()) return null;
  if (paymentHost !== undefined && host === paymentHost.toLowerCase()) return null;
  return host;
}
