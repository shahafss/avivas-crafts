// Pure and without `server-only`: used by server code and unit tests alike.
const MAX_LENGTH = 512;
const BASE = 'http://admin.invalid';

/**
 * The same-origin admin path to return to after sign-in, or null (meaning `/admin`).
 * Accepts only a path under `/admin` that is not `/admin/sign-in*` or `/admin/setup*`, has no
 * `//`, backslash, control character, scheme or dot segment (`..`, also percent-encoded), and is
 * at most 512 characters. The result is the normalised `pathname + search`.
 */
export function safeAdminNext(path: unknown): string | null {
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_LENGTH) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(path) || path.includes('//')) return null;
  if (path !== '/admin' && !path.startsWith('/admin/') && !path.startsWith('/admin?')) return null;
  let url: URL;
  try {
    url = new URL(path, BASE);
  } catch {
    return null;
  }
  // Dot segments are resolved by URL parsing: what is left must still be an admin path.
  const { pathname } = url;
  if (url.origin !== BASE || (pathname !== '/admin' && !pathname.startsWith('/admin/')))
    return null;
  if (/^\/admin\/(sign-in|setup)(\/|$)/.test(pathname)) return null;
  const normalised = pathname + url.search;
  return normalised.length <= MAX_LENGTH ? normalised : null;
}
