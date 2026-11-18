import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { makeActor, makeTestStorage, photo, type TestStorage } from '../helpers/catalog';
import {
  adminActivity,
  category,
  optionGroup,
  optionValue,
  orderLine,
  orders,
  product,
  productCategory,
  productImage,
  shippingZone,
} from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import type { Actor } from '@/server/catalog/result';
import {
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  updateCategory,
} from '@/server/catalog/categories';
import { addImage } from '@/server/catalog/images';
import { listOptionGroups, upsertOptionGroup } from '@/server/catalog/options';
import { NEW_PRODUCT_NAME_HE } from '@/lib/validation/product';
import { getEditorData, listAdminProducts } from '@/server/catalog/admin-queries';
import {
  createProduct,
  deleteProduct,
  setProductOrderable,
  setProductState,
  updateProduct,
} from '@/server/catalog/products';

let testDb: TestDbHandle;
let files: TestStorage;
let actor: Actor;

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));
vi.mock('@/server/storage', () => ({
  getStorage: () => files.storage,
}));

beforeAll(async () => {
  testDb = await createTestDb();
  files = await makeTestStorage();
});
beforeEach(async () => {
  await testDb.reset();
  await runSeed(testDb.db, { samples: false });
  actor = await makeActor(testDb.db);
});
afterAll(async () => {
  await testDb.close();
  await files.cleanup();
});

async function ok<T>(promise: Promise<{ ok: true; data: T } | { ok: false }>): Promise<T> {
  const result = await promise;
  if (!result.ok) throw new Error(`Expected ok, got ${JSON.stringify(result)}`);
  return result.data;
}

async function makeCategory(nameHe = 'נרות', nameEn?: string): Promise<string> {
  const data = await ok(createCategory(actor, { nameHe, ...(nameEn ? { nameEn } : {}) }));
  return data.id;
}

/** A product that satisfies every publish rule. */
async function completeProduct(extra: { priceUsdMinor?: number } = {}): Promise<string> {
  const categoryId = await makeCategory();
  const { id } = await ok(createProduct(actor, { nameHe: 'בובה' }));
  await ok(
    updateProduct(actor, id, {
      descriptionHe: 'בובה בעבודת יד',
      priceIlsMinor: 12000,
      categoryIds: [categoryId],
      prepTimeHe: 'כשבועיים',
      ...extra,
    }),
  );
  const added = await addImage(actor, id, await photo());
  expect(added.ok).toBe(true);
  return id;
}

async function getProduct(id: string) {
  const [row] = await testDb.db.select().from(product).where(eq(product.id, id));
  if (!row) throw new Error('missing product');
  return row;
}

async function linkedCategoryIds(productId: string): Promise<string[]> {
  const rows = await testDb.db
    .select({ id: productCategory.categoryId })
    .from(productCategory)
    .where(eq(productCategory.productId, productId));
  return rows.map((row) => row.id).sort();
}

async function activity(action: string) {
  return testDb.db.select().from(adminActivity).where(eq(adminActivity.action, action));
}

describe('createProduct', () => {
  it('makes a draft with only name_he, and a random slug without English text', async () => {
    const { id, slug } = await ok(createProduct(actor, { nameHe: 'בובת בד' }));
    const row = await getProduct(id);
    expect(row).toMatchObject({
      nameHe: 'בובת בד',
      nameEn: null,
      state: 'draft',
      orderable: true,
      publishedAt: null,
      priceIlsMinor: null,
    });
    expect(await linkedCategoryIds(id)).toEqual([]);
    expect(slug).toMatch(/^p-[a-z2-7]{8}$/);
    expect(row.slug).toBe(slug);
    expect(await activity('product.created')).toHaveLength(1);
  });

  it('slugifies the English name and suffixes duplicates -2, -3', async () => {
    const first = await ok(createProduct(actor, { nameHe: 'א', nameEn: 'Rag Doll!' }));
    const second = await ok(createProduct(actor, { nameHe: 'ב', nameEn: 'Rag Doll' }));
    const third = await ok(createProduct(actor, { nameHe: 'ג', nameEn: 'rag doll' }));
    expect([first.slug, second.slug, third.slug]).toEqual(['rag-doll', 'rag-doll-2', 'rag-doll-3']);
  });

  it('rejects an empty or over-long Hebrew name', async () => {
    expect((await createProduct(actor, { nameHe: '   ' })).ok).toBe(false);
    expect((await createProduct(actor, { nameHe: 'א'.repeat(121) })).ok).toBe(false);
    expect((await createProduct(actor, { nameHe: 'א'.repeat(120) })).ok).toBe(true);
  });
});

