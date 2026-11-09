import { NextResponse, type NextRequest } from 'next/server';
import { clearOauthCookie, completeGoogleFlow, OAUTH_COOKIE } from '@/server/auth/google';
import { setSessionCookie } from '@/server/auth/session';
import { getEnv } from '@/server/env';
import { sameSiteNavigationPage } from '@/server/security/admin-bounce';
import { generateNonce } from '@/server/security/headers';

export const dynamic = 'force-dynamic';

const ERROR_CODES = { not_allowed: 'not_allowed', expired: 'expired', invalid: 'error' } as const;

/**
 * Google redirects here. The success answer is a page, not an HTTP redirect: the navigation
 * started on Google's site, so browsers withhold the SameSite=Strict session cookie on a
 * redirect. The page's script navigates from this site, and that request carries the cookie.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const origin = getEnv().APP_ORIGIN;
  const url = new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, origin);
  const result = await completeGoogleFlow(url, request.cookies.get(OAUTH_COOKIE)?.value);
  await clearOauthCookie();
  if (!result.ok) {
    return NextResponse.redirect(
      new URL(`/admin/sign-in?e=${ERROR_CODES[result.error]}`, origin),
      303,
    );
  }
  await setSessionCookie(result.token);
  return sameSiteNavigationPage(
    result.redirectTo,
    request.headers.get('x-nonce') ?? generateNonce(),
  );
}
