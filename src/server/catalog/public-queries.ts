import 'server-only';
import { and, asc, desc, eq, ilike, inArray, isNull, ne, type SQL } from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/server/db/client';
import { category, optionGroup, optionValue, product, productImage } from '@/server/db/schema';
import { getStorage } from '@/server/storage';
import { variantKey } from './public-images';

export type ProductSort = 'newest' | 'price-asc' | 'price-desc';

export interface PublicImage {
  id: string;
  url400: string;
  url800: string;
  url1600: string;
  width: number;
  height: number;
  altHe: string | null;
  altEn: string | null;
}

export interface PublicProductCard {
  id: string;
  slug: string;
  nameHe: string;
  nameEn: string | null;
  priceIlsMinor: number;
  /** Base price plus the lowest adjustment of each option group. */
  fromPriceMinor: number;
  /** Some option changes the price, so the card says "from". */
  priceVaries: boolean;
  orderable: boolean;
  /** Main photo (position 0), or null when the product has none. */
  image: PublicImage | null;
}

export interface PublicOptionValue {
  id: string;
  labelHe: string;
  labelEn: string | null;
  deltaIlsMinor: number;
  swatch: string | null;
}

export interface PublicOptionGroup {
  id: string;
  nameHe: string;
  nameEn: string | null;
  values: PublicOptionValue[];
}

export interface PublicProduct {
  id: string;
  slug: string;
  nameHe: string;
  nameEn: string | null;
  descriptionHe: string | null;
  descriptionEn: string | null;
  prepTimeHe: string | null;
  prepTimeEn: string | null;
  priceIlsMinor: number;
  orderable: boolean;
  category: { id: string; slug: string; nameHe: string; nameEn: string | null } | null;
  images: PublicImage[];
  groups: PublicOptionGroup[];
  fromPriceMinor: number;
  priceVaries: boolean;
}

export interface PublicCategory {
  id: string;
  slug: string;
  nameHe: string;
  nameEn: string | null;
}

function toImage(row: {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  altHe: string | null;
  altEn: string | null;
}): PublicImage {
  const storage = getStorage();
  return {
    id: row.id,
    url400: storage.publicUrl(variantKey(row.storageKey, 400)),
    url800: storage.publicUrl(variantKey(row.storageKey, 800)),
    url1600: storage.publicUrl(variantKey(row.storageKey, 1600)),
    width: row.width,
    height: row.height,
    altHe: row.altHe,
    altEn: row.altEn,
  };
}

/** Lowest total and whether any adjustment is non-zero, from the deltas of each group. */
function priceSpan(
  base: number,
  groups: { deltas: number[] }[],
): { fromPriceMinor: number; priceVaries: boolean } {
  let from = base;
  let varies = false;
  for (const group of groups) {
    if (group.deltas.length === 0) continue;
    from += Math.min(...group.deltas);
    if (group.deltas.some((delta) => delta !== 0)) varies = true;
  }
  return { fromPriceMinor: from, priceVaries: varies };
}

const CARD_COLUMNS = {
  id: product.id,
  slug: product.slug,
  nameHe: product.nameHe,
  nameEn: product.nameEn,
  priceIlsMinor: product.priceIlsMinor,
  orderable: product.orderable,
  imageId: productImage.id,
  imageKey: productImage.storageKey,
  imageWidth: productImage.width,
  imageHeight: productImage.height,
  imageAltHe: productImage.altHe,
  imageAltEn: productImage.altEn,
};

type CardRow = {
  id: string;
  slug: string;
  nameHe: string;
  nameEn: string | null;
  priceIlsMinor: number | null;
  orderable: boolean;
  imageId: string | null;
  imageKey: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  imageAltHe: string | null;
  imageAltEn: string | null;
};

async function toCards(rows: CardRow[]): Promise<PublicProductCard[]> {
  if (rows.length === 0) return [];
  const values = await db
    .select({
      productId: optionGroup.productId,
      groupId: optionGroup.id,
      delta: optionValue.deltaIlsMinor,
    })
    .from(optionValue)
    .innerJoin(optionGroup, eq(optionValue.groupId, optionGroup.id))
    .where(
      inArray(
        optionGroup.productId,
        rows.map((row) => row.id),
      ),
    );
  const byProduct = new Map<string, Map<string, number[]>>();
  for (const value of values) {
    const groups = byProduct.get(value.productId) ?? new Map<string, number[]>();
    groups.set(value.groupId, [...(groups.get(value.groupId) ?? []), value.delta]);
    byProduct.set(value.productId, groups);
  }
  return rows.map((row) => {
    const base = row.priceIlsMinor ?? 0;
    const groups = [...(byProduct.get(row.id)?.values() ?? [])].map((deltas) => ({ deltas }));
    return {
      id: row.id,
      slug: row.slug,
      nameHe: row.nameHe,
      nameEn: row.nameEn,
      priceIlsMinor: base,
      ...priceSpan(base, groups),
      orderable: row.orderable,
      image:
        row.imageId !== null && row.imageKey !== null
          ? toImage({
              id: row.imageId,
              storageKey: row.imageKey,
              width: row.imageWidth ?? 0,
              height: row.imageHeight ?? 0,
              altHe: row.imageAltHe,
              altEn: row.imageAltEn,
            })
          : null,
    };
  });
}

function cardSelect() {
  return db
    .select(CARD_COLUMNS)
    .from(product)
    .leftJoin(
      productImage,
      and(
        eq(productImage.productId, product.id),
        eq(productImage.position, 0),
        isNull(productImage.deletedAt),
      ),
    );
}

const NEWEST = [desc(product.publishedAt), desc(product.createdAt), asc(product.id)] as const;

