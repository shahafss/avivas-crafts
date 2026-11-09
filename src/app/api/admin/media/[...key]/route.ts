import { jsonError } from '@/server/auth/api';
import { requireAdminApi } from '@/server/auth/require-admin';
import { getStorage } from '@/server/storage';

export const dynamic = 'force-dynamic';

const KEY_PATTERN = /^(p|orders)\/[a-z0-9/_-]+-(400|800|1600)\.webp$/;

/** Authenticated delivery of private images (drafts, admin previews, order snapshots). */
export async function GET(
  request: Request,
  context: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const admin = await requireAdminApi(request);
  if (admin instanceof Response) return admin;

  const { key: segments } = await context.params;
  const key = segments.join('/');
  if (key.includes('..') || key.includes('//') || !KEY_PATTERN.test(key)) {
    return jsonError(400, 'bad_key');
  }

  const object = await getStorage().get('private', key);
  if (!object) return jsonError(404, 'not_found');
  return new Response(object.body, {
    headers: {
      'Content-Type': 'image/webp',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
