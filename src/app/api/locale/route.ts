import { NextResponse, type NextRequest } from 'next/server';
import { parseSwitchTarget } from '@/lib/locale-path';
import { getEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const ONE_YEAR = 31_536_000;

function refererOrigin(value: string | null): string | null {
  if (value === null) return null;
  try {
    return new URL(value).origin;
  } catch {
    return 'invalid';
  }
}

/** Whether the request may change the visitor's language cookie (contracts/locale-switch.md). */
function mayWriteCookie(request: NextRequest, origin: string): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site !== null) return site === 'same-origin' || site === 'none';
  const referer = refererOrigin(request.headers.get('referer'));
  return referer === null || referer === origin;
}

/**
 * The language switch's target: the only writer of the `NEXT_LOCALE` cookie. Reached by a click
 * on `LanguageSwitch`; redirects to the same page in the chosen language.
 */
export function GET(request: NextRequest): Response {
  const origin = getEnv().APP_ORIGIN;
  const params = request.nextUrl.searchParams;
  const parsed = parseSwitchTarget(params.get('to'), params.get('path'), origin);
  if (parsed === null) return new Response(null, { status: 400, headers: NO_STORE });

  const response = NextResponse.redirect(`${origin}${parsed.path}`, 303);
  response.headers.set('Cache-Control', 'no-store');
  if (mayWriteCookie(request, origin)) {
    response.cookies.set('NEXT_LOCALE', parsed.locale, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: ONE_YEAR,
      secure: origin.startsWith('https://'),
    });
  }
  return response;
}
