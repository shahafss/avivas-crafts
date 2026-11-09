import 'server-only';
import { and, count, eq, isNull, ne } from 'drizzle-orm';
import {
  createProductSchema,
  missingForPublish,
  optionPriceProblem,
  updateProductSchema,
  type ProductUpdate,
  type PublishFacts,
} from '@/lib/validation/product';
import { logActivity } from '@/server/activity/log';
import { db } from '@/server/db/client';
import {
  category,
  optionGroup,
  optionValue,
  product,
  productImage,
  shippingZone,
} from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { deleteImagesOfProduct } from './images';
import { syncPublicImages } from './public-images';
import {
  fieldFailure,
  formFailure,
  ok,
  zodFailure,
  type ActionResult,
  type Actor,
  type Failure,
} from './result';
import { isRandomSlug, randomSlug, slugify, uniqueSlug } from './slug';

type ProductRow = typeof product.$inferSelect;

export type ProductStateAction = 'publish' | 'hide' | 'unhide' | 'draft';

function activity(
  actor: Actor,
  action: string,
  productId: string,
  details: Record<string, unknown> = {},
) {
  return {
    adminId: actor.adminId,
    actorKind: 'admin' as const,
    actorLabel: actor.label,
    action,
    targetType: 'product',
    targetId: productId,
    details,
  };
}

async function slugTaken(tx: DbLike, slug: string, exceptId?: string): Promise<boolean> {
  const rows = await tx
    .select({ id: product.id })
    .from(product)
    .where(
      exceptId === undefined
        ? eq(product.slug, slug)
        : and(eq(product.slug, slug), ne(product.id, exceptId)),
    );
  return rows.length > 0;
}

async function usdZoneEnabled(tx: DbLike): Promise<boolean> {
  const rows = await tx
    .select({ id: shippingZone.id })
    .from(shippingZone)
    .where(and(eq(shippingZone.currency, 'USD'), eq(shippingZone.enabled, true)))
    .limit(1);
  return rows.length > 0;
}

/** Every option value of the product as `{deltaIlsMinor, deltaUsdMinor}`, grouped. */
async function optionDeltas(
  tx: DbLike,
  productId: string,
  excludeGroupId?: string,
): Promise<{ deltaIlsMinor: number; deltaUsdMinor: number | null }[][]> {
  const groups = await tx
    .select({ id: optionGroup.id })
    .from(optionGroup)
    .where(eq(optionGroup.productId, productId));
  const result: { deltaIlsMinor: number; deltaUsdMinor: number | null }[][] = [];
  for (const group of groups) {
    if (group.id === excludeGroupId) continue;
    result.push(
      await tx
        .select({
          deltaIlsMinor: optionValue.deltaIlsMinor,
          deltaUsdMinor: optionValue.deltaUsdMinor,
        })
        .from(optionValue)
        .where(eq(optionValue.groupId, group.id)),
    );
  }
  return result;
}

async function publishFacts(tx: DbLike, row: ProductRow): Promise<PublishFacts> {
  const [images] = await tx
    .select({ n: count() })
    .from(productImage)
    .where(and(eq(productImage.productId, row.id), isNull(productImage.deletedAt)));
  return {
    nameHe: row.nameHe,
    descriptionHe: row.descriptionHe,
    priceIlsMinor: row.priceIlsMinor,
    priceUsdMinor: row.priceUsdMinor,
    categoryId: row.categoryId,
    prepTimeHe: row.prepTimeHe,
    imageCount: images?.n ?? 0,
    groups: await optionDeltas(tx, row.id),
    usdZoneEnabled: await usdZoneEnabled(tx),
  };
}

function publishFailure(missing: string[]): Failure {
  return {
    ok: false,
    formError: 'admin.products.errors.publish_incomplete',
    missingFields: missing,
    fieldErrors: Object.fromEntries(
      missing.map((field) => [field, `admin.products.missing.${field}`]),
    ),
  };
}

export async function createProduct(
  actor: Actor,
  input: { nameHe: string; nameEn?: string | null },
): Promise<ActionResult<{ id: string; slug: string }>> {
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) return zodFailure(parsed.error, 'admin.products.errors.invalid');
  const { nameHe, nameEn } = parsed.data;
  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(slugify(nameEn) ?? randomSlug('p'), (s) => slugTaken(tx, s));
    const [row] = await tx
      .insert(product)
      .values({ slug, nameHe, nameEn: nameEn ?? null })
      .returning({ id: product.id });
    if (!row) throw new Error('Product was not created');
    await logActivity(tx, activity(actor, 'product.created', row.id, { slug }));
    return ok({ id: row.id, slug });
  });
}

