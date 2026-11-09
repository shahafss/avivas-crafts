import 'server-only';
import { z } from 'zod';
import { isSameOrigin } from '@/server/security/origin';

const MAX_BODY_BYTES = 64 * 1024;

/** `{ "error": "<code>" }` only, never details (ASVS V16). */
export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Cookie-authenticated POST handlers: `403` unless the `Origin` header is this site. */
export function originGuard(request: Request): Response | null {
  return isSameOrigin(request) ? null : jsonError(403, 'bad_origin');
}

/** JSON body validated with Zod (`415` for another content type, `400` for bad or oversized input). */
export async function readJson<T>(request: Request, schema: z.ZodType<T>): Promise<T | Response> {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return jsonError(415, 'unsupported_media_type');
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return jsonError(413, 'too_large');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return jsonError(400, 'bad_request');
  }
  const parsed = schema.safeParse(raw);
  return parsed.success ? parsed.data : jsonError(400, 'bad_request');
}

const base64url = z.string().min(1).max(8192);

/** Shape of `AuthenticationResponseJSON` from @simplewebauthn/browser. */
export const authenticationResponseSchema = z.object({
  id: base64url,
  rawId: base64url,
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: base64url,
    authenticatorData: base64url,
    signature: base64url,
    userHandle: base64url.optional(),
  }),
  authenticatorAttachment: z.enum(['cross-platform', 'platform']).optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()),
});

/** Shape of `RegistrationResponseJSON` from @simplewebauthn/browser. */
export const registrationResponseSchema = z.object({
  id: base64url,
  rawId: base64url,
  type: z.literal('public-key'),
  response: z.object({
    clientDataJSON: base64url,
    attestationObject: base64url,
    authenticatorData: base64url.optional(),
    transports: z
      .array(z.enum(['ble', 'cable', 'hybrid', 'internal', 'nfc', 'smart-card', 'usb']))
      .optional(),
    publicKeyAlgorithm: z.number().optional(),
    publicKey: base64url.optional(),
  }),
  authenticatorAttachment: z.enum(['cross-platform', 'platform']).optional(),
  clientExtensionResults: z.record(z.string(), z.unknown()),
});
