export async function register(): Promise<void> {
  if (
    process.env.NEXT_RUNTIME === 'nodejs' &&
    process.env.NEXT_PHASE !== 'phase-production-build'
  ) {
    // Fail fast with a clear message (no secret values) when the environment is invalid.
    const { getEnv } = await import('@/server/env');
    const env = getEnv();
    // Under APP_ENV=test the loop does not run: tests drive the tasks themselves.
    if (env.APP_ENV !== 'test') {
      const { startJobLoop } = await import('@/server/jobs/loop');
      startJobLoop();
    }
  }
}
