'use server';

import { redirect } from 'next/navigation';
import { NEW_PRODUCT_NAME_HE } from '@/lib/validation/product';
import { requireAdmin } from '@/server/auth/require-admin';
import { createProduct as createProductRecord } from '@/server/catalog/products';
import { actorOf } from '@/server/catalog/result';

/**
 * "New product": creates a draft with a placeholder Hebrew name (the name column is required)
 * and opens the editor. Used as a form action, so it also works before the page has hydrated.
 */
export async function createProduct(): Promise<void> {
  const context = await requireAdmin();
  const result = await createProductRecord(actorOf(context), { nameHe: NEW_PRODUCT_NAME_HE });
  if (!result.ok) throw new Error('Product was not created');
  redirect(`/admin/products/${result.data.id}`);
}
