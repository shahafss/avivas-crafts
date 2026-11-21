// US2: admin settings rules (tasks.md T085): payment and delivery minimums (FR-017, FR-022),
// notification emails, the shop name, and the USD rules of FR-015 / research.md R18.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { makeActor, makeTestStorage, type TestStorage } from '../helpers/catalog';
import { seedCatalog, type CheckoutFixture } from '../helpers/checkout';
import { createProduct, setProductState, updateProduct } from '@/server/catalog/products';
import type { Actor } from '@/server/catalog/result';
import {
  adminActivity,
  category,
  optionValue,
  product,
  shippingZone,
  shippingZoneCountry,
  shopSettings,
} from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import {
  getSettings,
  placeholderFields,
  productsMissingUsdPrice,
  settingsNeedingAttention,
  updateSettings,
  updateZone,
} from '@/server/settings/settings';

let testDb: TestDbHandle;
let files: TestStorage;
let actor: Actor;
let fixture: CheckoutFixture;

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));
vi.mock('@/server/storage', () => ({ getStorage: () => files.storage }));
vi.mock('@/server/env', () => ({
  getEnv: () => ({ APP_ENV: 'test', PAYMENT_PROVIDER: 'fake' }),
}));

beforeAll(async () => {
  testDb = await createTestDb();
  files = await makeTestStorage();
});
afterAll(async () => {
  await testDb.close();
  await files.cleanup();
});
beforeEach(async () => {
  await testDb.reset();
  await runSeed(testDb.db, { samples: false });
  actor = await makeActor(testDb.db);
});

const settings = async () => (await testDb.db.select().from(shopSettings))[0];
const activity = async () =>
  (await testDb.db.select().from(adminActivity)).map((row) => row.action);
const israel = async () =>
  (await testDb.db.select().from(shippingZone).where(eq(shippingZone.code, 'IL')))[0];

async function usdZone() {
  const [zone] = await testDb.db
    .insert(shippingZone)
    .values({
      code: 'WORLD',
      nameHe: 'העולם',
      currency: 'USD',
      shippingEnabled: true,
      shippingFeeMinor: 2500,
    })
    .returning();
  await testDb.db.insert(shippingZoneCountry).values({ zoneId: zone?.id ?? '', countryCode: 'US' });
  return zone;
}

function zoneInput(zone: { id: string }, overrides: Record<string, unknown> = {}) {
  return {
    zoneId: zone.id,
    enabled: true,
    shippingEnabled: true,
    pickupEnabled: false,
    shippingFeeMinor: 2500,
    freeShippingThresholdMinor: null,
    ...overrides,
  };
}

describe('payment methods (FR-017)', () => {
  it('refuses to disable the last enabled payment method and changes nothing', async () => {
    expect(await updateSettings(actor, { offlinePaymentEnabled: false })).toEqual({
      ok: true,
      data: undefined,
    });
    const result = await updateSettings(actor, { onlinePaymentEnabled: false });
    expect(result).toMatchObject({
      ok: false,
      formError: 'admin.settings.errors.last_payment_method',
    });
    expect(await settings()).toMatchObject({
      onlinePaymentEnabled: true,
      offlinePaymentEnabled: false,
    });
    // Both off in one request is refused too.
    await updateSettings(actor, { offlinePaymentEnabled: true });
    expect(
      await updateSettings(actor, { onlinePaymentEnabled: false, offlinePaymentEnabled: false }),
    ).toMatchObject({ ok: false });
    expect(await settings()).toMatchObject({
      onlinePaymentEnabled: true,
      offlinePaymentEnabled: true,
    });
  });
});

describe('delivery methods per zone (FR-022)', () => {
  it('refuses to switch off the last enabled delivery method of Israel', async () => {
    const il = await israel();
    expect(
      await updateZone(
        actor,
        zoneInput(il as never, { shippingEnabled: false, pickupEnabled: true }),
      ),
    ).toMatchObject({ ok: true });
    const result = await updateZone(
      actor,
      zoneInput(il as never, { shippingEnabled: false, pickupEnabled: false }),
    );
    expect(result).toMatchObject({
      ok: false,
      formError: 'admin.settings.errors.last_delivery_method',
    });
    expect(await israel()).toMatchObject({ shippingEnabled: false, pickupEnabled: true });
  });

  it('keeps Israel enabled, allows pickup in Israel only, and rejects negative fees', async () => {
    const il = await israel();
    expect(await updateZone(actor, zoneInput(il as never, { enabled: false }))).toMatchObject({
      ok: false,
      formError: 'admin.settings.errors.israel_stays_enabled',
    });
    const world = await usdZone();
    expect(
      await updateZone(actor, zoneInput(world as never, { enabled: false, pickupEnabled: true })),
    ).toMatchObject({ ok: false, formError: 'admin.settings.errors.pickup_israel_only' });
    expect(await updateZone(actor, zoneInput(il as never, { shippingFeeMinor: -1 }))).toMatchObject(
      {
        ok: false,
        fieldErrors: { shippingFeeMinor: 'admin.settings.errors.fee' },
      },
    );
  });

  it('saves the fee and the free-shipping amount of a zone', async () => {
    const il = await israel();
    expect(
      await updateZone(
        actor,
        zoneInput(il as never, {
          pickupEnabled: true,
          shippingFeeMinor: 4000,
          freeShippingThresholdMinor: null,
        }),
      ),
    ).toMatchObject({ ok: true });
    expect(await israel()).toMatchObject({
      shippingFeeMinor: 4000,
      freeShippingThresholdMinor: null,
    });
  });
});

