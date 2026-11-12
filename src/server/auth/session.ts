import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { db } from '@/server/db/client';
import { logActivity } from '@/server/activity/log';
import { adminSession, adminUser } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';

export const SESSION_COOKIE = '__Host-ac_admin';

export const IDLE_MS = 30 * 60_000;
export const ABSOLUTE_MS = 12 * 60 * 60_000;

export type AdminRow = typeof adminUser.$inferSelect;
export type SessionRow = typeof adminSession.$inferSelect;

export interface SessionContext {
  admin: AdminRow;
  session: SessionRow;
}

/** Anything with `get(name)`: the request's cookies, or a parsed `Cookie` header. */
export interface CookieSource {
  get: (name: string) => { value: string } | undefined;
}

export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/** "device · browser" from a User-Agent header; never the full string. */
export function summarizeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return '';
  const device = /iPhone/.test(userAgent)
    ? 'iPhone'
    : /iPad/.test(userAgent)
      ? 'iPad'
      : /Android/.test(userAgent)
        ? 'Android'
        : /Windows/.test(userAgent)
          ? 'Windows'
          : /Macintosh|Mac OS X/.test(userAgent)
            ? 'Mac'
            : /CrOS/.test(userAgent)
              ? 'ChromeOS'
              : /Linux/.test(userAgent)
                ? 'Linux'
                : '';
  const browser = /Edg(e|A|iOS)?\//.test(userAgent)
    ? 'Edge'
    : /OPR\/|Opera/.test(userAgent)
      ? 'Opera'
      : /Firefox\/|FxiOS\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\/|CriOS\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : '';
  return [device, browser].filter((part) => part !== '').join(' · ');
}

async function requestUserAgent(): Promise<string | null> {
  try {
    return (await headers()).get('user-agent');
  } catch {
    return null; // outside a request (CLI scripts)
  }
}

export interface CreateSessionOptions {
  /** Raw User-Agent; defaults to the current request's header. */
  userAgent?: string | null | undefined;
  now?: Date | undefined;
  tx?: DbLike | undefined;
}

/** Creates a session and returns its token. The caller sets the cookie (`setSessionCookie`). */
export async function createSession(
  adminId: string,
  options: CreateSessionOptions = {},
): Promise<{ token: string; session: SessionRow }> {
  const now = options.now ?? new Date();
  const token = randomBytes(32).toString('base64url');
  const summary = summarizeUserAgent(
    options.userAgent === undefined ? await requestUserAgent() : options.userAgent,
  );
  const [session] = await (options.tx ?? db)
    .insert(adminSession)
    .values({
      tokenHash: hashToken(token),
      adminId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + ABSOLUTE_MS),
      userAgentSummary: summary,
    })
    .returning();
  if (!session) throw new Error('Session was not created');
  return { token, session };
}

export function setSessionCookie(token: string): Promise<void> {
  return cookies().then((jar) => {
    jar.set(SESSION_COOKIE, token, { secure: true, httpOnly: true, sameSite: 'strict', path: '/' });
  });
}

/** Expires the cookie. `__Host-` cookies are only replaced by a Set-Cookie with `Secure` and `Path=/`. */
export function clearSessionCookie(): Promise<void> {
  return cookies().then((jar) => {
    jar.set(SESSION_COOKIE, '', {
      secure: true,
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      maxAge: 0,
    });
  });
}

/** Cookie source for a route handler's `Request`. */
export function cookieSourceFromRequest(request: Request): CookieSource {
  const header = request.headers.get('cookie') ?? '';
  const values = new Map<string, string>();
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > 0) values.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  }
  return {
    get: (name) => {
      const value = values.get(name);
      return value === undefined ? undefined : { value };
    },
  };
}

export interface GetSessionOptions {
  now?: Date | undefined;
  /** Writes nothing (no touch, no deleting): for admin GET pages that only look. */
  readOnly?: boolean | undefined;
}

/**
 * The live session behind the cookie, or null. A session ends (and its row is deleted) after
 * 30 minutes idle, 12 hours in all, or when the user's role is no longer `admin` (logged once as
 * `signin.role_refused`). A live session is touched (`last_seen_at`) unless `readOnly`.
 */
export async function getSession(
  source?: CookieSource,
  { now = new Date(), readOnly = false }: GetSessionOptions = {},
): Promise<SessionContext | null> {
  const jar = source ?? (await cookies());
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token === undefined || token === '' || token.length > 128) return null;
  const tokenHash = hashToken(token);

  const [row] = await db
    .select({ session: adminSession, admin: adminUser })
    .from(adminSession)
    .innerJoin(adminUser, eq(adminUser.id, adminSession.adminId))
    .where(eq(adminSession.tokenHash, tokenHash));
  if (!row) return null;

  const { session, admin } = row;
  const expired =
    now.getTime() - session.lastSeenAt.getTime() > IDLE_MS ||
    now.getTime() >= session.expiresAt.getTime();
  if (expired) {
    if (!readOnly) await db.delete(adminSession).where(eq(adminSession.tokenHash, tokenHash));
    return null;
  }
  if (admin.role !== 'admin') {
    if (!readOnly) {
      // Delete first: only the request that really removed the row logs the refusal.
      const removed = await db
        .delete(adminSession)
        .where(eq(adminSession.tokenHash, tokenHash))
        .returning({ tokenHash: adminSession.tokenHash });
      if (removed.length > 0) {
        await logActivity(db, {
          adminId: admin.id,
          actorKind: 'admin',
          actorLabel: admin.displayName,
          action: 'signin.role_refused',
        });
      }
    }
    return null;
  }
  if (readOnly) return { admin, session };
  return { admin, session: await touchSession(session, now) };
}

/** Sets `last_seen_at`. */
export async function touchSession(
  session: SessionRow,
  now: Date = new Date(),
): Promise<SessionRow> {
  await db
    .update(adminSession)
    .set({ lastSeenAt: now })
    .where(eq(adminSession.tokenHash, session.tokenHash));
  return { ...session, lastSeenAt: now };
}

export async function deleteSession(session: SessionRow): Promise<void> {
  await db.delete(adminSession).where(eq(adminSession.tokenHash, session.tokenHash));
}

export async function signOutEverywhere(adminId: string): Promise<void> {
  await db.delete(adminSession).where(eq(adminSession.adminId, adminId));
}
