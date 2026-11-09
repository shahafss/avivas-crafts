'use server';

import { z } from 'zod';
import {
  optionGroupSchema,
  type OptionGroupInput,
  type ProductUpdate,
} from '@/lib/validation/product';
import { requireAdmin } from '@/server/auth/require-admin';
import {
  reorderImages as reorderImagesRecord,
  removeImage as removeImageRecord,
  setImageAlt as setImageAltRecord,
  setMainImage as setMainImageRecord,
} from '@/server/catalog/images';
import {
  deleteOptionGroup as deleteOptionGroupRecord,
  upsertOptionGroup as upsertOptionGroupRecord,
} from '@/server/catalog/options';
import {
  deleteProduct as deleteProductRecord,
  setProductOrderable as setProductOrderableRecord,
  setProductState as setProductStateRecord,
  updateProduct as updateProductRecord,
} from '@/server/catalog/products';
import { actorOf, formFailure, type ActionResult } from '@/server/catalog/result';

const idSchema = z.uuid();
const stateSchema = z.enum(['publish', 'hide', 'unhide', 'draft']);
const altSchema = z.object({
  altHe: z.string().max(200).nullish(),
  altEn: z.string().max(200).nullish(),
});
const deleteProductSchema = z.object({ id: z.uuid(), confirm: z.literal(true) });
const deleteGroupSchema = z.object({
  productId: z.uuid(),
  groupId: z.uuid(),
  confirm: z.literal(true),
});

const NOT_FOUND = 'admin.products.errors.not_found';
const INVALID = 'admin.products.errors.invalid';

export async function updateProduct(
  productId: string,
  input: ProductUpdate,
): Promise<ActionResult> {
  const context = await requireAdmin();
  const id = idSchema.safeParse(productId);
  if (!id.success) return formFailure(NOT_FOUND);
  return updateProductRecord(actorOf(context), id.data, input);
}

export async function setProductState(productId: string, action: string): Promise<ActionResult> {
  const context = await requireAdmin();
  const id = idSchema.safeParse(productId);
  const state = stateSchema.safeParse(action);
  if (!id.success) return formFailure(NOT_FOUND);
  if (!state.success) return formFailure(INVALID);
  return setProductStateRecord(actorOf(context), id.data, state.data);
}

export async function setProductOrderable(
  productId: string,
  orderable: boolean,
): Promise<ActionResult> {
  const context = await requireAdmin();
  const id = idSchema.safeParse(productId);
  if (!id.success || typeof orderable !== 'boolean') return formFailure(NOT_FOUND);
  return setProductOrderableRecord(actorOf(context), id.data, orderable);
}

export async function deleteProduct(input: {
  id: string;
  confirm: boolean;
}): Promise<ActionResult> {
  const context = await requireAdmin();
  const parsed = deleteProductSchema.safeParse(input);
  if (!parsed.success) return formFailure('admin.confirm_required');
  return deleteProductRecord(actorOf(context), parsed.data.id, { confirm: true });
}

export async function reorderImages(productId: string, imageIds: string[]): Promise<ActionResult> {
  const context = await requireAdmin();
  const id = idSchema.safeParse(productId);
  const ids = z.array(z.uuid()).max(12).safeParse(imageIds);
  if (!id.success) return formFailure(NOT_FOUND);
  if (!ids.success) return formFailure('admin.products.errors.bad_image_order');
  return reorderImagesRecord(actorOf(context), id.data, ids.data);
}

export async function setMainImage(productId: string, imageId: string): Promise<ActionResult> {
  const context = await requireAdmin();
  const id = idSchema.safeParse(productId);
  const image = idSchema.safeParse(imageId);
  if (!id.success) return formFailure(NOT_FOUND);
  if (!image.success) return formFailure('admin.products.errors.image_not_found');
  return setMainImageRecord(actorOf(context), id.data, image.data);
}

export async function removeImage(productId: string, imageId: string): Promise<ActionResult> {
  const context = await requireAdmin();
  const id = idSchema.safeParse(productId);
  const image = idSchema.safeParse(imageId);
  if (!id.success) return formFailure(NOT_FOUND);
  if (!image.success) return formFailure('admin.products.errors.image_not_found');
  return removeImageRecord(actorOf(context), id.data, image.data);
}

export async function setImageAlt(
  productId: string,
  imageId: string,
  alt: { altHe?: string | null; altEn?: string | null },
): Promise<ActionResult> {
  const context = await requireAdmin();
  const id = idSchema.safeParse(productId);
  const image = idSchema.safeParse(imageId);
  const parsed = altSchema.safeParse(alt);
  if (!id.success) return formFailure(NOT_FOUND);
  if (!image.success) return formFailure('admin.products.errors.image_not_found');
  if (!parsed.success) return formFailure(INVALID);
  return setImageAltRecord(actorOf(context), id.data, image.data, parsed.data);
}

export async function upsertOptionGroup(
  productId: string,
  group: OptionGroupInput,
): Promise<ActionResult<{ id: string; valueIds: string[] }>> {
  const context = await requireAdmin();
  const id = idSchema.safeParse(productId);
  if (!id.success) return formFailure(NOT_FOUND);
  // The record validates again; this keeps a malformed payload from reaching it at all.
  if (!optionGroupSchema.safeParse(group).success) return formFailure(INVALID);
  return upsertOptionGroupRecord(actorOf(context), id.data, group);
}

export async function deleteOptionGroup(input: {
  productId: string;
  groupId: string;
  confirm: boolean;
}): Promise<ActionResult> {
  const context = await requireAdmin();
  const parsed = deleteGroupSchema.safeParse(input);
  if (!parsed.success) return formFailure('admin.confirm_required');
  return deleteOptionGroupRecord(actorOf(context), parsed.data.productId, parsed.data.groupId, {
    confirm: true,
  });
}
