import { json, jsonError, originGuard } from '@/server/auth/api';
import { registrationOptions, type RegistrationError } from '@/server/auth/passkeys';
import { requireRecentAuthApi } from '@/server/auth/require-admin';
import { cookieSourceFromRequest, getSession, type SessionContext } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

const STATUS: Record<RegistrationError, number> = {
  not_allowed: 401,
  reauth_required: 403,
  no_other_admin: 409,
  registration_failed: 400,
};

/**
 * Allowed for (a) a `full` session with a recent passkey re-check, (b) a setup session, or (c) a
 * session on which a recovery code was just accepted. Anything else is `401`.
 */
export async function POST(request: Request): Promise<Response> {
  // Not read-only: every step refreshes the pending session's 5-minute idle clock.
  const peek = await getSession(cookieSourceFromRequest(request));
  if (!peek) return jsonError(401, 'unauthorized');
  const blocked = originGuard(request);
  if (blocked) return blocked;

  let context: SessionContext | Response = peek;
  if (peek.session.stage === 'full') context = await requireRecentAuthApi(request);
  if (context instanceof Response) return context;

  const result = await registrationOptions(context);
  return result.ok ? json(result.options) : jsonError(STATUS[result.error], result.error);
}
