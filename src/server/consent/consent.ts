import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { STORAGE_ITEMS } from '@/lib/consent/registry';
import { formFailure, ok, type ActionResult } from '@/server/catalog/result';
import { db } from '@/server/db/client';
import { consentRecord, contentPage } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { getEnv } from '@/server/env';
import { checkRateLimit } from '@/server/security/rate-limit';
import { consentConfig } from './config';

/** Cookie names (registry items). */
export const CONSENT_COOKIE = 'ac_consent';

/** 12 months, in seconds. */
export const CONSENT_MAX_AGE_SEC = 365 * 24 * 60 * 60;

/** `consent` rate limit (contracts/server-actions.md > saveConsent): 30 per 60 s per visitor. */
const RATE_LIMIT = { limit: 30, windowSec: 60 } as const;

const ERRORS = { unavailable: 'consent.errors.unavailable', invalid: 'consent.errors.invalid' };

export type Choices = Record<string, boolean>;

export interface ConsentCookie {
  recordId: string;
  policyVersion: number;
  choices: Choices;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const VERSION = /^[1-9][0-9]{0,8}$/;
const BASE64URL = /^[A-Za-z0-9_-]+$/;

/** `<recordId>.<policyVersion>.<base64url JSON choices>` (contracts/consent.md). */
export function serializeConsentCookie(record: ConsentCookie): string {
  const payload = Buffer.from(JSON.stringify(record.choices), 'utf8').toString('base64url');
  return `${record.recordId}.${String(record.policyVersion)}.${payload}`;
}

/** The cookie's content, or null for anything that is not exactly the format above. */
export function parseConsentCookie(value: string | undefined): ConsentCookie | null {
  if (value === undefined) return null;
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [recordId, version, payload] = parts as [string, string, string];
  if (!UUID.test(recordId) || !VERSION.test(version) || !BASE64URL.test(payload)) return null;
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) return null;
  const choices: Choices = {};
  for (const [key, flag] of Object.entries(json)) {
    if (typeof flag !== 'boolean') return null;
    choices[key] = flag;
  }
  return { recordId, policyVersion: Number(version), choices };
}

export interface ConsentState {
  /** What the cookie says (pre-sets the dialog's switches); empty without a valid cookie. */
  choices: Choices;
  needsChoice: boolean;
  /** What may run now: every category `false` while a choice is needed (user decision Q2). */
  effectiveChoices: Choices;
}

/**
 * `needsChoice = !parsed || parsed.policyVersion !== currentCookiesVersion`. While a choice is
 * needed nothing optional is effective; the older choices only pre-set the dialog (FR-022, Q2).
 */
export function consentState(
  cookieValue: string | undefined,
  cookiesVersion: number,
  categoryIds: readonly string[] = consentConfig().categories.map((category) => category.id),
): ConsentState {
  const parsed = parseConsentCookie(cookieValue);
  const needsChoice = parsed === null || parsed.policyVersion !== cookiesVersion;
  const effectiveChoices: Choices = {};
  for (const id of categoryIds) {
    effectiveChoices[id] = !needsChoice && parsed.choices[id] === true;
  }
  return { choices: parsed?.choices ?? {}, needsChoice, effectiveChoices };
}

/** The Cookie Policy page's version: the consent policy version (data-model.md). */
export async function getCookiesVersion(database: DbLike = db): Promise<number> {
  const [row] = await database
    .select({ version: contentPage.version })
    .from(contentPage)
    .where(eq(contentPage.slug, 'cookies'));
  return row?.version ?? 1;
}

/**
 * Inserts the record (the only data stored: choices, policy version, time). Within the rate limit
 * only: over it the caller still applies the choice, so a rejection is never dropped. In that
 * case the cookie's record id has no matching `consent_record` row: nothing may assume it exists.
 */
export async function saveConsentRecord(
  choices: Choices,
  policyVersion: number,
  ctx: { ip: string | null; now: Date },
): Promise<{ recordId: string; recorded: boolean }> {
  const recordId = randomUUID();
  const limit = await checkRateLimit('consent', ctx.ip ?? 'unknown', {
    ...RATE_LIMIT,
    now: ctx.now,
  });
  if (!limit.allowed) return { recordId, recorded: false };
  await db.insert(consentRecord).values({ id: recordId, choices, policyVersion });
  return { recordId, recorded: true };
}

const inputSchema = z.object({ choices: z.record(z.string(), z.boolean()) });

export interface SaveConsentContext {
  /** Client IP (null when unknown); only a daily-rotating hash of it is used, for the limit. */
  ip: string | null;
  /** Test hook. */
  now?: Date;
}

/**
 * contracts/server-actions.md > saveConsent. Unknown keys are ignored and a missing category
 * counts as `false`. Sets `ac_consent` and expires the cookies of every category now `false`.
 */
export async function saveConsent(
  input: unknown,
  ctx: SaveConsentContext,
): Promise<ActionResult<{ choices: Choices }>> {
  const config = consentConfig();
  if (!config.required) return formFailure(ERRORS.unavailable);
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return formFailure(ERRORS.invalid);

  const choices: Choices = {};
  for (const category of config.categories) {
    choices[category.id] = parsed.data.choices[category.id] === true;
  }

  const now = ctx.now ?? new Date();
  const policyVersion = await getCookiesVersion();
  const { recordId } = await saveConsentRecord(choices, policyVersion, { ip: ctx.ip, now });

  const jar = await cookies();
  jar.set(CONSENT_COOKIE, serializeConsentCookie({ recordId, policyVersion, choices }), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: CONSENT_MAX_AGE_SEC,
    secure: getEnv().APP_ORIGIN.startsWith('https://'),
  });
  expireOptionalCookies(jar, choices);
  return ok({ choices });
}

type CookieJar = Awaited<ReturnType<typeof cookies>>;

/** Expires the cookies of every optional category that is not `true` in `choices`. */
function expireOptionalCookies(jar: CookieJar, choices: Choices): void {
  for (const item of STORAGE_ITEMS) {
    if (item.kind !== 'cookie' || item.category === 'necessary') continue;
    if (choices[item.category] === true) continue;
    jar.set(item.name, '', { path: '/', maxAge: 0 });
  }
}

/**
 * While a new choice is needed (no valid `ac_consent`, or a newer Cookie Policy version: user
 * decision Q2) nothing optional may stay on the device: expires every optional cookie. Called by
 * the banner on mount only when the choice is stale (`staleOptional`), because cookies cannot be
 * written while a Server Component renders and the proxy has no database access for the policy
 * version. Does nothing when no choice is needed.
 */
export async function expireOptionalCookiesIfUndecided(): Promise<void> {
  if (!consentConfig().required) return;
  const jar = await cookies();
  const state = consentState(jar.get(CONSENT_COOKIE)?.value, await getCookiesVersion());
  if (state.needsChoice) expireOptionalCookies(jar, {});
}
