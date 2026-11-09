import 'server-only';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import {
  optionGroupSchema,
  optionPriceProblem,
  type OptionGroupInput,
  type Swatch,
} from '@/lib/validation/product';
import { logActivity } from '@/server/activity/log';
import { db } from '@/server/db/client';
import { optionGroup, optionValue, product } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { fieldFailure, formFailure, ok, zodFailure, type ActionResult, type Actor } from './result';

export interface OptionValueRow {
  id: string;
  labelHe: string;
  labelEn: string | null;
  deltaIlsMinor: number;
  deltaUsdMinor: number | null;
  swatch: Swatch | null;
  position: number;
}

export interface OptionGroupRow {
  id: string;
  nameHe: string;
  nameEn: string | null;
  position: number;
  values: OptionValueRow[];
}

function activity(actor: Actor, productId: string) {
  return {
    adminId: actor.adminId,
    actorKind: 'admin' as const,
    actorLabel: actor.label,
    action: 'product.updated',
    targetType: 'product',
    targetId: productId,
    details: { field: 'options' },
  };
}

/** Groups of a product with their values, both in display order. */
export async function listOptionGroups(
  productId: string,
  database: DbLike = db,
): Promise<OptionGroupRow[]> {
  const groups = await database
    .select()
    .from(optionGroup)
    .where(eq(optionGroup.productId, productId))
    .orderBy(asc(optionGroup.position));
  const result: OptionGroupRow[] = [];
  for (const group of groups) {
    const values = await database
      .select()
      .from(optionValue)
      .where(eq(optionValue.groupId, group.id))
      .orderBy(asc(optionValue.position));
    result.push({
      id: group.id,
      nameHe: group.nameHe,
      nameEn: group.nameEn,
      position: group.position,
      values: values.map((value) => ({
        id: value.id,
        labelHe: value.labelHe,
        labelEn: value.labelEn,
        deltaIlsMinor: value.deltaIlsMinor,
        deltaUsdMinor: value.deltaUsdMinor,
        swatch: value.swatch as Swatch | null,
        position: value.position,
      })),
    });
  }
  return result;
}

/**
 * Creates or edits one option group. Values with an `id` are updated in place (they keep it, so
 * carts that hold them only see the new price), values of the group that are left out are
 * deleted, values without an `id` are inserted. Ids of another group or product are rejected.
 */
