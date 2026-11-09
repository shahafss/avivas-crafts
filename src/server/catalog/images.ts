import 'server-only';
import { randomBytes } from 'node:crypto';
import { and, asc, count, eq, isNotNull, isNull, lt } from 'drizzle-orm';
import sharp from 'sharp';
import { logActivity } from '@/server/activity/log';
import { db } from '@/server/db/client';
import { product, productImage } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { ImageError, processUpload, type UploadErrorCode } from '@/server/images/process';
import { enqueueImageJob } from '@/server/images/queue';
import type { JobTask } from '@/server/jobs/daily-maintenance';
import { getStorage } from '@/server/storage';
import { MAX_IMAGES } from '@/lib/validation/product';
import { syncPublicImages, variantKey, variantKeys } from './public-images';
import { fieldFailure, formFailure, ok, type ActionResult, type Actor } from './result';

/** Removed photos stay in private storage for this long (data-model.md › product_image). */
export const IMAGE_PURGE_AFTER_DAYS = 30;

export type AddImageResult =
  | { ok: true; id: string; position: number; storageKey: string }
  | { ok: false; code: UploadErrorCode | 'too_many_images' | 'not_found' };

export interface ImageRow {
  id: string;
  storageKey: string;
  width: number;
  height: number;
  altHe: string | null;
  altEn: string | null;
  position: number;
}

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

/** `p/` + 16 random bytes as lowercase, unpadded base32 (26 characters). */
export function newStorageKey(): string {
  const bytes = randomBytes(16);
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32.charAt((value << (5 - bits)) & 31);
  return `p/${out}`;
}

/** Same-origin admin URL of a private image (served by `/api/admin/media/[...key]`). */
export function adminImageUrl(storageKey: string, width: 400 | 800 | 1600): string {
  return `/api/admin/media/${variantKey(storageKey, width)}`;
}

/** Non-deleted images, main photo first. */
export async function listImages(productId: string, database: DbLike = db): Promise<ImageRow[]> {
  const rows = await database
    .select({
      id: productImage.id,
      storageKey: productImage.storageKey,
      width: productImage.width,
      height: productImage.height,
      altHe: productImage.altHe,
      altEn: productImage.altEn,
      position: productImage.position,
    })
    .from(productImage)
    .where(and(eq(productImage.productId, productId), isNull(productImage.deletedAt)))
    .orderBy(asc(productImage.position));
  return rows.map((row) => ({ ...row, position: row.position ?? 0 }));
}

function activity(actor: Actor, productId: string, count?: number) {
  return {
    adminId: actor.adminId,
    actorKind: 'admin' as const,
    actorLabel: actor.label,
    action: 'product.updated',
    targetType: 'product',
    targetId: productId,
    details: { field: 'images', ...(count === undefined ? {} : { count }) },
  };
}

async function removeStored(storageKey: string): Promise<void> {
  const storage = getStorage();
  for (const key of variantKeys(storageKey)) {
    await storage.delete('private', key);
    await storage.delete('public', key);
  }
}

/**
 * Processes an upload (one at a time), stores the variants in the private bucket and numbers the
 * photo last. A published product gets the public copies right away. `actor: null` is system work
 * (the seed) and writes no activity row.
 */