describe('new-product placeholder name', () => {
  it('blocks publishing while the name is still "מוצר חדש", listing the name as missing', async () => {
    const id = await completeProduct();
    await ok(updateProduct(actor, id, { nameHe: NEW_PRODUCT_NAME_HE }));
    const refused = await setProductState(actor, id, 'publish');
    expect(refused).toMatchObject({ ok: false, missingFields: ['nameHe'] });
    expect((await getProduct(id)).state).toBe('draft');
    await ok(updateProduct(actor, id, { nameHe: 'בובה אדומה' }));
    expect((await setProductState(actor, id, 'publish')).ok).toBe(true);
  });
});

describe('updateProduct', () => {
  it('keeps the slug editable while draft and frozen after the first publish', async () => {
    const id = await completeProduct();
    expect((await updateProduct(actor, id, { slug: 'my-doll' })).ok).toBe(true);
    expect((await getProduct(id)).slug).toBe('my-doll');
    expect((await updateProduct(actor, id, { slug: 'Bad Slug' })).ok).toBe(false);
    await ok(setProductState(actor, id, 'publish'));
    const frozen = await updateProduct(actor, id, { slug: 'other-slug' });
    expect(frozen).toMatchObject({
      ok: false,
      fieldErrors: { slug: 'admin.products.errors.slug_frozen' },
    });
    await ok(setProductState(actor, id, 'draft'));
    expect((await updateProduct(actor, id, { slug: 'other-slug' })).ok).toBe(false);
  });

  it('rejects a slug that another product uses', async () => {
    const { id } = await ok(createProduct(actor, { nameHe: 'א', nameEn: 'Taken' }));
    const other = await ok(createProduct(actor, { nameHe: 'ב' }));
    const result = await updateProduct(actor, other.id, { slug: 'taken' });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { slug: 'admin.products.errors.slug_taken' },
    });
    expect((await getProduct(id)).slug).toBe('taken');
  });

  it('refuses edits that would break a published product', async () => {
    const id = await completeProduct();
    await ok(setProductState(actor, id, 'publish'));
    const result = await updateProduct(actor, id, { prepTimeHe: '' });
    expect(result).toMatchObject({ ok: false, missingFields: ['prepTimeHe'] });
    expect((await getProduct(id)).prepTimeHe).toBe('כשבועיים');
  });

  it('validates lengths and prices', async () => {
    const { id } = await ok(createProduct(actor, { nameHe: 'א' }));
    expect((await updateProduct(actor, id, { descriptionHe: 'ש'.repeat(5001) })).ok).toBe(false);
    expect((await updateProduct(actor, id, { priceIlsMinor: 0 })).ok).toBe(false);
    expect((await updateProduct(actor, id, { priceIlsMinor: 12.5 })).ok).toBe(false);
    expect((await updateProduct(actor, id, { priceIlsMinor: 12050 })).ok).toBe(true);
  });

  it('a price change writes product.price_changed with old and new price and leaves order lines alone', async () => {
    const id = await completeProduct();
    await ok(setProductState(actor, id, 'publish'));
    const [zone] = await testDb.db.select().from(shippingZone);
    const [order] = await testDb.db
      .insert(orders)
      .values({
        publicTokenHash: Buffer.from('a'.repeat(32)),
        publicTokenExpiresAt: new Date(Date.now() + 86_400_000),
        locale: 'he',
        zoneId: zone?.id ?? '',
        currency: 'ILS',
        customerName: 'Dana',
        customerPhone: '+972501234567',
        customerEmail: 'dana@example.test',
        deliveryMethod: 'pickup',
        paymentMethod: 'offline',
        subtotalMinor: 12000,
        totalMinor: 12000,
        termsAcceptedAt: new Date(),
        termsVersion: 1,
        privacyVersion: 1,
      })
      .returning({ id: orders.id });
    await testDb.db.insert(orderLine).values({
      orderId: order?.id ?? '',
      productId: id,
      productNameHe: 'בובה',
      unitPriceMinor: 12000,
      quantity: 1,
      lineTotalMinor: 12000,
    });

    await ok(updateProduct(actor, id, { priceIlsMinor: 15000 }));

    // Setting the first price (null -> 12000) was logged too; this is the second row.
    const rows = await activity('product.price_changed');
    expect(rows).toHaveLength(2);
    const row = rows.find((r) => (r.details as { newPriceMinor?: number }).newPriceMinor === 15000);
    expect(row?.details).toMatchObject({
      oldPriceMinor: 12000,
      newPriceMinor: 15000,
      currency: 'ILS',
    });
    expect(row?.targetId).toBe(id);
    expect(
      rows.find((r) => (r.details as { oldPriceMinor?: number | null }).oldPriceMinor === null),
    ).toBeDefined();
    const [line] = await testDb.db.select().from(orderLine);
    expect(line?.unitPriceMinor).toBe(12000);
    expect((await getProduct(id)).priceIlsMinor).toBe(15000);
  });

  it('writes product.updated for other changes and nothing when nothing changed', async () => {
    const { id } = await ok(createProduct(actor, { nameHe: 'א' }));
    await ok(updateProduct(actor, id, { nameHe: 'ב' }));
    expect(await activity('product.updated')).toHaveLength(1);
    await ok(updateProduct(actor, id, { nameHe: 'ב' }));
    expect(await activity('product.updated')).toHaveLength(1);
    expect(await activity('product.price_changed')).toHaveLength(0);
  });

  it('refuses a price that makes an option adjustment non-positive', async () => {
    const id = await completeProduct();
    await ok(
      upsertOptionGroup(actor, id, {
        nameHe: 'צבע',
        values: [
          { labelHe: 'חום', deltaIlsMinor: 0 },
          { labelHe: 'בהיר', deltaIlsMinor: -5000 },
        ],
      }),
    );
    const result = await updateProduct(actor, id, { priceIlsMinor: 4000 });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { priceIlsMinor: 'admin.products.errors.option_ils_not_positive' },
    });
  });
});

