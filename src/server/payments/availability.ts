import type { Env } from '@/server/env';

// Type-only import: this module stays pure (no `server-only`), so unit tests need no mocks.

export interface EffectivePaymentMethods {
  /** Card payment can be offered and accepted. */
  online: boolean;
  /** Offline payment can be offered and accepted. */
  offline: boolean;
  /** A card provider is configured at all (`PAYMENT_PROVIDER` is not `none`). */
  cardAvailable: boolean;
}

/**
 * The payment methods that are really on: the stored shop settings, narrowed by whether a card
 * provider exists (data-model.md). Every surface that offers, shows or accepts a payment method
 * reads these values, never the stored flags.
 */
export function effectivePaymentMethods(
  settings: { onlinePaymentEnabled: boolean; offlinePaymentEnabled: boolean },
  provider: Env['PAYMENT_PROVIDER'],
): EffectivePaymentMethods {
  const cardAvailable = provider !== 'none';
  return {
    cardAvailable,
    online: cardAvailable && settings.onlinePaymentEnabled,
    offline: settings.offlinePaymentEnabled || !cardAvailable,
  };
}
