import 'server-only';
import { and, asc, desc, eq, exists, inArray, isNull } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { category, product, productCategory, productImage } from '@/server/db/schema';
import { adminImageUrl, listImages, type ImageRow } from './images';
import { listOptionGroups, type OptionGroupRow } from './options';

export type ProductState = (typeof product.$inferSelect)['state'];

export interface AdminProductListRow {
  id: string;
  slug: string;
  nameHe: string;
  priceIlsMinor: number | null;
  state: ProductState;
  orderable: boolean;
  /** Hebrew names of every category of the piece, in the shop's category order. */
  categoryNames: string[];
  /** Same-origin URL of the main photo (400 px), or null. */
  imageUrl: string | null;
  /**
   * The English name is empty, or a Hebrew description exists without an English one (a draft
   * with no Hebrew description is not asked for an English one; spec 005 FR-017).
   */
  missingEnglish: boolean;
}

const blank = (value: string | null): boolean => value === null || value.trim() === '';

/** Newest first; `state` and `categoryId` narrow the list. */
export async function listAdminProducts(
  filters: { state?: ProductState; categoryId?: string } = {},
): Promise<AdminProductListRow[]> {
  const conditions = [
    filters.state === undefined ? undefined : eq(product.state, filters.state),
    filters.categoryId === undefined
      ? undefined
      : exists(
          db
            .select({ one: productCategory.productId })
            .from(productCategory)
            .where(
              and(
                eq(productCategory.productId, product.id),
                eq(productCategory.categoryId, filters.categoryId),
              ),
            ),
        ),
  ].filter((condition) => condition !== undefined);
  const rows = await db
    .select({
      id: product.id,
      slug: product.slug,
      nameHe: product.nameHe,
      priceIlsMinor: product.priceIlsMinor,
      state: product.state,
      orderable: product.orderable,
      imageKey: productImage.storageKey,
      nameEn: product.nameEn,
      descriptionHe: product.descriptionHe,
      descriptionEn: product.descriptionEn,
    })
    .from(product)
    .leftJoin(
      productImage,
      and(
        eq(productImage.productId, product.id),
        eq(productImage.position, 0),
        isNull(productImage.deletedAt),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(product.createdAt), asc(product.id));
  const names = new Map<string, string[]>();
  if (rows.length > 0) {
    const links = await db
      .select({ productId: productCategory.productId, nameHe: category.nameHe })
      .from(productCategory)
      .innerJoin(category, eq(category.id, productCategory.categoryId))
      .where(
        inArray(
          productCategory.productId,
          rows.map((row) => row.id),
        ),
      )
      .orderBy(asc(category.sortOrder));
    for (const link of links) {
      names.set(link.productId, [...(names.get(link.productId) ?? []), link.nameHe]);
    }
  }
  return rows.map(({ imageKey, nameEn, descriptionHe, descriptionEn, ...row }) => ({
    ...row,
    categoryNames: names.get(row.id) ?? [],
    imageUrl: imageKey === null ? null : adminImageUrl(imageKey, 400),
    missingEnglish: blank(nameEn) || (!blank(descriptionHe) && blank(descriptionEn)),
  }));
}

export interface EditorProduct {
  id: string;
  slug: string;
  nameHe: string;
  nameEn: string | null;
  descriptionHe: string | null;
  descriptionEn: string | null;
  priceIlsMinor: number | null;
  priceUsdMinor: number | null;
  prepTimeHe: string | null;
  prepTimeEn: string | null;
  /** Ids of the piece's categories (any order). */
  categoryIds: string[];
  state: ProductState;
  orderable: boolean;
}

export interface EditorImage extends ImageRow {
  /** Same-origin preview URL (400 px). */
  url: string;
}

export interface EditorData {
  product: EditorProduct;
  images: EditorImage[];
  groups: OptionGroupRow[];
}

/** Everything the product editor shows, or `null` when the product does not exist. */
export async function getEditorData(id: string): Promise<EditorData | null> {
  const [row] = await db.select().from(product).where(eq(product.id, id));
  if (!row) return null;
  const images = await listImages(id);
  const links = await db
    .select({ categoryId: productCategory.categoryId })
    .from(productCategory)
    .where(eq(productCategory.productId, id));
  return {
    product: {
      id: row.id,
      slug: row.slug,
      nameHe: row.nameHe,
      nameEn: row.nameEn,
      descriptionHe: row.descriptionHe,
      descriptionEn: row.descriptionEn,
      priceIlsMinor: row.priceIlsMinor,
      priceUsdMinor: row.priceUsdMinor,
      prepTimeHe: row.prepTimeHe,
      prepTimeEn: row.prepTimeEn,
      categoryIds: links.map((link) => link.categoryId),
      state: row.state,
      orderable: row.orderable,
    },
    images: images.map((image) => ({ ...image, url: adminImageUrl(image.storageKey, 400) })),
    groups: await listOptionGroups(id),
  };
}
