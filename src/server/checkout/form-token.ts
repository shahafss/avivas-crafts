import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getEnv } from '@/server/env';

export const FORM_MIN_AGE_MS = 3000;
export const FORM_MAX_AGE_MS = 2 * 60 * 60 * 1000;

function sign(timestamp: string): string {
  return createHmac('sha256', Buffer.from(getEnv().SECRET_HMAC_KEY, 'base64'))
    .update(`form:${timestamp}`)
    .digest('hex');
}

/** `<ms since epoch>.<HMAC>`: proves when the form was rendered (bots post faster than 3 s). */
export function issueFormToken(now: number = Date.now()): string {
  const timestamp = String(now);
  return `${timestamp}.${sign(timestamp)}`;
}

/** True for a token we issued that is between 3 seconds and 2 hours old. */
export function verifyFormToken(token: string, now: number = Date.now()): boolean {
  const [timestamp, signature, ...rest] = token.split('.');
  if (timestamp === undefined || signature === undefined || rest.length > 0) return false;
  if (!/^\d{10,16}$/.test(timestamp)) return false;
  const expected = Buffer.from(sign(timestamp));
  const given = Buffer.from(signature);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  const age = now - Number(timestamp);
  return age >= FORM_MIN_AGE_MS && age <= FORM_MAX_AGE_MS;
}
