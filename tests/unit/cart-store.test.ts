import { beforeEach, describe, expect, it, vi } from 'vitest';

const P1 = '00000000-0000-4000-8000-000000000001';
const V1 = '00000000-0000-4000-8000-0000000000b1';
const memory = new Map<string, string>();

beforeEach(() => {
  memory.clear();
  vi.resetModules();
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    },
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

async function load(items: unknown[], extra: Record<string, unknown> = {}) {
  memory.set(
    'ac_cart_v1',
    JSON.stringify({ v: 1, updatedAt: new Date().toISOString(), items, ...extra }),
  );
  const store = await import('@/lib/cart/store');
  // `useCart` needs React; `addToCart` and friends read the same state, so read it through them.
  return store;
}

describe('cart store parsing', () => {
  it('keeps valid lines and drops lines with a malformed product or option id', async () => {
    const good = { productId: P1, optionValueIds: [V1], quantity: 2 };
    const store = await load([
      good,
      { productId: 'not-a-uuid', optionValueIds: [], quantity: 1 },
      { productId: P1, optionValueIds: ['nope'], quantity: 1 },
    ]);
    store.setQuantity(`${P1}:${V1}`, 3); // forces a load and a write
    const saved = JSON.parse(memory.get('ac_cart_v1') ?? '{}') as { items: { quantity: number }[] };
    expect(saved.items).toHaveLength(1);
    expect(saved.items[0]?.quantity).toBe(3);
  });

  it('drops lines older than 90 days and clamps the quantity to 20', async () => {
    const old = new Date(Date.now() - 91 * 86_400_000).toISOString();
    const store = await load([
      { productId: P1, optionValueIds: [], quantity: 1, addedAt: old },
      { productId: P1, optionValueIds: [V1], quantity: 99 },
    ]);
    const result = store.addToCart({ productId: P1, optionValueIds: [], quantity: 1 });
    expect(result).toEqual({ ok: true, count: 21 });
  });
});
