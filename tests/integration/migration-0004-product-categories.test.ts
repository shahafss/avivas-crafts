import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const FULL_FOLDER = fileURLToPath(new URL('../../src/server/db/migrations', import.meta.url));

// Migration 0004 (007, data-model.md §5): the product_category join table replaces
// product.category_id, "featured" is created or reused as the last category, every piece is
// linked to it and the home row setting points at it. Not to be confused with
// migration-004.test.ts (migration 0003, "004" in the roadmap).
let tempFolder: string;
const opened: PGlite[] = [];

const CATEGORY_A = '00000000-0000-4000-8000-0000000000a1';
const CATEGORY_B = '00000000-0000-4000-8000-0000000000a2';
const PRODUCT_1 = '00000000-0000-4000-8000-0000000000b1';
const PRODUCT_2 = '00000000-0000-4000-8000-0000000000b2';
const PRODUCT_3 = '00000000-0000-4000-8000-0000000000b3';
const PRODUCT_4 = '00000000-0000-4000-8000-0000000000b4';

const SETTINGS = `INSERT INTO shop_settings (id, shop_name_he, business_name_he, business_reg_number,
  business_email, business_phone, business_address_he, notification_emails)
  VALUES (1, 'חנות', 'עסק', '1', 'a@example.test', '+972500000000', 'כתובת', ARRAY['n@example.test']);`;

/** A database at migration 0003 holding `data`, then migrated with the full folder. */
async function migrated(data: string): Promise<PGlite> {
  const client = new PGlite();
  opened.push(client);
  await migrate(drizzle(client), { migrationsFolder: tempFolder });
  await client.exec(data);
  await migrate(drizzle(client), { migrationsFolder: FULL_FOLDER });
  return client;
}

async function rows<T>(client: PGlite, query: string): Promise<T[]> {
  return (await client.query<T>(query)).rows;
}

beforeAll(() => {
  // Migrations 0000-0003 and a journal trimmed to them: the schema before this feature.
  tempFolder = mkdtempSync(join(tmpdir(), 'migration-0004-'));
  mkdirSync(join(tempFolder, 'meta'));
  const journal = JSON.parse(readFileSync(join(FULL_FOLDER, 'meta', '_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  const old = journal.entries.filter((entry) => entry.idx <= 3);
  expect(old).toHaveLength(4);
  for (const entry of old) {
    cpSync(join(FULL_FOLDER, `${entry.tag}.sql`), join(tempFolder, `${entry.tag}.sql`));
  }
  writeFileSync(
    join(tempFolder, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries: old }),
  );
  expect(journal.entries.find((entry) => entry.idx === 4)?.tag).toBe('0004_product_categories');
});

afterAll(async () => {
  for (const client of opened) await client.close();
  rmSync(tempFolder, { recursive: true, force: true });
});

describe('migration 0004 (several categories per piece, the home row)', () => {
  it('keeps each piece in its category, links all of them to "featured" (last in order) and points the setting at it', async () => {
    const client = await migrated(`
      INSERT INTO category (id, slug, name_he, name_en, sort_order) VALUES
        ('${CATEGORY_A}', 'candles', 'נרות', 'Candles', 0),
        ('${CATEGORY_B}', 'ceramics', 'קרמיקה', 'Ceramics', 1);
      INSERT INTO product (id, slug, name_he, category_id, state) VALUES
        ('${PRODUCT_1}', 'one', 'אחד', '${CATEGORY_A}', 'published'),
        ('${PRODUCT_2}', 'two', 'שניים', '${CATEGORY_B}', 'draft'),
        ('${PRODUCT_3}', 'three', 'שלושה', NULL, 'draft'),
        ('${PRODUCT_4}', 'four', 'ארבעה', '${CATEGORY_A}', 'hidden');
      ${SETTINGS}
    `);

    const featured = await rows<{
      id: string;
      sort_order: number;
      name_he: string;
      name_en: string;
    }>(client, `SELECT id, sort_order, name_he, name_en FROM category WHERE slug = 'featured'`);
    expect(featured).toHaveLength(1);
    expect(featured[0]).toMatchObject({ sort_order: 2, name_he: 'מומלצות', name_en: 'Featured' });
    const featuredId = featured[0]?.id ?? '';

    const links = await rows<{ product_id: string; category_id: string }>(
      client,
      `SELECT product_id, category_id FROM product_category ORDER BY product_id, category_id`,
    );
    const linked = (productId: string) =>
      links.filter((link) => link.product_id === productId).map((link) => link.category_id);
    expect(linked(PRODUCT_1).sort()).toEqual([CATEGORY_A, featuredId].sort());
    expect(linked(PRODUCT_2).sort()).toEqual([CATEGORY_B, featuredId].sort());
    expect(linked(PRODUCT_3)).toEqual([featuredId]);
    // A hidden piece is linked to "featured" like every other piece.
    expect(linked(PRODUCT_4).sort()).toEqual([CATEGORY_A, featuredId].sort());
    expect(links).toHaveLength(7);

    const [setting] = await rows<{ home_category_id: string | null }>(
      client,
      `SELECT home_category_id FROM shop_settings WHERE id = 1`,
    );
    expect(setting?.home_category_id).toBe(featuredId);

    // The old column and its index are gone.
    const columns = await rows<{ column_name: string }>(
      client,
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'product' AND column_name = 'category_id'`,
    );
    expect(columns).toEqual([]);
    const indexes = await rows<{ indexname: string }>(
      client,
      `SELECT indexname FROM pg_indexes WHERE indexname = 'product_category_idx'`,
    );
    expect(indexes).toEqual([]);
  });

  it('reuses an existing "featured" category and keeps its place in the order', async () => {
    const client = await migrated(`
      INSERT INTO category (id, slug, name_he, name_en, sort_order) VALUES
        ('${CATEGORY_A}', 'featured', 'נבחרות', NULL, 0),
        ('${CATEGORY_B}', 'ceramics', 'קרמיקה', 'Ceramics', 1);
      INSERT INTO product (id, slug, name_he, category_id, state) VALUES
        ('${PRODUCT_1}', 'one', 'אחד', '${CATEGORY_B}', 'published');
      ${SETTINGS}
    `);
    const categories = await rows<{ id: string; slug: string; name_he: string }>(
      client,
      `SELECT id, slug, name_he FROM category ORDER BY sort_order`,
    );
    expect(categories.map((row) => row.slug)).toEqual(['featured', 'ceramics']);
    expect(categories[0]?.name_he).toBe('נבחרות');
    const links = await rows<{ category_id: string }>(
      client,
      `SELECT category_id FROM product_category WHERE product_id = '${PRODUCT_1}'`,
    );
    expect(links.map((link) => link.category_id).sort()).toEqual([CATEGORY_A, CATEGORY_B].sort());
    const [setting] = await rows<{ home_category_id: string | null }>(
      client,
      `SELECT home_category_id FROM shop_settings WHERE id = 1`,
    );
    expect(setting?.home_category_id).toBe(CATEGORY_A);
  });

  it('gives "featured" sort_order 0 on an empty category table', async () => {
    const client = await migrated(SETTINGS);
    const categories = await rows<{ slug: string; sort_order: number }>(
      client,
      `SELECT slug, sort_order FROM category`,
    );
    expect(categories).toEqual([{ slug: 'featured', sort_order: 0 }]);
  });
});
