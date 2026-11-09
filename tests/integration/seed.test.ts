import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { exists, makeTestStorage, type TestStorage } from '../helpers/catalog';
import {
  category,
  contentPage,
  optionGroup,
  optionValue,
  product,
  productImage,
  shippingZone,
  shippingZoneCountry,
  shopSettings,
} from '@/server/db/schema';
import { runSeed, SEED_DEFAULTS, SEED_PLACEHOLDERS } from '@/server/db/seed';
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
  it('creates the Israel zone, settings, seven content pages and two sample categories', async () => {
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
    expect(await testDb.db.select().from(category)).toHaveLength(2);
  });

  it('inserts no sample categories with samples: false', async () => {
    await runSeed(testDb.db, { samples: false });
    expect(await testDb.db.select().from(category)).toHaveLength(0);
    expect(await testDb.db.select().from(shippingZone)).toHaveLength(1);
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
