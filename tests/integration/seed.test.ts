import { mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { exists, makeTestStorage, type TestStorage } from '../helpers/catalog';
import {
  category,
  contentPage,
  contentPageVersion,
  optionGroup,
  optionValue,
  product,
  productCategory,
  productImage,
  shippingZone,
  shippingZoneCountry,
  shopSettings,
} from '@/server/db/schema';
import { CONTENT_SLUGS, runSeed, SEED_DEFAULTS, SEED_PLACEHOLDERS } from '@/server/db/seed';
import {
  getEnabledZones,
  getSettings,
  getZoneForCountry,
  getZones,
  placeholderFields,
} from '@/server/settings/settings';

let testDb: TestDbHandle;
let files: TestStorage;

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
beforeEach(() => testDb.reset());
afterAll(async () => {
  await testDb.close();
  await files.cleanup();
});

describe('runSeed', () => {
  it('creates the Israel zone, settings, seven content pages, two sample categories and Featured', async () => {
    await runSeed(testDb.db, { samples: true });
    const zones = await testDb.db.select().from(shippingZone);
    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({
      code: 'IL',
      currency: 'ILS',
      enabled: true,
      shippingEnabled: true,
      pickupEnabled: true,
      shippingFeeMinor: 3000,
      freeShippingThresholdMinor: 30000,
    });
    const countries = await testDb.db.select().from(shippingZoneCountry);
    expect(countries.map((c) => c.countryCode)).toEqual(['IL']);
    const settings = await testDb.db.select().from(shopSettings);
    expect(settings).toHaveLength(1);
    expect(settings[0]?.notificationEmails).toEqual(['notify@example.invalid']);
    const pages = await testDb.db.select().from(contentPage);
    expect(pages.map((p) => p.slug).sort()).toEqual([
      'about',
      'accessibility',
      'contact',
      'cookies',
      'privacy',
      'shipping-returns',
      'terms',
    ]);
    expect(pages.every((p) => p.titleHe === 'טיוטה' && p.bodyHe === 'טיוטה')).toBe(true);
    expect(
      (await testDb.db.select().from(category).orderBy(category.sortOrder)).map((c) => c.slug),
    ).toEqual(['sample-candles', 'sample-ceramics', 'featured']);
  });

  it('inserts no sample categories with samples: false, only Featured, without pieces', async () => {
    await runSeed(testDb.db, { samples: false });
    const categories = await testDb.db.select().from(category);
    expect(categories.map((c) => c.slug)).toEqual(['featured']);
    expect(await testDb.db.select().from(productCategory)).toHaveLength(0);
    expect(await testDb.db.select().from(shippingZone)).toHaveLength(1);
  });

  it('creates Featured last in order and points a new settings row at it', async () => {
    await runSeed(testDb.db, { samples: true });
    const [featured] = await testDb.db.select().from(category).where(eq(category.slug, 'featured'));
    expect(featured).toMatchObject({ nameHe: 'מומלצות', nameEn: 'Featured', sortOrder: 2 });
    const [settings] = await testDb.db.select().from(shopSettings);
    expect(settings?.homeCategoryId).toBe(featured?.id);
  });

  it('puts Featured at order 0 when there are no other categories', async () => {
    await runSeed(testDb.db, { samples: false });
    const [featured] = await testDb.db.select().from(category);
    expect(featured?.sortOrder).toBe(0);
  });

  it('links every sample to its category and to Featured, and a second run changes nothing', async () => {
    await runSeed(testDb.db, { samples: true });
    const linkRows = async () =>
      testDb.db
        .select({ product: product.slug, category: category.slug })
        .from(productCategory)
        .innerJoin(product, eq(product.id, productCategory.productId))
        .innerJoin(category, eq(category.id, productCategory.categoryId))
        .orderBy(product.slug, category.slug);
    const before = await linkRows();
    expect(before).toEqual([
      { product: 'sample-ceramic-bowl', category: 'featured' },
      { product: 'sample-ceramic-bowl', category: 'sample-ceramics' },
      { product: 'sample-clay-mug', category: 'featured' },
      { product: 'sample-clay-mug', category: 'sample-ceramics' },
      { product: 'sample-soy-candle', category: 'featured' },
      { product: 'sample-soy-candle', category: 'sample-candles' },
    ]);
    await runSeed(testDb.db, { samples: true });
    expect(await linkRows()).toEqual(before);
    expect(await testDb.db.select().from(category)).toHaveLength(3);
  });

  it('leaves a null home category on an existing settings row null', async () => {
    await runSeed(testDb.db, { samples: true });
    await testDb.db
      .update(shopSettings)
      .set({ homeCategoryId: null })
      .where(eq(shopSettings.id, 1));
    await runSeed(testDb.db, { samples: true });
    const [settings] = await testDb.db.select().from(shopSettings);
    expect(settings?.homeCategoryId).toBeNull();
  });

  it('does not re-create a deleted Featured when seeding without samples on an existing settings row', async () => {
    await runSeed(testDb.db, { samples: false });
    await testDb.db.delete(category).where(eq(category.slug, 'featured'));
    await runSeed(testDb.db, { samples: false });
    expect(await testDb.db.select().from(category)).toHaveLength(0);
    const [settings] = await testDb.db.select().from(shopSettings);
    expect(settings?.homeCategoryId).toBeNull();
  });

  it('is idempotent: a second run changes nothing', async () => {
    await runSeed(testDb.db, { samples: true });
    const snapshot = async () => ({
      zones: await testDb.db.select().from(shippingZone),
      countries: await testDb.db.select().from(shippingZoneCountry),
      settings: await testDb.db.select().from(shopSettings),
      pages: await testDb.db.select().from(contentPage).orderBy(contentPage.slug),
      categories: await testDb.db.select().from(category).orderBy(category.sortOrder),
      products: await testDb.db.select().from(product).orderBy(product.slug),
      images: await testDb.db.select().from(productImage).orderBy(productImage.storageKey),
      links: await testDb.db.select().from(productCategory).orderBy(productCategory.createdAt),
      groups: await testDb.db.select().from(optionGroup),
      values: await testDb.db.select().from(optionValue).orderBy(optionValue.position),
    });
    const before = await snapshot();
    await runSeed(testDb.db, { samples: true });
    expect(await snapshot()).toEqual(before);
  });

  it('adds three published sample products with photos, and a second run adds no products or images', async () => {
    await runSeed(testDb.db, { samples: true });
    const products = await testDb.db.select().from(product).orderBy(product.slug);
    expect(products.map((p) => p.slug)).toEqual([
      'sample-ceramic-bowl',
      'sample-clay-mug',
      'sample-soy-candle',
    ]);
    expect(products.every((p) => p.state === 'published' && p.publishedAt !== null)).toBe(true);
    expect(products.find((p) => p.slug === 'sample-ceramic-bowl')?.orderable).toBe(false);
    expect(products.find((p) => p.slug === 'sample-clay-mug')).toMatchObject({
      nameEn: null,
      descriptionEn: null,
    });
    const values = await testDb.db.select().from(optionValue);
    expect(values.length).toBeGreaterThanOrEqual(2);
    expect(values.some((v) => v.swatch !== null)).toBe(true);

    const images = await testDb.db.select().from(productImage);
    expect(images.length).toBeGreaterThanOrEqual(3);
    for (const image of images) {
      // Real pipeline: private variants, and (published) public copies.
      expect(await exists(files.storage, 'private', `${image.storageKey}-800.webp`)).toBe(true);
      expect(await exists(files.storage, 'public', `${image.storageKey}-800.webp`)).toBe(true);
    }
    for (const p of products) {
      const own = images.filter((image) => image.productId === p.id).map((image) => image.position);
      expect(own.sort()).toEqual(own.map((_, index) => index));
    }

    await runSeed(testDb.db, { samples: true });
    expect(await testDb.db.select().from(product)).toHaveLength(3);
    expect(await testDb.db.select().from(productImage)).toHaveLength(images.length);
  });

  it('adds no products with samples: false', async () => {
    await runSeed(testDb.db, { samples: false });
    expect(await testDb.db.select().from(product)).toHaveLength(0);
    expect(await testDb.db.select().from(productImage)).toHaveLength(0);
  });

  it('links country IL when the zone already exists without it', async () => {
    await runSeed(testDb.db, { samples: false });
    await testDb.db.delete(shippingZoneCountry);
    expect(await testDb.db.select().from(shippingZoneCountry)).toHaveLength(0);
    await runSeed(testDb.db, { samples: false });
    const countries = await testDb.db.select().from(shippingZoneCountry);
    expect(countries.map((c) => c.countryCode)).toEqual(['IL']);
  });

  it('never overwrites owner changes', async () => {
    await runSeed(testDb.db, { samples: true });
    await testDb.db
      .update(shopSettings)
      .set({
        shopNameHe: 'חנות חדשה',
        notificationEmails: ['owner@example.test'],
        businessPhone: '+972521111111',
      })
      .where(eq(shopSettings.id, 1));
    await testDb.db
      .update(shippingZone)
      .set({ shippingFeeMinor: 4500, enabled: false })
      .where(eq(shippingZone.code, 'IL'));
    await testDb.db
      .update(contentPage)
      .set({ bodyHe: 'תוכן', ownerEdited: true })
      .where(eq(contentPage.slug, 'about'));
    await runSeed(testDb.db, { samples: true });
    const [settings] = await testDb.db.select().from(shopSettings);
    expect(settings).toMatchObject({
      shopNameHe: 'חנות חדשה',
      notificationEmails: ['owner@example.test'],
      businessPhone: '+972521111111',
    });
    const [zone] = await testDb.db.select().from(shippingZone);
    expect(zone).toMatchObject({ shippingFeeMinor: 4500, enabled: false });
    const [about] = await testDb.db.select().from(contentPage).where(eq(contentPage.slug, 'about'));
    expect(about?.bodyHe).toBe('תוכן');
  });
});

describe('settings', () => {
  it('reads settings and zones', async () => {
    await runSeed(testDb.db, { samples: false });
    expect((await getSettings()).shopNameHe).toBe(SEED_DEFAULTS.shopNameHe);
    expect(await getZones()).toHaveLength(1);
    expect(await getEnabledZones()).toHaveLength(1);
    expect((await getZoneForCountry('IL'))?.code).toBe('IL');
    expect(await getZoneForCountry('FR')).toBeNull();
    await testDb.db.update(shippingZone).set({ enabled: false });
    expect(await getEnabledZones()).toHaveLength(0);
  });

  it('lists every untouched placeholder, and none once changed', async () => {
    await runSeed(testDb.db, { samples: false });
    const untouched = placeholderFields(await getSettings());
    expect(untouched.sort()).toEqual(Object.keys(SEED_PLACEHOLDERS).sort());
    expect(untouched).not.toContain('shopNameHe');
    expect(untouched).not.toContain('shopNameEn');
    const changed = Object.fromEntries(
      Object.entries(SEED_PLACEHOLDERS).map(([key, value]) => [
        key,
        Array.isArray(value) ? ['real@example.test'] : `real ${key}`,
      ]),
    );
    await testDb.db.update(shopSettings).set(changed).where(eq(shopSettings.id, 1));
    expect(placeholderFields(await getSettings())).toEqual([]);
  });

  it('reports only the fields that are still placeholders', async () => {
    await runSeed(testDb.db, { samples: false });
    await testDb.db
      .update(shopSettings)
      .set({ businessPhone: '+972521111111' })
      .where(eq(shopSettings.id, 1));
    const fields = placeholderFields(await getSettings());
    expect(fields).not.toContain('businessPhone');
    expect(fields).toContain('businessEmail');
  });
});

describe('runSeed with supplied drafts (003 R7)', () => {
  let contentDir: string;

  /** Writes all 14 draft files; `overrides` replaces the body of `<slug>.<lang>`. */
  async function writeDrafts(overrides: Record<string, string> = {}): Promise<void> {
    for (const slug of CONTENT_SLUGS) {
      for (const lang of ['he', 'en'] as const) {
        const body = overrides[`${slug}.${lang}`] ?? `Body of ${slug} ${lang}`;
        await writeFile(
          join(contentDir, `${slug}.${lang}.md`),
          `# Title ${slug} ${lang}\n\n${body}\n`,
        );
      }
    }
  }

  beforeEach(async () => {
    contentDir = await mkdtemp(join(tmpdir(), 'ac-drafts-'));
  });
  afterEach(async () => {
    await rm(contentDir, { recursive: true, force: true });
  });

  const versions = (slug: string) =>
    testDb.db
      .select()
      .from(contentPageVersion)
      .where(eq(contentPageVersion.slug, slug))
      .orderBy(contentPageVersion.version);

  it('inserts missing pages at version 1 and one version copy for terms and privacy only', async () => {
    await writeDrafts();
    await runSeed(testDb.db, { samples: false, contentDir });
    const pages = await testDb.db.select().from(contentPage);
    expect(pages).toHaveLength(7);
    expect(pages.every((p) => p.version === 1 && !p.ownerEdited)).toBe(true);
    const terms = pages.find((p) => p.slug === 'terms');
    expect(terms).toMatchObject({
      titleHe: 'Title terms he',
      bodyHe: 'Body of terms he',
      titleEn: 'Title terms en',
      bodyEn: 'Body of terms en',
    });
    const all = await testDb.db.select().from(contentPageVersion);
    expect(all.map((v) => `${v.slug}:${String(v.version)}`).sort()).toEqual([
      'privacy:1',
      'terms:1',
    ]);
    expect((await versions('terms'))[0]).toMatchObject({
      titleHe: 'Title terms he',
      bodyEn: 'Body of terms en',
    });
  });

  it('replaces a changed draft of a page that was never edited and bumps the version exactly once', async () => {
    await writeDrafts();
    await runSeed(testDb.db, { samples: false, contentDir });
    await writeDrafts({ 'terms.he': 'New terms', 'about.en': 'New about' });
    await runSeed(testDb.db, { samples: false, contentDir });
    const [terms] = await testDb.db.select().from(contentPage).where(eq(contentPage.slug, 'terms'));
    expect(terms).toMatchObject({ version: 2, bodyHe: 'New terms', ownerEdited: false });
    const [about] = await testDb.db.select().from(contentPage).where(eq(contentPage.slug, 'about'));
    expect(about).toMatchObject({ version: 2, bodyEn: 'New about' });
    expect((await versions('terms')).map((v) => v.version)).toEqual([1, 2]);
    expect((await versions('privacy')).map((v) => v.version)).toEqual([1]);
    expect(await testDb.db.select().from(contentPageVersion)).toHaveLength(3);

    // A second run with the same drafts changes nothing and adds no version row.
    const before = await testDb.db.select().from(contentPage).orderBy(contentPage.slug);
    await runSeed(testDb.db, { samples: false, contentDir });
    expect(await testDb.db.select().from(contentPage).orderBy(contentPage.slug)).toEqual(before);
    expect(await testDb.db.select().from(contentPageVersion)).toHaveLength(3);
  });

  it('never touches a page with owner_edited = true', async () => {
    await writeDrafts();
    await runSeed(testDb.db, { samples: false, contentDir });
    await testDb.db
      .update(contentPage)
      .set({ bodyHe: 'Aviva wrote this', ownerEdited: true, version: 2 })
      .where(eq(contentPage.slug, 'privacy'));
    await writeDrafts({ 'privacy.he': 'A newer draft' });
    await runSeed(testDb.db, { samples: false, contentDir });
    const [privacy] = await testDb.db
      .select()
      .from(contentPage)
      .where(eq(contentPage.slug, 'privacy'));
    expect(privacy).toMatchObject({ bodyHe: 'Aviva wrote this', version: 2, ownerEdited: true });
    expect((await versions('privacy')).map((v) => v.version)).toEqual([1]);
  });

  it('rejects when a draft file is missing', async () => {
    await writeDrafts();
    await unlink(join(contentDir, 'cookies.en.md'));
    await expect(runSeed(testDb.db, { samples: false, contentDir })).rejects.toThrow(
      /cookies\.en\.md/,
    );
  });

  it('rejects a draft whose first line is not a title', async () => {
    await writeDrafts();
    await writeFile(join(contentDir, 'about.he.md'), 'no title here\n');
    await expect(runSeed(testDb.db, { samples: false, contentDir })).rejects.toThrow(
      /about\.he\.md/,
    );
  });

  it('without contentDir keeps the placeholder pages and still leaves a version copy for terms and privacy', async () => {
    await runSeed(testDb.db, { samples: false });
    const pages = await testDb.db.select().from(contentPage);
    expect(pages.every((p) => p.titleHe === 'טיוטה' && p.version === 1)).toBe(true);
    const copies = await testDb.db.select().from(contentPageVersion);
    expect(copies.map((v) => `${v.slug}:${String(v.version)}`).sort()).toEqual([
      'privacy:1',
      'terms:1',
    ]);
    await runSeed(testDb.db, { samples: false });
    expect(await testDb.db.select().from(contentPageVersion)).toHaveLength(2);
    const [copy] = await testDb.db
      .select()
      .from(contentPageVersion)
      .where(and(eq(contentPageVersion.slug, 'terms'), eq(contentPageVersion.version, 1)));
    expect(copy).toMatchObject({ titleHe: 'טיוטה', bodyHe: 'טיוטה' });
  });
});

describe('the supplied legal drafts in docs/legal-drafts', () => {
  it('load, and the five legal pages start with the draft notice in both languages', async () => {
    const contentDir = fileURLToPath(new URL('../../docs/legal-drafts', import.meta.url));
    await runSeed(testDb.db, { samples: false, contentDir });
    const pages = await testDb.db.select().from(contentPage);
    expect(pages).toHaveLength(7);
    for (const page of pages) {
      expect(page.titleHe.length).toBeGreaterThan(0);
      expect(page.titleEn?.length ?? 0).toBeGreaterThan(0);
      if (['about', 'contact'].includes(page.slug)) continue;
      expect(page.bodyHe.startsWith('**טיוטה — נדרשת בדיקה משפטית.**')).toBe(true);
      expect(page.bodyEn?.startsWith('**Draft — requires legal review.**')).toBe(true);
    }
    expect(await testDb.db.select().from(contentPageVersion)).toHaveLength(2);
  });
});
