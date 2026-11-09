// Applies the committed drizzle migrations. Reads DATABASE_URL directly (no src/server/env.ts),
// because E2E global-setup runs it with only the E2E environment.
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Local development: take settings from .env.local when it exists. Variables already set in the
// environment win (loadEnvFile never overrides them), so tests and CI keep control.
try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local: use the environment as it is.
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const migrationsFolder = fileURLToPath(new URL('../src/server/db/migrations', import.meta.url));
const ssl = ['staging', 'production'].includes(process.env.APP_ENV ?? '') ? 'require' : false;
const client = postgres(url, { max: 1, ssl, onnotice: () => undefined });

try {
  await migrate(drizzle(client), { migrationsFolder });
  console.log('Migrations applied');
} catch (error) {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await client.end();
}
