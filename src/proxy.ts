import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { routing } from '@/i18n/routing';
import { getEnv } from '@/server/env';
import {
  isAdminPath,
  isSignInPath,
  sameSiteNavigationPage,
  shouldBounceAdminRequest,
} from '@/server/security/admin-bounce';
import {
  buildCsp,
  generateNonce,
  paymentHostFor,
  securityHeaders,
} from '@/server/security/headers';

// Headers, locale routing and the same-site bounce only. No authorisation here: every admin
// page, Server Action and route handler calls requireAdmin() itself (research.md R14).

const handleI18nRouting = createIntlMiddleware(routing);

function applyHeaders(response: Response, csp: string, nonce: string, https: boolean): void {
  for (const [key, value] of Object.entries(securityHeaders({ https }))) {
    response.headers.set(key, value);
  }
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('x-nonce', nonce);
}

export default function proxy(request: NextRequest): Response {
  const env = getEnv();
  const https = env.APP_ORIGIN.startsWith('https://');
  const { pathname, search } = request.nextUrl;
  const nonce = generateNonce();

  const csp = buildCsp(nonce, {
    paymentHost: paymentHostFor(env),
    imageOrigin: env.IMAGE_PUBLIC_ORIGIN,
    optionalScriptHosts: [],
    oidcOrigin: isSignInPath(pathname) ? new URL(env.OIDC_ISSUER).origin : undefined,
    dev: process.env.NODE_ENV === 'development',
    upgradeInsecureRequests: https,
  });

  if (
    shouldBounceAdminRequest({
      method: request.method,
      pathname,
      secFetchSite: request.headers.get('sec-fetch-site'),
      secFetchMode: request.headers.get('sec-fetch-mode'),
    })
  ) {
    const page = sameSiteNavigationPage(`${pathname}${search}`, nonce);
    applyHeaders(page, page.headers.get('Content-Security-Policy') ?? csp, nonce, https);
    return page;
  }

  // The nonce travels on the forwarded request headers: Next.js reads it from there for its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  // Always overwritten (never trusted from the client); requireAdmin() uses it for `next`.
  if (isAdminPath(pathname)) requestHeaders.set('x-admin-path', `${pathname}${search}`);
  else requestHeaders.delete('x-admin-path');

  let response: Response;
  if (pathname === '/') {
    const cookie = request.cookies.get('NEXT_LOCALE')?.value;
    const locale =
      routing.locales.find((candidate) => candidate === cookie) ?? routing.defaultLocale;
    response = NextResponse.redirect(new URL(`/${locale}${search}`, env.APP_ORIGIN));
  } else if (
    isAdminPath(pathname) ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/')
  ) {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  } else {
    response = handleI18nRouting(new NextRequest(request, { headers: requestHeaders }));
  }
  applyHeaders(response, csp, nonce, https);
  return response;
}

export const config = {
  // Excludes static files, and /api/admin/images so 20 MB uploads are not cut by the proxy's
  // request-body buffering limit (that route sets its own headers via securityHeaders()).
  matcher: ['/((?!api/admin/images|_next/static|_next/image|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)'],
};
