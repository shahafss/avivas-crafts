import {
  authenticationResponseSchema,
  json,
  jsonError,
  originGuard,
  readJson,
} from '@/server/auth/api';
import { verifyReauth } from '@/server/auth/passkeys';
import { requireAdminApi } from '@/server/auth/require-admin';

export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const context = await requireAdminApi(request);
  if (context instanceof Response) return context;
  const blocked = originGuard(request);
  if (blocked) return blocked;
  const body = await readJson(request, authenticationResponseSchema);
  if (body instanceof Response) return body;

  const result = await verifyReauth(context, body);
  return result.ok ? json({ ok: true }) : jsonError(401, result.error);
}
