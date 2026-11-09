import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { TEMPLATE_DB } from './pg-constants';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../src/server/db/migrations', import.meta.url));

/** Runs once for the `pg` project: (re)builds the migrated template database. */
export default async function setup(): Promise<void> {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      'DATABASE_URL_TEST is not set. Start Postgres with `docker compose up -d db` and set it (see .env.example).',
    );
  }
  const admin = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await admin`DROP DATABASE IF EXISTS ${admin(TEMPLATE_DB)} WITH (FORCE)`;
    await admin`CREATE DATABASE ${admin(TEMPLATE_DB)}`;
  } finally {
    await admin.end();
  }

  const templateUrl = new URL(url);
  templateUrl.pathname = `/${TEMPLATE_DB}`;
  const template = postgres(templateUrl.toString(), { max: 1, onnotice: () => undefined });
  try {
    if (existsSync(MIGRATIONS_FOLDER)) {
      await migrate(drizzle(template), { migrationsFolder: MIGRATIONS_FOLDER });
    }
  } finally {
    // The template must have no open connections or CREATE DATABASE ... TEMPLATE fails.
    await template.end();
  }
}
