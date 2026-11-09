// Pure and without `server-only`: the proxy imports it (contracts/http-endpoints.md › Same-site bounce).

export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}

/** `/admin/sign-in*` and `/admin/setup`: the pages that need the OIDC origin in `form-action` and are never bounced. */
export function isSignInOrSetupPath(pathname: string): boolean {
  return (
    pathname === '/admin/sign-in' ||
    pathname.startsWith('/admin/sign-in/') ||
    pathname === '/admin/setup' ||
    pathname.startsWith('/admin/setup/')
  );
}

export interface BounceRequest {
  method: string;
  pathname: string;
  secFetchSite: string | null;
  secFetchMode: string | null;
}

/**
 * A top-level GET of an admin page (not sign-in or setup) coming from another site arrives
 * without the SameSite=Strict admin cookie, so it is answered with a same-site re-navigation.
 */
export function shouldBounceAdminRequest(request: BounceRequest): boolean {
  return (
    request.method === 'GET' &&
    isAdminPath(request.pathname) &&
    !isSignInOrSetupPath(request.pathname) &&
    request.secFetchSite === 'cross-site' &&
    request.secFetchMode === 'navigate'
  );
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

/**
 * Minimal page that re-navigates to `url` (a path + query on this site) from this site, so the
 * next request carries the SameSite=Strict cookie. Reads no session and grants nothing.
 * The Google callback (T041) reuses it.
 */
export function sameSiteNavigationPage(url: string, nonce: string): Response {
  if (!url.startsWith('/') || url.startsWith('//') || url.includes('\\')) {
    throw new Error('sameSiteNavigationPage needs a path on this site');
  }
  // `<` is escaped so the JSON string cannot close the script element.
  const scriptUrl = JSON.stringify(url).replaceAll('<', '\\u003c');
  const html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="refresh" content="0;url=${escapeAttribute(url)}">` +
    '<meta name="robots" content="noindex">' +
    `<script nonce="${nonce}">location.replace(${scriptUrl});</script>` +
    '</head><body></body></html>';
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    },
  });
}