describe('setProductState', () => {
  it('publish lists every missing field', async () => {
    const { id } = await ok(createProduct(actor, { nameHe: 'א' }));
    const result = await setProductState(actor, id, 'publish');
    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error('unreachable');
    expect(result.missingFields).toEqual([
      'descriptionHe',
      'priceIlsMinor',
      'categoryId',
      'prepTimeHe',
      'images',
    ]);
    expect(Object.keys(result.fieldErrors ?? {}).sort()).toEqual(
      [...(result.missingFields ?? [])].sort(),
    );
    expect((await getProduct(id)).state).toBe('draft');
  });

  it('publish also names option groups with fewer than 2 values and, with a USD zone enabled, the USD price', async () => {
    const id = await completeProduct();
    await ok(
      upsertOptionGroup(actor, id, {
        nameHe: 'צבע',
        values: [{ labelHe: 'חום', deltaIlsMinor: 0 }],
      }),
    );
    await testDb.db.insert(shippingZone).values({
      code: 'WORLD',
      nameHe: 'העולם',
      currency: 'USD',
      enabled: true,
      shippingEnabled: true,
    });
    const result = await setProductState(actor, id, 'publish');
    if (result.ok) throw new Error('expected a failure');
    expect(result.missingFields).toEqual(['priceUsdMinor', 'optionGroups']);
  });

  it('publishes a complete product, sets published_at once and follows the transitions', async () => {
    const id = await completeProduct();
    expect((await getProduct(id)).publishedAt).toBeNull();
    await ok(setProductState(actor, id, 'publish'));
    const first = (await getProduct(id)).publishedAt;
    expect(first).toBeInstanceOf(Date);
    expect((await getProduct(id)).state).toBe('published');

    await ok(setProductState(actor, id, 'hide'));
    expect((await getProduct(id)).state).toBe('hidden');
    await ok(setProductState(actor, id, 'unhide'));
    expect((await getProduct(id)).state).toBe('published');
    await ok(setProductState(actor, id, 'draft'));
    expect((await getProduct(id)).state).toBe('draft');
    await ok(setProductState(actor, id, 'publish'));
    expect((await getProduct(id)).publishedAt?.getTime()).toBe(first?.getTime());

    await ok(setProductState(actor, id, 'hide'));
    await ok(setProductState(actor, id, 'draft'));
    expect((await getProduct(id)).state).toBe('draft');
    expect((await getProduct(id)).publishedAt?.getTime()).toBe(first?.getTime());
  });

  it('refuses transitions that data-model.md does not allow', async () => {
    const id = await completeProduct();
    expect(await setProductState(actor, id, 'hide')).toMatchObject({ ok: false });
    expect(await setProductState(actor, id, 'unhide')).toMatchObject({ ok: false });
    await ok(setProductState(actor, id, 'publish'));
    expect(await setProductState(actor, id, 'publish')).toMatchObject({ ok: false });
    expect(await setProductState(actor, id, 'unhide')).toMatchObject({ ok: false });
  });

  it('derives the slug from the English name on the first publish when it is still random', async () => {
    const id = await completeProduct();
    await ok(updateProduct(actor, id, { nameEn: 'Blue Doll' }));
    expect((await getProduct(id)).slug).toBe('blue-doll');
    await ok(setProductState(actor, id, 'publish'));
    expect((await getProduct(id)).slug).toBe('blue-doll');
  });

  it('orderable=false keeps the product public', async () => {
    const id = await completeProduct();
    await ok(setProductState(actor, id, 'publish'));
    await ok(setProductOrderable(actor, id, false));
    const row = await getProduct(id);
    expect(row).toMatchObject({ state: 'published', orderable: false });
    await ok(setProductOrderable(actor, id, true));
    expect((await getProduct(id)).orderable).toBe(true);
  });

  it('writes product.updated with the new state', async () => {
    const id = await completeProduct();
    await ok(setProductState(actor, id, 'publish'));
    const rows = await activity('product.updated');
    expect(rows.some((row) => (row.details as { state?: string }).state === 'published')).toBe(
      true,
    );
  });
});