export async function addImage(
  actor: Actor | null,
  productId: string,
  buffer: Buffer,
  options: { db?: DbLike } = {},
): Promise<AddImageResult> {
  const database = options.db ?? db;
  const [current] = await database
    .select({ id: product.id })
    .from(product)
    .where(eq(product.id, productId));
  if (!current) return { ok: false, code: 'not_found' };
  const [before] = await database
    .select({ n: count() })
    .from(productImage)
    .where(and(eq(productImage.productId, productId), isNull(productImage.deletedAt)));
  if ((before?.n ?? 0) >= MAX_IMAGES) return { ok: false, code: 'too_many_images' };

  let processed;
  try {
    processed = await enqueueImageJob(() => processUpload(buffer));
  } catch (error) {
    if (error instanceof ImageError) return { ok: false, code: error.code };
    throw error;
  }

  // `width`/`height` of the row are those of the 1600 variant (data-model.md › product_image).
  const largest =
    processed.variants.find((variant) => variant.width === 1600) ?? processed.variants.at(-1);
  const shown = largest ? await sharp(largest.buffer).metadata() : undefined;
  const width = shown?.width ?? processed.width;
  const height = shown?.height ?? processed.height;

  const storageKey = newStorageKey();
  const storage = getStorage();
  const stored: string[] = [];
  try {
    for (const variant of processed.variants) {
      const key = variantKey(storageKey, variant.width);
      await storage.put('private', key, variant.buffer, 'image/webp');
      stored.push(key);
    }
    const result = await database.transaction(async (tx): Promise<AddImageResult> => {
      // Serialises concurrent uploads of one product, so the limit and the numbering hold.
      const [locked] = await tx
        .select({ id: product.id })
        .from(product)
        .where(eq(product.id, productId))
        .for('update');
      if (!locked) return { ok: false, code: 'not_found' };
      const [live] = await tx
        .select({ n: count() })
        .from(productImage)
        .where(and(eq(productImage.productId, productId), isNull(productImage.deletedAt)));
      const position = live?.n ?? 0;
      if (position >= MAX_IMAGES) return { ok: false, code: 'too_many_images' };
      const [row] = await tx
        .insert(productImage)
        .values({
          productId,
          storageKey,
          width,
          height,
          position,
        })
        .returning({ id: productImage.id });
      if (!row) throw new Error('Image row was not written');
      if (actor) await logActivity(tx, activity(actor, productId, position + 1));
      return { ok: true, id: row.id, position, storageKey };
    });
    if (!result.ok) {
      await removeStored(storageKey);
      return result;
    }
    // Always: the sync reads the state itself, so a product hidden meanwhile gets no public copy.
    await syncPublicImages(productId, database, [storageKey]);
    return result;
  } catch (error) {
    await removeStored(storageKey).catch(() => undefined);
    throw error;
  }
}

async function liveIds(tx: DbLike, productId: string): Promise<string[]> {
  const rows = await tx
    .select({ id: productImage.id })
    .from(productImage)
    .where(and(eq(productImage.productId, productId), isNull(productImage.deletedAt)))
    .orderBy(asc(productImage.position));
  return rows.map((row) => row.id);
}

/** Rewrites positions 0..n-1 in the given order (deferrable unique constraint: one transaction). */
async function writeOrder(tx: DbLike, ids: string[]): Promise<void> {
  for (const [index, id] of ids.entries()) {
    await tx.update(productImage).set({ position: index }).where(eq(productImage.id, id));
  }
}

export async function reorderImages(
  actor: Actor,
  productId: string,
  imageIds: string[],
): Promise<ActionResult> {
  const result = await db.transaction(async (tx): Promise<ActionResult> => {
    const current = await liveIds(tx, productId);
    const wanted = new Set(imageIds);
    if (
      wanted.size !== imageIds.length ||
      imageIds.length !== current.length ||
      !current.every((id) => wanted.has(id))
    ) {
      return formFailure('admin.products.errors.bad_image_order');
    }
    await writeOrder(tx, imageIds);
    await logActivity(tx, activity(actor, productId));
    return ok(undefined);
  });
  // Keys do not change on a reorder, so the public bucket needs nothing.
  return result;
}

