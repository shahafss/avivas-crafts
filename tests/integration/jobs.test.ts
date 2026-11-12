import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { adminSession, adminUser, jobRun, oauthFlow, rateLimitBucket } from '@/server/db/schema';
import { dailyTasks, type JobTask } from '@/server/jobs/daily-maintenance';
import { registerJobs, tick, type TaskSet } from '@/server/jobs/loop';

let testDb: TestDbHandle;

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));
vi.mock('@/server/email/sender', () => ({ drainOutbox: vi.fn(() => Promise.resolve(0)) }));

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());

function counting(name: string, results: { fail?: boolean } = {}): JobTask & { runs: number } {
  const task = {
    name,
    runs: 0,
    run: () => {
      task.runs += 1;
      return results.fail === true
        ? Promise.reject(new Error('boom'))
        : Promise.resolve(`run ${String(task.runs)}`);
    },
  };
  return task;
}

const t0 = new Date('2026-11-08T10:00:00Z');
const minutes = (n: number) => new Date(t0.getTime() + n * 60_000);
const row = async (job: string) =>
  (await testDb.db.select().from(jobRun).where(eq(jobRun.job, job)))[0];

describe('job loop', () => {
  it('registers one job_run row per task and keeps existing rows', async () => {
    const tasks: TaskSet = {
      minute: [counting('a')],
      fiveMinute: [counting('b')],
      daily: [counting('c')],
    };
    await registerJobs(testDb.db, tasks);
    await testDb.db.update(jobRun).set({ lastResult: 'kept' }).where(eq(jobRun.job, 'a'));
    await registerJobs(testDb.db, tasks);
    const rows = await testDb.db.select().from(jobRun);
    expect(rows.map((r) => r.job).sort()).toEqual(['a', 'b', 'c']);
    expect((await row('a'))?.lastResult).toBe('kept');
  });

  it('runs minute tasks on every tick and records the run', async () => {
    const task = counting('minute');
    const tasks: TaskSet = { minute: [task], fiveMinute: [], daily: [] };
    await registerJobs(testDb.db, tasks);
    await tick({ database: testDb.db, now: t0, tasks });
    await tick({ database: testDb.db, now: minutes(1), tasks });
    expect(task.runs).toBe(2);
    const saved = await row('minute');
    expect(saved?.lastStartedAt).toEqual(minutes(1));
    expect(saved?.lastFinishedAt).toBeInstanceOf(Date);
    expect(saved).toMatchObject({ lastResult: 'run 2', lockedUntil: null });
  });

  it('runs five-minute tasks only every five minutes', async () => {
    const task = counting('five');
    const tasks: TaskSet = { minute: [], fiveMinute: [task], daily: [] };
    await registerJobs(testDb.db, tasks);
    for (const at of [0, 1, 2, 3, 4, 5, 6])
      await tick({ database: testDb.db, now: minutes(at), tasks });
    expect(task.runs).toBe(2);
  });

  it('runs a daily task once per UTC day, also across restarts', async () => {
    const task = counting('daily');
    const tasks: TaskSet = { minute: [], fiveMinute: [], daily: [task] };
    await registerJobs(testDb.db, tasks);
    await tick({ database: testDb.db, now: t0, tasks });
    await tick({ database: testDb.db, now: minutes(1), tasks });
    // A restart registers again and ticks again on the same day.
    await registerJobs(testDb.db, tasks);
    await tick({ database: testDb.db, now: minutes(2), tasks });
    expect(task.runs).toBe(1);
    // Next UTC day: far ahead of the real clock, which records `last_finished_at` (a fixed date
    // here started failing on the day the suite ran past it).
    await tick({ database: testDb.db, now: new Date('2099-01-01T00:05:00Z'), tasks });
    expect(task.runs).toBe(2);
  });

  it('keeps going when a task fails, and records the failure', async () => {
    const bad = counting('bad', { fail: true });
    const good = counting('good');
    const tasks: TaskSet = { minute: [bad, good], fiveMinute: [], daily: [] };
    await registerJobs(testDb.db, tasks);
    await tick({ database: testDb.db, now: t0, tasks });
    expect(good.runs).toBe(1);
    expect(await row('bad')).toMatchObject({
      lastResult: 'failed',
      lockedUntil: null,
      lastFinishedAt: null,
    });
  });

  it('retries a failed daily task after ten minutes, not on every tick', async () => {
    const bad = counting('bad-daily', { fail: true });
    const tasks: TaskSet = { minute: [], fiveMinute: [], daily: [bad] };
    await registerJobs(testDb.db, tasks);
    await tick({ database: testDb.db, now: t0, tasks });
    await tick({ database: testDb.db, now: minutes(1), tasks });
    expect(bad.runs).toBe(1);
    await tick({ database: testDb.db, now: minutes(11), tasks });
    expect(bad.runs).toBe(2);
  });

  it('skips a task whose lease is still held', async () => {
    const task = counting('leased');
    const tasks: TaskSet = { minute: [task], fiveMinute: [], daily: [] };
    await registerJobs(testDb.db, tasks);
    await testDb.db
      .update(jobRun)
      .set({ lockedUntil: minutes(3) })
      .where(eq(jobRun.job, 'leased'));
    await tick({ database: testDb.db, now: minutes(1), tasks });
    expect(task.runs).toBe(0);
    await tick({ database: testDb.db, now: minutes(4), tasks });
    expect(task.runs).toBe(1);
  });
});

describe('daily maintenance tasks', () => {
  it('deletes expired rate limit buckets, OAuth flows and expired or idle sessions only', async () => {
    const now = t0;
    const past = new Date(now.getTime() - 1000);
    const future = new Date(now.getTime() + 3_600_000);
    await testDb.db.insert(rateLimitBucket).values([
      { key: 'old', count: 1, expiresAt: past },
      { key: 'new', count: 1, expiresAt: future },
    ]);
    await testDb.db.insert(oauthFlow).values([
      {
        stateHash: Buffer.from('old'),
        codeVerifier: 'v',
        nonce: 'n',
        expiresAt: past,
      },
      {
        stateHash: Buffer.from('new'),
        codeVerifier: 'v',
        nonce: 'n',
        expiresAt: future,
      },
    ]);
    const [admin] = await testDb.db
      .insert(adminUser)
      .values({ displayName: 'A', googleEmail: 'a@example.test', role: 'admin' })
      .returning();
    const adminId = admin?.id ?? '';
    await testDb.db.insert(adminSession).values([
      { tokenHash: Buffer.from('past-lifetime'), adminId, lastSeenAt: now, expiresAt: past },
      {
        tokenHash: Buffer.from('idle'),
        adminId,
        lastSeenAt: new Date(now.getTime() - 31 * 60_000),
        expiresAt: future,
      },
      {
        tokenHash: Buffer.from('active'),
        adminId,
        lastSeenAt: new Date(now.getTime() - 29 * 60_000),
        expiresAt: future,
      },
    ]);

    const tasks: TaskSet = { minute: [], fiveMinute: [], daily: dailyTasks };
    await registerJobs(testDb.db, tasks);
    await tick({ database: testDb.db, now, tasks });

    expect((await testDb.db.select().from(rateLimitBucket)).map((r) => r.key)).toEqual(['new']);
    expect(
      (await testDb.db.select().from(oauthFlow)).map((r) => Buffer.from(r.stateHash).toString()),
    ).toEqual(['new']);
    expect(
      (await testDb.db.select().from(adminSession))
        .map((r) => Buffer.from(r.tokenHash).toString())
        .sort(),
    ).toEqual(['active']);
  });
});
