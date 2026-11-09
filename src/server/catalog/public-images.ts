import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { product, productImage } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { getStorage } from '@/server/storage';

export const VARIANT_WIDTHS = [400, 800, 1600] as const;

/** Public copies may be cached for a day only, so a hidden product drops out of CDN caches soon. */
export const PUBLIC_CACHE_CONTROL = 'public, max-age=86400';

export function variantKey(storageKey: string, width: number): string {
  return `${storageKey}-${String(width)}.webp`;
}

export function variantKeys(storageKey: string): string[] {
  return VARIANT_WIDTHS.map((width) => variantKey(storageKey, width));
}

// One shop instance runs, so an in-process queue per product is enough to serialise syncs.
const tails = new Map<string, Promise<unknown>>();

function withProductLock<T>(productId: string, job: () => Promise<T>): Promise<T> {
  const run = (tails.get(productId) ?? Promise.resolve()).then(job, job);
  const tail = run.catch(() => undefined);
  tails.set(productId, tail);
  void tail.then(() => {
    if (tails.get(productId) === tail) tails.delete(productId);
  });
  return run;
}

async function isPublished(productId: string, database: DbLike): Promise<boolean> {
  const [row] = await database
    .select({ state: product.state })
    .from(product)
    .where(eq(product.id, productId));
  return row?.state === 'published';
}

/**
 * Makes the public bucket match the product: published -> a copy of every variant of the
 * non-deleted images (none of the removed ones); any other state -> no public copies at all.
 * `only` limits the work to images with these storage keys (a new or removed photo: keys never
 * change, so reorders need no sync). Syncs of one product run one after the other, and after
 * copying the state is read again: a product hidden meanwhile loses every public copy.
 * A variant that is missing from the private bucket is skipped.
 */
export function syncPublicImages(
  productId: string,
  database: DbLike = db,
  only?: string[],
): Promise<void> {
  return withProductLock(productId, async () => {
    const storage = getStorage();
    const images = await database
      .select({ storageKey: productImage.storageKey, deletedAt: productImage.deletedAt })
      .from(productImage)
      .where(eq(productImage.productId, productId));
    const scope = images.filter((image) => only === undefined || only.includes(image.storageKey));
    const publish = await isPublished(productId, database);

    for (const image of scope) {
      for (const key of variantKeys(image.storageKey)) {
        if (!publish || image.deletedAt !== null) {
          await storage.delete('public', key);
          continue;
        }
        const source = await storage.get('private', key);
        if (!source) continue;
        const body = Buffer.from(await new Response(source.body).arrayBuffer());
        await storage.put('public', key, body, 'image/webp', PUBLIC_CACHE_CONTROL);
      }
    }

    // Hidden, drafted or deleted while the copies were being made: take every public copy away.
    if (publish && !(await isPublished(productId, database))) {
      for (const image of images) {
        for (const key of variantKeys(image.storageKey)) await storage.delete('public', key);
      }
    }
  });
}
