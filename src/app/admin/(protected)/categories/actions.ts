'use server';

import { z } from 'zod';
import { requireAdmin } from '@/server/auth/require-admin';
import {
  createCategory as createCategoryRecord,
  deleteCategory as deleteCategoryRecord,
  reorderCategories as reorderCategoriesRecord,
  updateCategory as updateCategoryRecord,
} from '@/server/catalog/categories';
import { actorOf, formFailure, type ActionResult } from '@/server/catalog/result';
import type { CategoryInput } from '@/lib/validation/category';

const idSchema = z.uuid();
const idsSchema = z.array(z.uuid()).max(500);
const deleteSchema = z.object({ id: z.uuid(), confirm: z.literal(true) });

const NOT_FOUND = 'admin.categories.errors.not_found';

export async function createCategory(
  input: CategoryInput,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const context = await requireAdmin();
  return createCategoryRecord(actorOf(context), input);
}

export async function updateCategory(
  id: string,
  input: CategoryInput,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const context = await requireAdmin();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return formFailure(NOT_FOUND);
  return updateCategoryRecord(actorOf(context), parsed.data, input);
}

export async function reorderCategories(ids: string[]): Promise<ActionResult> {
  const context = await requireAdmin();
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) return formFailure('admin.categories.errors.bad_order');
  return reorderCategoriesRecord(actorOf(context), parsed.data);
}

export async function deleteCategory(input: {
  id: string;
  confirm: boolean;
}): Promise<ActionResult> {
  const context = await requireAdmin();
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return formFailure('admin.confirm_required');
  return deleteCategoryRecord(actorOf(context), parsed.data.id, { confirm: true });
}
