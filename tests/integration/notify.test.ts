import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { adminUser, emailOutbox, notificationThrottle, shopSettings } from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import { notifyAdmins } from '@/server/security/notify';

let testDb: TestDbHandle;

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));
vi.mock('@/server/email/sender', () => ({ kickOutbox: vi.fn() }));

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(async () => {
  await testDb.reset();
  await runSeed(testDb.db, { samples: false });
  await testDb.db
    .update(shopSettings)
    .set({ notificationEmails: ['Owner@Example.test', 'second@example.test'] });
  await testDb.db.insert(adminUser).values([
    { displayName: 'Aviva', googleEmail: 'aviva@example.test', role: 'admin' },
    { displayName: 'Dana', googleEmail: 'owner@example.test', role: 'admin' },
    // A user without the admin role never gets security alerts.
    { displayName: 'Guest', googleEmail: 'guest@example.test', role: 'user' },
  ]);
});
afterAll(() => testDb.close());

const t0 = new Date('2026-11-08T10:00:00Z');
const rows = () => testDb.db.select().from(emailOutbox);

describe('notifyAdmins', () => {
  it('emails every admin Google address and notification address once, and no user without the admin role', async () => {
    const queued = await notifyAdmins(
      'google_rejected',
      { at: t0, adminName: 'Dana' },
      { activityId: 'act-1', now: t0 },
    );
    expect(queued).toBe(3);
    const all = await rows();
    expect(all.map((r) => r.toAddress).sort()).toEqual([
      'aviva@example.test',
      'owner@example.test',
      'second@example.test',
    ]);
    expect(all.every((r) => r.kind === 'security-alert' && r.locale === 'he')).toBe(true);
  });

  it('puts the admin name in the body only, never in the subject', async () => {
    await notifyAdmins(
      'google_rejected',
      { at: t0, adminName: 'SentinelAdminName' },
      { activityId: 'act-2', now: t0 },
    );
    for (const row of await rows()) {
      expect(row.subject).not.toContain('SentinelAdminName');
      expect(row.subject).not.toMatch(/@/);
      expect(row.html).toContain('SentinelAdminName');
      expect(row.textBody).toContain('SentinelAdminName');
      expect(row.html).toContain('lang="he"');
    }
  });

  it('throttles the repeatable sign-in kinds to one email per kind per 15 minutes', async () => {
    expect(await notifyAdmins('google_rejected', { at: t0 }, { now: t0 })).toBe(3);
    const soon = new Date(t0.getTime() + 5 * 60_000);
    expect(await notifyAdmins('google_rejected', { at: soon }, { now: soon })).toBe(0);
    const later = new Date(t0.getTime() + 16 * 60_000);
    expect(await notifyAdmins('google_rejected', { at: later }, { now: later })).toBe(3);
    expect(
      (await rows()).filter((r) => r.dedupeKey.startsWith('security:google_rejected:')),
    ).toHaveLength(6);
    expect(await testDb.db.select().from(notificationThrottle)).toHaveLength(1);
  });

  it('rolls back with the caller transaction', async () => {
    await expect(
      testDb.db.transaction(async (tx) => {
        await notifyAdmins('google_rejected', { at: t0 }, { tx, now: t0 });
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(await rows()).toHaveLength(0);
    expect(await testDb.db.select().from(notificationThrottle)).toHaveLength(0);
  });
});