describe('notification emails and names', () => {
  it('accepts one to three valid addresses only, counting a repeat once', async () => {
    const ok = await updateSettings(actor, {
      notificationEmails: ['a@example.com', 'B@example.com', 'c@example.com'],
    });
    expect(ok).toMatchObject({ ok: true });
    expect((await settings())?.notificationEmails).toHaveLength(3);
    for (const bad of [
      [],
      ['a@example.com', 'b@example.com', 'c@example.com', 'd@example.com'],
      ['not-an-email'],
    ]) {
      expect(await updateSettings(actor, { notificationEmails: bad })).toMatchObject({
        ok: false,
        fieldErrors: {
          notificationEmails: expect.stringContaining('admin.settings.errors.') as string,
        },
      });
    }
    expect((await settings())?.notificationEmails).toHaveLength(3);
    await updateSettings(actor, { notificationEmails: ['same@example.com', 'SAME@example.com'] });
    expect((await settings())?.notificationEmails).toEqual(['same@example.com']);
  });

  it('requires a Hebrew shop name of 1-60 characters, keeps the English one optional and the legal name apart', async () => {
    const before = await settings();
    expect(await updateSettings(actor, { shopNameHe: '' })).toMatchObject({ ok: false });
    expect(await updateSettings(actor, { shopNameHe: 'א'.repeat(61) })).toMatchObject({
      ok: false,
    });
    expect(await updateSettings(actor, { shopNameEn: 'x'.repeat(61) })).toMatchObject({
      ok: false,
    });
    expect(
      await updateSettings(actor, { shopNameHe: 'א'.repeat(60), shopNameEn: '' }),
    ).toMatchObject({ ok: true });
    const after = await settings();
    expect(after).toMatchObject({ shopNameEn: null, businessNameHe: before?.businessNameHe });
    expect(after?.shopNameHe).toHaveLength(60);
    expect(await updateSettings(actor, { shopNameEn: 'Aviva' })).toMatchObject({ ok: true });
    expect(await settings()).toMatchObject({
      shopNameEn: 'Aviva',
      businessNameEn: before?.businessNameEn,
    });
  });

  it('requires the business details', async () => {
    for (const field of [
      'businessNameHe',
      'businessPhone',
      'businessAddressHe',
    ]) {
      expect(await updateSettings(actor, { [field]: '  ' })).toMatchObject({ ok: false });
    }
    expect(await updateSettings(actor, { businessEmail: 'nope' })).toMatchObject({ ok: false });
  });

  it('treats the business number as optional (008 FR-004, FR-008)', async () => {
    expect(await settingsNeedingAttention()).toContain('businessRegNumber');
    for (const value of ['', '   ']) {
      expect(await updateSettings(actor, { businessRegNumber: value })).toMatchObject({ ok: true });
      expect((await settings())?.businessRegNumber).toBeNull();
      expect(await settingsNeedingAttention()).not.toContain('businessRegNumber');
    }
    expect(await updateSettings(actor, { businessRegNumber: ' 123456789 ' })).toMatchObject({
      ok: true,
    });
    expect((await settings())?.businessRegNumber).toBe('123456789');
    expect(await updateSettings(actor, { businessRegNumber: 'x'.repeat(41) })).toMatchObject({
      ok: false,
    });
  });
});

