import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { safeAdminNext } from './next-path';
import { REAUTH_WINDOW_MS } from './passkeys';
import { cookieSourceFromRequest, getSession, type SessionContext } from './session';

export type AdminContext = SessionContext;

export type ReauthRequired = { ok: false; formError: 'admin.reauth_required' };

function json(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function isRecent(context: AdminContext, now: Date): boolean {
  const at = context.session.reauthAt;
  return at !== null && now.getTime() - at.getTime() < REAUTH_WINDOW_MS;
}

/**
 * First statement of every admin page and Server Action (before any input is parsed): the admin
 * behind a `full` session, or a redirect to the sign-in page (with `?next=` when the proxy-set
 * `x-admin-path` header passes `safeAdminNext()`).
 */
export async function requireAdmin(): Promise<AdminContext> {
  const context = await getSession();
  if (context?.session.stage === 'full') return context;
  const next = safeAdminNext((await headers()).get('x-admin-path'));
  return redirect(
    next === null ? '/admin/sign-in' : `/admin/sign-in?next=${encodeURIComponent(next)}`,
  );
}

/**
 * For ⟳ actions (contracts/server-actions.md › Passkey re-check): everything `requireAdmin()` does,
 * then `admin.reauth_required` unless a passkey assertion happened less than 5 minutes ago.
 */
export async function requireRecentAuth(
  now: Date = new Date(),
): Promise<({ ok: true } & AdminContext) | ReauthRequired> {
  const context = await requireAdmin();
  if (!isRecent(context, now)) return { ok: false, formError: 'admin.reauth_required' };
  return { ok: true, ...context };
}

/** Route handlers: the admin behind a `full` session, or a `401` response. */
export async function requireAdminApi(request: Request): Promise<AdminContext | Response> {
  const context = await getSession(cookieSourceFromRequest(request));
  return context?.session.stage === 'full' ? context : json(401, 'unauthorized');
}

/** Like `requireAdminApi`, then `403 {error: 'reauth_required'}` unless the passkey re-check is recent. */
export async function requireRecentAuthApi(
  request: Request,
  now: Date = new Date(),
): Promise<AdminContext | Response> {
  const context = await requireAdminApi(request);
  if (context instanceof Response) return context;
  return isRecent(context, now) ? context : json(403, 'reauth_required');
}

/** Auth endpoints that belong to the passkey step: a live `pending_passkey` session or a `401`. */
export async function requirePendingSession(request: Request): Promise<AdminContext | Response> {
  const context = await getSession(cookieSourceFromRequest(request));
  return context?.session.stage === 'pending_passkey' ? context : json(401, 'unauthorized');
}
