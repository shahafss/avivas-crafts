// Pure and without `server-only`: used by the route handler, the client island and unit tests.
// Contract: specs/005-english-language-switch/contracts/locale-switch.md.
export type SwitchLocale = 'he' | 'en';

const MAX_LENGTH = 2048;

export function isSwitchLocale(value: unknown): value is SwitchLocale {
  return value === 'he' || value === 'en';
}

export function otherLocale(locale: SwitchLocale): SwitchLocale {
  return locale === 'he' ? 'en' : 'he';
}

/**
 * The same page in the other language: the first path segment (`/he` or `/en`) is swapped; the
 * rest of the path and the query (`search` is '' or starts with `?`) stay as they are.
 */
export function switchPath(pathname: string, search: string): string {
  const match = /^\/(he|en)(?=$|\/)/.exec(pathname);
  const current: SwitchLocale = match?.[1] === 'en' ? 'en' : 'he';
  const rest = match === null ? pathname : pathname.slice(match[0].length);
  return `/${otherLocale(current)}${rest}${search}`;
}

/** Forbidden in the path part: `//`, backslash, control characters (raw or %-encoded), `%2f`, `%5c`, `%2e`. */
const FORBIDDEN_RAW = /[\u0000-\u001f\u007f\\]|\/\//;
const FORBIDDEN_ENCODED = /%(2f|5c|2e|[01][0-9a-f]|7f)/i;

/**
 * The validated target of the language switch, or null. `path` must start with the locale `to`
 * (`/he` or `/en`, then end, `/` or `?`), have no `//`, backslash, control character, encoded
 * slash/backslash/dot or dot segment before the query, and stay on `origin` after URL parsing.
 * The result is the normalised `pathname + search`, never the raw input.
 */
export function parseSwitchTarget(
  to: unknown,
  path: unknown,
  origin: string,
): { locale: SwitchLocale; path: string } | null {
  if (!isSwitchLocale(to)) return null;
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_LENGTH) return null;
  const match = /^\/(he|en)(?=$|\/|\?)/.exec(path);
  if (match === null || match[1] !== to) return null;

  const pathPart = path.split('?')[0] ?? '';
  if (FORBIDDEN_RAW.test(pathPart) || FORBIDDEN_ENCODED.test(pathPart)) return null;
  if (pathPart.split('/').some((segment) => segment === '.' || segment === '..')) return null;
  // Control characters are refused in the query too: they would end up in the Location header.
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return null;

  let url: URL;
  try {
    url = new URL(path, origin);
  } catch {
    return null;
  }
  const normalised = /^\/(he|en)(?=\/|$)/.exec(url.pathname);
  if (url.origin !== origin || normalised === null || normalised[1] !== to) return null;
  return { locale: to, path: url.pathname + url.search };
}
