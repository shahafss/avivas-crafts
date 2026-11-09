'use server';

import { z } from 'zod';
import { formFailure } from '@/server/catalog/result';
import {
  retryOnlinePayment as retryRecord,
  switchToOfflinePayment as switchRecord,
  type CheckoutResult,
} from '@/server/checkout/place-order';

const inputSchema = z.object({
  resumeToken: z.string().min(1).max(100),
  acceptNewTotal: z.boolean().optional(),
});

/** A new payment page for the same details, after a failed one (T079). */
export async function retryOnlinePayment(input: unknown): Promise<CheckoutResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return formFailure('checkout.link_expired');
  return retryRecord(parsed.data.resumeToken, {
    acceptNewTotal: parsed.data.acceptNewTotal === true,
  });
}

/** An offline order from the same details, after a failed online payment (T079). */
export async function switchToOfflinePayment(input: unknown): Promise<CheckoutResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return formFailure('checkout.link_expired');
  return switchRecord(parsed.data.resumeToken, {
    acceptNewTotal: parsed.data.acceptNewTotal === true,
  });
}