describe('deleteProduct', () => {
  it('needs confirm: true', async () => {
    const id = await completeProduct();
    expect(await deleteProduct(actor, id, { confirm: false as never })).toMatchObject({
      ok: false,
    });
    expect(await testDb.db.select().from(product)).toHaveLength(1);
  });

  it('removes the product and keeps order lines (name, options, price, image_key) with product_id null', async () => {
    const id = await completeProduct();
    const [zone] = await testDb.db.select().from(shippingZone);
    const [order] = await testDb.db
      .insert(orders)
      .values({
        publicTokenHash: Buffer.from('b'.repeat(32)),
        publicTokenExpiresAt: new Date(Date.now() + 86_400_000),
        locale: 'he',
        zoneId: zone?.id ?? '',
        currency: 'ILS',
        customerName: 'Dana',
        customerPhone: '+972501234567',
        customerEmail: 'dana@example.test',
        deliveryMethod: 'pickup',
        paymentMethod: 'offline',
        subtotalMinor: 12000,
        totalMinor: 12000,
        termsAcceptedAt: new Date(),
        termsVersion: 1,
        privacyVersion: 1,
      })
      .returning({ id: orders.id });
    await testDb.db.insert(orderLine).values({
      orderId: order?.id ?? '',
      productId: id,
      productNameHe: 'בובה',
      imageKey: 'orders/abc',
      options: [{ group: 'צבע', value: 'חום' }],
      unitPriceMinor: 12000,
      quantity: 1,
      lineTotalMinor: 12000,
    });

    await ok(deleteProduct(actor, id, { confirm: true }));

    expect(await testDb.db.select().from(product)).toHaveLength(0);
    expect(await testDb.db.select().from(productImage)).toHaveLength(0);
    const [line] = await testDb.db.select().from(orderLine);
    expect(line).toMatchObject({
      productId: null,
      productNameHe: 'בובה',
      imageKey: 'orders/abc',
      options: [{ group: 'צבע', value: 'חום' }],
      unitPriceMinor: 12000,
    });
    expect(await activity('product.deleted')).toHaveLength(1);
  });

  it('answers not found for an unknown product', async () => {
    expect(
      await deleteProduct(actor, '00000000-0000-4000-8000-000000000000', { confirm: true }),
    ).toMatchObject({ ok: false });
  });
});

