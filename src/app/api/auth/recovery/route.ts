import { z } from 'zod';
import { json, jsonError, originGuard, readJson } from '@/server/auth/api';
import { attemptRecovery } from '@/server/auth/recovery';
import { requirePendingSession } from '@/server/auth/require-admin';
import { clearSessionCookie } from '@/server/auth/session';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ code: z.string().max(64).optional() });

/** Without another admin who has an active passkey this answers `409` before looking at the code. */
export async function POST(request: Request): Promise<Response> {
  const context = await requirePendingSession(request);
  if (context instanceof Response) return context;
  const blocked = originGuard(request);
  if (blocked) return blocked;
  const body = await readJson(request, bodySchema);
  if (body instanceof Response) return body;

  const result = await attemptRecovery(context, body.code);
  if (result.ok) return json({ ok: true });
  if (result.error === 'no_other_admin') {
    await clearSessionCookie();
    return jsonError(409, 'no_other_admin');
  }
  return jsonError(result.error === 'code_required' ? 400 : 401, result.error);
}