describe('enabling a USD zone (FR-015, research.md R18)', () => {
  beforeEach(async () => {
    fixture = await seedCatalog(actor);
  });

  it('is refused while published products lack a USD price, and lists them', async () => {
    const world = await usdZone();
    const result = await updateZone(actor, zoneInput(world as never));
    expect(result).toMatchObject({ ok: false, formError: 'admin.settings.errors.usd_missing' });
    const listed = (result as { products: { id: string }[] }).products.map((row) => row.id).sort();
    expect(listed).toEqual([fixture.doll.id, fixture.candle.id].sort());
    expect(
      (await testDb.db.select().from(shippingZone).where(eq(shippingZone.code, 'WORLD')))[0]
        ?.enabled,
    ).toBe(false);
  });

  it('also lists a product whose non-zero option adjustment has no USD amount', async () => {
    await testDb.db.update(product).set({ priceUsdMinor: 3000 });
    const [blocked] = await productsMissingUsdPrice(testDb.db);
    expect(blocked?.id).toBe(fixture.doll.id);
    await testDb.db
      .update(optionValue)
      .set({ deltaUsdMinor: 600 })
      .where(eq(optionValue.id, fixture.doll.blond));
    expect(await productsMissingUsdPrice(testDb.db)).toEqual([]);
    const world = await usdZone();
    expect(await updateZone(actor, zoneInput(world as never))).toMatchObject({ ok: true });
  });

  it('once enabled, a published product cannot be published or saved without a USD price', async () => {
    await testDb.db.update(product).set({ priceUsdMinor: 3000 });
    await testDb.db
      .update(optionValue)
      .set({ deltaUsdMinor: 600 })
      .where(eq(optionValue.id, fixture.doll.blond));
    await updateZone(actor, zoneInput((await usdZone()) as never));

    const saved = await updateProduct(actor, fixture.candle.id, { priceUsdMinor: null });
    expect(saved).toMatchObject({
      ok: false,
      missingFields: expect.arrayContaining(['priceUsdMinor']) as string[],
    });

    const draft = await createProduct(actor, { nameHe: 'חדש' });
    if (!draft.ok) throw new Error('product');
    await updateProduct(actor, draft.data.id, {
      nameHe: 'צעצוע',
      descriptionHe: 'תיאור',
      priceIlsMinor: 5000,
      prepTimeHe: 'שבוע',
    });
    const published = await setProductState(actor, draft.data.id, 'publish');
    expect(published).toMatchObject({ ok: false });
    expect((published as { missingFields?: string[] }).missingFields).toContain('priceUsdMinor');
  });
});

describe('social links (US3, FR-024-FR-026)', () => {
  it('stores the normalised address, writes one activity row without it, and clears with null', async () => {
    expect(await updateSettings(actor, { socialInstagramUrl: 'instagram.com/aviva' })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await settings()).toMatchObject({ socialInstagramUrl: 'https://instagram.com/aviva' });
    const rows = await testDb.db.select().from(adminActivity);
    const updated = rows.filter((row) => row.action === 'settings.updated');
    expect(updated).toHaveLength(1);
    expect(JSON.stringify(updated[0]?.details)).not.toContain('instagram');
    expect(await updateSettings(actor, { socialInstagramUrl: null })).toMatchObject({ ok: true });
    expect(await settings()).toMatchObject({ socialInstagramUrl: null });
  });

  it('refuses a wrong site with a field error and writes nothing', async () => {
    const before = (await activity()).length;
    const result = await updateSettings(actor, {
      socialInstagramUrl: 'instagram.com/aviva',
      socialFacebookUrl: 'https://example.com/a',
    });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { socialFacebookUrl: 'admin.settings.errors.social.wrongSite.facebook' },
    });
    expect(await settings()).toMatchObject({ socialInstagramUrl: null, socialFacebookUrl: null });
    expect((await activity()).length).toBe(before);
  });
});

describe('home row category (US5, FR-034)', () => {
  const categoryRow = async () => {
    const [row] = await testDb.db
      .insert(category)
      .values({ slug: 'row-cat', nameHe: 'שורה', sortOrder: 90 })
      .returning();
    return row as { id: string };
  };

  it('sets an existing category, clears it with null, and logs the save', async () => {
    const cat = await categoryRow();
    const before = (await activity()).filter((a) => a === 'settings.updated').length;
    expect(await updateSettings(actor, { homeCategoryId: cat.id })).toMatchObject({ ok: true });
    expect(await settings()).toMatchObject({ homeCategoryId: cat.id });
    expect(await updateSettings(actor, { homeCategoryId: null })).toMatchObject({ ok: true });
    expect(await settings()).toMatchObject({ homeCategoryId: null });
    const after = (await activity()).filter((a) => a === 'settings.updated').length;
    expect(after - before).toBe(2);
  });

  it('refuses an unknown id with a field error and saves nothing', async () => {
    const cat = await categoryRow();
    await updateSettings(actor, { homeCategoryId: cat.id });
    const before = (await activity()).length;
    const result = await updateSettings(actor, {
      homeCategoryId: '11111111-1111-4111-8111-111111111111',
    });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { homeCategoryId: 'admin.settings.errors.home_category_not_found' },
    });
    expect(await settings()).toMatchObject({ homeCategoryId: cat.id });
    expect((await activity()).length).toBe(before);
  });
});

