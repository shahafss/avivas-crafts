import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { rateLimitBucket } from '@/server/db/schema';
import { checkRateLimit } from '@/server/security/rate-limit';

let testDb: TestDbHandle;

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));
vi.mock('@/server/env', () => ({
  getEnv: () => ({
    SECRET_HMAC_KEY: Buffer.from('rate-limit-test-key-0123456789abcdef').toString('base64'),
  }),
}));

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

const opts = { limit: 3, windowSec: 60 };
const t0 = new Date('2026-11-08T10:00:10Z');

describe('checkRateLimit', () => {
  it('allows up to the limit then blocks with a retry time', async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await checkRateLimit('contact', '203.0.113.7', { ...opts, now: t0 })).allowed).toBe(
        true,
      );
    }
    const blocked = await checkRateLimit('contact', '203.0.113.7', { ...opts, now: t0 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(50);
  });

  it('keeps scopes and subjects separate', async () => {
    for (let i = 0; i < 4; i += 1) await checkRateLimit('a', 'x', { ...opts, now: t0 });
    expect((await checkRateLimit('b', 'x', { ...opts, now: t0 })).allowed).toBe(true);
    expect((await checkRateLimit('a', 'y', { ...opts, now: t0 })).allowed).toBe(true);
  });

  it('rolls into a new window', async () => {
    for (let i = 0; i < 4; i += 1) await checkRateLimit('a', 'x', { ...opts, now: t0 });
    const later = new Date(t0.getTime() + 60_000);
    expect((await checkRateLimit('a', 'x', { ...opts, now: later })).allowed).toBe(true);
  });

  it('never stores the raw subject', async () => {
    const subject = '203.0.113.7';
    await checkRateLimit('contact', subject, { ...opts, now: t0 });
    const rows = await testDb.db.select().from(rateLimitBucket);
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(subject);
    expect(rows[0]?.key.startsWith('contact:')).toBe(true);
    expect(rows[0]?.expiresAt.getTime()).toBeGreaterThan(t0.getTime());
  });

  it('uses a different hash on a different UTC day', async () => {
    await checkRateLimit('a', 'x', { ...opts, now: t0 });
    await checkRateLimit('a', 'x', { ...opts, now: new Date('2026-11-09T10:00:10Z') });
    const rows = await testDb.db.select().from(rateLimitBucket);
    const hashes = new Set(rows.map((r) => r.key.split(':')[1]));
    expect(hashes.size).toBe(2);
  });

  it('rejects a window that does not divide a UTC day', async () => {
    await expect(checkRateLimit('a', 'x', { limit: 1, windowSec: 7 })).rejects.toThrow();
  });
});
