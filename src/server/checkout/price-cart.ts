import 'server-only';
import { fallbackAttrs, pick, type ContentLocale } from '@/lib/i18n-fallback';
import { variantKey } from '@/server/catalog/public-images';
import { getStorage } from '@/server/storage';
import { loadPricingProducts } from './pricing-data';
import {
  quote,
  type CartItem,
  type LineFlag,
  priceLines,
  type PricedLine,
  type PricingZone,
} from './pricing';
import { resolveZoneByCode } from './zones';

export interface PricedCartLine {
  key: string;
  productId: string;
  slug: string | null;
  name: string;
  /** `he` when `name` is Hebrew text shown on an English page. */
  nameLang?: 'he';
  /** 400 px photo of a product that is still on sale, otherwise null. */
  imageUrl: string | null;
  options: { group: string; value: string; groupLang?: 'he'; valueLang?: 'he' }[];
  prepTime: string;
  prepTimeLang?: 'he';
  unitPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
  flag?: LineFlag;
}

export interface PricedCart {
  currency: 'ILS' | 'USD';
  zoneCode: string;
  lines: PricedCartLine[];
  /** Unflagged lines only. */
  subtotalMinor: number;
}

/** What `priceCart` returns: current prices, names in the page language, flags per line. */
export async function priceCartItems(
  items: readonly CartItem[],
  locale: ContentLocale,
  zoneCode?: string,
): Promise<PricedCart | null> {
  const zone = await resolveZoneByCode(zoneCode);
  if (zone === null) return null;
  const lines = priceLines(
    items,
    await loadPricingProducts(items.map((item) => item.productId)),
    zone,
  );
  return presentCart(lines, zone, locale);
}

/** Priced lines as the cart and checkout show them: names in the page language, flags kept. */
export function presentCart(
  lines: readonly PricedLine[],
  zone: PricingZone,
  locale: ContentLocale,
): PricedCart {
  const storage = getStorage();
  return {
    currency: zone.currency,
    zoneCode: zone.code,
    subtotalMinor: quote(lines, 'pickup', zone).subtotalMinor,
    lines: lines.map((line) => {
      const name = pick(locale, line.nameHe, line.nameEn);
      const prep = pick(locale, line.prepTimeHe, line.prepTimeEn);
      return {
        key: line.key,
        productId: line.productId,
        slug: line.slug,
        name: name.text,
        ...(fallbackAttrs(name).lang === undefined ? {} : { nameLang: 'he' as const }),
        imageUrl:
          line.flag === 'unavailable' || line.sourceImageKey === null
            ? null
            : storage.publicUrl(variantKey(line.sourceImageKey, 400)),
        options: line.options.map((option) => {
          const group = pick(locale, option.groupHe, option.groupEn);
          const value = pick(locale, option.valueHe, option.valueEn);
          return {
            group: group.text,
            value: value.text,
            ...(group.fallback ? { groupLang: 'he' as const } : {}),
            ...(value.fallback ? { valueLang: 'he' as const } : {}),
          };
        }),
        prepTime: prep.text,
        ...(prep.fallback && prep.text !== '' ? { prepTimeLang: 'he' as const } : {}),
        unitPriceMinor: line.unitPriceMinor,
        quantity: line.quantity,
        lineTotalMinor: line.lineTotalMinor,
        ...(line.flag === undefined ? {} : { flag: line.flag }),
      };
    }),
  };
}