describe('header categories (007 FR-039)', () => {
  const unknownId = '11111111-1111-4111-8111-111111111111';
  let sort = 100;
  const makeCat = async (slug: string) => {
    const [row] = await testDb.db
      .insert(category)
      .values({ slug, nameHe: slug, sortOrder: sort++ })
      .returning();
    return row as { id: string };
  };

  it('sets both, reads them back with getSettings(), and clears them with null', async () => {
    const a = await makeCat('hdr-a');
    const b = await makeCat('hdr-b');
    expect(
      await updateSettings(actor, { headerCategory1Id: a.id, headerCategory2Id: b.id }),
    ).toMatchObject({ ok: true });
    expect(await settings()).toMatchObject({ headerCategory1Id: a.id, headerCategory2Id: b.id });
    expect(await getSettings()).toMatchObject({ headerCategory1Id: a.id, headerCategory2Id: b.id });
    expect(
      await updateSettings(actor, { headerCategory1Id: null, headerCategory2Id: null }),
    ).toMatchObject({ ok: true });
    expect(await getSettings()).toMatchObject({ headerCategory1Id: null, headerCategory2Id: null });
  });

  it('refuses an unknown id with a field error and saves nothing', async () => {
    const a = await makeCat('hdr-a');
    await updateSettings(actor, { headerCategory1Id: a.id });
    const before = (await activity()).length;
    const result = await updateSettings(actor, {
      headerCategory1Id: unknownId,
      headerCategory2Id: a.id,
    });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { headerCategory1Id: 'admin.settings.errors.header_category_not_found' },
    });
    expect(await settings()).toMatchObject({ headerCategory1Id: a.id, headerCategory2Id: null });
    expect((await activity()).length).toBe(before);

    const second = await updateSettings(actor, { headerCategory2Id: unknownId });
    expect(second).toMatchObject({
      ok: false,
      fieldErrors: { headerCategory2Id: 'admin.settings.errors.header_category_not_found' },
    });
  });
});

describe('activity log', () => {
  it('writes settings.updated and zone.updated rows, and nothing for a refused or unchanged save', async () => {
    await updateSettings(actor, { shopNameHe: 'שם חדש' });
    await updateSettings(actor, { shopNameHe: 'שם חדש' });
    await updateSettings(actor, { onlinePaymentEnabled: false, offlinePaymentEnabled: false });
    const il = await israel();
    await updateZone(
      actor,
      zoneInput(il as never, { pickupEnabled: true, shippingFeeMinor: 3500 }),
    );
    await updateZone(
      actor,
      zoneInput(il as never, { shippingEnabled: false, pickupEnabled: false }),
    );
    expect(await activity()).toEqual(['settings.updated', 'zone.updated']);
    const rows = await testDb.db.select().from(adminActivity);
    expect(rows.every((row) => row.adminId === actor.adminId)).toBe(true);
  });
});

describe('settingsNeedingAttention (002 US7, research R13)', () => {
  const setZone = (values: Partial<typeof shippingZone.$inferInsert>) =>
    testDb.db.update(shippingZone).set(values).where(eq(shippingZone.code, 'IL'));
  const setInstructions = (value: string | null) =>
    testDb.db.update(shopSettings).set({ pickupInstructionsHe: value });

  it('lists the seed placeholders, the same as placeholderFields()', async () => {
    const expected = placeholderFields(await getSettings());
    expect(expected.length).toBeGreaterThan(0);
    // The seed always enables pickup in a zone and leaves the pickup instructions empty.
    // ...and, with offline payment on, the empty Hebrew offline instructions (006 FR-010b).
    expect(await settingsNeedingAttention()).toEqual([
      ...expected,
      'pickupInstructionsHe',
      'offlineInstructionsHe',
    ]);
    // With pickup off, only the placeholders and the offline instructions remain.
    await testDb.db.update(shippingZone).set({ pickupEnabled: false });
    expect(await settingsNeedingAttention()).toEqual([...expected, 'offlineInstructionsHe']);
  });

  it('adds pickupInstructionsHe when an enabled zone offers pickup and the text is empty or blank', async () => {
    await setZone({ enabled: true, pickupEnabled: true });
    await setInstructions(null);
    expect(await settingsNeedingAttention()).toContain('pickupInstructionsHe');
    await setInstructions('   ');
    expect(await settingsNeedingAttention()).toContain('pickupInstructionsHe');
  });

  it('does not list it when pickup is disabled, the zone is disabled or the text is filled', async () => {
    await setInstructions(null);
    await setZone({ enabled: true, pickupEnabled: false });
    expect(await settingsNeedingAttention()).not.toContain('pickupInstructionsHe');
    await setZone({ enabled: false, pickupEnabled: true });
    expect(await settingsNeedingAttention()).not.toContain('pickupInstructionsHe');
    await setZone({ enabled: true, pickupEnabled: true });
    await setInstructions('איסוף בשבת');
    expect(await settingsNeedingAttention()).not.toContain('pickupInstructionsHe');
  });
});
