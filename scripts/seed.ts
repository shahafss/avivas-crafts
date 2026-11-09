import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';

// Local development: take settings from .env.local when it exists. Variables already set in the
// environment win (loadEnvFile never overrides them), so tests and CI keep control.
try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local: use the environment as it is.
}

// Reads DATABASE_URL and APP_ENV directly: the seed also runs on deploy and in E2E setup.
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const appEnv = process.env.APP_ENV ?? '';
// Samples only when APP_ENV is explicitly development or test (a missing value never counts).
const samples = ['development', 'test'].includes(appEnv) && !process.argv.includes('--no-samples');

const ssl = ['staging', 'production'].includes(appEnv) ? 'require' : false;
const client = postgres(url, { max: 1, ssl, onnotice: () => undefined });
try {
  await runSeed(drizzle(client, { schema }), { samples });
  console.log(`Seed done (samples: ${String(samples)})`);
} catch (error) {
  console.error('Seed failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
