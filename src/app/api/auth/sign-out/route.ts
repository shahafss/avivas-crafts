import { NextResponse } from 'next/server';
import { logActivity } from '@/server/activity/log';
import { json, originGuard } from '@/server/auth/api';
import {
  clearSessionCookie,
  cookieSourceFromRequest,
  deleteSession,
  getSession,
  signOutEverywhere,
} from '@/server/auth/session';
import { db } from '@/server/db/client';
import { getEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

async function wantsAll(request: Request): Promise<boolean> {
  const type = (request.headers.get('content-type') ?? '').toLowerCase();
  try {
    if (type.startsWith('application/json')) {
      const body = (await request.json()) as { all?: unknown };
      return body.all === true;
    }
    if (type.startsWith('application/x-www-form-urlencoded')) {
      return (await request.formData()).get('all') === '1';
    }
  } catch {
    // an unreadable body means "this session only"
  }
  return false;
}

/** Ends this session (or all of the admin's with `all`).  */
export async function POST(request: Request): Promise<Response> {
  const blocked = originGuard(request);
  if (blocked) return blocked;
  const context = await getSession(cookieSourceFromRequest(request), { readOnly: true });
  if (context) {
    const all = await wantsAll(request);
    if (all) await signOutEverywhere(context.admin.id);
    else await deleteSession(context.session);
    await logActivity(db, {
      adminId: context.admin.id,
      actorKind: 'admin',
      actorLabel: context.admin.displayName,
      action: all ? 'session.revoked' : 'session.signed_out',
    });
  }
  await clearSessionCookie();
  // A plain form post (the sign-out button) lands on the sign-in page; scripts get JSON.
  if ((request.headers.get('accept') ?? '').includes('text/html')) {
    return NextResponse.redirect(new URL('/admin/sign-in', getEnv().APP_ORIGIN), 303);
  }
  return json({ ok: true });
}
