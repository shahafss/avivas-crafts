import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { makeActor, makeTestStorage, photo, type TestStorage } from '../helpers/catalog';
import { runSeed } from '@/server/db/seed';
import type { Actor } from '@/server/catalog/result';
import { createCategory } from '@/server/catalog/categories';
import { addImage } from '@/server/catalog/images';
import { createProduct, setProductState, updateProduct } from '@/server/catalog/products';

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
vi.mock('@/server/env', () => ({
  getEnv: () => ({ APP_ORIGIN: 'https://shop.example' }),
}));

import sitemap from '@/app/sitemap';
import robots from '@/app/robots';

const O = 'https://shop.example';

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

async function make(nameHe: string, categoryId: string, state: 'published' | 'draft' | 'hidden') {
  const created = await createProduct(actor, { nameHe, nameEn: null });
  if (!created.ok) throw new Error('create');
  await updateProduct(actor, created.data.id, {
    descriptionHe: 'תיאור',
    priceIlsMinor: 5000,
    categoryId,
    prepTimeHe: 'שבוע',
  });
  await addImage(actor, created.data.id, await photo(640, 480, 100));
  if (state !== 'draft') await setProductState(actor, created.data.id, 'publish');
  if (state === 'hidden') await setProductState(actor, created.data.id, 'hide');
  return created.data;
}

describe('sitemap()', () => {
  it('lists each public page once per locale with both language alternates', async () => {
    const full = await createCategory(actor, { nameHe: 'נרות' });
    const empty = await createCategory(actor, { nameHe: 'ריקה' });
    if (!full.ok || !empty.ok) throw new Error('cat');
    const live = await make('חי', full.data.id, 'published');
    const draft = await make('טיוטה', full.data.id, 'draft');
    const onlyHidden = await createCategory(actor, { nameHe: 'מוסתרת' });
    if (!onlyHidden.ok) throw new Error('cat');
    await make('טיוטה ב', onlyHidden.data.id, 'draft');
    await make('מוסתר ב', onlyHidden.data.id, 'hidden');
    const hidden = await make('מוסתר', full.data.id, 'hidden');

    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);
    const paths = [
      '',
      `/c/${full.data.slug}`,
      `/p/${live.slug}`,
      '/pages/about',
      '/pages/privacy',
      '/pages/terms',
      '/pages/cookies',
      '/pages/shipping-returns',
      '/pages/accessibility',
      '/contact',
    ];
    for (const locale of ['he', 'en']) {
      for (const path of paths) expect(urls).toContain(`${O}/${locale}${path}`);
    }
    expect(urls).toHaveLength(paths.length * 2);

    // An empty category, a draft and a hidden product are left out.
    expect(urls.join('\n')).not.toContain(`/c/${empty.data.slug}`);
    expect(urls.join('\n')).not.toContain(`/c/${onlyHidden.data.slug}`);
    expect(urls.join('\n')).not.toContain(`/p/${draft.slug}`);
    expect(urls.join('\n')).not.toContain(`/p/${hidden.slug}`);
    // Nothing private or dynamic.
    expect(urls.join('\n')).not.toMatch(/search|cart|checkout|order|admin|api/);

    for (const entry of entries) {
      const path = entry.url.replace(/^https:\/\/shop\.example\/(he|en)/, '');
      expect(entry.alternates?.languages).toEqual({ he: `${O}/he${path}`, en: `${O}/en${path}` });
      const isProduct = path.startsWith('/p/');
      expect(entry.lastModified !== undefined).toBe(isProduct);
    }
  });
});

describe('robots()', () => {
  it('allows the shop, keeps the admin and api out and names the sitemap', () => {
    expect(robots()).toEqual({
      rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/'] },
      sitemap: `${O}/sitemap.xml`,
    });
  });
});
