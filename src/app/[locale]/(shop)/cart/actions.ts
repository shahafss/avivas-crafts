'use server';

import { z } from 'zod';
import { routing } from '@/i18n/routing';
import { formFailure, ok, type ActionResult } from '@/server/catalog/result';
import { cartItemsSchema } from '@/server/checkout/pricing';
import { priceCartItems, type PricedCart } from '@/server/checkout/price-cart';

const inputSchema = z.object({
  items: cartItemsSchema,
  zoneCode: z.string().min(1).max(20).optional(),
  locale: z.enum(routing.locales).default('he'),
});

export type PriceCartResult = PricedCart;

/**
 * Current prices for the cart's items (contracts/server-actions.md). Read-only: it writes nothing
 * and the cart itself stays on the device.
 */
export async function priceCart(input: unknown): Promise<ActionResult<PriceCartResult>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return formFailure('cart.errors.invalid');
  const { items, zoneCode, locale } = parsed.data;
  const priced = await priceCartItems(items, locale, zoneCode);
  if (priced === null) return formFailure('checkout.ships_israel_only');
  return ok(priced);
}
