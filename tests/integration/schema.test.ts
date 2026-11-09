import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import {
  adminUser,
  category,
  orderLine,
  orders,
  product,
  productImage,
  shippingZone,
} from '@/server/db/schema';

let testDb: TestDbHandle;

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a row');
  return value;
}

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

async function makeZone(): Promise<string> {
  const [zone] = await testDb.db
    .insert(shippingZone)
    .values({ code: 'IL', nameHe: 'ישראל', currency: 'ILS' })
    .returning({ id: shippingZone.id });
  return must(zone).id;
}

let counter = 0;
function orderValues(zoneId: string, overrides: Partial<typeof orders.$inferInsert> = {}) {
  counter += 1;
  return {
    publicTokenHash: Buffer.from(`token-${String(counter)}-${String(Math.random())}`),
    publicTokenExpiresAt: new Date(Date.now() + 86_400_000),
    locale: 'he' as const,
    zoneId,
    currency: 'ILS' as const,
    customerName: 'Dana Levi',
    customerPhone: '+972501234567',
    customerEmail: 'dana@example.test',
    deliveryMethod: 'pickup' as const,
    paymentMethod: 'offline' as const,
    subtotalMinor: 1000,
    totalMinor: 1000,
    termsAcceptedAt: new Date(),
    termsVersion: 1,
    privacyVersion: 1,
    ...overrides,
  };
}

async function makeCategory(name = 'c', sortOrder = 0): Promise<string> {
  const [row] = await testDb.db
    .insert(category)
    .values({ slug: `${name}-${String(sortOrder)}`, nameHe: 'קטגוריה', sortOrder })
    .returning({ id: category.id });
  return must(row).id;
}

async function makeProduct(categoryId: string | null = null, slug = 'p-1'): Promise<string> {
  const [row] = await testDb.db
    .insert(product)
    .values({ slug, nameHe: 'מוצר', categoryId })
    .returning({ id: product.id });
  return must(row).id;
}

function image(productId: string, position: number | null, key: string) {
  return { productId, storageKey: key, width: 10, height: 10, position };
}

describe('orders', () => {
  it('rejects a non-anonymised order without email or phone', async () => {
    const zoneId = await makeZone();
    await expect(
      testDb.db.insert(orders).values(orderValues(zoneId, { customerEmail: null })),
    ).rejects.toThrow();
    await expect(
      testDb.db.insert(orders).values(orderValues(zoneId, { customerPhone: null })),
    ).rejects.toThrow();
  });

  it('allows null contact details once anonymised', async () => {
    const zoneId = await makeZone();
    await testDb.db.insert(orders).values(
      orderValues(zoneId, {
        customerEmail: null,
        customerPhone: null,
        anonymizedAt: new Date(),
      }),
    );
  });

  it('rejects a duplicate (provider, provider_transaction_id)', async () => {
    const zoneId = await makeZone();
    const dup = { provider: 'payplus', providerTransactionId: 'tx-1' };
    await testDb.db.insert(orders).values(orderValues(zoneId, dup));
    await expect(testDb.db.insert(orders).values(orderValues(zoneId, dup))).rejects.toThrow();
  });

  it('starts order_number at 1001 and increments', async () => {
    const zoneId = await makeZone();
    const [first] = await testDb.db
      .insert(orders)
      .values(orderValues(zoneId))
      .returning({ n: orders.orderNumber });
    const [second] = await testDb.db
      .insert(orders)
      .values(orderValues(zoneId))
      .returning({ n: orders.orderNumber });
    expect(first?.n).toBe(1001);
    expect(second?.n).toBe(1002);
  });

  it('rejects order line quantity 0 and 21, accepts 1 and 20', async () => {
    const zoneId = await makeZone();
    const [order] = await testDb.db
      .insert(orders)
      .values(orderValues(zoneId))
      .returning({ id: orders.id });
    const line = (quantity: number) => ({
      orderId: must(order).id,
      productNameHe: 'מוצר',
      unitPriceMinor: 100,
      quantity,
      lineTotalMinor: 100 * quantity,
    });
    await expect(testDb.db.insert(orderLine).values(line(0))).rejects.toThrow();
    await expect(testDb.db.insert(orderLine).values(line(21))).rejects.toThrow();
    await testDb.db.insert(orderLine).values(line(1));
    await testDb.db.insert(orderLine).values(line(20));
  });
});

