import { authenticationOptions } from '@/server/auth/passkeys';
import { json, jsonError, originGuard } from '@/server/auth/api';
import { requirePendingSession } from '@/server/auth/require-admin';
import { isBlocked } from '@/server/auth/throttle';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const context = await requirePendingSession(request);
  if (context instanceof Response) return context;
  const blocked = originGuard(request);
  if (blocked) return blocked;
  if (context.session.purpose === 'setup') return jsonError(403, 'not_allowed');
  if (isBlocked(context.admin)) return jsonError(401, 'blocked');
  return json(await authenticationOptions(context));
}
