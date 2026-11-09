import { describe, expect, it } from 'vitest';
import {
  cartItemsSchema,
  priceLines,
  quote,
  type PricingProduct,
  type PricingZone,
} from '@/server/checkout/pricing';

const ILS: PricingZone = {
  code: 'IL',
  currency: 'ILS',
  shippingEnabled: true,
  pickupEnabled: true,
  shippingFeeMinor: 3000,
  freeShippingThresholdMinor: 20000,
};
const USD: PricingZone = {
  code: 'WORLD',
  currency: 'USD',
  shippingEnabled: true,
  pickupEnabled: true,
  shippingFeeMinor: 2500,
  freeShippingThresholdMinor: null,
};

const GROUP = '00000000-0000-4000-8000-0000000000a1';
const BROWN = '00000000-0000-4000-8000-0000000000b1';
const BLOND = '00000000-0000-4000-8000-0000000000b2';
const P1 = '00000000-0000-4000-8000-000000000001';
const P2 = '00000000-0000-4000-8000-000000000002';

function product(overrides: Partial<PricingProduct> = {}): PricingProduct {
  return {
    id: P1,
    slug: 'doll',
    state: 'published',
    orderable: true,
    nameHe: 'בובה',
    nameEn: 'Doll',
    prepTimeHe: 'כשבועיים',
    prepTimeEn: 'about two weeks',
    priceIlsMinor: 10000,
    priceUsdMinor: 3000,
    imageKey: 'p/abc',
    groups: [
      {
        id: GROUP,
        nameHe: 'צבע שיער',
        nameEn: 'Hair colour',
        values: [
          { id: BROWN, labelHe: 'חום', labelEn: 'Brown', deltaIlsMinor: 0, deltaUsdMinor: null },
          { id: BLOND, labelHe: 'בלונד', labelEn: null, deltaIlsMinor: 2000, deltaUsdMinor: 600 },
        ],
      },
    ],
    ...overrides,
  };
}

function price(
  items: { productId?: string; optionValueIds?: string[]; quantity?: number }[],
  products: PricingProduct[],
  zone: PricingZone = ILS,
) {
  return priceLines(
    items.map((item) => ({
      productId: item.productId ?? P1,
      optionValueIds: item.optionValueIds ?? [],
      quantity: item.quantity ?? 1,
    })),
    new Map(products.map((entry) => [entry.id, entry])),
    zone,
  );
}

