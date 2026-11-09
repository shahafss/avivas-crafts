import 'server-only';
import { and, eq, isNull, lt, lte, or, type SQL } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { jobRun } from '@/server/db/schema';
import type { DbLike } from '@/server/db/types';
import { drainOutbox } from '@/server/email/sender';
import { log } from '@/server/security/logger';
import { dailyTasks, fiveMinuteTasks, minuteTasks, type JobTask } from './daily-maintenance';

const MINUTE_MS = 60_000;
const FIVE_MINUTES_MS = 5 * MINUTE_MS;
const RETRY_AFTER_MS = 10 * MINUTE_MS;
const DEFAULT_MAX_DURATION_MS = 5 * MINUTE_MS;
/** A tick is not exactly on time; a five-minute task is due a little before five minutes. */
const SLACK_MS = 5_000;

const outboxTask: JobTask = {
  name: 'outbox',
  maxDurationMs: 2 * MINUTE_MS,
  run: async () => `sent ${String(await drainOutbox())}`,
};

export interface TaskSet {
  minute: JobTask[];
  fiveMinute: JobTask[];
  daily: JobTask[];
}

export function defaultTasks(): TaskSet {
  return { minute: [outboxTask, ...minuteTasks], fiveMinute: fiveMinuteTasks, daily: dailyTasks };
}

export function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Inserts one `job_run` row per task name; existing rows are left alone. */
export async function registerJobs(database: DbLike, tasks: TaskSet): Promise<void> {
  const names = [...tasks.minute, ...tasks.fiveMinute, ...tasks.daily].map((task) => task.name);
  if (names.length === 0) return;
  await database
    .insert(jobRun)
    .values(names.map((job) => ({ job })))
    .onConflictDoNothing({ target: jobRun.job });
}

/**
 * Runs `task` if nobody else holds its lease (a row-level lease, not a session advisory lock,
 * which would leak on a connection pool). Returns whether it ran.
 */
export async function runLeased(
  database: DbLike,
  task: JobTask,
  now: Date,
  due?: SQL,
): Promise<boolean> {
  const leaseEnds = new Date(now.getTime() + (task.maxDurationMs ?? DEFAULT_MAX_DURATION_MS));
  const taken = await database
    .update(jobRun)
    .set({ lockedUntil: leaseEnds, lastStartedAt: now })
    // The due condition is part of the lease statement, so two instances cannot both pass it.
    .where(
      and(
        eq(jobRun.job, task.name),
        or(isNull(jobRun.lockedUntil), lt(jobRun.lockedUntil, now)),
        due,
      ),
    )
    .returning({ job: jobRun.job });
  if (taken.length === 0) return false;

  // Clearing only touches the row while this run still holds its own lease.
  const holdsLease = and(eq(jobRun.job, task.name), eq(jobRun.lockedUntil, leaseEnds));
  const started = Date.now();
  try {
    const result = await task.run(database, now);
    await database
      .update(jobRun)
      .set({ lastFinishedAt: new Date(), lastResult: result ?? 'ok', lockedUntil: null })
      .where(holdsLease);
  } catch (error) {
    // Not marked finished, so a daily task is tried again later.
    await database
      .update(jobRun)
      .set({ lastResult: 'failed', lockedUntil: null })
      .where(holdsLease);
    log.error('job_failed', {
      kind: task.name,
      errorCode: error instanceof Error ? error.name : 'unknown',
      durationMs: Date.now() - started,
    });
  }
  return true;
}

export interface TickOptions {
  database?: DbLike;
  now?: Date;
  tasks?: TaskSet;
}

/** One pass of the loop: minute tasks, then five-minute and daily tasks that are due. */
export async function tick({
  database = db,
  now = new Date(),
  tasks = defaultTasks(),
}: TickOptions = {}): Promise<void> {
  for (const task of tasks.minute) await runLeased(database, task, now);

  const fiveMinutesAgo = new Date(now.getTime() - (FIVE_MINUTES_MS - SLACK_MS));
  for (const task of tasks.fiveMinute) {
    await runLeased(
      database,
      task,
      now,
      or(isNull(jobRun.lastStartedAt), lte(jobRun.lastStartedAt, fiveMinutesAgo)),
    );
  }

  const today = utcDayStart(now);
  const retryBefore = new Date(now.getTime() - RETRY_AFTER_MS);
  for (const task of tasks.daily) {
    // Not finished today, and (after a failure) not tried in the last ten minutes.
    await runLeased(
      database,
      task,
      now,
      and(
        or(isNull(jobRun.lastFinishedAt), lt(jobRun.lastFinishedAt, today)),
        or(isNull(jobRun.lastStartedAt), lt(jobRun.lastStartedAt, retryBefore)),
      ),
    );
  }
}

let timer: ReturnType<typeof setInterval> | undefined;

/** Starts the in-process loop (every 60 s). Returns a function that stops it. */
export function startJobLoop(): () => void {
  if (timer) return () => undefined;
  const tasks = defaultTasks();
  let running = false;
  const pass = (): void => {
    if (running) return;
    running = true;
    tick({ tasks })
      .catch(() => {
        log.error('job_tick_failed');
      })
      .finally(() => {
        running = false;
      });
  };
  registerJobs(db, tasks)
    .then(pass)
    .catch(() => {
      log.error('job_register_failed');
    });
  timer = setInterval(pass, MINUTE_MS);
  timer.unref();
  return () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };
}
