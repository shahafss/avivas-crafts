import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../src/server/db/migrations', import.meta.url));

export type TestDb = ReturnType<typeof drizzle>;

export interface TestDbHandle {
  db: TestDb;
  client: PGlite;
  /** Empties every application table and restarts identities (keeps the schema). */
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * In-memory PostgreSQL (PGlite) with every migration from src/server/db/migrations applied.
 * Integration tests inject it, see tests/README.md.
 */
export async function createTestDb(): Promise<TestDbHandle> {
  const client = new PGlite();
  const db = drizzle(client);
  if (existsSync(MIGRATIONS_FOLDER)) {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  }

  const reset = async (): Promise<void> => {
    const tables = await client.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    if (tables.rows.length > 0) {
      const list = tables.rows.map((row) => `"public"."${row.tablename}"`).join(', ');
      await client.exec(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    }
    // RESTART IDENTITY does not touch standalone sequences such as order_number_seq.
    const sequences = await db.execute<{ sequencename: string; start_value: string }>(
      sql`SELECT sequencename, start_value FROM pg_sequences WHERE schemaname = 'public'`,
    );
    for (const seq of sequences.rows) {
      await db.execute(
        sql`SELECT setval(${`public."${seq.sequencename}"`}::regclass, ${seq.start_value}::bigint, false)`,
      );
    }
  };

  return { db, client, reset, close: () => client.close() };
}
