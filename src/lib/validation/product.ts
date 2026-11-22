import { z } from 'zod';
import { isRandomSlug } from '@/lib/slug';

export const SWATCHES = [
  'white',
  'cream',
  'beige',
  'brown',
  'grey',
  'black',
  'red',
  'pink',
  'orange',
  'yellow',
  'green',
  'blue',
] as const;
export type Swatch = (typeof SWATCHES)[number];

/** Hebrew name of a product just created with "New product"; the owner must rename it before publishing. */
export const NEW_PRODUCT_NAME_HE = 'מוצר חדש';

export const MAX_IMAGES = 12;
export const MAX_PRICE_MINOR = 100_000_000_00;

/** Optional text: trimmed, empty becomes `null`. */
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? '';
      return trimmed === '' ? null : trimmed;
    });

/**
 * The address the owner types (010 FR-004): lowercase letters, digits and single dashes, 1-60
 * characters, not trimmed, and not a random-looking code. `''` means "clear it" (a draft only).
 */
const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(60)
  .refine((value) => !isRandomSlug(value, 'p'))
  .or(z.literal(''));

export const nameHeSchema = z.string().trim().min(1).max(120);

export const priceMinorSchema = z.number().int().positive().max(MAX_PRICE_MINOR);

export const createProductSchema = z.object({
  nameHe: nameHeSchema,
  nameEn: optionalText(120).optional(),
});

/** Every field is optional: only the keys present are changed. */
export const updateProductSchema = z
  .object({
    nameHe: nameHeSchema,
    nameEn: optionalText(120),
    descriptionHe: optionalText(5000),
    descriptionEn: optionalText(5000),
    priceIlsMinor: priceMinorSchema.nullable(),
    priceUsdMinor: priceMinorSchema.nullable(),
    prepTimeHe: optionalText(120),
    prepTimeEn: optionalText(120),
    // 0-50 category ids, duplicates collapsed (a piece is in a category once).
    categoryIds: z
      .array(z.uuid())
      .max(50)
      .transform((ids) => [...new Set(ids)]),
    slug: slugSchema,
  })
  .partial()
  .strict();
export type ProductUpdate = z.input<typeof updateProductSchema>;

export const optionValueSchema = z.object({
  id: z.uuid().optional(),
  labelHe: z.string().trim().min(1).max(60),
  labelEn: optionalText(60).optional(),
  deltaIlsMinor: z.number().int().min(-MAX_PRICE_MINOR).max(MAX_PRICE_MINOR),
  deltaUsdMinor: z.number().int().min(-MAX_PRICE_MINOR).max(MAX_PRICE_MINOR).nullish(),
  swatch: z.enum(SWATCHES).nullish(),
});

export const optionGroupSchema = z.object({
  id: z.uuid().optional(),
  nameHe: z.string().trim().min(1).max(60),
  nameEn: optionalText(60).optional(),
  values: z.array(optionValueSchema).min(1).max(50),
});
export type OptionGroupInput = z.input<typeof optionGroupSchema>;

/**
 * Owner-typed price ("45", "45.5", "1,250.00") in shekels or dollars -> minor units; `null` for
 * anything else (more than two decimals, negative, not a number).
 */
export function priceMajorToMinor(text: string): number | null {
  const match = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(
    text.trim().replace(/[\s,](?=\d{3}(\D|$))/g, ''),
  );
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return minor > 0 && minor <= MAX_PRICE_MINOR ? minor : null;
}

export interface PublishFacts {
  nameHe: string;
  descriptionHe: string | null;
  priceIlsMinor: number | null;
  priceUsdMinor: number | null;
  categoryIds: string[];
  prepTimeHe: string | null;
  imageCount: number;
  slug: string | null;
  /** True only when publishing from draft: then a random-looking address is not accepted. */
  fromDraft: boolean;
  /** One entry per option group: its values' deltas. */
  groups: { deltaIlsMinor: number; deltaUsdMinor: number | null }[][];
  usdZoneEnabled: boolean;
}

/** Field names that block publishing, in form order (data-model.md › product). */
export function missingForPublish(facts: PublishFacts): string[] {
  const missing: string[] = [];
  const name = facts.nameHe.trim();
  if (name === '' || name === NEW_PRODUCT_NAME_HE) missing.push('nameHe');
  if (facts.slug === null || (facts.fromDraft && isRandomSlug(facts.slug, 'p'))) {
    missing.push('slug');
  }
  if ((facts.descriptionHe ?? '').trim() === '') missing.push('descriptionHe');
  if (facts.priceIlsMinor === null || facts.priceIlsMinor <= 0) missing.push('priceIlsMinor');
  if (facts.usdZoneEnabled && (facts.priceUsdMinor === null || facts.priceUsdMinor <= 0)) {
    missing.push('priceUsdMinor');
  }
  // The message key stays `categoryId`, so the text shown is unchanged.
  if (facts.categoryIds.length === 0) missing.push('categoryId');
  if ((facts.prepTimeHe ?? '').trim() === '') missing.push('prepTimeHe');
  if (facts.imageCount < 1) missing.push('images');
  const badGroup = facts.groups.some(
    (values) =>
      values.length < 2 ||
      (facts.usdZoneEnabled &&
        values.some((v) => v.deltaIlsMinor !== 0 && v.deltaUsdMinor === null)),
  );
  if (badGroup) missing.push('optionGroups');
  return missing;
}

export type OptionPriceProblem = 'ils_not_positive' | 'usd_not_positive' | 'usd_missing';

/** base + delta must stay > 0; a non-zero ILS delta needs a USD delta when the product has a USD price. */
export function optionPriceProblem(
  prices: { priceIlsMinor: number | null; priceUsdMinor: number | null },
  values: { deltaIlsMinor: number; deltaUsdMinor: number | null }[],
): OptionPriceProblem | null {
  for (const value of values) {
    if (prices.priceIlsMinor !== null && prices.priceIlsMinor + value.deltaIlsMinor <= 0) {
      return 'ils_not_positive';
    }
    if (prices.priceUsdMinor !== null) {
      if (value.deltaIlsMinor !== 0 && value.deltaUsdMinor === null) return 'usd_missing';
      if (value.deltaUsdMinor !== null && prices.priceUsdMinor + value.deltaUsdMinor <= 0) {
        return 'usd_not_positive';
      }
    }
  }
  return null;
}
