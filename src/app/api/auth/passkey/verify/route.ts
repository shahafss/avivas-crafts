import {
  authenticationResponseSchema,
  json,
  jsonError,
  originGuard,
  readJson,
} from '@/server/auth/api';
import { verifyAuthentication } from '@/server/auth/passkeys';
import { requirePendingSession } from '@/server/auth/require-admin';
import { setSessionCookie } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const context = await requirePendingSession(request);
  if (context instanceof Response) return context;
  const blocked = originGuard(request);
  if (blocked) return blocked;
  if (context.session.purpose === 'setup') return jsonError(403, 'not_allowed');
  const body = await readJson(request, authenticationResponseSchema);
  if (body instanceof Response) return body;

  const result = await verifyAuthentication(context, body);
  if (!result.ok) return jsonError(401, result.error);
  await setSessionCookie(result.token);
  return json({ redirect: result.redirect });
}