/** Optional alt text of one photo, in Hebrew and English (empty = none). */
export async function setImageAlt(
  actor: Actor,
  productId: string,
  imageId: string,
  alt: { altHe?: string | null; altEn?: string | null },
): Promise<ActionResult> {
  const clean = (value: string | null | undefined): string | null => {
    const trimmed = value?.trim() ?? '';
    return trimmed === '' ? null : trimmed;
  };
  const altHe = clean(alt.altHe);
  const altEn = clean(alt.altEn);
  if ((altHe?.length ?? 0) > 200 || (altEn?.length ?? 0) > 200) {
    return formFailure('admin.products.errors.invalid');
  }
  return db.transaction(async (tx): Promise<ActionResult> => {
    const updated = await tx
      .update(productImage)
      .set({ altHe, altEn })
      .where(
        and(
          eq(productImage.id, imageId),
          eq(productImage.productId, productId),
          isNull(productImage.deletedAt),
        ),
      )
      .returning({ id: productImage.id });
    if (updated.length === 0) return formFailure('admin.products.errors.image_not_found');
    await logActivity(tx, activity(actor, productId));
    return ok(undefined);
  });
}

/** Position 0; the others keep their relative order. */
export async function setMainImage(
  actor: Actor,
  productId: string,
  imageId: string,
): Promise<ActionResult> {
  const result = await db.transaction(async (tx): Promise<ActionResult> => {
    const current = await liveIds(tx, productId);
    if (!current.includes(imageId)) return formFailure('admin.products.errors.image_not_found');
    await writeOrder(tx, [imageId, ...current.filter((id) => id !== imageId)]);
    await logActivity(tx, activity(actor, productId));
    return ok(undefined);
  });
  return result;
}

/**
 * Soft delete: `deleted_at` set, `position` null, the rest re-sequenced (so the next photo
 * becomes main when the main one is removed). The files go 30 days later, the public copies at once.
 */
export async function removeImage(
  actor: Actor,
  productId: string,
  imageId: string,
): Promise<ActionResult> {
  const removed: { key?: string } = {};
  const result = await db.transaction(async (tx): Promise<ActionResult> => {
    const [current] = await tx
      .select({ state: product.state })
      .from(product)
      .where(eq(product.id, productId))
      .for('update');
    const ids = await liveIds(tx, productId);
    if (!current || !ids.includes(imageId))
      return formFailure('admin.products.errors.image_not_found');
    // A published product needs a photo.
    if (current.state === 'published' && ids.length === 1) {
      return fieldFailure('images', 'admin.products.errors.last_photo');
    }
    const [row] = await tx
      .select({ storageKey: productImage.storageKey })
      .from(productImage)
      .where(eq(productImage.id, imageId));
    removed.key = row?.storageKey;
    await tx
      .update(productImage)
      .set({ deletedAt: new Date(), position: null })
      .where(eq(productImage.id, imageId));
    await writeOrder(
      tx,
      ids.filter((id) => id !== imageId),
    );
    await logActivity(tx, activity(actor, productId, ids.length - 1));
    return ok(undefined);
  });
  // Only the removed photo's public copies go.
  if (result.ok && removed.key !== undefined) await syncPublicImages(productId, db, [removed.key]);
  return result;
}

/**
 * Deletes the private and public files of **all** images of a product (soft-deleted ones too).
 * Called before the product row goes: its images cascade with it, so the daily purge could never find them.
 */
export async function deleteImagesOfProduct(
  productId: string,
  database: DbLike = db,
): Promise<void> {
  const rows = await database
    .select({ storageKey: productImage.storageKey })
    .from(productImage)
    .where(eq(productImage.productId, productId));
  for (const row of rows) await removeStored(row.storageKey);
}

/** Daily: removes the files and rows of photos soft-deleted more than 30 days ago. */
export const purgeDeletedImagesTask: JobTask = {
  name: 'purge-deleted-images',
  async run(database, now) {
    const cutoff = new Date(now.getTime() - IMAGE_PURGE_AFTER_DAYS * 86_400_000);
    const old = await database
      .select({ id: productImage.id, storageKey: productImage.storageKey })
      .from(productImage)
      .where(and(isNotNull(productImage.deletedAt), lt(productImage.deletedAt, cutoff)));
    for (const row of old) {
      await removeStored(row.storageKey);
      await database.delete(productImage).where(eq(productImage.id, row.id));
    }
    return `purged ${String(old.length)}`;
  },
};
