import { getEnv } from '@/server/env';
import { getStorage } from '@/server/storage';

// Development and test only: serves the PUBLIC bucket of the fs driver.
export async function GET(
  _request: Request,
  context: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const env = getEnv();
  if (env.APP_ENV !== 'development' && env.APP_ENV !== 'test') {
    return new Response('Not found', { status: 404 });
  }
  const { key } = await context.params;
  let object;
  try {
    object = await getStorage().get('public', key.join('/'));
  } catch {
    return new Response('Not found', { status: 404 });
  }
  if (!object) return new Response('Not found', { status: 404 });
  return new Response(object.body, {
    headers: {
      'Content-Type': 'image/webp',
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=60',
    },
  });
}
