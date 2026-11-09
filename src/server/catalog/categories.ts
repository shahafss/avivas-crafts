import 'server-only';
import { and, asc, count, eq, ne, sql } from 'drizzle-orm';
import { categoryInputSchema, type CategoryInput } from '@/lib/validation/category';
import { logActivity } from '@/server/activity/log';
import { db } from '@/server/db/client';
import { category, product } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { fieldFailure, formFailure, ok, zodFailure, type ActionResult, type Actor } from './result';
import { isRandomSlug, randomSlug, slugify, uniqueSlug } from './slug';

export interface CategoryRow {
  id: string;
  slug: string;
  nameHe: string;
  nameEn: string | null;
  sortOrder: number;
  productCount: number;
}

function activityFor(actor: Actor, action: string, id: string, slug: string) {
  return {
    adminId: actor.adminId,
    actorKind: 'admin' as const,
    actorLabel: actor.label,
    action,
    targetType: 'category',
    targetId: id,
    details: { slug },
  };
}

/** Categories in display order, each with the number of products (any state) that use it. */
export async function listCategories(database: DbLike = db): Promise<CategoryRow[]> {
  const counts = database
    .select({ categoryId: product.categoryId, n: count().as('n') })
    .from(product)
    .groupBy(product.categoryId)
    .as('counts');
  const rows = await database
    .select({
      id: category.id,
      slug: category.slug,
      nameHe: category.nameHe,
      nameEn: category.nameEn,
      sortOrder: category.sortOrder,
      n: counts.n,
    })
    .from(category)
    .leftJoin(counts, eq(counts.categoryId, category.id))
    .orderBy(asc(category.sortOrder));
  return rows.map(({ n, ...row }) => ({ ...row, productCount: (n as number | null) ?? 0 }));
}

async function slugTaken(tx: DbLike, slug: string, exceptId?: string): Promise<boolean> {
  const rows = await tx
    .select({ id: category.id })
    .from(category)
    .where(
      exceptId === undefined
        ? eq(category.slug, slug)
        : and(eq(category.slug, slug), ne(category.id, exceptId)),
    );
  return rows.length > 0;
}

export async function createCategory(
  actor: Actor,
  input: CategoryInput,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) return zodFailure(parsed.error, 'admin.categories.errors.invalid');
  const { nameHe, nameEn, slug: given } = parsed.data;
  return db.transaction(async (tx) => {
    if (given !== undefined && (await slugTaken(tx, given))) {
      return fieldFailure('slug', 'admin.categories.errors.slug_taken');
    }
    const slug =
      given ?? (await uniqueSlug(slugify(nameEn) ?? randomSlug('c'), (s) => slugTaken(tx, s)));
    const [row] = await tx
      .insert(category)
      .values({
        slug,
        nameHe,
        nameEn: nameEn ?? null,
        // New categories go to the end.
        sortOrder: sql`(SELECT coalesce(max(${category.sortOrder}), -1) + 1 FROM ${category})`,
      })
      .returning({ id: category.id });
    if (!row) throw new Error('Category was not created');
    await logActivity(tx, activityFor(actor, 'category.created', row.id, slug));
    return ok({ id: row.id, slug });
  });
}

export async function updateCategory(
  actor: Actor,
  id: string,
  input: CategoryInput,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) return zodFailure(parsed.error, 'admin.categories.errors.invalid');
  const { nameHe, nameEn, slug: given } = parsed.data;
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(category).where(eq(category.id, id));
    if (!current) return formFailure('admin.categories.errors.not_found');
    let slug = current.slug;
    if (given !== undefined && given !== current.slug) {
      if (await slugTaken(tx, given, id))
        return fieldFailure('slug', 'admin.categories.errors.slug_taken');
      slug = given;
    } else if (given === undefined && isRandomSlug(current.slug, 'c')) {
      // A random slug becomes the English one when an English name is added later.
      const fromName = slugify(nameEn);
      if (fromName !== null) slug = await uniqueSlug(fromName, (s) => slugTaken(tx, s, id));
    }
    await tx
      .update(category)
      .set({ nameHe, nameEn: nameEn ?? null, slug })
      .where(eq(category.id, id));
    await logActivity(tx, activityFor(actor, 'category.updated', id, slug));
    return ok({ id, slug });
  });
}

/** Rewrites `sort_order` 0..n-1 in the given order (deferrable unique constraint: one transaction). */
async function resequence(tx: DbLike, ids: string[]): Promise<void> {
  for (const [index, id] of ids.entries()) {
    await tx.update(category).set({ sortOrder: index }).where(eq(category.id, id));
  }
}

export async function reorderCategories(actor: Actor, ids: string[]): Promise<ActionResult> {
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: category.id }).from(category);
    const wanted = new Set(ids);
    if (
      wanted.size !== ids.length ||
      ids.length !== existing.length ||
      !existing.every((row) => wanted.has(row.id))
    ) {
      return formFailure('admin.categories.errors.bad_order');
    }
    await resequence(tx, ids);
    await logActivity(tx, {
      adminId: actor.adminId,
      actorKind: 'admin',
      actorLabel: actor.label,
      action: 'category.reordered',
      targetType: 'category',
      details: { count: ids.length },
    });
    return ok(undefined);
  });
}

/** Blocked while any product (any state) uses the category; the remaining ones are re-sequenced. */
export async function deleteCategory(
  actor: Actor,
  id: string,
  options: { confirm: true },
): Promise<ActionResult> {
  if (!(options.confirm as boolean)) return formFailure('admin.confirm_required');
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(category).where(eq(category.id, id));
    if (!current) return formFailure('admin.categories.errors.not_found');
    const [used] = await tx.select({ n: count() }).from(product).where(eq(product.categoryId, id));
    const products = used?.n ?? 0;
    if (products > 0)
      return formFailure('admin.categories.errors.has_products', { count: products });
    await tx.delete(category).where(eq(category.id, id));
    const rest = await tx
      .select({ id: category.id })
      .from(category)
      .orderBy(asc(category.sortOrder));
    await resequence(
      tx,
      rest.map((row) => row.id),
    );
    await logActivity(tx, activityFor(actor, 'category.deleted', id, current.slug));
    return ok(undefined);
  });
}
