'use server';

import { headers } from 'next/headers';
import {
  expireOptionalCookiesIfUndecided,
  saveConsent as saveConsentChoice,
} from '@/server/consent/consent';
import { getClientIp } from '@/server/security/client-ip';

/** The consent banner's and settings dialog's save (contracts/server-actions.md). Public. */
export async function saveConsent(input: unknown) {
  return saveConsentChoice(input, { ip: getClientIp(await headers()) });
}

/** Called by the banner while a choice is needed: removes optional cookies left from an older policy version. */
export async function expireUndecidedCookies(): Promise<void> {
  await expireOptionalCookiesIfUndecided();
}
