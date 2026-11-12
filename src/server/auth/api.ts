import 'server-only';
import { isSameOrigin } from '@/server/security/origin';

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
