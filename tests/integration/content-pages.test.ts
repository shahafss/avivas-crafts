import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { makeActor } from '../helpers/catalog';
import { adminActivity, contentPage, contentPageVersion } from '@/server/db/schema';
import type { Actor } from '@/server/catalog/result';
import {
  getPage,
  getVersion,
  listPages,
  listVersions,
  updateContentPage,
} from '@/server/content/pages';
import { CONTENT_SLUGS } from '@/server/content/slugs';

let testDb: TestDbHandle;

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(async () => {
  await testDb.reset();
  await testDb.db.insert(contentPage).values(
    CONTENT_SLUGS.map((slug) => ({
      slug,
      titleHe: `כותרת ${slug}`,
      bodyHe: `גוף ${slug}`,
    })),
  );
});
afterAll(() => testDb.close());

type Input = Parameters<typeof updateContentPage>[1];

function input(overrides: Partial<Input> = {}): Input {
  return {
    slug: 'about',
    expectedVersion: 1,
    titleHe: 'אודות',
    bodyHe: 'טקסט חדש',
    titleEn: '',
    bodyEn: '',
    ...overrides,
  };
}

async function rowOf(slug: string) {
  const [row] = await testDb.db.select().from(contentPage).where(eq(contentPage.slug, slug));
  if (!row) throw new Error('row missing');
  return row;
}

const versionRows = () => testDb.db.select().from(contentPageVersion);

describe('getPage', () => {
  it('returns the English text when it exists', async () => {
    await testDb.db
      .update(contentPage)
      .set({ titleEn: 'About', bodyEn: 'English body' })
      .where(eq(contentPage.slug, 'about'));
    const page = await getPage('about', 'en');
    expect(page?.title).toEqual({ text: 'About', lang: 'en', fallback: false });
    expect(page?.body).toEqual({ text: 'English body', lang: 'en', fallback: false });
  });

  it('falls back to Hebrew when English is NULL or blank', async () => {
    const page = await getPage('about', 'en');
    expect(page?.title).toEqual({ text: 'כותרת about', lang: 'he', fallback: true });
    expect(page?.body).toEqual({ text: 'גוף about', lang: 'he', fallback: true });

    await testDb.db
      .update(contentPage)
      .set({ titleEn: '  ', bodyEn: '' })
      .where(eq(contentPage.slug, 'about'));
    const blank = await getPage('about', 'en');
    expect(blank?.title.lang).toBe('he');
    expect(blank?.body.fallback).toBe(true);
  });

  it('serves Hebrew pages without a fallback flag', async () => {
    const page = await getPage('about', 'he');
    expect(page?.body).toEqual({ text: 'גוף about', lang: 'he', fallback: false });
    expect(page?.version).toBe(1);
  });

  it('returns null for an unknown slug', async () => {
    expect(await getPage('nope', 'he')).toBeNull();
    expect(await getPage('../etc', 'en')).toBeNull();
  });
});

describe('listPages', () => {
  it('lists the seven pages in the fixed order', async () => {
    const pages = await listPages();
    expect(pages.map((page) => page.slug)).toEqual([...CONTENT_SLUGS]);
    expect(pages[0]).toMatchObject({ version: 1, ownerEdited: false });
  });
});

describe('updateContentPage validation', () => {
  it('requires a Hebrew title and body', async () => {
    const actor = await makeActor(testDb.db);
    const result = await updateContentPage(actor, input({ titleHe: ' ', bodyHe: '' }));
    expect(result).toEqual({
      ok: false,
      fieldErrors: {
        titleHe: 'admin.content.errors.title_required',
        bodyHe: 'admin.content.errors.body_required',
      },
    });
  });

  it('limits titles to 120 and bodies to 50,000 characters', async () => {
    const actor = await makeActor(testDb.db);
    const tooLong = await updateContentPage(
      actor,
      input({
        titleHe: 'x'.repeat(121),
        titleEn: 'x'.repeat(121),
        bodyHe: 'x'.repeat(50_001),
        bodyEn: 'x'.repeat(50_001),
      }),
    );
    expect(tooLong).toEqual({
      ok: false,
      fieldErrors: {
        titleHe: 'admin.content.errors.title_long',
        titleEn: 'admin.content.errors.title_long',
        bodyHe: 'admin.content.errors.body_long',
        bodyEn: 'admin.content.errors.body_long',
      },
    });
    const edge = await updateContentPage(
      actor,
      input({ titleHe: 'x'.repeat(120), bodyHe: 'x'.repeat(50_000) }),
    );
    expect(edge.ok).toBe(true);
    expect((await rowOf('about')).version).toBe(2);
  });

  it('writes nothing when validation fails', async () => {
    const actor = await makeActor(testDb.db);
    await updateContentPage(actor, input({ titleHe: '' }));
    expect((await rowOf('about')).version).toBe(1);
    expect(await testDb.db.select().from(adminActivity)).toHaveLength(0);
  });

  it('rejects an unknown slug without touching the database', async () => {
    const actor = await makeActor(testDb.db);
    const result = await updateContentPage(actor, input({ slug: 'nope' as never }));
    expect(result.ok).toBe(false);
    expect(await versionRows()).toHaveLength(0);
  });
});