describe('option groups', () => {
  async function priced(priceUsdMinor?: number): Promise<string> {
    const { id } = await ok(createProduct(actor, { nameHe: 'בובה' }));
    await ok(
      updateProduct(actor, id, {
        priceIlsMinor: 10000,
        ...(priceUsdMinor ? { priceUsdMinor } : {}),
      }),
    );
    return id;
  }

  it('saves a group with values in order and returns their ids', async () => {
    const id = await priced();
    const saved = await ok(
      upsertOptionGroup(actor, id, {
        nameHe: 'צבע שיער',
        nameEn: 'Hair colour',
        values: [
          { labelHe: 'חום', deltaIlsMinor: 0, swatch: 'brown' },
          { labelHe: 'בלונד', deltaIlsMinor: 2000 },
        ],
      }),
    );
    expect(saved.valueIds).toHaveLength(2);
    const groups = await listOptionGroups(id);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.values.map((v) => [v.labelHe, v.deltaIlsMinor, v.swatch])).toEqual([
      ['חום', 0, 'brown'],
      ['בלונד', 2000, null],
    ]);
  });

  it('rejects base + delta <= 0', async () => {
    const id = await priced();
    const result = await upsertOptionGroup(actor, id, {
      nameHe: 'צבע',
      values: [
        { labelHe: 'א', deltaIlsMinor: 0 },
        { labelHe: 'ב', deltaIlsMinor: -10000 },
      ],
    });
    expect(result).toMatchObject({ ok: false });
    expect(await testDb.db.select().from(optionGroup)).toHaveLength(0);
    expect(
      (
        await upsertOptionGroup(actor, id, {
          nameHe: 'צבע',
          values: [
            { labelHe: 'א', deltaIlsMinor: 0 },
            { labelHe: 'ב', deltaIlsMinor: -9999 },
          ],
        })
      ).ok,
    ).toBe(true);
  });

  it('rejects a non-zero ILS delta without a USD delta when the product has a USD price', async () => {
    const id = await priced(3000);
    const missing = await upsertOptionGroup(actor, id, {
      nameHe: 'צבע',
      values: [
        { labelHe: 'א', deltaIlsMinor: 0 },
        { labelHe: 'ב', deltaIlsMinor: 2000 },
      ],
    });
    expect(missing).toMatchObject({ ok: false });
    const fine = await upsertOptionGroup(actor, id, {
      nameHe: 'צבע',
      values: [
        { labelHe: 'א', deltaIlsMinor: 0 },
        { labelHe: 'ב', deltaIlsMinor: 2000, deltaUsdMinor: 600 },
      ],
    });
    expect(fine.ok).toBe(true);
  });

  it('accepts only palette swatches and null', async () => {
    const id = await priced();
    const bad = await upsertOptionGroup(actor, id, {
      nameHe: 'צבע',
      values: [
        { labelHe: 'א', deltaIlsMinor: 0, swatch: 'purple' as never },
        { labelHe: 'ב', deltaIlsMinor: 0, swatch: null },
      ],
    });
    expect(bad).toMatchObject({ ok: false });
    const palette = [
      'white',
      'cream',
      'beige',
      'brown',
      'grey',
      'black',
      'red',
      'pink',
      'orange',
      'yellow',
      'green',
      'blue',
    ] as const;
    for (const swatch of palette) {
      expect(
        (
          await upsertOptionGroup(actor, id, {
            nameHe: `צבע ${swatch}`,
            values: [
              { labelHe: 'א', deltaIlsMinor: 0, swatch },
              { labelHe: 'ב', deltaIlsMinor: 0, swatch: null },
            ],
          })
        ).ok,
      ).toBe(true);
    }
  });

  it('editing a value keeps its id, leaving a value out deletes it, new values are inserted', async () => {
    const id = await priced();
    const first = await ok(
      upsertOptionGroup(actor, id, {
        nameHe: 'צבע',
        values: [
          { labelHe: 'חום', deltaIlsMinor: 0 },
          { labelHe: 'בלונד', deltaIlsMinor: 2000 },
          { labelHe: 'שחור', deltaIlsMinor: 0 },
        ],
      }),
    );
    const [brown, blond, black] = first.valueIds as [string, string, string];

    const second = await ok(
      upsertOptionGroup(actor, id, {
        id: first.id,
        nameHe: 'צבע שיער',
        values: [
          { id: blond, labelHe: 'בלונד', deltaIlsMinor: 2500 },
          { id: brown, labelHe: 'חום', deltaIlsMinor: 0 },
          { labelHe: 'אדום', deltaIlsMinor: 500 },
        ],
      }),
    );
    expect(second.id).toBe(first.id);
    expect(second.valueIds.slice(0, 2)).toEqual([blond, brown]);

    const values = await testDb.db.select().from(optionValue).orderBy(asc(optionValue.position));
    expect(values.map((v) => v.labelHe)).toEqual(['בלונד', 'חום', 'אדום']);
    expect(values.find((v) => v.id === blond)?.deltaIlsMinor).toBe(2500);
    expect(values.some((v) => v.id === black)).toBe(false);
    const [group] = await testDb.db.select().from(optionGroup);
    expect(group?.nameHe).toBe('צבע שיער');
  });

  it('rejects value ids and group ids from another group or product', async () => {
    const a = await priced();
    const b = await priced();
    const groupA = await ok(
      upsertOptionGroup(actor, a, {
        nameHe: 'צבע',
        values: [
          { labelHe: 'א', deltaIlsMinor: 0 },
          { labelHe: 'ב', deltaIlsMinor: 0 },
        ],
      }),
    );
    const groupB = await ok(
      upsertOptionGroup(actor, b, {
        nameHe: 'גודל',
        values: [
          { labelHe: 'קטן', deltaIlsMinor: 0 },
          { labelHe: 'גדול', deltaIlsMinor: 0 },
        ],
      }),
    );
    const foreignValue = await upsertOptionGroup(actor, a, {
      id: groupA.id,
      nameHe: 'צבע',
      values: [
        { id: groupB.valueIds[0], labelHe: 'א', deltaIlsMinor: 0 },
        { labelHe: 'ב', deltaIlsMinor: 0 },
      ],
    });
    expect(foreignValue).toMatchObject({ ok: false });
    const foreignGroup = await upsertOptionGroup(actor, a, {
      id: groupB.id,
      nameHe: 'גודל',
      values: [
        { labelHe: 'קטן', deltaIlsMinor: 0 },
        { labelHe: 'גדול', deltaIlsMinor: 0 },
      ],
    });
    expect(foreignGroup).toMatchObject({ ok: false });
    // The other product's group is untouched.
    const values = await testDb.db.select().from(optionValue);
    expect(values).toHaveLength(4);
  });

  it('refuses to save a published product group with fewer than 2 values', async () => {
    const id = await completeProduct();
    const group = await ok(
      upsertOptionGroup(actor, id, {
        nameHe: 'צבע',
        values: [
          { labelHe: 'א', deltaIlsMinor: 0 },
          { labelHe: 'ב', deltaIlsMinor: 0 },
        ],
      }),
    );
    await ok(setProductState(actor, id, 'publish'));
    const refused = await upsertOptionGroup(actor, id, {
      id: group.id,
      nameHe: 'צבע',
      values: [{ id: group.valueIds[0], labelHe: 'א', deltaIlsMinor: 0 }],
    });
    expect(refused).toMatchObject({ ok: false });
    expect(await testDb.db.select().from(optionValue)).toHaveLength(2);
  });

  it('validates name and label lengths', async () => {
    const id = await priced();
    expect(
      (
        await upsertOptionGroup(actor, id, {
          nameHe: 'א'.repeat(61),
          values: [{ labelHe: 'א', deltaIlsMinor: 0 }],
        })
      ).ok,
    ).toBe(false);
    expect(
      (
        await upsertOptionGroup(actor, id, {
          nameHe: 'צבע',
          values: [{ labelHe: '', deltaIlsMinor: 0 }],
        })
      ).ok,
    ).toBe(false);
  });
});

