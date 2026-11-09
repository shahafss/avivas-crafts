import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createPgTestDb, type PgTestDb } from '../setup/pg';
import { jobRun } from '@/server/db/schema';
import type { JobTask } from '@/server/jobs/daily-maintenance';
import { registerJobs, runLeased, tick, type TaskSet } from '@/server/jobs/loop';

let pg: PgTestDb;

vi.mock('@/server/db/client', () => ({
  get db() {
    return pg.a;
  },
}));
vi.mock('@/server/email/sender', () => ({ drainOutbox: vi.fn(() => Promise.resolve(0)) }));

beforeAll(async () => {
  pg = await createPgTestDb();
});
afterAll(() => pg.close());

function slow(name: string): JobTask & { runs: number } {
  const task = {
    name,
    runs: 0,
    run: async () => {
      task.runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
      return 'ok';
    },
  };
  return task;
}

describe('job lease (real PostgreSQL)', () => {
  it('stops two connections from running the same task at once', async () => {
    const task = slow('exclusive');
    const tasks: TaskSet = { minute: [task], fiveMinute: [], daily: [] };
    await registerJobs(pg.a, tasks);
    const now = new Date();
    const [first, second] = await Promise.all([
      runLeased(pg.a, task, now),
      runLeased(pg.b, task, now),
    ]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    expect(task.runs).toBe(1);
    expect(
      (await pg.a.select().from(jobRun).where(eq(jobRun.job, 'exclusive')))[0]?.lockedUntil,
    ).toBeNull();
  });

  it('takes over an expired lease', async () => {
    const task = slow('takeover');
    await registerJobs(pg.a, { minute: [task], fiveMinute: [], daily: [] });
    const now = new Date();
    await pg.a
      .update(jobRun)
      .set({ lockedUntil: new Date(now.getTime() - 1000) })
      .where(eq(jobRun.job, 'takeover'));
    expect(await runLeased(pg.b, task, now)).toBe(true);
    expect(task.runs).toBe(1);
  });

  it('does not take over a lease that is still valid', async () => {
    const task = slow('held');
    await registerJobs(pg.a, { minute: [task], fiveMinute: [], daily: [] });
    const now = new Date();
    await pg.a
      .update(jobRun)
      .set({ lockedUntil: new Date(now.getTime() + 60_000) })
      .where(eq(jobRun.job, 'held'));
    expect(await runLeased(pg.b, task, now)).toBe(false);
    expect(task.runs).toBe(0);
  });

  it('runs a daily task once even when two instances tick in turn or at the same time', async () => {
    const task = slow('daily-once');
    const tasks: TaskSet = { minute: [], fiveMinute: [], daily: [task] };
    await registerJobs(pg.a, tasks);
    const now = new Date();
    await Promise.all([tick({ database: pg.a, now, tasks }), tick({ database: pg.b, now, tasks })]);
    await tick({ database: pg.b, now: new Date(now.getTime() + 1000), tasks });
    expect(task.runs).toBe(1);
  });

  it('runs a five-minute task once per interval across two instances', async () => {
    const task = slow('five-once');
    const tasks: TaskSet = { minute: [], fiveMinute: [task], daily: [] };
    await registerJobs(pg.a, tasks);
    const now = new Date();
    await Promise.all([tick({ database: pg.a, now, tasks }), tick({ database: pg.b, now, tasks })]);
    await tick({ database: pg.b, now: new Date(now.getTime() + 60_000), tasks });
    expect(task.runs).toBe(1);
    await tick({ database: pg.a, now: new Date(now.getTime() + 5 * 60_000), tasks });
    expect(task.runs).toBe(2);
  });

  it('does not clear a lease that another instance took over meanwhile', async () => {
    const takenOver = new Date(Date.now() + 600_000);
    const task: JobTask = {
      name: 'lost-lease',
      run: async (db) => {
        await db.update(jobRun).set({ lockedUntil: takenOver }).where(eq(jobRun.job, 'lost-lease'));
        return 'ok';
      },
    };
    await registerJobs(pg.a, { minute: [task], fiveMinute: [], daily: [] });
    await runLeased(pg.a, task, new Date());
    const [row] = await pg.a.select().from(jobRun).where(eq(jobRun.job, 'lost-lease'));
    expect(row?.lockedUntil).toEqual(takenOver);
    expect(row?.lastFinishedAt).toBeNull();
  });
});