describe('priceLines', () => {
  it('prices a line as base plus the chosen option adjustments, times the quantity', () => {
    const [line] = price([{ optionValueIds: [BLOND], quantity: 3 }], [product()]);
    expect(line).toMatchObject({
      unitPriceMinor: 12000,
      quantity: 3,
      lineTotalMinor: 36000,
      productId: P1,
      slug: 'doll',
      nameHe: 'בובה',
      nameEn: 'Doll',
      sourceImageKey: 'p/abc',
    });
    expect(line?.flag).toBeUndefined();
    expect(line?.options).toEqual([
      {
        valueId: BLOND,
        groupHe: 'צבע שיער',
        groupEn: 'Hair colour',
        valueHe: 'בלונד',
        valueEn: null,
      },
    ]);
  });

  it('carries the product preparation time on every line', () => {
    const [line] = price([{ optionValueIds: [BROWN] }], [product()]);
    expect(line).toMatchObject({ prepTimeHe: 'כשבועיים', prepTimeEn: 'about two weeks' });
  });

  it('prices a product without options', () => {
    const [line] = price([{}], [product({ groups: [] })]);
    expect(line).toMatchObject({ unitPriceMinor: 10000, lineTotalMinor: 10000 });
  });

  it('keeps the same product with other options as another line', () => {
    const lines = price([{ optionValueIds: [BROWN] }, { optionValueIds: [BLOND] }], [product()]);
    expect(lines[0]?.key).not.toBe(lines[1]?.key);
  });

  it('flags hidden, draft and deleted products as unavailable', () => {
    expect(price([{}], [product({ state: 'hidden' })])[0]?.flag).toBe('unavailable');
    expect(price([{}], [product({ state: 'draft' })])[0]?.flag).toBe('unavailable');
    expect(price([{}], [])[0]?.flag).toBe('unavailable');
  });

  it('flags a product that is not orderable', () => {
    expect(price([{ optionValueIds: [BROWN] }], [product({ orderable: false })])[0]?.flag).toBe(
      'not_orderable',
    );
  });

  it('asks to choose again when a value was removed, a group is unchosen or a value is foreign', () => {
    const gone = '00000000-0000-4000-8000-0000000000ff';
    expect(price([{ optionValueIds: [gone] }], [product()])[0]?.flag).toBe('choose_options_again');
    expect(price([{ optionValueIds: [] }], [product()])[0]?.flag).toBe('choose_options_again');
    expect(price([{ optionValueIds: [BROWN, BLOND] }], [product()])[0]?.flag).toBe(
      'choose_options_again',
    );
    expect(price([{ optionValueIds: [BROWN, gone] }], [product()])[0]?.flag).toBe(
      'choose_options_again',
    );
    expect(price([{ optionValueIds: [BROWN] }], [product({ groups: [] })])[0]?.flag).toBe(
      'choose_options_again',
    );
  });

  it('does not add flagged lines to any amount', () => {
    const lines = price([{ optionValueIds: [BLOND], quantity: 2 }, { productId: P2 }], [product()]);
    expect(lines[1]).toMatchObject({ flag: 'unavailable', unitPriceMinor: 0, lineTotalMinor: 0 });
    expect(quote(lines, 'pickup', ILS).subtotalMinor).toBe(24000);
    expect(quote(lines, 'pickup', ILS).flags).toEqual([
      { key: lines[1]?.key, flag: 'unavailable' },
    ]);
  });

  it('uses the USD prices in a USD zone', () => {
    const [blond] = price([{ optionValueIds: [BLOND] }], [product()], USD);
    expect(blond).toMatchObject({ unitPriceMinor: 3600, lineTotalMinor: 3600 });
    // A zero adjustment needs no USD figure.
    const [brown] = price([{ optionValueIds: [BROWN], quantity: 2 }], [product()], USD);
    expect(brown).toMatchObject({ unitPriceMinor: 3000, lineTotalMinor: 6000 });
  });

  it('flags no_usd_price when the product or a non-zero adjustment lacks a USD price', () => {
    expect(
      price([{ optionValueIds: [BROWN] }], [product({ priceUsdMinor: null })], USD)[0]?.flag,
    ).toBe('no_usd_price');
    const missingDelta = product({
      groups: [
        {
          id: GROUP,
          nameHe: 'צבע שיער',
          nameEn: null,
          values: [
            { id: BROWN, labelHe: 'חום', labelEn: null, deltaIlsMinor: 0, deltaUsdMinor: null },
            {
              id: BLOND,
              labelHe: 'בלונד',
              labelEn: null,
              deltaIlsMinor: 2000,
              deltaUsdMinor: null,
            },
          ],
        },
      ],
    });
    expect(price([{ optionValueIds: [BLOND] }], [missingDelta], USD)[0]?.flag).toBe('no_usd_price');
    // ...but the same product is fine in shekels.
    expect(price([{ optionValueIds: [BLOND] }], [missingDelta], ILS)[0]?.flag).toBeUndefined();
  });

  it('keeps every amount an integer', () => {
    const [line] = price([{ optionValueIds: [BLOND], quantity: 7 }], [product()]);
    for (const amount of [line?.unitPriceMinor, line?.lineTotalMinor]) {
      expect(Number.isInteger(amount)).toBe(true);
    }
  });

  it('refuses a quantity outside 1-20 and more than 50 lines', () => {
    expect(() => price([{ quantity: 0 }], [product()])).toThrow(RangeError);
    expect(() => price([{ quantity: 21 }], [product()])).toThrow(RangeError);
    expect(() => price([{ quantity: 1.5 }], [product()])).toThrow(RangeError);
    expect(() =>
      price(
        Array.from({ length: 51 }, () => ({ optionValueIds: [BROWN] })),
        [product()],
      ),
    ).toThrow(RangeError);
  });
});

