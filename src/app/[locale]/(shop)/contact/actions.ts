'use server';

import { headers } from 'next/headers';
import { submitContact as submitContactRecord } from '@/server/contact/submit';
import type { SubmitContactResult } from '@/server/contact/submit';
import { getClientIp } from '@/server/security/client-ip';

/** The contact form's submit (contracts/server-actions.md). Public: no sign-in. */
export async function submitContact(input: unknown): Promise<SubmitContactResult> {
  return submitContactRecord(input, { ip: getClientIp(await headers()) });
}
