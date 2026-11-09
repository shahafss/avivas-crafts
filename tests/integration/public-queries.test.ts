import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { makeActor, makeTestStorage, photo, type TestStorage } from '../helpers/catalog';
import { runSeed } from '@/server/db/seed';
import type { Actor } from '@/server/catalog/result';
import { createCategory } from '@/server/catalog/categories';
import { addImage } from '@/server/catalog/images';
import { upsertOptionGroup } from '@/server/catalog/options';
import { createProduct, setProductState, updateProduct } from '@/server/catalog/products';
import {
  getPublishedProductBySlug,
  listCategoriesWithProducts,
  listNewestProducts,
  listPublishedProducts,
  listRelatedProducts,
} from '@/server/catalog/public-queries';

let testDb: TestDbHandle;
let files: TestStorage;
let actor: Actor;

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));
vi.mock('@/server/storage', () => ({ getStorage: () => files.storage }));

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

async function make(nameHe: string, price: number, categoryId: string, publish = true) {
  const created = await createProduct(actor, { nameHe, nameEn: nameHe === 'א' ? 'A' : null });
  if (!created.ok) throw new Error('create');
  await updateProduct(actor, created.data.id, {
    descriptionHe: 'תיאור',
    priceIlsMinor: price,
    categoryId,
    prepTimeHe: 'שבוע',
  });
  await addImage(actor, created.data.id, await photo(640, 480, 100));
  if (publish) await setProductState(actor, created.data.id, 'publish');
  return created.data;
}

describe('public catalog queries', () => {
  it('list only published products, sorted by base price with newest first on ties', async () => {
    const cat = await createCategory(actor, { nameHe: 'נרות' });
    if (!cat.ok) throw new Error('cat');
    const a = await make('א', 5000, cat.data.id);
    const b = await make('ב', 3000, cat.data.id);
    const c = await make('ג', 5000, cat.data.id);
    await make('טיוטה', 1000, cat.data.id, false);

    const names = async (sort: 'newest' | 'price-asc' | 'price-desc') =>
      (await listPublishedProducts({ sort })).map((card) => card.id);
    expect(await names('newest')).toEqual([c.id, b.id, a.id]);
    expect(await names('price-asc')).toEqual([b.id, c.id, a.id]);
    expect(await names('price-desc')).toEqual([c.id, a.id, b.id]);
    const [first] = await listPublishedProducts({ sort: 'newest' });
    expect(first?.image?.url800).toMatch(/\.webp$/);
    expect((await listNewestProducts(2)).length).toBe(2);
    expect((await listRelatedProducts(cat.data.id, a.id, 4)).map((x) => x.id)).toEqual([
      c.id,
      b.id,
    ]);
    expect((await listCategoriesWithProducts()).map((x) => x.id)).toEqual([cat.data.id]);
  });

  it('returns null for draft and hidden products, and a from price for varying options', async () => {
    const cat = await createCategory(actor, { nameHe: 'נרות' });
    if (!cat.ok) throw new Error('cat');
    const draft = await make('טיוטה', 4000, cat.data.id, false);
    expect(await getPublishedProductBySlug(draft.slug)).toBeNull();

    const live = await make('חי', 4000, cat.data.id);
    await upsertOptionGroup(actor, live.id, {
      nameHe: 'צבע',
      values: [
        { labelHe: 'חום', deltaIlsMinor: 0, swatch: 'brown' },
        { labelHe: 'בלונד', deltaIlsMinor: 2000 },
      ],
    });
    const detail = await getPublishedProductBySlug(live.slug);
    expect(detail?.priceVaries).toBe(true);
    expect(detail?.fromPriceMinor).toBe(4000);
    expect(detail?.groups[0]?.values.map((v) => v.swatch)).toEqual(['brown', null]);
    const [card] = await listPublishedProducts();
    expect(card?.priceVaries).toBe(true);

    await setProductState(actor, live.id, 'hide');
    expect(await getPublishedProductBySlug(live.slug)).toBeNull();
  });
});
