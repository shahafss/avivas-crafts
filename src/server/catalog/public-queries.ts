import 'server-only';
import {
  and,
  asc,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  isNull,
  ne,
  notInArray,
  type SQL,
} from 'drizzle-orm';
import { cache } from 'react';
import { db } from '@/server/db/client';
import { pick, type ContentLocale, type Picked } from '@/lib/i18n-fallback';
import {
  category,
  optionGroup,
  optionValue,
  product,
  productCategory,
  productImage,
} from '@/server/db/schema';
import { getSettings } from '@/server/settings/settings';
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
  /** Every category of the piece, in the shop's category order. */
  categories: PublicCategory[];
  /** The one category named in the breadcrumb and structured data (FR-037), or null. */
  mainCategory: PublicCategory | null;
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

/** The piece has the category among its own (an `EXISTS`, so a piece is never listed twice). */
function inCategory(categoryId: string): SQL {
  return exists(
    db
      .select({ one: productCategory.productId })
      .from(productCategory)
      .where(
        and(eq(productCategory.productId, product.id), eq(productCategory.categoryId, categoryId)),
      ),
  );
}

/**
 * Published products only. Price sorts use the shekel base price, ties newest first (R18).
 * `categoryId` matches through `product_category`; `limit` caps the list.
 */
export async function listPublishedProducts(
  options: {
    categoryId?: string;
    sort?: ProductSort;
    searchPattern?: string;
    limit?: number;
  } = {},
): Promise<PublicProductCard[]> {
  const { categoryId, sort = 'newest', searchPattern, limit } = options;
  const filters: (SQL | undefined)[] = [eq(product.state, 'published')];
  if (categoryId !== undefined) filters.push(inCategory(categoryId));
  // `searchPattern` is an already escaped ILIKE pattern (see search.ts).
  if (searchPattern !== undefined) filters.push(ilike(product.searchText, searchPattern));
  const where = and(...filters);
  const order =
    sort === 'price-asc'
      ? [asc(product.priceIlsMinor), ...NEWEST]
      : sort === 'price-desc'
        ? [desc(product.priceIlsMinor), ...NEWEST]
        : [...NEWEST];
  const query = cardSelect()
    .where(where)
    .orderBy(...order);
  return toCards(await (limit === undefined ? query : query.limit(limit)));
}

/** The piece is linked to any of the categories (an `EXISTS`, so a piece is never listed twice). */
function inAnyCategory(categoryIds: string[]): SQL {
  return exists(
    db
      .select({ one: productCategory.productId })
      .from(productCategory)
      .where(
        and(
          eq(productCategory.productId, product.id),
          inArray(productCategory.categoryId, categoryIds),
        ),
      ),
  );
}

/**
 * "You may also like": up to `limit` other published pieces. First those sharing one of
 * `categoryIds` (the piece's categories without the home-row one), newest first; then, to fill
 * the list, the newest of the rest. Never the piece itself, never twice (007 D8).
 */
export async function listAlsoLike(
  productId: string,
  categoryIds: string[],
  limit = 4,
): Promise<PublicProductCard[]> {
  const shared =
    categoryIds.length === 0
      ? []
      : await toCards(
          await cardSelect()
            .where(
              and(
                eq(product.state, 'published'),
                ne(product.id, productId),
                inAnyCategory(categoryIds),
              ),
            )
            .orderBy(...NEWEST)
            .limit(limit),
        );
  const missing = limit - shared.length;
  if (missing <= 0) return shared;
  const rest = await toCards(
    await cardSelect()
      .where(
        and(
          eq(product.state, 'published'),
          notInArray(product.id, [productId, ...shared.map((card) => card.id)]),
        ),
      )
      .orderBy(...NEWEST)
      .limit(missing),
  );
  return [...shared, ...rest];
}

/**
 * "You may also like" for a product page: the piece's categories without the home-row category
 * (it holds every piece, so sharing it says nothing; FR-019, D8), then `listAlsoLike`.
 */
export function listAlsoLikeFor(
  piece: { id: string; categories: readonly { id: string }[] },
  homeCategoryId: string | null,
  limit = 4,
): Promise<PublicProductCard[]> {
  return listAlsoLike(
    piece.id,
    piece.categories.filter((entry) => entry.id !== homeCategoryId).map((entry) => entry.id),
    limit,
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
    .innerJoin(productCategory, eq(productCategory.categoryId, category.id))
    .innerJoin(
      product,
      and(eq(product.id, productCategory.productId), eq(product.state, 'published')),
    )
    .orderBy(asc(category.sortOrder));
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    nameHe: row.nameHe,
    nameEn: row.nameEn,
  }));
}

export interface HomeRow {
  /** The home-row category's name for the page language (Hebrew, marked, when English is empty). */
  name: Picked;
  slug: string;
  /** Up to 12 published pieces, newest first. */
  cards: PublicProductCard[];
}

export const HOME_ROW_LIMIT = 12;

/**
 * The home page's row (007 FR-034): published pieces of the category named by
 * `shop_settings.home_category_id`; `null` when none is chosen or it has no published piece.
 */
export async function getHomeRow(locale: ContentLocale): Promise<HomeRow | null> {
  const { homeCategoryId } = await getSettings();
  if (homeCategoryId === null) return null;
  const [row] = await db
    .select({ slug: category.slug, nameHe: category.nameHe, nameEn: category.nameEn })
    .from(category)
    .where(eq(category.id, homeCategoryId));
  if (!row) return null;
  const cards = await listPublishedProducts({ categoryId: homeCategoryId, limit: HOME_ROW_LIMIT });
  if (cards.length === 0) return null;
  return { name: pick(locale, row.nameHe, row.nameEn), slug: row.slug, cards };
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
    const [item] = await db
      .select()
      .from(product)
      .where(and(eq(product.slug, slug), eq(product.state, 'published')));
    if (!item) return null;

    const categories: PublicCategory[] = await db
      .select({
        id: category.id,
        slug: category.slug,
        nameHe: category.nameHe,
        nameEn: category.nameEn,
      })
      .from(productCategory)
      .innerJoin(category, eq(category.id, productCategory.categoryId))
      .where(eq(productCategory.productId, item.id))
      .orderBy(asc(category.sortOrder));
    const { homeCategoryId } = await getSettings();
    // FR-037: the first category that is not the home-row one, else the home-row one, else none.
    const mainCategory =
      categories.find((entry) => entry.id !== homeCategoryId) ??
      categories.find((entry) => entry.id === homeCategoryId) ??
      null;

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
      categories,
      mainCategory,
      images: images.map(toImage),
      groups,
      ...priceSpan(
        base,
        groups.map((group) => ({ deltas: group.values.map((value) => value.deltaIlsMinor) })),
      ),
    };
  },
);