describe('categories', () => {
  // The seed's "Featured" category is not part of what these tests count.
  beforeEach(async () => {
    await testDb.db.delete(category).where(eq(category.slug, 'featured'));
  });

  it('creates categories with generated slugs and sequential sort_order', async () => {
    const a = await ok(createCategory(actor, { nameHe: 'נרות', nameEn: 'Candles' }));
    const b = await ok(createCategory(actor, { nameHe: 'קרמיקה' }));
    expect(a.slug).toBe('candles');
    expect(b.slug).toMatch(/^c-[a-z2-7]{8}$/);
    const list = await listCategories();
    expect(list.map((c) => [c.nameHe, c.sortOrder])).toEqual([
      ['נרות', 0],
      ['קרמיקה', 1],
    ]);
    expect(await activity('category.created')).toHaveLength(2);
  });

  it('refuses to delete a category that has products and reports the count', async () => {
    const id = await makeCategory();
    for (const name of ['א', 'ב']) {
      const created = await ok(createProduct(actor, { nameHe: name }));
      await ok(updateProduct(actor, created.id, { categoryIds: [id] }));
    }
    const result = await deleteCategory(actor, id, { confirm: true });
    expect(result).toMatchObject({ ok: false, count: 2 });
    expect(await testDb.db.select().from(category)).toHaveLength(1);
  });

  it('re-sequences sort_order on reorder (one transaction, deferrable unique) and on delete', async () => {
    const ids: string[] = [];
    for (const name of ['א', 'ב', 'ג', 'ד']) ids.push(await makeCategory(name));
    const [a, b, c, d] = ids as [string, string, string, string];

    await ok(reorderCategories(actor, [d, c, b, a]));
    expect((await listCategories()).map((row) => [row.nameHe, row.sortOrder])).toEqual([
      ['ד', 0],
      ['ג', 1],
      ['ב', 2],
      ['א', 3],
    ]);
    expect(await activity('category.reordered')).toHaveLength(1);

    // A partial or foreign list is refused and changes nothing.
    expect(await reorderCategories(actor, [a, b])).toMatchObject({ ok: false });
    expect((await listCategories()).map((row) => row.nameHe)).toEqual(['ד', 'ג', 'ב', 'א']);

    await ok(deleteCategory(actor, c, { confirm: true }));
    expect((await listCategories()).map((row) => [row.nameHe, row.sortOrder])).toEqual([
      ['ד', 0],
      ['ב', 1],
      ['א', 2],
    ]);
    expect(await activity('category.deleted')).toHaveLength(1);
  });

  it('needs confirm: true to delete', async () => {
    const id = await makeCategory();
    expect(await deleteCategory(actor, id, { confirm: false as never })).toMatchObject({
      ok: false,
    });
    expect(await listCategories()).toHaveLength(1);
  });

  it('keeps the products of other categories when a category is deleted', async () => {
    const keep = await makeCategory('א');
    const drop = await makeCategory('ב');
    const { id } = await ok(createProduct(actor, { nameHe: 'מוצר' }));
    await ok(updateProduct(actor, id, { categoryIds: [keep] }));
    await ok(deleteCategory(actor, drop, { confirm: true }));
    expect(await linkedCategoryIds(id)).toEqual([keep]);
  });
});

