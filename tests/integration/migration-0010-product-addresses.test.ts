import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const FULL_FOLDER = fileURLToPath(new URL('../../src/server/db/migrations', import.meta.url));

// Migration 0010 (010 FR-002, spec decision 5): the one-time rename of the live products' addresses.
// Like migration-0008-refresh-terms-privacy.test.ts: the schema through 0009, then the SQL of 0010.
let tempFolder: string;
let client: PGlite;
let migrationSql: string;

beforeAll(async () => {
  tempFolder = mkdtempSync(join(tmpdir(), 'migration-0010-'));
  mkdirSync(join(tempFolder, 'meta'));
  const journal = JSON.parse(readFileSync(join(FULL_FOLDER, 'meta', '_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  const old = journal.entries.filter((entry) => entry.idx <= 9);
  expect(old).toHaveLength(10);
  expect(old.find((entry) => entry.idx === 9)?.tag).toBe('0009_product_slug_nullable');
  expect(journal.entries.find((entry) => entry.idx === 10)?.tag).toBe('0010_product_addresses');
  for (const entry of old) {
    cpSync(join(FULL_FOLDER, `${entry.tag}.sql`), join(tempFolder, `${entry.tag}.sql`));
  }
  writeFileSync(
    join(tempFolder, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries: old }),
  );
  migrationSql = readFileSync(join(FULL_FOLDER, '0010_product_addresses.sql'), 'utf8');
  client = new PGlite();
  await migrate(drizzle(client), { migrationsFolder: tempFolder });
});

afterAll(async () => {
  await client.close();
  rmSync(tempFolder, { recursive: true, force: true });
});

beforeEach(async () => {
  await client.exec('DELETE FROM product');
});

async function seed(...slugs: string[]): Promise<void> {
  for (const slug of slugs) {
    await client.query(`INSERT INTO product (slug, name_he) VALUES ($1, 'מוצר')`, [slug]);
  }
}

async function slugs(): Promise<string[]> {
  const result = await client.query<{ slug: string }>(`SELECT slug FROM product ORDER BY slug`);
  return result.rows.map((row) => row.slug);
}

describe('migration 0010 (one-time product addresses)', () => {
  it('renames the products that exist, leaves the others alone, and a second run changes nothing', async () => {
    await seed('p-35xmobci', 'p-suzy3jpe', 'teddy-bear-in-a-dress', 'unrelated-piece');
    await client.exec(migrationSql);
    expect(await slugs()).toEqual(
      ['baby-rattle', 'boy-doll-2', 'teddy-girl', 'unrelated-piece'].sort(),
    );
    await client.exec(migrationSql);
    expect(await slugs()).toEqual(
      ['baby-rattle', 'boy-doll-2', 'teddy-girl', 'unrelated-piece'].sort(),
    );
  });

  it('changes nothing on a database that has none of the old addresses', async () => {
    await seed('something', 'else-entirely');
    await client.exec(migrationSql);
    expect(await slugs()).toEqual(['else-entirely', 'something']);
  });

  it('skips only the rename whose new address is already used by another product', async () => {
    await seed('p-hic726te', 'kitten', 'p-35xmobci');
    await client.exec(migrationSql);
    expect(await slugs()).toEqual(['baby-rattle', 'kitten', 'p-hic726te']);
  });
});
