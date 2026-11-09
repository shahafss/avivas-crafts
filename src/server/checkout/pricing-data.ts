import 'server-only';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { optionGroup, optionValue, product, productImage } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import {
  priceLines,
  type CartItem,
  type PricedLine,
  type PricingOptionGroup,
  type PricingProduct,
  type PricingZone,
} from './pricing';

/** Current data of the given products (deleted ones are absent from the map). */
export async function loadPricingProducts(
  productIds: readonly string[],
  database: DbLike = db,
): Promise<Map<string, PricingProduct>> {
  const ids = [...new Set(productIds)];
  const result = new Map<string, PricingProduct>();
  if (ids.length === 0) return result;

  const [products, images, groups] = await Promise.all([
    database.select().from(product).where(inArray(product.id, ids)),
    database
      .select({ productId: productImage.productId, storageKey: productImage.storageKey })
      .from(productImage)
      .where(
        and(
          inArray(productImage.productId, ids),
          eq(productImage.position, 0),
          isNull(productImage.deletedAt),
        ),
      ),
    database
      .select()
      .from(optionGroup)
      .where(inArray(optionGroup.productId, ids))
      .orderBy(asc(optionGroup.position)),
  ]);
  const values =
    groups.length === 0
      ? []
      : await database
          .select()
          .from(optionValue)
          .where(
            inArray(
              optionValue.groupId,
              groups.map((group) => group.id),
            ),
          )
          .orderBy(asc(optionValue.position));

  for (const row of products) {
    const own: PricingOptionGroup[] = groups
      .filter((group) => group.productId === row.id)
      .map((group) => ({
        id: group.id,
        nameHe: group.nameHe,
        nameEn: group.nameEn,
        values: values
          .filter((value) => value.groupId === group.id)
          .map((value) => ({
            id: value.id,
            labelHe: value.labelHe,
            labelEn: value.labelEn,
            deltaIlsMinor: value.deltaIlsMinor,
            deltaUsdMinor: value.deltaUsdMinor,
          })),
      }));
    result.set(row.id, {
      id: row.id,
      slug: row.slug,
      state: row.state,
      orderable: row.orderable,
      nameHe: row.nameHe,
      nameEn: row.nameEn,
      prepTimeHe: row.prepTimeHe,
      prepTimeEn: row.prepTimeEn,
      priceIlsMinor: row.priceIlsMinor,
      priceUsdMinor: row.priceUsdMinor,
      imageKey: images.find((image) => image.productId === row.id)?.storageKey ?? null,
      groups: own,
    });
  }
  return result;
}

/** Loads the products of `items` and prices them in `zone`. */
export async function priceItems(
  items: readonly CartItem[],
  zone: PricingZone,
  database: DbLike = db,
): Promise<PricedLine[]> {
  return priceLines(
    items,
    await loadPricingProducts(
      items.map((item) => item.productId),
      database,
    ),
    zone,
  );
}