describe('category name length (007 FR-040)', () => {
  const TOO_LONG = 'admin.categories.errors.nameTooLong';
  const he13 = 'א'.repeat(13);
  const he12 = 'א'.repeat(12);
  const en13 = 'Candle Boxes!'; // 13 characters
  const en12 = 'Small hearts';

  it('createCategory refuses a 13-character Hebrew or English name with nameTooLong', async () => {
    expect(await createCategory(actor, { nameHe: he13 })).toMatchObject({
      ok: false,
      fieldErrors: { nameHe: TOO_LONG },
    });
    expect(await createCategory(actor, { nameHe: 'נרות', nameEn: en13 })).toMatchObject({
      ok: false,
      fieldErrors: { nameEn: TOO_LONG },
    });
  });

  it('both too long: both fields carry the error', async () => {
    const result = await createCategory(actor, { nameHe: he13, nameEn: en13 });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { nameHe: TOO_LONG, nameEn: TOO_LONG },
    });
  });

  it('accepts 12 characters, an English one with a trailing space too (trimmed first)', async () => {
    expect(await createCategory(actor, { nameHe: he12, nameEn: en12 })).toMatchObject({ ok: true });
    const trailing = await createCategory(actor, { nameHe: 'נרות', nameEn: `${en12} ` });
    expect(trailing).toMatchObject({ ok: true });
    const [stored] = await testDb.db
      .select({ nameEn: category.nameEn })
      .from(category)
      .where(eq(category.id, (trailing as { data: { id: string } }).data.id));
    expect(stored?.nameEn).toBe('Small hearts');
  });

  it('accepts a 12-character Hebrew name with a trailing space (trimmed first)', async () => {
    expect(await createCategory(actor, { nameHe: `${he12} ` })).toMatchObject({ ok: true });
  });

  it('an empty Hebrew name still gives invalid', async () => {
    expect(await createCategory(actor, { nameHe: '' })).toMatchObject({
      ok: false,
      fieldErrors: { nameHe: 'admin.categories.errors.invalid' },
    });
  });

  it('updateCategory applies the same rules', async () => {
    const id = await makeCategory('נרות');
    expect(await updateCategory(actor, id, { nameHe: he13 })).toMatchObject({
      ok: false,
      fieldErrors: { nameHe: TOO_LONG },
    });
    expect(await updateCategory(actor, id, { nameHe: 'נרות', nameEn: en13 })).toMatchObject({
      ok: false,
      fieldErrors: { nameEn: TOO_LONG },
    });
    expect(await updateCategory(actor, id, { nameHe: he13, nameEn: en13 })).toMatchObject({
      ok: false,
      fieldErrors: { nameHe: TOO_LONG, nameEn: TOO_LONG },
    });
    expect(await updateCategory(actor, id, { nameHe: he12, nameEn: `${en12} ` })).toMatchObject({
      ok: true,
    });
    expect(await updateCategory(actor, id, { nameHe: '' })).toMatchObject({
      ok: false,
      fieldErrors: { nameHe: 'admin.categories.errors.invalid' },
    });
  });
});