/** Saves the given fields; a published product is re-validated against the publish rules. */
export async function updateProduct(
  actor: Actor,
  id: string,
  input: ProductUpdate,
): Promise<ActionResult> {
  const parsed = updateProductSchema.safeParse(input);
  if (!parsed.success) return zodFailure(parsed.error, 'admin.products.errors.invalid');
  const changes = Object.fromEntries(
    Object.entries(parsed.data as Record<string, unknown>).filter(
      ([, value]) => value !== undefined,
    ),
  ) as Partial<Omit<ProductRow, 'id'>>;

  return db.transaction(async (tx): Promise<ActionResult> => {
    const [current] = await tx.select().from(product).where(eq(product.id, id)).for('update');
    if (!current) return formFailure('admin.products.errors.not_found');

    // Slug: editable while draft, frozen after the first publish. An English name replaces a random slug.
    if (changes.slug !== undefined) {
      if (changes.slug === current.slug) {
        delete changes.slug;
      } else {
        if (current.publishedAt !== null)
          return fieldFailure('slug', 'admin.products.errors.slug_frozen');
        if (await slugTaken(tx, changes.slug, id))
          return fieldFailure('slug', 'admin.products.errors.slug_taken');
      }
    } else {
      const fromName = slugify(changes.nameEn);
      if (current.publishedAt === null && isRandomSlug(current.slug, 'p') && fromName !== null) {
        changes.slug = await uniqueSlug(fromName, (s) => slugTaken(tx, s, id));
      }
    }

    if (changes.categoryId !== undefined && changes.categoryId !== null) {
      const [found] = await tx
        .select({ id: category.id })
        .from(category)
        .where(eq(category.id, changes.categoryId));
      if (!found) return fieldFailure('categoryId', 'admin.products.errors.category_not_found');
    }

    const next: ProductRow = { ...current, ...changes };

    // Option adjustments must keep working with the new base prices.
    if ('priceIlsMinor' in changes || 'priceUsdMinor' in changes) {
      const groups = await optionDeltas(tx, id);
      const problem = optionPriceProblem(next, groups.flat());
      if (problem === 'usd_missing' || problem === 'usd_not_positive') {
        return fieldFailure('priceUsdMinor', `admin.products.errors.option_${problem}`);
      }
      if (problem === 'ils_not_positive') {
        return fieldFailure('priceIlsMinor', 'admin.products.errors.option_ils_not_positive');
      }
    }

    if (current.state === 'published') {
      const missing = missingForPublish(await publishFacts(tx, next));
      if (missing.length > 0) return publishFailure(missing);
    }

    const changed = (Object.keys(changes) as (keyof typeof changes)[]).filter(
      (key) => changes[key] !== current[key],
    );
    if (changed.length === 0) return ok(undefined);

    await tx.update(product).set(changes).where(eq(product.id, id));
    for (const [column, currency] of [
      ['priceIlsMinor', 'ILS'],
      ['priceUsdMinor', 'USD'],
    ] as const) {
      if (changed.includes(column)) {
        await logActivity(
          tx,
          activity(actor, 'product.price_changed', id, {
            oldPriceMinor: current[column],
            newPriceMinor: next[column],
            currency,
          }),
        );
      }
    }
    const others = changed.filter((key) => key !== 'priceIlsMinor' && key !== 'priceUsdMinor');
    if (others.length > 0) {
      await logActivity(tx, activity(actor, 'product.updated', id, { count: others.length }));
    }
    return ok(undefined);
  });
}

const TRANSITIONS: Record<
  ProductStateAction,
  { from: ProductRow['state']; to: ProductRow['state'] }
> = {
  publish: { from: 'draft', to: 'published' },
  hide: { from: 'published', to: 'hidden' },
  unhide: { from: 'hidden', to: 'published' },
  draft: { from: 'published', to: 'draft' },
};

/** data-model.md state machine; publishing is blocked with `missingFields`, then the public bucket is synced. */
export async function setProductState(
  actor: Actor,
  id: string,
  action: ProductStateAction,
): Promise<ActionResult> {
  const transition = TRANSITIONS[action];
  const result = await db.transaction(async (tx): Promise<ActionResult> => {
    const [current] = await tx.select().from(product).where(eq(product.id, id)).for('update');
    if (!current) return formFailure('admin.products.errors.not_found');
    const allowed =
      action === 'draft'
        ? current.state === 'published' || current.state === 'hidden'
        : current.state === transition.from;
    if (!allowed) return formFailure('admin.products.errors.invalid_transition');

    const values: Partial<ProductRow> = { state: transition.to };
    if (transition.to === 'published') {
      const missing = missingForPublish(await publishFacts(tx, current));
      if (missing.length > 0) return publishFailure(missing);
      values.publishedAt = current.publishedAt ?? new Date();
      // A random slug becomes the English one at the first publish, before it is frozen.
      const fromName = slugify(current.nameEn);
      if (current.publishedAt === null && isRandomSlug(current.slug, 'p') && fromName !== null) {
        values.slug = await uniqueSlug(fromName, (s) => slugTaken(tx, s, id));
      }
    }
    await tx.update(product).set(values).where(eq(product.id, id));
    await logActivity(
      tx,
      activity(actor, 'product.updated', id, { state: transition.to, from: current.state }),
    );
    return ok(undefined);
  });
  if (result.ok) await syncPublicImages(id);
  return result;
}

/** FR-007: false = visible but "not available to order right now". */
export async function setProductOrderable(
  actor: Actor,
  id: string,
  orderable: boolean,
): Promise<ActionResult> {
  return db.transaction(async (tx): Promise<ActionResult> => {
    const [current] = await tx.select().from(product).where(eq(product.id, id)).for('update');
    if (!current) return formFailure('admin.products.errors.not_found');
    if (current.orderable === orderable) return ok(undefined);
    await tx.update(product).set({ orderable }).where(eq(product.id, id));
    await logActivity(
      tx,
      activity(actor, 'product.updated', id, { field: 'orderable', to: orderable }),
    );
    return ok(undefined);
  });
}

/**
 * Deletes the product and all its photo files at once; order lines keep their own snapshot
 * (`order_line.product_id` becomes null).
 */
export async function deleteProduct(
  actor: Actor,
  id: string,
  options: { confirm: true },
): Promise<ActionResult> {
  if (!(options.confirm as boolean)) return formFailure('admin.confirm_required');
  const [current] = await db.select({ slug: product.slug }).from(product).where(eq(product.id, id));
  if (!current) return formFailure('admin.products.errors.not_found');
  // Files first: the image rows cascade with the product, so afterwards nothing could find them.
  await deleteImagesOfProduct(id);
  await db.transaction(async (tx) => {
    await tx.delete(product).where(eq(product.id, id));
    await logActivity(tx, activity(actor, 'product.deleted', id, { slug: current.slug }));
  });
  return ok(undefined);
}
