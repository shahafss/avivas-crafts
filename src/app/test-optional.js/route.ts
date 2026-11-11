import { consentConfig } from '@/server/consent/config';
import { getEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

/**
 * Test-only script of the dummy optional category (contracts/routes.md): 404 unless
 * `CONSENT_TEST_CATEGORY=analytics` (which production refuses); otherwise it sets the
 * `ac_test_optional` cookie. Not in `public/`, which would serve it unconditionally.
 */
export function GET(): Response {
  if (!consentConfig().test) return new Response(null, { status: 404 });
  const secure = getEnv().APP_ORIGIN.startsWith('https://') ? '; Secure' : '';
  const body = `document.cookie = 'ac_test_optional=1; Path=/; Max-Age=31536000; SameSite=Lax${secure}';\n`;
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' },
  });
}
