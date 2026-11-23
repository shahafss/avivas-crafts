import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { makeActor, makeTestStorage, photo, type TestStorage } from '../helpers/catalog';
import { category, product, productCategory, shopSettings } from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import type { Actor } from '@/server/catalog/result';
import { createCategory } from '@/server/catalog/categories';
import { addImage } from '@/server/catalog/images';
import { upsertOptionGroup } from '@/server/catalog/options';
import {
  createProduct,
  setProductShowAsNew,
  setProductState,
  updateProduct,
} from '@/server/catalog/products';
import {
  getHomeRow,
  getPublishedProductBySlug,
  pickMainCategory,
  listCategoriesWithProducts,
  listSitemapEntries,
  listNewestProducts,
  listPublishedProducts,
  listAlsoLike,
  listAlsoLikeFor,
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

let productCounter = 0;

async function make(nameHe: string, price: number, categoryIds: string | string[], publish = true) {
  const created = await createProduct(actor, { nameHe, nameEn: nameHe === 'א' ? 'A' : null });
  if (!created.ok) throw new Error('create');
  const slug = `piece-${String((productCounter += 1))}`;
  const updated = await updateProduct(actor, created.data.id, {
    slug,
    descriptionHe: 'תיאור',
    priceIlsMinor: price,
    categoryIds: Array.isArray(categoryIds) ? categoryIds : [categoryIds],
    prepTimeHe: 'שבוע',
  });
  if (!updated.ok) throw new Error('update');
  await addImage(actor, created.data.id, await photo(640, 480, 100));
  if (publish) {
    const published = await setProductState(actor, created.data.id, 'publish');
    if (!published.ok) throw new Error('publish');
  }
  return { id: created.data.id, slug };
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

async function featuredId(): Promise<string> {
  const [row] = await testDb.db
    .select({ id: category.id })
    .from(category)
    .where(eq(category.slug, 'featured'));
  if (!row) throw new Error('featured missing');
  return row.id;
}

async function newCategory(nameHe: string, nameEn?: string): Promise<string> {
  const created = await createCategory(actor, { nameHe, ...(nameEn ? { nameEn } : {}) });
  if (!created.ok) throw new Error('cat');
  return created.data.id;
}

describe('several categories per piece (007 FR-031)', () => {
  it('lists a piece linked to two categories once on each category and once on the full list', async () => {
    const a = await newCategory('נרות');
    const b = await newCategory('קרמיקה');
    const both = await make('שניהם', 5000, [a, b]);
    const onlyA = await make('רק א', 4000, a);
    expect((await listPublishedProducts({ categoryId: a })).map((x) => x.id)).toEqual([
      onlyA.id,
      both.id,
    ]);
    expect((await listPublishedProducts({ categoryId: b })).map((x) => x.id)).toEqual([both.id]);
    const all = (await listPublishedProducts()).map((x) => x.id);
    expect(all).toHaveLength(2);
    expect(new Set(all).size).toBe(2);
  });

  it('lists categories and sitemap categories through the links', async () => {
    const a = await newCategory('נרות');
    const b = await newCategory('קרמיקה');
    const empty = await newCategory('ריקה');
    const hiddenOnly = await newCategory('מוסתרת');
    await make('שניהם', 5000, [a, b]);
    await make('מוסתר', 5000, hiddenOnly, false);
    const ids = (await listCategoriesWithProducts()).map((x) => x.id);
    expect(ids).toEqual([a, b]);
    expect(ids).not.toContain(empty);
    const { categorySlugs } = await listSitemapEntries();
    expect(categorySlugs).toHaveLength(2);
  });

  it('limit caps listPublishedProducts', async () => {
    const a = await newCategory('נרות');
    for (const name of ['א', 'ב', 'ג']) await make(name, 1000, a);
    expect(await listPublishedProducts({ limit: 2 })).toHaveLength(2);
    expect(await listPublishedProducts({ categoryId: a, limit: 1 })).toHaveLength(1);
    expect(await listPublishedProducts()).toHaveLength(3);
  });

  describe('getHomeRow', () => {
    it('is null with no home category, and null when it has only drafts or hidden pieces', async () => {
      const home = await featuredId();
      await make('טיוטה', 1000, home, false);
      const hidden = await make('מוסתר', 1000, home);
      await setProductState(actor, hidden.id, 'hide');
      expect(await getHomeRow('he')).toBeNull();

      const live = await make('חי', 1000, home);
      expect(await getHomeRow('he')).not.toBeNull();
      await testDb.db.update(shopSettings).set({ homeCategoryId: null });
      expect(await getHomeRow('he')).toBeNull();
      expect(live.id).toBeDefined();
    });

    it('gives the Hebrew name and slug with the published pieces newest first, and the English name on en', async () => {
      const home = await featuredId();
      const first = await make('ראשון', 1000, home);
      const second = await make('שני', 1000, home);
      await make('לא בשורה', 1000, await newCategory('אחרת'));
      const row = await getHomeRow('he');
      expect(row).toMatchObject({
        slug: 'featured',
        name: { text: 'מומלצות', lang: 'he', fallback: false },
      });
      expect(row?.cards.map((card) => card.id)).toEqual([second.id, first.id]);
      expect(await getHomeRow('en')).toMatchObject({
        name: { text: 'Featured', lang: 'en', fallback: false },
      });
    });

    it('falls back on the Hebrew name, marked, when the English name is empty', async () => {
      const home = await featuredId();
      await testDb.db.update(category).set({ nameEn: null }).where(eq(category.id, home));
      await make('חי', 1000, home);
      expect((await getHomeRow('en'))?.name).toEqual({
        text: 'מומלצות',
        lang: 'he',
        fallback: true,
      });
    });

    it('shows at most 12 of 13 pieces, the newest', async () => {
      const home = await featuredId();
      const base = Date.now() - 1_000_000;
      const ids: string[] = [];
      for (let i = 0; i < 13; i += 1) {
        const [row] = await testDb.db
          .insert(product)
          .values({
            slug: `bulk-${String(i)}`,
            nameHe: `פריט ${String(i)}`,
            priceIlsMinor: 1000,
            state: 'published',
            publishedAt: new Date(base + i * 1000),
          })
          .returning({ id: product.id });
        ids.push(row?.id ?? '');
        await testDb.db
          .insert(productCategory)
          .values({ productId: row?.id ?? '', categoryId: home });
      }
      const row = await getHomeRow('he');
      expect(row?.cards).toHaveLength(12);
      expect(row?.cards.map((card) => card.id)).toEqual(ids.slice(1).reverse());
    });
  });

  describe('product detail categories and mainCategory (FR-037)', () => {
    it('mainCategory is the first non-home category in category order', async () => {
      const home = await featuredId();
      const a = await newCategory('א');
      const b = await newCategory('ב');
      const piece = await make('בובה', 1000, [home, b, a]);
      const detail = await getPublishedProductBySlug(piece.slug);
      expect(detail?.mainCategory?.id).toBe(a);
      expect(detail?.categories.map((x) => x.id)).toEqual([home, a, b]);
    });

    it('is the home category when it is the only one, and null with none', async () => {
      const home = await featuredId();
      const onlyHome = await make('בית', 1000, home);
      expect((await getPublishedProductBySlug(onlyHome.slug))?.mainCategory?.id).toBe(home);

      const none = await make('בלי', 1000, home);
      await testDb.db.delete(productCategory).where(eq(productCategory.productId, none.id));
      const detail = await getPublishedProductBySlug(none.slug);
      expect(detail?.mainCategory).toBeNull();
      expect(detail?.categories).toEqual([]);
    });
  });
});

describe('listAlsoLike (007 FR-019, D8)', () => {
  const ids = (cards: { id: string }[]) => cards.map((card) => card.id);

  it('gives the 4 newest other pieces of the shared category', async () => {
    const a = await newCategory('נרות');
    const mine = await make('שלי', 1000, a);
    const others: string[] = [];
    for (const name of ['ב', 'ג', 'ד', 'ה', 'ו']) others.push((await make(name, 1000, a)).id);
    const list = await listAlsoLike(mine.id, [a]);
    expect(ids(list)).toEqual(others.slice(1).reverse());
  });

  it('puts pieces sharing a category first, then the newest of the rest', async () => {
    const a = await newCategory('נרות');
    const b = await newCategory('קרמיקה');
    const c = await newCategory('אחרת');
    const mine = await make('שלי', 1000, [a, b]);
    const sharesA = await make('א1', 1000, a);
    const sharesB = await make('ב1', 1000, b);
    const x1 = await make('x1', 1000, c);
    const x2 = await make('x2', 1000, c);
    const x3 = await make('x3', 1000, c);
    const list = await listAlsoLike(mine.id, [a, b]);
    expect(ids(list)).toEqual([sharesB.id, sharesA.id, x3.id, x2.id]);
    expect(ids(list)).not.toContain(x1.id);
  });

  it('does not count the home-row category as sharing', async () => {
    const home = await featuredId();
    const a = await newCategory('נרות');
    const mine = await make('שלי', 1000, [home, a]);
    const sharesA = await make('משותף', 1000, [home, a]);
    const o1 = await make('o1', 1000, home);
    const o2 = await make('o2', 1000, home);
    const o3 = await make('o3', 1000, home);
    const list = await listAlsoLike(mine.id, [a]);
    expect(ids(list)).toEqual([sharesA.id, o3.id, o2.id, o1.id]);
  });

  it('listAlsoLikeFor drops the home-row category itself before matching', async () => {
    const home = await featuredId();
    const a = await newCategory('נרות');
    const mine = await make('שלי', 1000, [home, a]);
    const sharesA = await make('משותף', 1000, [home, a]);
    const o1 = await make('o1', 1000, home);
    const o2 = await make('o2', 1000, home);
    const o3 = await make('o3', 1000, home);
    const piece = { id: mine.id, categories: [{ id: home }, { id: a }] };
    // The home category is in the piece's list; only `a` counts as sharing.
    expect(ids(await listAlsoLikeFor(piece, home))).toEqual([sharesA.id, o3.id, o2.id, o1.id]);
    // With no home-row category chosen, nothing is dropped: every piece shares `home` and the
    // newest come first.
    expect(ids(await listAlsoLikeFor(piece, null))).toEqual([o3.id, o2.id, o1.id, sharesA.id]);
  });

  it('gives the 4 newest other pieces when the piece has no category besides the home one', async () => {
    const home = await featuredId();
    const a = await newCategory('נרות');
    const mine = await make('שלי', 1000, home);
    const made: string[] = [];
    for (const name of ['א', 'ב', 'ג']) made.push((await make(name, 1000, home)).id);
    for (const name of ['ד', 'ה']) made.push((await make(name, 1000, a)).id);
    const list = await listAlsoLike(mine.id, []);
    expect(ids(list)).toEqual(made.slice(1).reverse());
  });

  it('is empty for the only published piece', async () => {
    const a = await newCategory('נרות');
    const mine = await make('שלי', 1000, a);
    await make('טיוטה', 1000, a, false);
    expect(await listAlsoLike(mine.id, [a])).toEqual([]);
    expect(await listAlsoLike(mine.id, [])).toEqual([]);
  });

  it('never lists the piece itself, drafts or hidden pieces, and no piece twice', async () => {
    const a = await newCategory('נרות');
    const b = await newCategory('קרמיקה');
    const mine = await make('שלי', 1000, [a, b]);
    const both = await make('שניהם', 1000, [a, b]);
    await make('טיוטה', 1000, [a, b], false);
    const hidden = await make('מוסתר', 1000, [a, b]);
    await setProductState(actor, hidden.id, 'hide');
    const other = await make('אחר', 1000, await newCategory('שלישית'));
    const list = ids(await listAlsoLike(mine.id, [a, b]));
    expect(list).toEqual([both.id, other.id]);
    expect(new Set(list).size).toBe(list.length);
  });
  describe('card labels (spec 011 FR-004, FR-012, FR-013)', () => {
    it('cards carry showAsNew from the owner tick box', async () => {
      const home = await featuredId();
      const fresh = await make('חדשה', 1000, home);
      const old = await make('ישנה', 1000, home);
      await setProductShowAsNew(actor, fresh.id, true);
      const cards = await listPublishedProducts();
      expect(cards.find((card) => card.id === fresh.id)?.showAsNew).toBe(true);
      expect(cards.find((card) => card.id === old.id)?.showAsNew).toBe(false);
    });

    it('mainCategory is the first non-home category, else the home one, else null', async () => {
      const home = await featuredId();
      const a = await newCategory('א');
      const b = await newCategory('ב');
      const both = await make('שתיים', 1000, [home, b, a]);
      const onlyHome = await make('בית', 1000, home);
      const none = await make('בלי', 1000, home);
      await testDb.db.delete(productCategory).where(eq(productCategory.productId, none.id));
      const byId = new Map((await listPublishedProducts()).map((card) => [card.id, card]));
      expect(byId.get(both.id)?.mainCategory?.id).toBe(a);
      expect(byId.get(onlyHome.id)?.mainCategory?.id).toBe(home);
      expect(byId.get(none.id)?.mainCategory).toBeNull();
    });

    it('featuredCategory is the home-row category when the piece is in it, else null', async () => {
      const home = await featuredId();
      const a = await newCategory('א');
      const both = await make('שתיים', 1000, [home, a]);
      const onlyHome = await make('בית', 1000, home);
      const notIn = await make('אחרת', 1000, a);
      const byId = new Map((await listPublishedProducts()).map((card) => [card.id, card]));
      expect(byId.get(both.id)?.featuredCategory?.id).toBe(home);
      expect(byId.get(both.id)?.mainCategory?.id).toBe(a);
      expect(byId.get(onlyHome.id)?.featuredCategory?.id).toBe(home);
      expect(byId.get(onlyHome.id)?.mainCategory?.id).toBe(home);
      expect(byId.get(notIn.id)?.featuredCategory).toBeNull();
    });

    it('every card list fills the labels, and the card agrees with the product page', async () => {
      const home = await featuredId();
      const a = await newCategory('א');
      const piece = await make('בובה', 1000, [home, a]);
      const other = await make('אחרת', 1000, [home, a]);
      await setProductShowAsNew(actor, piece.id, true);
      const detail = await getPublishedProductBySlug(piece.slug);
      const lists = [
        await listPublishedProducts(),
        await listNewestProducts(5),
        await listAlsoLike(other.id, [a]),
        await listAlsoLikeFor({ id: other.id, categories: [{ id: home }, { id: a }] }, home),
        (await getHomeRow('he'))?.cards ?? [],
      ];
      for (const list of lists) {
        const card = list.find((entry) => entry.id === piece.id);
        expect(card?.showAsNew).toBe(true);
        expect(card?.mainCategory).toEqual(detail?.mainCategory);
        expect(card?.mainCategory?.id).toBe(a);
        expect(card?.featuredCategory?.id).toBe(home);
      }
    });

    it('pickMainCategory follows the breadcrumb rule', () => {
      const x = { id: 'x' };
      const y = { id: 'y' };
      expect(pickMainCategory([x, y], 'x')).toBe(y);
      expect(pickMainCategory([x], 'x')).toBe(x);
      expect(pickMainCategory([x, y], null)).toBe(x);
      expect(pickMainCategory([], 'x')).toBeNull();
    });
  });
});
