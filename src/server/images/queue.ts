import 'server-only';

let tail: Promise<unknown> = Promise.resolve();

/** In-process FIFO: only one image is processed at a time (memory on the 512 MB instance). */
export function enqueueImageJob<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(job, job);
  tail = run.catch(() => undefined);
  return run;
}
