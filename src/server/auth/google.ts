import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import {
  allowInsecureRequests,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  type Configuration,
} from 'openid-client';
import { cookies, headers } from 'next/headers';
import { db } from '@/server/db/client';
import { adminSession, adminUser, oauthFlow } from '@/server/db/schema';
import { logActivity } from '@/server/activity/log';
import { kickOutbox } from '@/server/email/sender';
import { getEnv } from '@/server/env';
import { getClientIp } from '@/server/security/client-ip';
import { notifyAdmins } from '@/server/security/notify';
import { safeAdminNext } from './next-path';
import { createSession } from './session';
import { findAdminBySetupToken, hashSetupToken } from './setup-links';
import { googleStartAllowed } from './throttle';

/** Holds the OAuth `state` between the redirect to Google and the callback. */
export const OAUTH_COOKIE = '__Host-ac_oauth';
const FLOW_TTL_MS = 10 * 60_000;

export type GooglePurpose = 'sign_in' | 'recovery' | 'setup';

const REDIRECT_PATHS: Record<GooglePurpose, string> = {
  sign_in: '/admin/sign-in/passkey',
  recovery: '/admin/sign-in/recovery',
  setup: '/admin/setup',
};

function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

const configurations = new Map<string, Promise<Configuration>>();

/** OIDC discovery for `OIDC_ISSUER`, once per issuer. */
function getConfiguration(): Promise<Configuration> {
  const env = getEnv();
  const issuer = env.OIDC_ISSUER;
  let pending = configurations.get(issuer);
  if (pending === undefined) {
    const insecure = env.APP_ENV === 'development' || env.APP_ENV === 'test';
    pending = discovery(
      new URL(issuer),
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_SECRET,
      undefined,
      // eslint-disable-next-line @typescript-eslint/no-deprecated -- only for the local mock issuer
      insecure ? { execute: [allowInsecureRequests] } : undefined,
    ).then((config) => {
      // The sign-in pages' CSP `form-action` allows only the issuer's origin (research.md R14).
      const authorizationEndpoint = config.serverMetadata().authorization_endpoint;
      if (
        authorizationEndpoint === undefined ||
        new URL(authorizationEndpoint).origin !== new URL(issuer).origin
      ) {
        throw new Error('The OIDC authorization endpoint must have the same origin as OIDC_ISSUER');
      }
      return config;
    });
    configurations.set(issuer, pending);
    pending.catch(() => configurations.delete(issuer));
  }
  return pending;
}

function redirectUri(): string {
  return `${getEnv().APP_ORIGIN}/api/auth/google/callback`;
}

export type StartResult =
  { ok: true; url: string } | { ok: false; error: 'rate_limited' | 'invalid_setup' };

/**
 * Creates the `oauth_flow` row (state hash, PKCE verifier, nonce, validated `next`), sets the
 * `__Host-ac_oauth` cookie and returns Google's authorisation URL. Rate limited per IP.
 */