export async function upsertOptionGroup(
  actor: Actor,
  productId: string,
  input: OptionGroupInput,
): Promise<ActionResult<{ id: string; valueIds: string[] }>> {
  const parsed = optionGroupSchema.safeParse(input);
  if (!parsed.success) return zodFailure(parsed.error, 'admin.products.errors.invalid');
  const data = parsed.data;

  return db.transaction(async (tx) => {
    const [owner] = await tx.select().from(product).where(eq(product.id, productId)).for('update');
    if (!owner) return formFailure('admin.products.errors.not_found');

    let existingValueIds = new Set<string>();
    if (data.id !== undefined) {
      const [group] = await tx
        .select({ id: optionGroup.id })
        .from(optionGroup)
        .where(and(eq(optionGroup.id, data.id), eq(optionGroup.productId, productId)));
      if (!group) return formFailure('admin.products.errors.option_group_invalid');
      const rows = await tx
        .select({ id: optionValue.id })
        .from(optionValue)
        .where(eq(optionValue.groupId, data.id));
      existingValueIds = new Set(rows.map((row) => row.id));
    }
    const givenIds = data.values.flatMap((value) => (value.id === undefined ? [] : [value.id]));
    if (
      new Set(givenIds).size !== givenIds.length ||
      givenIds.some((id) => !existingValueIds.has(id))
    ) {
      return formFailure('admin.products.errors.option_value_invalid');
    }

    const problem = optionPriceProblem(
      owner,
      data.values.map((value) => ({
        deltaIlsMinor: value.deltaIlsMinor,
        deltaUsdMinor: value.deltaUsdMinor ?? null,
      })),
    );
    if (problem !== null) return fieldFailure('values', `admin.products.errors.option_${problem}`);
    if (owner.state === 'published' && data.values.length < 2) {
      return fieldFailure('values', 'admin.products.errors.option_min_values');
    }

    let groupId = data.id;
    if (groupId === undefined) {
      const [positions] = await tx
        .select({ n: count() })
        .from(optionGroup)
        .where(eq(optionGroup.productId, productId));
      const [created] = await tx
        .insert(optionGroup)
        .values({
          productId,
          nameHe: data.nameHe,
          nameEn: data.nameEn ?? null,
          position: positions?.n ?? 0,
        })
        .returning({ id: optionGroup.id });
      if (!created) throw new Error('Option group was not created');
      groupId = created.id;
    } else {
      await tx
        .update(optionGroup)
        .set({ nameHe: data.nameHe, nameEn: data.nameEn ?? null })
        .where(eq(optionGroup.id, groupId));
      const keep = new Set(givenIds);
      const gone = [...existingValueIds].filter((id) => !keep.has(id));
      if (gone.length > 0) await tx.delete(optionValue).where(inArray(optionValue.id, gone));
    }

    const valueIds: string[] = [];
    for (const [position, value] of data.values.entries()) {
      const fields = {
        labelHe: value.labelHe,
        labelEn: value.labelEn ?? null,
        deltaIlsMinor: value.deltaIlsMinor,
        deltaUsdMinor: value.deltaUsdMinor ?? null,
        swatch: value.swatch ?? null,
        position,
      };
      if (value.id !== undefined) {
        await tx.update(optionValue).set(fields).where(eq(optionValue.id, value.id));
        valueIds.push(value.id);
      } else {
        const [created] = await tx
          .insert(optionValue)
          .values({ groupId, ...fields })
          .returning({ id: optionValue.id });
        if (!created) throw new Error('Option value was not created');
        valueIds.push(created.id);
      }
    }
    await logActivity(tx, activity(actor, productId));
    return ok({ id: groupId, valueIds });
  });
}

/** Removes a group and its values (carts holding them are flagged "choose again"); needs `confirm: true`. */
export async function deleteOptionGroup(
  actor: Actor,
  productId: string,
  groupId: string,
  options: { confirm: true },
): Promise<ActionResult> {
  if (!(options.confirm as boolean)) return formFailure('admin.confirm_required');
  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(optionGroup)
      .where(and(eq(optionGroup.id, groupId), eq(optionGroup.productId, productId)))
      .returning({ id: optionGroup.id });
    if (deleted.length === 0) return formFailure('admin.products.errors.option_group_invalid');
    const rest = await tx
      .select({ id: optionGroup.id })
      .from(optionGroup)
      .where(eq(optionGroup.productId, productId))
      .orderBy(asc(optionGroup.position));
    for (const [position, row] of rest.entries()) {
      await tx.update(optionGroup).set({ position }).where(eq(optionGroup.id, row.id));
    }
    await logActivity(tx, activity(actor, productId));
    return ok(undefined);
  });
}

/** Display order of a product's groups: the given ids must be exactly its groups. */
export async function reorderOptionGroups(
  actor: Actor,
  productId: string,
  groupIds: string[],
): Promise<ActionResult> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: optionGroup.id })
      .from(optionGroup)
      .where(eq(optionGroup.productId, productId));
    const wanted = new Set(groupIds);
    if (
      wanted.size !== groupIds.length ||
      groupIds.length !== rows.length ||
      !rows.every((row) => wanted.has(row.id))
    ) {
      return formFailure('admin.products.errors.option_group_invalid');
    }
    for (const [position, id] of groupIds.entries()) {
      await tx.update(optionGroup).set({ position }).where(eq(optionGroup.id, id));
    }
    await logActivity(tx, activity(actor, productId));
    return ok(undefined);
  });
}