/** Published products only. Price sorts use the shekel base price, ties newest first (R18). */
export async function listPublishedProducts(
  options: { categoryId?: string; sort?: ProductSort; searchPattern?: string } = {},
): Promise<PublicProductCard[]> {
  const { categoryId, sort = 'newest', searchPattern } = options;
  const filters: (SQL | undefined)[] = [eq(product.state, 'published')];
  if (categoryId !== undefined) filters.push(eq(product.categoryId, categoryId));
  // `searchPattern` is an already escaped ILIKE pattern (see search.ts).
  if (searchPattern !== undefined) filters.push(ilike(product.searchText, searchPattern));
  const where = and(...filters);
  const order =
    sort === 'price-asc'
      ? [asc(product.priceIlsMinor), ...NEWEST]
      : sort === 'price-desc'
        ? [desc(product.priceIlsMinor), ...NEWEST]
        : [...NEWEST];
  return toCards(
    await cardSelect()
      .where(where)
      .orderBy(...order),
  );
}

/** Other published products of a category, newest first. */
export async function listRelatedProducts(
  categoryId: string,
  excludeProductId: string,
  limit: number,
): Promise<PublicProductCard[]> {
  return toCards(
    await cardSelect()
      .where(
        and(
          eq(product.state, 'published'),
          eq(product.categoryId, categoryId),
          ne(product.id, excludeProductId),
        ),
      )
      .orderBy(...NEWEST)
      .limit(limit),
  );
}

export async function listNewestProducts(limit: number): Promise<PublicProductCard[]> {
  return toCards(
    await cardSelect()
      .where(eq(product.state, 'published'))
      .orderBy(...NEWEST)
      .limit(limit),
  );
}

/** A category by slug, even when it has no published product yet; null when it does not exist. */
export async function getCategoryBySlug(slug: string): Promise<PublicCategory | null> {
  const [row] = await db
    .select({
      id: category.id,
      slug: category.slug,
      nameHe: category.nameHe,
      nameEn: category.nameEn,
    })
    .from(category)
    .where(eq(category.slug, slug));
  return row ?? null;
}

/** Categories with at least one published product, in display order. */
export async function listCategoriesWithProducts(): Promise<PublicCategory[]> {
  const rows = await db
    .selectDistinct({
      id: category.id,
      slug: category.slug,
      nameHe: category.nameHe,
      nameEn: category.nameEn,
      sortOrder: category.sortOrder,
    })
    .from(category)
    .innerJoin(product, and(eq(product.categoryId, category.id), eq(product.state, 'published')))
    .orderBy(asc(category.sortOrder));
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    nameHe: row.nameHe,
    nameEn: row.nameEn,
  }));
}

/** What the sitemap lists: published products and the categories that hold one. */
export async function listSitemapEntries(): Promise<{
  products: { slug: string; updatedAt: Date }[];
  categorySlugs: string[];
}> {
  const [products, categories] = await Promise.all([
    db
      .select({ slug: product.slug, updatedAt: product.updatedAt })
      .from(product)
      .where(eq(product.state, 'published'))
      .orderBy(asc(product.slug)),
    listCategoriesWithProducts(),
  ]);
  return { products, categorySlugs: categories.map((item) => item.slug) };
}

/** `null` for draft, hidden and missing products. Deduplicated within one request. */
export const getPublishedProductBySlug = cache(
  async (slug: string): Promise<PublicProduct | null> => {
    const [row] = await db
      .select({ product, category })
      .from(product)
      .leftJoin(category, eq(category.id, product.categoryId))
      .where(and(eq(product.slug, slug), eq(product.state, 'published')));
    if (!row) return null;
    const { product: item } = row;

    const images = await db
      .select({
        id: productImage.id,
        storageKey: productImage.storageKey,
        width: productImage.width,
        height: productImage.height,
        altHe: productImage.altHe,
        altEn: productImage.altEn,
      })
      .from(productImage)
      .where(and(eq(productImage.productId, item.id), isNull(productImage.deletedAt)))
      .orderBy(asc(productImage.position));

    const groupRows = await db
      .select()
      .from(optionGroup)
      .where(eq(optionGroup.productId, item.id))
      .orderBy(asc(optionGroup.position));
    const valueRows =
      groupRows.length === 0
        ? []
        : await db
            .select()
            .from(optionValue)
            .where(
              inArray(
                optionValue.groupId,
                groupRows.map((group) => group.id),
              ),
            )
            .orderBy(asc(optionValue.position));
    const groups: PublicOptionGroup[] = groupRows.map((group) => ({
      id: group.id,
      nameHe: group.nameHe,
      nameEn: group.nameEn,
      values: valueRows
        .filter((value) => value.groupId === group.id)
        .map((value) => ({
          id: value.id,
          labelHe: value.labelHe,
          labelEn: value.labelEn,
          deltaIlsMinor: value.deltaIlsMinor,
          swatch: value.swatch,
        })),
    }));

    const base = item.priceIlsMinor ?? 0;
    return {
      id: item.id,
      slug: item.slug,
      nameHe: item.nameHe,
      nameEn: item.nameEn,
      descriptionHe: item.descriptionHe,
      descriptionEn: item.descriptionEn,
      prepTimeHe: item.prepTimeHe,
      prepTimeEn: item.prepTimeEn,
      priceIlsMinor: base,
      orderable: item.orderable,
      category: row.category
        ? {
            id: row.category.id,
            slug: row.category.slug,
            nameHe: row.category.nameHe,
            nameEn: row.category.nameEn,
          }
        : null,
      images: images.map(toImage),
      groups,
      ...priceSpan(
        base,
        groups.map((group) => ({ deltas: group.values.map((value) => value.deltaIlsMinor) })),
      ),
    };
  },
);
