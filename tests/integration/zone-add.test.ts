// `pnpm zone:add` (tasks.md T087): the logic behind the script.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { adminActivity, shippingZone, shippingZoneCountry } from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import { addZone } from '@/server/settings/zone-add';

let testDb: TestDbHandle;

beforeAll(async () => {
  testDb = await createTestDb();
});
afterAll(() => testDb.close());
beforeEach(async () => {
  await testDb.reset();
  await runSeed(testDb.db, { samples: false });
});

describe('addZone', () => {
  it('creates a disabled USD zone with its countries', async () => {
    const result = await addZone(testDb.db, {
      code: 'WORLD',
      nameHe: 'שאר העולם',
      nameEn: 'Rest of the world',
      countries: ['us', 'GB', 'us'],
    });
    expect(result).toEqual({ ok: true, code: 'WORLD', countries: ['US', 'GB'] });
    const [zone] = await testDb.db
      .select()
      .from(shippingZone)
      .where(eq(shippingZone.code, 'WORLD'));
    expect(zone).toMatchObject({
      currency: 'USD',
      enabled: false,
      shippingEnabled: false,
      pickupEnabled: false,
      nameEn: 'Rest of the world',
    });
    const countries = await testDb.db
      .select()
      .from(shippingZoneCountry)
      .where(eq(shippingZoneCountry.zoneId, zone?.id ?? ''));
    expect(countries.map((row) => row.countryCode).sort()).toEqual(['GB', 'US']);
    expect((await testDb.db.select().from(adminActivity)).map((row) => row.action)).toEqual([
      'zone.added',
    ]);
  });

  it('refuses a country that already belongs to a zone and creates nothing', async () => {
    const result = await addZone(testDb.db, {
      code: 'WORLD',
      nameHe: 'העולם',
      countries: ['US', 'IL'],
    });
    expect(result).toEqual({ ok: false, error: 'country_taken', countries: ['IL'] });
    expect(await testDb.db.select().from(shippingZone)).toHaveLength(1);
    expect(await testDb.db.select().from(shippingZoneCountry)).toHaveLength(1);
  });

  it('refuses a code that is taken and input that is not valid', async () => {
    await addZone(testDb.db, { code: 'WORLD', nameHe: 'העולם', countries: ['US'] });
    expect(await addZone(testDb.db, { code: 'WORLD', nameHe: 'שוב', countries: ['GB'] })).toEqual({
      ok: false,
      error: 'code_taken',
    });
    for (const bad of [
      { code: 'world', nameHe: 'x', countries: ['FR'] },
      { code: 'EU', nameHe: '', countries: ['FR'] },
      { code: 'EU', nameHe: 'x', countries: [] },
      { code: 'EU', nameHe: 'x', countries: ['FRA'] },
    ]) {
      expect(await addZone(testDb.db, bad)).toEqual({ ok: false, error: 'invalid' });
    }
    expect(await testDb.db.select().from(shippingZone)).toHaveLength(2);
  });
});
