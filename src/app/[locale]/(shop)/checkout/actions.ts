'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { routing } from '@/i18n/routing';
import { formFailure, ok, type ActionResult } from '@/server/catalog/result';
import { placeOrder as placeOrderRecord, type CheckoutResult } from '@/server/checkout/place-order';
import { presentCart, type PricedCart } from '@/server/checkout/price-cart';
import { loadPricingProducts } from '@/server/checkout/pricing-data';
import { cartItemsSchema, priceLines, quote, type Quote } from '@/server/checkout/pricing';
import { resolveZone } from '@/server/checkout/zones';
import { getClientIp } from '@/server/security/client-ip';

const quoteSchema = z.object({
  items: cartItemsSchema,
  deliveryMethod: z.enum(['shipping', 'pickup']),
  country: z.string().max(10).optional(),
  locale: z.enum(routing.locales).default('he'),
});

export type QuoteCheckoutResult = Quote & { zoneCode: string; lines: PricedCart['lines'] };

/**
 * Totals for the checkout (contracts/server-actions.md), with the priced lines the order summary
 * shows (a superset of the contract's output: one round trip instead of two). Read-only.
 */
export async function quoteCheckout(input: unknown): Promise<ActionResult<QuoteCheckoutResult>> {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return formFailure('cart.errors.invalid');
  const { items, deliveryMethod, country, locale } = parsed.data;
  const zoneResult = await resolveZone(deliveryMethod === 'shipping' ? country : undefined);
  if (!zoneResult.ok) return formFailure(zoneResult.formError);
  const zone = zoneResult.zone;
  const lines = priceLines(
    items,
    await loadPricingProducts(items.map((item) => item.productId)),
    zone,
  );
  const presented = presentCart(lines, zone, locale);
  return ok({ ...quote(lines, deliveryMethod, zone), zoneCode: zone.code, lines: presented.lines });
}

/** The checkout form's submit (contracts/server-actions.md). */
export async function placeOrder(input: unknown): Promise<CheckoutResult> {
  return placeOrderRecord(input, { ip: getClientIp(await headers()) });
}
