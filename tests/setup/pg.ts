import { randomBytes } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { TEMPLATE_DB } from './pg-constants';

export interface PgTestDb {
  /** Database name, `test_<random>`. */
  name: string;
  url: string;
  /** Two independent connections (separate sessions) for race and locking tests. */
  a: ReturnType<typeof drizzle>;
  b: ReturnType<typeof drizzle>;
  clientA: postgres.Sql;
  clientB: postgres.Sql;
  /** Ends both connections and drops the database. */
  close: () => Promise<void>;
}

/**
 * A fresh database cloned from the migrated template (drizzle-kit migrations hard-code the
 * `public` schema, so a schema per test file would not work). Call once per test file.
 */
export async function createPgTestDb(): Promise<PgTestDb> {
  const baseUrl = process.env.DATABASE_URL_TEST;
  if (!baseUrl) throw new Error('DATABASE_URL_TEST is not set');

  const name = `test_${randomBytes(6).toString('hex')}`;
  const admin = postgres(baseUrl, { max: 1, onnotice: () => undefined });
  try {
    await admin`CREATE DATABASE ${admin(name)} TEMPLATE ${admin(TEMPLATE_DB)}`;
  } finally {
    await admin.end();
  }

  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const clientA = postgres(url.toString(), { max: 1, onnotice: () => undefined });
  const clientB = postgres(url.toString(), { max: 1, onnotice: () => undefined });

  return {
    name,
    url: url.toString(),
    a: drizzle(clientA),
    b: drizzle(clientB),
    clientA,
    clientB,
    close: async () => {
      await clientA.end();
      await clientB.end();
      const dropper = postgres(baseUrl, { max: 1, onnotice: () => undefined });
      try {
        await dropper`DROP DATABASE IF EXISTS ${dropper(name)} WITH (FORCE)`;
      } finally {
        await dropper.end();
      }
    },
  };
}
