import 'server-only';
import { getEnv } from '@/server/env';
import { createFakeProvider } from './fake';
import { createPayPlusProvider } from './payplus';
import type { PaymentProvider } from './provider';

export type { PaymentProvider } from './provider';

const instances = new Map<string, PaymentProvider>();

/**
 * The payment provider: the one named by `PAYMENT_PROVIDER`, or `id` when a stored checkout or a
 * callback URL names one. The fake provider refuses to load when `APP_ENV=production`.
 */
export function getProvider(id?: string): PaymentProvider {
  const env = getEnv();
  const wanted = id ?? env.PAYMENT_PROVIDER;
  const existing = instances.get(wanted);
  if (existing) return existing;
  let created: PaymentProvider;
  if (wanted === 'fake') {
    created = createFakeProvider();
  } else if (wanted === 'payplus') {
    created = createPayPlusProvider({
      baseUrl: env.PAYPLUS_BASE_URL ?? '',
      apiKey: env.PAYPLUS_API_KEY ?? '',
      secretKey: env.PAYPLUS_SECRET_KEY ?? '',
      paymentPageUid: env.PAYPLUS_PAYMENT_PAGE_UID ?? '',
    });
  } else {
    throw new Error('Unknown payment provider');
  }
  instances.set(wanted, created);
  return created;
}
