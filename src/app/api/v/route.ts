import { isBot, recordView } from '@/server/analytics/beacon';
import { isSameOrigin } from '@/server/security/origin';
import { getClientIp } from '@/server/security/client-ip';

const MAX_BODY_BYTES = 1024;
const NO_STORE = { 'Cache-Control': 'no-store' };

export const dynamic = 'force-dynamic';

function done(): Response {
  return new Response(null, { status: 204, headers: NO_STORE });
}

/** The body as text, or null when it is larger than the limit (read in chunks, never in full). */
async function readLimited(request: Request): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return null;
  if (request.body === null) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Cookieless page-view beacon (contracts/routes.md): `{"p": "/he/product/doll", "r": "instagram.com"}`.
 * Always answers 204 with no body, whatever happened; sets no cookie; stores nothing about the
 * requester.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    // Cheap refusals first: a cross-site or bot request costs no body read and no database call.
    if (!isSameOrigin(request)) return done();
    const userAgent = request.headers.get('user-agent');
    if (userAgent !== null && isBot(userAgent)) return done();
    const text = await readLimited(request);
    if (text === null) return done();
    const body: unknown = JSON.parse(text);
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return done();
    await recordView(body, {
      origin: request.headers.get('origin'),
      ip: getClientIp(request.headers),
      userAgent,
    });
  } catch {
    // Never an error to the client; a failed count is not worth a log line (nothing personal to log).
  }
  return done();
}
