import { z } from 'zod';
import { lineKey } from '@/lib/cart/key';
import { addMoney, mulMoney, type Currency } from '@/lib/money';

/** Pure pricing: no database access. `pricing-data.ts` loads the products it works on. */

export const MAX_CART_LINES = 50;
export const MAX_QUANTITY = 20;

export const cartItemSchema = z.object({
  productId: z.uuid(),
  optionValueIds: z.array(z.uuid()).max(20),
  quantity: z.number().int().min(1).max(MAX_QUANTITY),
});
export const cartItemsSchema = z.array(cartItemSchema).max(MAX_CART_LINES);
export type CartItem = z.infer<typeof cartItemSchema>;

export type LineFlag = 'unavailable' | 'not_orderable' | 'choose_options_again' | 'no_usd_price';
export type DeliveryMethod = 'shipping' | 'pickup';

export interface PricingOptionValue {
  id: string;
  labelHe: string;
  labelEn: string | null;
  deltaIlsMinor: number;
  deltaUsdMinor: number | null;
}

export interface PricingOptionGroup {
  id: string;
  nameHe: string;
  nameEn: string | null;
  values: PricingOptionValue[];
}

/** A product as pricing sees it. A product that no longer exists is simply absent from the map. */
export interface PricingProduct {
  id: string;
  slug: string | null;
  state: 'draft' | 'published' | 'hidden';
  orderable: boolean;
  nameHe: string;
  nameEn: string | null;
  prepTimeHe: string | null;
  prepTimeEn: string | null;
  priceIlsMinor: number | null;
  priceUsdMinor: number | null;
  /** `storage_key` of the main photo, or null. */
  imageKey: string | null;
  groups: PricingOptionGroup[];
}

export interface PricingZone {
  code: string;
  currency: Currency;
  shippingEnabled: boolean;
  pickupEnabled: boolean;
  shippingFeeMinor: number;
  freeShippingThresholdMinor: number | null;
}

export interface PricedOption {
  valueId: string;
  groupHe: string;
  groupEn: string | null;
  valueHe: string;
  valueEn: string | null;
}

export interface PricedLine {
  key: string;
  productId: string;
  slug: string | null;
  nameHe: string;
  nameEn: string | null;
  prepTimeHe: string | null;
  prepTimeEn: string | null;
  /** Main photo `storage_key` (the order photo is copied from it). */
  sourceImageKey: string | null;
  optionValueIds: string[];
  options: PricedOption[];
  /** 0 on a flagged line. */
  unitPriceMinor: number;
  quantity: number;
  /** 0 on a flagged line. */
  lineTotalMinor: number;
  flag?: LineFlag;
}

function flagOf(
  product: PricingProduct | undefined,
  item: CartItem,
  zone: PricingZone,
): { flag: LineFlag | null; options: PricedOption[]; unitPriceMinor: number } {
  if (!product || product.state !== 'published') {
    return { flag: 'unavailable', options: [], unitPriceMinor: 0 };
  }
  const usd = zone.currency === 'USD';
  const base = usd ? product.priceUsdMinor : product.priceIlsMinor;

  // Every group needs exactly one chosen value that still exists, and nothing else may be chosen.
  const byId = new Map<string, { group: PricingOptionGroup; value: PricingOptionValue }>();
  for (const group of product.groups) {
    for (const value of group.values) byId.set(value.id, { group, value });
  }
  const chosen: { group: PricingOptionGroup; value: PricingOptionValue }[] = [];
  let optionsOk = new Set(item.optionValueIds).size === item.optionValueIds.length;
  for (const id of item.optionValueIds) {
    const entry = byId.get(id);
    if (entry === undefined) optionsOk = false;
    else chosen.push(entry);
  }
  for (const group of product.groups) {
    if (chosen.filter((entry) => entry.group.id === group.id).length !== 1) optionsOk = false;
  }
  const options: PricedOption[] = chosen.map(({ group, value }) => ({
    valueId: value.id,
    groupHe: group.nameHe,
    groupEn: group.nameEn,
    valueHe: value.labelHe,
    valueEn: value.labelEn,
  }));

  if (!product.orderable) return { flag: 'not_orderable', options, unitPriceMinor: 0 };
  if (!optionsOk) return { flag: 'choose_options_again', options, unitPriceMinor: 0 };

  let unit = base ?? 0;
  let missingUsd = usd && base === null;
  for (const { value } of chosen) {
    if (usd) {
      if (value.deltaUsdMinor === null) {
        if (value.deltaIlsMinor !== 0) missingUsd = true;
      } else {
        unit = addMoney(unit, value.deltaUsdMinor);
      }
    } else {
      unit = addMoney(unit, value.deltaIlsMinor);
    }
  }
  if (missingUsd) return { flag: 'no_usd_price', options, unitPriceMinor: 0 };
  if (base === null || unit <= 0) return { flag: 'unavailable', options, unitPriceMinor: 0 };
  return { flag: null, options, unitPriceMinor: unit };
}

/**
 * Prices cart items in the zone's currency: base price plus the chosen option adjustments.
 * Lines that cannot be ordered carry a flag and cost nothing, so they never reach a total.
 */
export function priceLines(
  items: readonly CartItem[],
  products: ReadonlyMap<string, PricingProduct>,
  zone: PricingZone,
): PricedLine[] {
  if (items.length > MAX_CART_LINES) throw new RangeError('Too many cart lines');
  return items.map((item) => {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > MAX_QUANTITY) {
      throw new RangeError('Quantity must be a whole number from 1 to 20');
    }
    const product = products.get(item.productId);
    const { flag, options, unitPriceMinor } = flagOf(product, item, zone);
    const line: PricedLine = {
      key: lineKey(item),
      productId: item.productId,
      slug: product?.slug ?? null,
      nameHe: product?.nameHe ?? '',
      nameEn: product?.nameEn ?? null,
      prepTimeHe: product?.prepTimeHe ?? null,
      prepTimeEn: product?.prepTimeEn ?? null,
      sourceImageKey: product?.imageKey ?? null,
      optionValueIds: [...item.optionValueIds],
      options,
      unitPriceMinor,
      quantity: item.quantity,
      lineTotalMinor: mulMoney(unitPriceMinor, item.quantity),
    };
    if (flag !== null) line.flag = flag;
    return line;
  });
}

export interface Quote {
  currency: Currency;
  subtotalMinor: number;
  deliveryFeeMinor: number;
  totalMinor: number;
  flags: { key: string; flag: LineFlag }[];
  shippingAllowed: boolean;
  pickupAllowed: boolean;
}

/** Subtotal, delivery and total in the zone currency. Pickup is free and only offered in `IL`. */
export function quote(
  lines: readonly PricedLine[],
  deliveryMethod: DeliveryMethod,
  zone: PricingZone,
): Quote {
  let subtotalMinor = 0;
  const flags: Quote['flags'] = [];
  for (const line of lines) {
    subtotalMinor = addMoney(subtotalMinor, line.lineTotalMinor);
    if (line.flag !== undefined) flags.push({ key: line.key, flag: line.flag });
  }
  const free =
    zone.freeShippingThresholdMinor !== null && subtotalMinor >= zone.freeShippingThresholdMinor;
  const deliveryFeeMinor = deliveryMethod === 'pickup' || free ? 0 : zone.shippingFeeMinor;
  return {
    currency: zone.currency,
    subtotalMinor,
    deliveryFeeMinor,
    totalMinor: addMoney(subtotalMinor, deliveryFeeMinor),
    flags,
    shippingAllowed: zone.shippingEnabled,
    pickupAllowed: zone.pickupEnabled && zone.code === 'IL',
  };
}
