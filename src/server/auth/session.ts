import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { cookies, headers } from 'next/headers';
import { db } from '@/server/db/client';
import { adminSession, adminUser } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';

export const SESSION_COOKIE = '__Host-ac_admin';

export const PENDING_IDLE_MS = 5 * 60_000;
export const FULL_IDLE_MS = 30 * 60_000;
export const ABSOLUTE_MS = 12 * 60 * 60_000;

export type AdminRow = typeof adminUser.$inferSelect;
export type SessionRow = typeof adminSession.$inferSelect;
export type SessionStage = SessionRow['stage'];

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
  purpose?: 'sign_in' | 'recovery' | 'setup' | undefined;
  nextPath?: string | null | undefined;
  /** Raw User-Agent; defaults to the current request's header. */
  userAgent?: string | null | undefined;
  /** Already reduced summary (used when a session is rotated). */
  userAgentSummary?: string | undefined;
  /** A passkey assertion just happened: starts with `reauth_at = now`. */
  reauth?: boolean | undefined;
  now?: Date | undefined;
  tx?: DbLike | undefined;
}

/** Creates a session and returns its token. The caller sets the cookie (`setSessionCookie`). */
export async function createSession(
  adminId: string,
  stage: SessionStage,
  options: CreateSessionOptions = {},
): Promise<{ token: string; session: SessionRow }> {
  const now = options.now ?? new Date();
  const token = randomBytes(32).toString('base64url');
  const summary =
    options.userAgentSummary ??
    summarizeUserAgent(
      options.userAgent === undefined ? await requestUserAgent() : options.userAgent,
    );
  const [session] = await (options.tx ?? db)
    .insert(adminSession)
    .values({
      tokenHash: hashToken(token),
      adminId,
      stage,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + ABSOLUTE_MS),
      userAgentSummary: summary,
      purpose: stage === 'pending_passkey' ? (options.purpose ?? null) : null,
      nextPath: stage === 'pending_passkey' ? (options.nextPath ?? null) : null,
      reauthAt: options.reauth === true ? now : null,
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
  /** Writes nothing (no touch, no marking): for admin GET pages that only look. */
  readOnly?: boolean | undefined;
}

/**
 * The live session behind the cookie, or null. Applies the idle checks (pending 5 min, full
 * 30 min) and the 12 h absolute lifetime. A full session that expired is deleted; a pending one
 * is only marked `ended_at` so the abandoned-sessions task can still count it. A live session is
 * touched (`last_seen_at`) unless `readOnly`.
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
  if (!row || row.session.endedAt !== null) return null;

  const { session, admin } = row;
  const idleMs = session.stage === 'pending_passkey' ? PENDING_IDLE_MS : FULL_IDLE_MS;
  const expired =
    now.getTime() - session.lastSeenAt.getTime() > idleMs ||
    now.getTime() >= session.expiresAt.getTime();
  if (expired) {
    if (!readOnly) {
      if (session.stage === 'pending_passkey') {
        await db
          .update(adminSession)
          .set({ endedAt: now })
          .where(and(eq(adminSession.tokenHash, tokenHash), isNull(adminSession.endedAt)));
      } else {
        await db.delete(adminSession).where(eq(adminSession.tokenHash, tokenHash));
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

/** Replaces `old` with a new session of the given stage (the old row is deleted). */
export async function rotateSession(
  old: SessionRow,
  stage: SessionStage,
  options: Omit<CreateSessionOptions, 'tx' | 'userAgentSummary'> = {},
): Promise<{ token: string; session: SessionRow }> {
  return db.transaction(async (tx) => {
    await tx.delete(adminSession).where(eq(adminSession.tokenHash, old.tokenHash));
    return createSession(old.adminId, stage, {
      ...options,
      userAgentSummary: old.userAgentSummary,
      tx,
    });
  });
}

/**
 * Ends a pending session without deleting it (so the abandoned-sessions task can count it).
 * `processed` also sets `abandon_processed_at`: use it when the ending is not an abandoned
 * sign-in (recovery registration, `no_other_admin` refusal).
 */
export async function endPendingSession(
  session: SessionRow,
  {
    processed = false,
    now = new Date(),
    tx = db,
  }: { processed?: boolean; now?: Date; tx?: DbLike } = {},
): Promise<void> {
  await tx
    .update(adminSession)
    .set({ endedAt: session.endedAt ?? now, ...(processed ? { abandonProcessedAt: now } : {}) })
    .where(eq(adminSession.tokenHash, session.tokenHash));
}

export async function deleteSession(session: SessionRow): Promise<void> {
  await db.delete(adminSession).where(eq(adminSession.tokenHash, session.tokenHash));
}

export async function signOutEverywhere(adminId: string): Promise<void> {
  await db.delete(adminSession).where(eq(adminSession.adminId, adminId));
}

export interface SessionListItem {
  /** Opaque id for `revokeSession` (the stored hash, which cannot be turned back into a cookie). */
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
  expiresAt: Date;
  userAgentSummary: string;
}

/** The admin's full sessions, newest first. */
export async function listSessions(adminId: string): Promise<SessionListItem[]> {
  const rows = await db
    .select()
    .from(adminSession)
    .where(and(eq(adminSession.adminId, adminId), eq(adminSession.stage, 'full')))
    .orderBy(desc(adminSession.createdAt));
  return rows.map((row) => ({
    id: Buffer.from(row.tokenHash).toString('hex'),
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    expiresAt: row.expiresAt,
    userAgentSummary: row.userAgentSummary,
  }));
}

export async function markReauthenticated(
  session: SessionRow,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(adminSession)
    .set({ reauthAt: now })
    .where(eq(adminSession.tokenHash, session.tokenHash));
}