describe('cartItemsSchema', () => {
  const item = { productId: P1, optionValueIds: [BROWN], quantity: 1 };
  it('accepts 1-20 units and at most 50 lines', () => {
    expect(cartItemsSchema.safeParse([item]).success).toBe(true);
    expect(cartItemsSchema.safeParse([{ ...item, quantity: 20 }]).success).toBe(true);
    expect(cartItemsSchema.safeParse(Array.from({ length: 50 }, () => item)).success).toBe(true);
  });
  it('rejects 0, 21, fractions, 51 lines and malformed ids', () => {
    expect(cartItemsSchema.safeParse([{ ...item, quantity: 0 }]).success).toBe(false);
    expect(cartItemsSchema.safeParse([{ ...item, quantity: 21 }]).success).toBe(false);
    expect(cartItemsSchema.safeParse([{ ...item, quantity: 1.5 }]).success).toBe(false);
    expect(cartItemsSchema.safeParse(Array.from({ length: 51 }, () => item)).success).toBe(false);
    expect(cartItemsSchema.safeParse([{ ...item, productId: 'nope' }]).success).toBe(false);
  });
});

describe('quote', () => {
  const lineOf = (amount: number) =>
    price([{ optionValueIds: [BROWN], quantity: 1 }], [product({ priceIlsMinor: amount })]);

  it('adds the shipping fee below the free-shipping threshold', () => {
    expect(quote(lineOf(19999), 'shipping', ILS)).toMatchObject({
      currency: 'ILS',
      subtotalMinor: 19999,
      deliveryFeeMinor: 3000,
      totalMinor: 22999,
    });
  });

  it('is free at the threshold (inclusive) and above', () => {
    expect(quote(lineOf(20000), 'shipping', ILS)).toMatchObject({
      deliveryFeeMinor: 0,
      totalMinor: 20000,
    });
    expect(quote(lineOf(25000), 'shipping', ILS).deliveryFeeMinor).toBe(0);
  });

  it('never charges for pickup', () => {
    expect(quote(lineOf(5000), 'pickup', ILS)).toMatchObject({
      deliveryFeeMinor: 0,
      totalMinor: 5000,
    });
  });

  it('never waives the fee when the threshold is null', () => {
    const zone = { ...ILS, freeShippingThresholdMinor: null };
    expect(quote(lineOf(900000), 'shipping', zone).deliveryFeeMinor).toBe(3000);
  });

  it('quotes a USD zone in USD with the USD fee', () => {
    const lines = price([{ optionValueIds: [BLOND], quantity: 2 }], [product()], USD);
    expect(quote(lines, 'shipping', USD)).toMatchObject({
      currency: 'USD',
      subtotalMinor: 7200,
      deliveryFeeMinor: 2500,
      totalMinor: 9700,
    });
  });

  it('allows pickup only in the Israel zone and only when the zone offers it', () => {
    expect(quote([], 'shipping', ILS)).toMatchObject({
      shippingAllowed: true,
      pickupAllowed: true,
    });
    expect(quote([], 'shipping', USD)).toMatchObject({
      shippingAllowed: true,
      pickupAllowed: false,
    });
    expect(quote([], 'shipping', { ...ILS, pickupEnabled: false }).pickupAllowed).toBe(false);
    expect(quote([], 'shipping', { ...ILS, shippingEnabled: false }).shippingAllowed).toBe(false);
  });

  it('returns integers', () => {
    const result = quote(lineOf(12345), 'shipping', ILS);
    for (const amount of [result.subtotalMinor, result.deliveryFeeMinor, result.totalMinor]) {
      expect(Number.isInteger(amount)).toBe(true);
    }
  });
});
