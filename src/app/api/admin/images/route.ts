import { z } from 'zod';
import { json, jsonError, originGuard } from '@/server/auth/api';
import { requireAdminApi } from '@/server/auth/require-admin';
import { actorOf } from '@/server/catalog/result';
import { addImage, adminImageUrl } from '@/server/catalog/images';
import { getEnv } from '@/server/env';
import { MAX_BYTES } from '@/server/images/process';
import { securityHeaders } from '@/server/security/headers';

export const dynamic = 'force-dynamic';

// The proxy does not run for this route (its body-buffering limit would cut 20 MB uploads), so the
// static security headers are set here.
function withHeaders(response: Response): Response {
  const https = getEnv().APP_ORIGIN.startsWith('https://');
  for (const [key, value] of Object.entries(securityHeaders({ https })))
    response.headers.set(key, value);
  return response;
}

// Room for the multipart framing and the productId field around a 20 MB file.
const MAX_BODY_BYTES = MAX_BYTES + 256 * 1024;

const productIdSchema = z.uuid();

/** Reads the body in chunks and stops as soon as it is over the limit (chunked uploads have no Content-Length). */
async function readCapped(request: Request): Promise<Uint8Array<ArrayBuffer> | null> {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  if (request.body === null) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // The chunks are copies of what `body` now holds: let them go before the body is parsed.
  chunks.length = 0;
  return body;
}

export async function POST(request: Request): Promise<Response> {
  const context = await requireAdminApi(request);
  if (context instanceof Response) return withHeaders(context);
  const blocked = originGuard(request);
  if (blocked) return withHeaders(blocked);

  // 20 MB guard before the body is parsed.
  let body = await readCapped(request);
  if (body === null) return withHeaders(jsonError(400, 'too_large'));
  let form: FormData;
  try {
    form = await new Response(body, {
      headers: { 'content-type': request.headers.get('content-type') ?? '' },
    }).formData();
  } catch {
    return withHeaders(jsonError(400, 'bad_request'));
  }
  // The raw body is no longer needed once parsed (it is the largest copy of the upload).
  body = null;

  const file = form.get('file');
  const productId = productIdSchema.safeParse(form.get('productId'));
  if (!(file instanceof File) || !productId.success)
    return withHeaders(jsonError(400, 'bad_request'));
  if (file.size > MAX_BYTES) return withHeaders(jsonError(400, 'too_large'));

  const result = await addImage(
    actorOf(context),
    productId.data,
    Buffer.from(await file.arrayBuffer()),
  );
  if (!result.ok) {
    return withHeaders(
      result.code === 'not_found' ? jsonError(404, 'not_found') : jsonError(400, result.code),
    );
  }
  return withHeaders(
    json(
      {
        id: result.id,
        position: result.position,
        previewUrl: adminImageUrl(result.storageKey, 400),
      },
      201,
    ),
  );
}