describe('catalog', () => {
  it('blocks deleting a category while a product references it', async () => {
    const categoryId = await makeCategory();
    await makeProduct(categoryId);
    await expect(testDb.db.delete(category).where(eq(category.id, categoryId))).rejects.toThrow();
  });

  it('does not allow two non-deleted images of one product to share a position at commit', async () => {
    const productId = await makeProduct();
    await expect(
      testDb.db.transaction(async (tx) => {
        await tx.insert(productImage).values(image(productId, 0, 'p/a'));
        await tx.insert(productImage).values(image(productId, 0, 'p/b'));
      }),
    ).rejects.toThrow();
  });

  it('allows swapping two positions inside one transaction', async () => {
    const productId = await makeProduct();
    await testDb.db
      .insert(productImage)
      .values([image(productId, 0, 'p/a'), image(productId, 1, 'p/b')]);
    await testDb.db.transaction(async (tx) => {
      await tx.update(productImage).set({ position: 1 }).where(eq(productImage.storageKey, 'p/a'));
      await tx.update(productImage).set({ position: 0 }).where(eq(productImage.storageKey, 'p/b'));
    });
    const rows = await testDb.db
      .select({ key: productImage.storageKey, position: productImage.position })
      .from(productImage)
      .orderBy(productImage.position);
    expect(rows).toEqual([
      { key: 'p/b', position: 0 },
      { key: 'p/a', position: 1 },
    ]);
  });

  it('allows any number of soft-deleted images with a null position', async () => {
    const productId = await makeProduct();
    await testDb.db
      .insert(productImage)
      .values([
        image(productId, null, 'p/a'),
        image(productId, null, 'p/b'),
        image(productId, null, 'p/c'),
      ]);
    const [count] = await testDb.db.select({ n: sql<number>`count(*)::int` }).from(productImage);
    expect(count?.n).toBe(3);
  });

  it('allows swapping category sort orders inside one transaction', async () => {
    const a = await makeCategory('a', 0);
    const b = await makeCategory('b', 1);
    await testDb.db.transaction(async (tx) => {
      await tx.update(category).set({ sortOrder: 1 }).where(eq(category.id, a));
      await tx.update(category).set({ sortOrder: 0 }).where(eq(category.id, b));
    });
    await expect(
      testDb.db.transaction(async (tx) => {
        await tx.update(category).set({ sortOrder: 0 }).where(eq(category.id, a));
      }),
    ).rejects.toThrow();
  });

  it('generates lower-cased search_text', async () => {
    const [row] = await testDb.db
      .insert(product)
      .values({ slug: 'p-s', nameHe: 'שלום', nameEn: 'Hello World' })
      .returning({ searchText: product.searchText });
    expect(row?.searchText).toContain('hello world');
  });
});

describe('check constraints', () => {
  it('requires admin_user.google_email to be lower-case', async () => {
    await expect(
      testDb.db.insert(adminUser).values({ displayName: 'A', googleEmail: 'Admin@Example.test' }),
    ).rejects.toThrow();
    await testDb.db
      .insert(adminUser)
      .values({ displayName: 'A', googleEmail: 'admin@example.test' });
  });

  it('enforces the slug format on category and product', async () => {
    for (const slug of ['Upper', 'has space', 'עברית', '', 'a'.repeat(61)]) {
      await expect(
        testDb.db.insert(category).values({ slug, nameHe: 'ק', sortOrder: 50 }),
      ).rejects.toThrow();
      await expect(testDb.db.insert(product).values({ slug, nameHe: 'מ' })).rejects.toThrow();
    }
    await testDb.db.insert(category).values({ slug: 'ok-slug-1', nameHe: 'ק', sortOrder: 50 });
    await testDb.db.insert(product).values({ slug: 'ok-slug-1', nameHe: 'מ' });
  });
});
