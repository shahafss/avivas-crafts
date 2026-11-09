import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPgTestDb, type PgTestDb } from '../setup/pg';
import { emailOutbox } from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import type { EmailDriver } from '@/server/email/drivers/types';
import { drainOutbox } from '@/server/email/sender';

let pg: PgTestDb;

vi.mock('@/server/db/client', () => ({
  get db() {
    return pg.a;
  },
}));
vi.mock('@/server/env', () => ({
  getEnv: () => ({ EMAIL_FROM: 'shop@example.test', EMAIL_DRIVER: 'outbox', APP_ENV: 'test' }),
}));

beforeAll(async () => {
  pg = await createPgTestDb();
  await runSeed(pg.a, { samples: false });
});
afterAll(() => pg.close());

function slowDriver(sent: string[]): EmailDriver {
  return {
    keepBodies: false,
    send: async (message) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      sent.push(message.to);
    },
  };
}

const row = (name: string) => ({
  kind: 'order-confirmation',
  toAddress: `${name}@example.test`,
  locale: 'he' as const,
  subject: 'Subject',
  dedupeKey: name,
});

describe('outbox concurrency (real PostgreSQL)', () => {
  it('two drains on two connections never send the same row', async () => {
    await pg.a
      .insert(emailOutbox)
      .values(Array.from({ length: 12 }, (_, i) => row(`race-${String(i)}`)));
    const sent: string[] = [];
    const driver = slowDriver(sent);
    const [first, second] = await Promise.all([
      drainOutbox({ driver, database: pg.a, limit: 12 }),
      drainOutbox({ driver, database: pg.b, limit: 12 }),
    ]);
    expect(first + second).toBe(12);
    expect(new Set(sent).size).toBe(12);
    expect(sent).toHaveLength(12);
  });

  it('picks up a row left in sending once its lease has expired', async () => {
    const now = new Date();
    await pg.a.insert(emailOutbox).values([
      { ...row('stale'), status: 'sending', lockedUntil: new Date(now.getTime() - 1000) },
      { ...row('leased'), status: 'sending', lockedUntil: new Date(now.getTime() + 60_000) },
    ]);
    const sent: string[] = [];
    await drainOutbox({ driver: slowDriver(sent), database: pg.b, now });
    expect(sent).toEqual(['stale@example.test']);
  });
});
