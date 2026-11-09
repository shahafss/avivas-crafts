import 'server-only';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { orderLine } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { variantKey } from '@/server/catalog/public-images';
import type { CartItem, PricedLine } from '@/server/checkout/pricing';
import { log } from '@/server/security/logger';
import { getStorage } from '@/server/storage';

/**
 * Order line snapshots (data-model.md > order_line, pending_checkout.lines). A priced cart line is
 * frozen into this shape when the order or pending checkout is created; later changes to the
 * product never touch it. Online checkouts keep the shape in `pending_checkout.lines` until the
 * payment is confirmed.
 */

export const lineSnapshotSchema = z.object({
  product_id: z.string().nullable(),
  /** Kept so the stored lines can be priced again on retry or switch to offline payment. */
  option_value_ids: z.array(z.string()),
  product_name_he: z.string(),
  product_name_en: z.string().nullable(),
  prep_time_he: z.string().nullable(),
  prep_time_en: z.string().nullable(),
  options: z.array(
    z.object({
      group_he: z.string(),
      group_en: z.string().nullable(),
      value_he: z.string(),
      value_en: z.string().nullable(),
    }),
  ),
  unit_price_minor: z.number().int(),
  quantity: z.number().int(),
  line_total_minor: z.number().int(),
  /** `storage_key` of the product's main photo at order time; the order photo is copied from it. */
  sourceImageKey: z.string().nullable(),
});
export type LineSnapshot = z.infer<typeof lineSnapshotSchema>;

export const lineSnapshotsSchema = z.array(lineSnapshotSchema);

export function snapshotLines(lines: readonly PricedLine[]): LineSnapshot[] {
  return lines.map((line) => ({
    product_id: line.productId,
    option_value_ids: [...line.optionValueIds],
    product_name_he: line.nameHe,
    product_name_en: line.nameEn,
    prep_time_he: line.prepTimeHe,
    prep_time_en: line.prepTimeEn,
    options: line.options.map((option) => ({
      group_he: option.groupHe,
      group_en: option.groupEn,
      value_he: option.valueHe,
      value_en: option.valueEn,
    })),
    unit_price_minor: line.unitPriceMinor,
    quantity: line.quantity,
    line_total_minor: line.lineTotalMinor,
    sourceImageKey: line.sourceImageKey,
  }));
}

/** The stored lines as cart items, to price them again. */
export function snapshotsAsCartItems(lines: readonly LineSnapshot[]): CartItem[] {
  return lines.map((line) => ({
    productId: line.product_id ?? '',
    optionValueIds: line.option_value_ids,
    quantity: line.quantity,
  }));
}

export interface OrderLineInsert {
  id: string;
  orderId: string;
  productId: string | null;
  productNameHe: string;
  productNameEn: string | null;
  /** Set after commit by `copyOrderImages`. */
  imageKey: null;
  options: LineSnapshot['options'];
  prepTimeHe: string | null;
  prepTimeEn: string | null;
  unitPriceMinor: number;
  quantity: number;
  lineTotalMinor: number;
}

/**
 * A random UUID whose first eight hex digits are the line's position, so that ordering an
 * order's lines by id gives the order they were placed in (`order_line` has no position column).
 */
function lineId(index: number): string {
  return `${index.toString(16).padStart(8, '0')}${randomUUID().slice(8)}`;
}

/** `order_line` rows for an order. Ids are generated here so photo keys can name them. */
export function orderLineRows(
  orderId: string,
  lines: readonly LineSnapshot[],
): { rows: OrderLineInsert[]; photos: PhotoToCopy[] } {
  const rows: OrderLineInsert[] = [];
  const photos: PhotoToCopy[] = [];
  for (const [index, line] of lines.entries()) {
    const id = lineId(index);
    rows.push({
      id,
      orderId,
      productId: line.product_id,
      productNameHe: line.product_name_he,
      productNameEn: line.product_name_en,
      imageKey: null,
      options: line.options,
      prepTimeHe: line.prep_time_he,
      prepTimeEn: line.prep_time_en,
      unitPriceMinor: line.unit_price_minor,
      quantity: line.quantity,
      lineTotalMinor: line.line_total_minor,
    });
    if (line.sourceImageKey !== null)
      photos.push({ lineId: id, sourceImageKey: line.sourceImageKey });
  }
  return { rows, photos };
}

export interface PhotoToCopy {
  lineId: string;
  sourceImageKey: string;
}

/**
 * Copies each main photo's 400 variant to `orders/<orderId>/<lineId>-400.webp` in the private
 * bucket and records the key. Runs after the order's transaction has committed, and is best
 * effort: a photo that is gone or a copy that fails leaves `image_key` null and is logged; the
 * order is never affected.
 */
export async function copyOrderImages(
  orderId: string,
  photos: readonly PhotoToCopy[],
  database: DbLike = db,
): Promise<void> {
  const storage = getStorage();
  for (const photo of photos) {
    const target = `orders/${orderId}/${photo.lineId}-400.webp`;
    try {
      await storage.copy('private', variantKey(photo.sourceImageKey, 400), 'private', target);
      await database
        .update(orderLine)
        .set({ imageKey: target })
        .where(eq(orderLine.id, photo.lineId));
    } catch {
      log.warn('order_image_copy_failed', { orderId });
    }
  }
}
