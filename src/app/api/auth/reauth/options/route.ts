import { json, jsonError, originGuard } from '@/server/auth/api';
import { reauthOptions } from '@/server/auth/passkeys';
import { requireAdminApi } from '@/server/auth/require-admin';
import { isBlocked } from '@/server/auth/throttle';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const context = await requireAdminApi(request);
  if (context instanceof Response) return context;
  const blocked = originGuard(request);
  if (blocked) return blocked;
  if (isBlocked(context.admin)) return jsonError(401, 'blocked');
  return json(await reauthOptions(context));
}