describe('updateContentPage', () => {
  let actor: Actor;
  beforeEach(async () => {
    actor = await makeActor(testDb.db);
  });

  it('bumps the version by one, marks the page edited and stores empty English as NULL', async () => {
    const result = await updateContentPage(actor, input({ titleEn: '  ', bodyEn: '' }));
    expect(result).toEqual({ ok: true, data: { version: 2, unchanged: false } });
    const row = await rowOf('about');
    expect(row).toMatchObject({
      version: 2,
      ownerEdited: true,
      titleHe: 'אודות',
      bodyHe: 'טקסט חדש',
      titleEn: null,
      bodyEn: null,
    });
  });

  it('writes a content.updated activity row with only slug and version', async () => {
    await updateContentPage(actor, input());
    const rows = await testDb.db.select().from(adminActivity);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: 'content.updated',
      targetType: 'content_page',
      targetId: 'about',
      adminId: actor.adminId,
      details: { slug: 'about', to: 2 },
    });
  });

  it('returns unchanged and writes nothing for identical text', async () => {
    await updateContentPage(actor, input());
    const result = await updateContentPage(actor, input({ expectedVersion: 2 }));
    expect(result).toEqual({ ok: true, data: { version: 2, unchanged: true } });
    expect((await rowOf('about')).version).toBe(2);
    expect(await testDb.db.select().from(adminActivity)).toHaveLength(1);
  });

  it('does not mark a page edited when nothing changed', async () => {
    const original = await rowOf('about');
    const result = await updateContentPage(
      actor,
      input({ titleHe: original.titleHe, bodyHe: original.bodyHe }),
    );
    expect(result).toEqual({ ok: true, data: { version: 1, unchanged: true } });
    expect((await rowOf('about')).ownerEdited).toBe(false);
  });

  it('refuses a stale expectedVersion and changes nothing', async () => {
    await updateContentPage(actor, input());
    const result = await updateContentPage(actor, input({ expectedVersion: 1, bodyHe: 'אחר' }));
    expect(result).toEqual({ ok: false, formError: 'admin.content.errors.stale' });
    const row = await rowOf('about');
    expect(row.version).toBe(2);
    expect(row.bodyHe).toBe('טקסט חדש');
    expect(await testDb.db.select().from(adminActivity)).toHaveLength(1);
  });

  it('inserts exactly one version row for terms and privacy', async () => {
    await updateContentPage(
      actor,
      input({
        slug: 'terms',
        titleHe: 'תקנון',
        bodyHe: 'סעיף',
        titleEn: 'Terms',
        bodyEn: 'Clause',
      }),
    );
    await updateContentPage(
      actor,
      input({ slug: 'privacy', titleHe: 'פרטיות', bodyHe: 'מדיניות' }),
    );
    const rows = await versionRows();
    expect(rows).toHaveLength(2);
    const terms = rows.find((row) => row.slug === 'terms');
    expect(terms).toMatchObject({
      version: 2,
      titleHe: 'תקנון',
      bodyHe: 'סעיף',
      titleEn: 'Terms',
      bodyEn: 'Clause',
    });
    expect(rows.find((row) => row.slug === 'privacy')).toMatchObject({
      version: 2,
      titleEn: null,
      bodyEn: null,
    });
  });

  it('inserts no version row for the other pages', async () => {
    await updateContentPage(actor, input({ slug: 'about' }));
    await updateContentPage(actor, input({ slug: 'cookies' }));
    expect(await versionRows()).toHaveLength(0);
  });

  it('adds no version row for an unchanged or refused save', async () => {
    await updateContentPage(actor, input({ slug: 'terms' }));
    await updateContentPage(actor, input({ slug: 'terms', expectedVersion: 2 }));
    await updateContentPage(actor, input({ slug: 'terms', expectedVersion: 1, bodyHe: 'אחר' }));
    expect(await versionRows()).toHaveLength(1);
  });
});

describe('versions', () => {
  it('lists versions newest first and returns one copy', async () => {
    const actor = await makeActor(testDb.db);
    await updateContentPage(actor, input({ slug: 'terms', bodyHe: 'גרסה 2' }));
    await updateContentPage(actor, input({ slug: 'terms', expectedVersion: 2, bodyHe: 'גרסה 3' }));
    const list = await listVersions('terms');
    expect(list?.map((row) => row.version)).toEqual([3, 2]);
    const second = await getVersion('terms', 2);
    expect(second).toMatchObject({ slug: 'terms', version: 2, bodyHe: 'גרסה 2' });
    expect(await getVersion('terms', 9)).toBeNull();
    expect(await getVersion('terms', 0)).toBeNull();
  });

  it('knows nothing of versions for the other pages', async () => {
    expect(await listVersions('about')).toBeNull();
    expect(await getVersion('about', 1)).toBeNull();
    expect(await listVersions('nope')).toBeNull();
  });

  it('returns an empty list for terms or privacy with no recorded version', async () => {
    expect(await listVersions('privacy')).toEqual([]);
  });

  it('only ever grows: no call updates or deletes a version row', async () => {
    const actor = await makeActor(testDb.db);
    const sizes: number[] = [];
    const seen = new Map<string, unknown>();
    const check = async () => {
      const rows = await versionRows();
      sizes.push(rows.length);
      for (const row of rows) {
        const key = `${row.slug}@${String(row.version)}`;
        const previous = seen.get(key);
        if (previous !== undefined) expect(row).toEqual(previous);
        seen.set(key, row);
      }
    };
    await updateContentPage(actor, input({ slug: 'terms', bodyHe: 'א' }));
    await check();
    await updateContentPage(actor, input({ slug: 'terms', expectedVersion: 2, bodyHe: 'ב' }));
    await check();
    await updateContentPage(actor, input({ slug: 'terms', expectedVersion: 3, bodyHe: 'ב' }));
    await updateContentPage(actor, input({ slug: 'terms', expectedVersion: 1, bodyHe: 'ג' }));
    await updateContentPage(actor, input({ slug: 'privacy', bodyHe: 'ד' }));
    await getPage('terms', 'he');
    await listPages();
    await listVersions('terms');
    await getVersion('terms', 2);
    await check();
    expect(sizes).toEqual([1, 2, 3]);
  });
});