describe('several categories per piece (007 FR-031, FR-032)', () => {
  it('saves categoryIds with two ids, replaces them with one, and allows [] for a draft', async () => {
    const a = await makeCategory('א');
    const b = await makeCategory('ב');
    const { id } = await ok(createProduct(actor, { nameHe: 'בובה' }));
    await ok(updateProduct(actor, id, { categoryIds: [a, b] }));
    expect(await linkedCategoryIds(id)).toEqual([a, b].sort());
    await ok(updateProduct(actor, id, { categoryIds: [b] }));
    expect(await linkedCategoryIds(id)).toEqual([b]);
    await ok(updateProduct(actor, id, { categoryIds: [] }));
    expect(await linkedCategoryIds(id)).toEqual([]);
  });

  it('writes one product.updated row for a save that changes only the categories, and none when they are the same set', async () => {
    const a = await makeCategory('א');
    const b = await makeCategory('ב');
    const { id } = await ok(createProduct(actor, { nameHe: 'בובה' }));
    await ok(updateProduct(actor, id, { categoryIds: [a] }));
    expect(await activity('product.updated')).toHaveLength(1);
    await ok(updateProduct(actor, id, { categoryIds: [a, b] }));
    expect(await activity('product.updated')).toHaveLength(2);
    // The same set in another order is not a change.
    await ok(updateProduct(actor, id, { categoryIds: [b, a] }));
    expect(await activity('product.updated')).toHaveLength(2);
    expect(await linkedCategoryIds(id)).toEqual([a, b].sort());
  });

  it('collapses duplicate ids and refuses an unknown id without changing anything', async () => {
    const a = await makeCategory('א');
    const { id } = await ok(createProduct(actor, { nameHe: 'בובה' }));
    await ok(updateProduct(actor, id, { categoryIds: [a, a, a] }));
    expect(await linkedCategoryIds(id)).toEqual([a]);

    const unknown = '00000000-0000-4000-8000-0000000000aa';
    const result = await updateProduct(actor, id, { categoryIds: [a, unknown] });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { categoryIds: 'admin.products.errors.category_not_found' },
    });
    expect(await linkedCategoryIds(id)).toEqual([a]);
  });

  it('refuses unticking every category on a published piece, and publishing with none', async () => {
    const productId = await completeProduct();
    const [link] = await testDb.db
      .select({ id: productCategory.categoryId })
      .from(productCategory)
      .where(eq(productCategory.productId, productId));
    const kept = link?.id ?? '';
    await ok(setProductState(actor, productId, 'publish'));

    const refused = await updateProduct(actor, productId, { categoryIds: [] });
    expect(refused).toMatchObject({
      ok: false,
      formError: 'admin.products.errors.publish_incomplete',
      missingFields: ['categoryId'],
      fieldErrors: { categoryId: 'admin.products.missing.categoryId' },
    });
    expect(await linkedCategoryIds(productId)).toEqual([kept]);

    // Another category added and the first removed in one save is fine.
    const other = await makeCategory('אחרת');
    await ok(updateProduct(actor, productId, { categoryIds: [other] }));
    expect(await linkedCategoryIds(productId)).toEqual([other]);

    // Publishing with no category keeps the existing missing-category key.
    const draft = await completeProduct();
    await ok(updateProduct(actor, draft, { categoryIds: [] }));
    const publish = await setProductState(actor, draft, 'publish');
    expect(publish).toMatchObject({ ok: false, missingFields: ['categoryId'] });
  });

  it('the products list shows every category name in category order, and the filter finds the piece under each', async () => {
    const first = await makeCategory('ראשונה');
    const second = await makeCategory('שנייה');
    const { id } = await ok(createProduct(actor, { nameHe: 'בובה' }));
    await ok(updateProduct(actor, id, { categoryIds: [second, first] }));
    const [row] = await listAdminProducts();
    expect(row?.categoryNames).toEqual(['ראשונה', 'שנייה']);
    expect(await listAdminProducts({ categoryId: first })).toHaveLength(1);
    expect(await listAdminProducts({ categoryId: second })).toHaveLength(1);
    expect(await listAdminProducts()).toHaveLength(1);
    const data = await getEditorData(id);
    expect(data?.product.categoryIds.sort()).toEqual([first, second].sort());
  });

  it('counts pieces through the links and still blocks deleting a category that has linked pieces', async () => {
    const a = await makeCategory('א');
    const b = await makeCategory('ב');
    for (const name of ['x', 'y']) {
      const { id } = await ok(createProduct(actor, { nameHe: name }));
      await ok(updateProduct(actor, id, { categoryIds: [a, b] }));
    }
    const { id: lone } = await ok(createProduct(actor, { nameHe: 'z' }));
    await ok(updateProduct(actor, lone, { categoryIds: [a] }));
    const counts = Object.fromEntries(
      (await listCategories()).map((row) => [row.nameHe, row.productCount]),
    );
    expect(counts['א']).toBe(3);
    expect(counts['ב']).toBe(2);
    expect(await deleteCategory(actor, b, { confirm: true })).toMatchObject({
      ok: false,
      count: 2,
    });
  });
});

describe('listAdminProducts › missingEnglish', () => {
  async function flag(fields: {
    nameEn?: string | null;
    descriptionHe?: string | null;
    descriptionEn?: string | null;
  }): Promise<boolean> {
    const { id } = await ok(createProduct(actor, { nameHe: 'בובה' }));
    await testDb.db.update(product).set(fields).where(eq(product.id, id));
    const row = (await listAdminProducts()).find((item) => item.id === id);
    if (!row) throw new Error('missing row');
    return row.missingEnglish;
  }

  it('is true when the English name is empty or only spaces', async () => {
    expect(await flag({ nameEn: null })).toBe(true);
    expect(await flag({ nameEn: '   ' })).toBe(true);
  });

  it('is true when a Hebrew description has no English one (empty or only spaces)', async () => {
    expect(await flag({ nameEn: 'Doll', descriptionHe: 'תיאור', descriptionEn: null })).toBe(true);
    expect(await flag({ nameEn: 'Doll', descriptionHe: 'תיאור', descriptionEn: '  ' })).toBe(true);
  });

  it('is false when both English fields are filled', async () => {
    expect(await flag({ nameEn: 'Doll', descriptionHe: 'תיאור', descriptionEn: 'Text' })).toBe(
      false,
    );
  });

  it('is false when the name is filled and both descriptions are empty', async () => {
    expect(await flag({ nameEn: 'Doll', descriptionHe: null, descriptionEn: null })).toBe(false);
    expect(await flag({ nameEn: 'Doll', descriptionHe: '  ', descriptionEn: null })).toBe(false);
  });
});
