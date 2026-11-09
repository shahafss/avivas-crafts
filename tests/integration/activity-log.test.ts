import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { adminActivity, adminUser } from '@/server/db/schema';
import { logActivity } from '@/server/activity/log';

let testDb: TestDbHandle;

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

const rows = () => testDb.db.select().from(adminActivity);

describe('logActivity', () => {
  it('drops details keys outside the allow-list', async () => {
    await logActivity(testDb.db, {
      adminId: null,
      actorKind: 'system',
      action: 'product.price_changed',
      targetType: 'product',
      targetId: 'p1',
      details: {
        oldPriceMinor: 1000,
        newPriceMinor: 1200,
        currency: 'ILS',
        slug: 'doll',
        email: 'someone@example.test',
        phone: '+972500000000',
        note: 'free text',
      },
    });
    const [row] = await rows();
    expect(row?.details).toEqual({
      oldPriceMinor: 1000,
      newPriceMinor: 1200,
      currency: 'ILS',
      slug: 'doll',
    });
  });

  it('drops nested objects and arrays, keeping only scalar values', async () => {
    await logActivity(testDb.db, {
      adminId: null,
      actorKind: 'system',
      action: 'x',
      details: {
        from: { email: 'someone@example.test' },
        to: ['a', 'b'],
        field: 'name',
        count: 2,
        state: true,
        slug: null,
        currency: undefined,
      },
    });
    expect((await rows())[0]?.details).toEqual({
      field: 'name',
      count: 2,
      state: true,
      slug: null,
    });
  });

  it('keeps every allowed key', async () => {
    const details = {
      from: 'a',
      to: 'b',
      oldPriceMinor: 1,
      newPriceMinor: 2,
      currency: 'ILS',
      field: 'name',
      count: 3,
      state: 'shipped',
      orderNumber: 1001,
      slug: 'x',
    };
    await logActivity(testDb.db, { adminId: null, actorKind: 'system', action: 'x', details });
    expect((await rows())[0]?.details).toEqual(details);
  });

  it('stores an unknown actor as unapproved_account with a null label and no admin', async () => {
    await logActivity(testDb.db, {
      adminId: null,
      actorKind: 'unapproved_account',
      actorLabel: 'stranger@example.test',
      action: 'signin.google_rejected',
    });
    const [row] = await rows();
    expect(row).toMatchObject({ actorKind: 'unapproved_account', actorLabel: null, adminId: null });
  });

  it('stores the admin and the display name at the time, and returns the row id', async () => {
    const [admin] = await testDb.db
      .insert(adminUser)
      .values({ displayName: 'Aviva', googleEmail: 'aviva@example.test' })
      .returning();
    const id = await logActivity(testDb.db, {
      adminId: admin?.id ?? null,
      actorKind: 'admin',
      actorLabel: 'Aviva',
      action: 'settings.updated',
    });
    const [row] = await rows();
    expect(row).toMatchObject({
      id,
      adminId: admin?.id,
      actorKind: 'admin',
      actorLabel: 'Aviva',
      details: {},
    });
  });

  it('is rolled back with its transaction', async () => {
    await expect(
      testDb.db.transaction(async (tx) => {
        await logActivity(tx, { adminId: null, actorKind: 'system', action: 'x' });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await rows()).toHaveLength(0);
  });
});
