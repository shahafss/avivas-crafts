import 'server-only';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { category, product, productImage } from '@/server/db/schema';
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
  categoryNameHe: string | null;
  /** Same-origin URL of the main photo (400 px), or null. */
  imageUrl: string | null;
}

/** Newest first; `state` and `categoryId` narrow the list. */
export async function listAdminProducts(
  filters: { state?: ProductState; categoryId?: string } = {},
): Promise<AdminProductListRow[]> {
  const conditions = [
    filters.state === undefined ? undefined : eq(product.state, filters.state),
    filters.categoryId === undefined ? undefined : eq(product.categoryId, filters.categoryId),
  ].filter((condition) => condition !== undefined);
  const rows = await db
    .select({
      id: product.id,
      slug: product.slug,
      nameHe: product.nameHe,
      priceIlsMinor: product.priceIlsMinor,
      state: product.state,
      orderable: product.orderable,
      categoryNameHe: category.nameHe,
      imageKey: productImage.storageKey,
    })
    .from(product)
    .leftJoin(category, eq(category.id, product.categoryId))
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
  return rows.map(({ imageKey, ...row }) => ({
    ...row,
    imageUrl: imageKey === null ? null : adminImageUrl(imageKey, 400),
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
  categoryId: string | null;
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
      categoryId: row.categoryId,
      state: row.state,
      orderable: row.orderable,
    },
    images: images.map((image) => ({ ...image, url: adminImageUrl(image.storageKey, 400) })),
    groups: await listOptionGroups(id),
  };
}