export async function startGoogleFlow(
  purpose: GooglePurpose,
  setupToken?: string,
  next?: string,
): Promise<StartResult> {
  const ip = getClientIp(await headers());
  if (!(await googleStartAllowed(ip))) return { ok: false, error: 'rate_limited' };

  let setupTokenHash: Buffer | null = null;
  if (purpose === 'setup') {
    const admin = setupToken === undefined ? null : await findAdminBySetupToken(setupToken);
    if (admin === null || setupToken === undefined) return { ok: false, error: 'invalid_setup' };
    setupTokenHash = hashSetupToken(setupToken);
  }

  const config = await getConfiguration();
  const state = randomState();
  const codeVerifier = randomPKCECodeVerifier();
  const nonce = randomNonce();
  await db.insert(oauthFlow).values({
    stateHash: sha256(state),
    codeVerifier,
    nonce,
    purpose,
    setupTokenHash,
    nextPath: safeAdminNext(next),
    expiresAt: new Date(Date.now() + FLOW_TTL_MS),
  });
  const url = buildAuthorizationUrl(config, {
    redirect_uri: redirectUri(),
    scope: 'openid email',
    state,
    nonce,
    code_challenge: await calculatePKCECodeChallenge(codeVerifier),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  (await cookies()).set(OAUTH_COOKIE, state, {
    secure: true,
    httpOnly: true,
    // Lax: the callback is a cross-site top-level navigation from Google, which Strict would not carry.
    sameSite: 'lax',
    path: '/',
    maxAge: FLOW_TTL_MS / 1000,
  });
  return { ok: true, url: url.href };
}

export type CompleteResult =
  | { ok: true; token: string; redirectTo: string }
  | { ok: false; error: 'not_allowed' | 'expired' | 'invalid' };

function sameValue(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Logs `signin.google_rejected` (never the email) and sends the throttled alert. */
async function reject(now: Date): Promise<CompleteResult> {
  await db.transaction(async (tx) => {
    const activityId = await logActivity(tx, {
      adminId: null,
      actorKind: 'unapproved_account',
      action: 'signin.google_rejected',
    });
    await notifyAdmins('google_rejected', { at: now }, { tx, activityId, now });
  });
  kickOutbox();
  return { ok: false, error: 'not_allowed' };
}

/**
 * Callback step. `url` is the full callback URL on `APP_ORIGIN`, `cookie` the value of
 * `__Host-ac_oauth`. Validates state (single use, bound to the cookie), PKCE, nonce and the ID
 * token, requires `email_verified`, checks the allow-list and the `google_sub` binding, and
 * creates a `pending_passkey` session.
 */
export async function completeGoogleFlow(
  url: URL,
  cookie: string | undefined,
  { now = new Date() }: { now?: Date } = {},
): Promise<CompleteResult> {
  const state = url.searchParams.get('state');
  if (state === null || cookie === undefined || !sameValue(state, cookie))
    return { ok: false, error: 'invalid' };

  // Deleting the row is what makes the state single use.
  const [flow] = await db
    .delete(oauthFlow)
    .where(eq(oauthFlow.stateHash, sha256(state)))
    .returning();
  if (!flow) return { ok: false, error: 'invalid' };
  if (flow.expiresAt.getTime() <= now.getTime()) return { ok: false, error: 'expired' };

  let claims: { sub: string; email?: unknown; email_verified?: unknown };
  try {
    const tokens = await authorizationCodeGrant(await getConfiguration(), url, {
      pkceCodeVerifier: flow.codeVerifier,
      expectedState: state,
      expectedNonce: flow.nonce,
      idTokenExpected: true,
    });
    const idClaims = tokens.claims();
    if (idClaims === undefined) return { ok: false, error: 'invalid' };
    claims = idClaims;
  } catch {
    return { ok: false, error: 'invalid' };
  }

  const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : null;
  if (email === null || claims.email_verified !== true) return reject(now);

  let admin;
  if (flow.purpose === 'setup') {
    if (flow.setupTokenHash === null) return { ok: false, error: 'invalid' };
    [admin] = await db
      .select()
      .from(adminUser)
      .where(
        and(
          eq(adminUser.setupTokenHash, flow.setupTokenHash),
          gt(adminUser.setupTokenExpiresAt, now),
        ),
      );
    if (!admin) return { ok: false, error: 'expired' };
    if (admin.googleEmail !== email) return reject(now);
  } else {
    [admin] = await db.select().from(adminUser).where(eq(adminUser.googleEmail, email));
    if (!admin) return reject(now);
  }

  if (admin.googleSub === null) {
    try {
      const bound = await db
        .update(adminUser)
        .set({ googleSub: claims.sub })
        .where(and(eq(adminUser.id, admin.id), isNull(adminUser.googleSub)))
        .returning({ id: adminUser.id });
      if (bound.length === 0) return await reject(now); // bound by a concurrent sign-in
    } catch {
      return await reject(now); // this sub already belongs to another admin
    }
  } else if (admin.googleSub !== claims.sub) {
    return reject(now);
  }

  const adminId = admin.id;
  const created = await db.transaction(async (tx) => {
    // A sign-in that never reached `full` is only marked, so the abandoned-sessions task counts it.
    await tx
      .update(adminSession)
      .set({ endedAt: now })
      .where(
        and(
          eq(adminSession.adminId, adminId),
          eq(adminSession.stage, 'pending_passkey'),
          isNull(adminSession.endedAt),
        ),
      );
    return createSession(adminId, 'pending_passkey', {
      now,
      purpose: flow.purpose,
      nextPath: safeAdminNext(flow.nextPath),
      tx,
    });
  });
  return { ok: true, token: created.token, redirectTo: REDIRECT_PATHS[flow.purpose] };
}

export function clearOauthCookie(): Promise<void> {
  return cookies().then((jar) => {
    jar.set(OAUTH_COOKIE, '', {
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
  });
}
