import { z } from 'zod';
import {
  json,
  jsonError,
  originGuard,
  readJson,
  registrationResponseSchema,
} from '@/server/auth/api';
import {
  registrationPurpose,
  verifyRegistration,
  type RegistrationError,
} from '@/server/auth/passkeys';
import { requireRecentAuthApi } from '@/server/auth/require-admin';
import {
  clearSessionCookie,
  cookieSourceFromRequest,
  getSession,
  setSessionCookie,
  type SessionContext,
} from '@/server/auth/session';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  response: registrationResponseSchema,
  deviceLabel: z.string().trim().min(1).max(60),
});

const STATUS: Record<RegistrationError, number> = {
  not_allowed: 401,
  reauth_required: 403,
  no_other_admin: 409,
  registration_failed: 400,
};

/**
 * Setup (b): rotates to a `full` session and returns the recovery codes once. Recovery (c): the
 * passkey waits for another admin's approval and the pending session ends. Adding (a) needs a
 * recent passkey re-check.
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

  // Permission first, so a session that may not register learns nothing from input validation.
  const allowed = await registrationPurpose(context, new Date());
  if (!allowed.ok) return jsonError(STATUS[allowed.error], allowed.error);

  const body = await readJson(request, bodySchema);
  if (body instanceof Response) return body;

  const result = await verifyRegistration(context, body.response, body.deviceLabel);
  if (!result.ok) return jsonError(STATUS[result.error], result.error);
  if (result.status === 'pending_approval') {
    await clearSessionCookie();
    return json({ status: 'pending_approval' });
  }
  if (result.token !== undefined) await setSessionCookie(result.token);
  return json({
    status: 'ok',
    ...(result.recoveryCodes === undefined ? {} : { recoveryCodes: result.recoveryCodes }),
  });
}
