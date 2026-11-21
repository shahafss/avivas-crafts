import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSeed } from '@/server/db/seed';

const DRAFTS = fileURLToPath(new URL('../../docs/legal-drafts', import.meta.url));
const FULL_FOLDER = fileURLToPath(new URL('../../src/server/db/migrations', import.meta.url));

// Migration 0008 (008 FR-038): marks the Terms and the Privacy Policy as not owner-edited, so the
// next seed replaces them with the new drafts. Like migration-0004-product-categories.test.ts.
let tempFolder: string;
let client: PGlite;

beforeAll(() => {
  // Migrations 0000-0007 and a journal trimmed to them: the schema before this migration.
  tempFolder = mkdtempSync(join(tmpdir(), 'migration-0008-'));
  mkdirSync(join(tempFolder, 'meta'));
  const journal = JSON.parse(readFileSync(join(FULL_FOLDER, 'meta', '_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  const old = journal.entries.filter((entry) => entry.idx <= 7);
  expect(old).toHaveLength(8);
  for (const entry of old) {
    cpSync(join(FULL_FOLDER, `${entry.tag}.sql`), join(tempFolder, `${entry.tag}.sql`));
  }
  writeFileSync(
    join(tempFolder, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries: old }),
  );
  expect(journal.entries.find((entry) => entry.idx === 8)?.tag).toBe('0008_refresh_terms_privacy');
  client = new PGlite();
});

afterAll(async () => {
  await client.close();
  rmSync(tempFolder, { recursive: true, force: true });
});

interface PageRow {
  slug: string;
  body_he: string;
  version: number;
  owner_edited: boolean;
}

async function pages(): Promise<Map<string, PageRow>> {
  const result = await client.query<PageRow>(
    `SELECT slug, body_he, version, owner_edited FROM content_page`,
  );
  return new Map(result.rows.map((row) => [row.slug, row]));
}

describe('migration 0008 (refresh of the Terms and the Privacy Policy)', () => {
  it('after the migration and the seed the edited terms hold the new draft, one version up, with a version row; the edited about page is untouched', async () => {
    await migrate(drizzle(client), { migrationsFolder: tempFolder });
    await runSeed(drizzle(client), { samples: false, contentDir: DRAFTS });
    // The live state before the deploy: the owner edited the terms and the about page.
    await client.exec(`
      UPDATE content_page SET body_he = 'התקנון של אביבה', owner_edited = true WHERE slug = 'terms';
      UPDATE content_page SET body_he = 'עלינו, בנוסח של אביבה', owner_edited = true WHERE slug = 'about';
    `);
    const before = await pages();
    const termsBefore = before.get('terms');
    expect(termsBefore?.version).toBe(1);

    await migrate(drizzle(client), { migrationsFolder: FULL_FOLDER });
    const migrated = await pages();
    expect(migrated.get('terms')?.owner_edited).toBe(false);
    expect(migrated.get('privacy')?.owner_edited).toBe(false);
    expect(migrated.get('about')?.owner_edited).toBe(true);

    await runSeed(drizzle(client), { samples: false, contentDir: DRAFTS });
    const after = await pages();
    const terms = after.get('terms');
    expect(terms?.body_he).not.toBe('התקנון של אביבה');
    expect(terms?.body_he).not.toContain('עוסק מורשה');
    expect(terms?.version).toBe((termsBefore?.version ?? 0) + 1);
    const versionRows = await client.query<{ version: number }>(
      `SELECT version FROM content_page_version WHERE slug = 'terms' AND version = 2`,
    );
    expect(versionRows.rows).toHaveLength(1);
    expect(after.get('about')).toMatchObject({
      body_he: 'עלינו, בנוסח של אביבה',
      version: before.get('about')?.version,
      owner_edited: true,
    });
  });
});
