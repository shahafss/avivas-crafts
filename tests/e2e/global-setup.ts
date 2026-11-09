import { execFileSync } from 'node:child_process';
import postgres from 'postgres';
import { startOidcMock } from '../../scripts/oidc-mock';
import { assertE2eDatabase, E2E_DATABASE_URL, OIDC_PORT, serverEnv } from './env';

/** Resets the e2e database, migrates and seeds it like a deploy, and starts the mock OIDC issuer. */
export default async function globalSetup(): Promise<() => Promise<void>> {
  assertE2eDatabase();
  const admin = postgres(E2E_DATABASE_URL, { max: 1, onnotice: () => undefined });
  try {
    await admin.unsafe('DROP SCHEMA IF EXISTS public CASCADE');
    await admin.unsafe('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await admin.unsafe('CREATE SCHEMA public');
  } finally {
    await admin.end();
  }

  const env = { ...process.env, ...serverEnv() };
  execFileSync('pnpm', ['db:migrate'], { env, stdio: 'inherit' });
  execFileSync('pnpm', ['db:seed'], { env, stdio: 'inherit' });

  const oidc = await startOidcMock(OIDC_PORT);
  return async () => {
    // Server-side keep-alive connections from the app can hold `stop()` open: do not wait for them.
    await Promise.race([oidc.stop(), new Promise((resolve) => setTimeout(resolve, 2000))]);
  };
}
