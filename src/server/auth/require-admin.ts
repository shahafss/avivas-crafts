import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { safeAdminNext } from './next-path';
import { cookieSourceFromRequest, getSession, type SessionContext } from './session';

export type AdminContext = SessionContext;

/**
 * First statement of every admin page and Server Action (before any input is parsed): the admin
 * behind a live session (`getSession()` already refuses users whose role is not `admin`), or a
 * redirect to the sign-in page (with `?next=` when the proxy-set `x-admin-path` header passes
 * `safeAdminNext()`).
 */
export async function requireAdmin(): Promise<AdminContext> {
  const context = await getSession();
  if (context) return context;
  const next = safeAdminNext((await headers()).get('x-admin-path'));
  return redirect(
    next === null ? '/admin/sign-in' : `/admin/sign-in?next=${encodeURIComponent(next)}`,
  );
}

/** Route handlers: the admin behind a live session, or a `401` response. */
export async function requireAdminApi(request: Request): Promise<AdminContext | Response> {
  const context = await getSession(cookieSourceFromRequest(request));
  return (
    context ??
    Response.json(
      { error: 'unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    )
  );
}
