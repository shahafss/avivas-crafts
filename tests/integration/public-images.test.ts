import sharp from 'sharp';
import { asc, eq, isNotNull, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { exists, makeActor, makeTestStorage, photo, type TestStorage } from '../helpers/catalog';
import { adminActivity, product, productImage } from '@/server/db/schema';
import { runSeed } from '@/server/db/seed';
import type { Actor } from '@/server/catalog/result';
import { createCategory } from '@/server/catalog/categories';
import {
  addImage,
  adminImageUrl,
  deleteImagesOfProduct,
  listImages,
  purgeDeletedImagesTask,
  removeImage,
  reorderImages,
  setImageAlt,
  setMainImage,
} from '@/server/catalog/images';
import {
  createProduct,
  deleteProduct,
  setProductState,
  updateProduct,
} from '@/server/catalog/products';
import { syncPublicImages } from '@/server/catalog/public-images';
import { listPublishedProducts } from '@/server/catalog/public-queries';
import { dailyTasks } from '@/server/jobs/daily-maintenance';

let testDb: TestDbHandle;
let files: TestStorage;
let actor: Actor;

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));
vi.mock('@/server/storage', () => ({
  getStorage: () => files.storage,
}));

beforeAll(async () => {
  testDb = await createTestDb();
  files = await makeTestStorage();
});
beforeEach(async () => {
  await testDb.reset();
  await runSeed(testDb.db, { samples: false });
  actor = await makeActor(testDb.db);
});
afterAll(async () => {
  await testDb.close();
  await files.cleanup();
});

const WIDTHS = [400, 800, 1600] as const;

async function newProduct(): Promise<string> {
  const created = await createProduct(actor, { nameHe: 'בובה' });
  if (!created.ok) throw new Error('create failed');
  const cat = await createCategory(actor, { nameHe: 'נרות' });
  if (!cat.ok) throw new Error('category failed');
  const updated = await updateProduct(actor, created.data.id, {
    descriptionHe: 'תיאור',
    priceIlsMinor: 9000,
    categoryIds: [cat.data.id],
    prepTimeHe: 'שבוע',
  });
  if (!updated.ok) throw new Error('update failed');
  return created.data.id;
}

async function upload(
  productId: string,
  red = 200,
  width = 640,
  height = 480,
): Promise<{ id: string; key: string }> {
  const result = await addImage(actor, productId, await photo(width, height, red));
  if (!result.ok) throw new Error(`addImage failed: ${result.code}`);
  const [row] = await testDb.db.select().from(productImage).where(eq(productImage.id, result.id));
  return { id: result.id, key: row?.storageKey ?? '' };
}

function variantKeys(key: string): string[] {
  return WIDTHS.map((width) => `${key}-${String(width)}.webp`);
}

async function where(
  key: string,
): Promise<{ privateAll: boolean; publicAny: boolean; publicAll: boolean }> {
  const inPrivate = await Promise.all(
    variantKeys(key).map((k) => exists(files.storage, 'private', k)),
  );
  const inPublic = await Promise.all(
    variantKeys(key).map((k) => exists(files.storage, 'public', k)),
  );
  return {
    privateAll: inPrivate.every(Boolean),
    publicAny: inPublic.some(Boolean),
    publicAll: inPublic.every(Boolean),
  };
}

async function order(productId: string): Promise<string[]> {
  const rows = await testDb.db
    .select({ id: productImage.id })
    .from(productImage)
    .where(eq(productImage.productId, productId))
    .orderBy(asc(productImage.position));
  return rows.map((row) => row.id);
}

/** What the public catalog shows as the main photo (the public query, as the home page uses it). */
async function mainPhoto(productId: string): Promise<string | undefined> {
  const cards = await listPublishedProducts();
  return cards.find((card) => card.id === productId)?.image?.id;
}

describe('uploaded images', () => {
  it('land only in the private bucket as 400/800/1600 WebP with a random lowercase base32 key', async () => {
    const id = await newProduct();
    const { key } = await upload(id);
    expect(key).toMatch(/^p\/[a-z2-7]{26}$/);
    const state = await where(key);
    expect(state).toEqual({ privateAll: true, publicAny: false, publicAll: false });
    expect(adminImageUrl(key, 400)).toBe(`/api/admin/media/${key}-400.webp`);
    const [row] = await testDb.db.select().from(productImage);
    expect(row).toMatchObject({ width: 640, height: 480, position: 0, deletedAt: null });
  });

  it('are numbered 0..n-1 and limited to 12 non-deleted images', async () => {
    const id = await newProduct();
    const ids: string[] = [];
    for (let i = 0; i < 12; i += 1) ids.push((await upload(id, 10 + i)).id);
    expect(await order(id)).toEqual(ids);
    const refused = await addImage(actor, id, await photo());
    expect(refused).toEqual({ ok: false, code: 'too_many_images' });
    // A removed photo frees a slot.
    await removeImage(actor, id, ids[3] as string);
    expect((await addImage(actor, id, await photo())).ok).toBe(true);
  });

  it('reports processing errors by code and stores nothing', async () => {
    const id = await newProduct();
    const bad = await addImage(actor, id, Buffer.from('not a picture '.repeat(40)));
    expect(bad).toEqual({ ok: false, code: 'unsupported_type' });
    expect(await testDb.db.select().from(productImage)).toHaveLength(0);
  });

  it('refuses an unknown product', async () => {
    const result = await addImage(actor, '00000000-0000-4000-8000-000000000000', await photo());
    expect(result).toEqual({ ok: false, code: 'not_found' });
  });
});

describe('public bucket', () => {
  it('publish copies all variants of the non-deleted images; hide, draft and delete remove them', async () => {
    const id = await newProduct();
    const a = await upload(id, 20);
    const b = await upload(id, 90);
    const gone = await upload(id, 160);
    await removeImage(actor, id, gone.id);

    await setProductState(actor, id, 'publish');
    expect((await where(a.key)).publicAll).toBe(true);
    expect((await where(b.key)).publicAll).toBe(true);
    expect((await where(gone.key)).publicAny).toBe(false);
    // The private copies stay.
    expect((await where(a.key)).privateAll).toBe(true);

    await setProductState(actor, id, 'hide');
    expect((await where(a.key)).publicAny).toBe(false);
    expect((await where(b.key)).publicAny).toBe(false);
    expect((await where(a.key)).privateAll).toBe(true);

    await setProductState(actor, id, 'unhide');
    expect((await where(a.key)).publicAll).toBe(true);

    await setProductState(actor, id, 'draft');
    expect((await where(a.key)).publicAny).toBe(false);
    expect((await where(b.key)).publicAny).toBe(false);

    await setProductState(actor, id, 'publish');
    expect((await where(b.key)).publicAll).toBe(true);
    await deleteProduct(actor, id, { confirm: true });
    for (const key of [a.key, b.key, gone.key]) {
      expect(await where(key)).toMatchObject({ publicAny: false });
      expect((await where(key)).privateAll).toBe(false);
      for (const bucket of ['private', 'public'] as const) {
        for (const k of variantKeys(key))
          expect(await exists(files.storage, bucket, k)).toBe(false);
      }
    }
  });

  it('public copies carry no private-only objects and are served with the same bytes', async () => {
    const id = await newProduct();
    const a = await upload(id);
    await setProductState(actor, id, 'publish');
    const fromPrivate = await new Response(
      (await files.storage.get('private', `${a.key}-800.webp`))?.body,
    ).arrayBuffer();
    const fromPublic = await new Response(
      (await files.storage.get('public', `${a.key}-800.webp`))?.body,
    ).arrayBuffer();
    expect(Buffer.from(fromPublic).equals(Buffer.from(fromPrivate))).toBe(true);
  });

  it('removing an image removes its public copies, and adding a photo to a published product copies it at once', async () => {
    const id = await newProduct();
    const a = await upload(id, 30);
    const b = await upload(id, 60);
    await setProductState(actor, id, 'publish');

    const c = await upload(id, 120);
    expect((await where(c.key)).publicAll).toBe(true);

    await removeImage(actor, id, b.id);
    expect((await where(b.key)).publicAny).toBe(false);
    expect((await where(b.key)).privateAll).toBe(true); // soft delete: kept privately for 30 days
    expect((await where(a.key)).publicAll).toBe(true);
    expect((await where(c.key)).publicAll).toBe(true);
  });

  it('syncPublicImages is idempotent and tolerates a product without images', async () => {
    const id = await newProduct();
    await syncPublicImages(id);
    const a = await upload(id);
    await setProductState(actor, id, 'publish');
    await syncPublicImages(id);
    await syncPublicImages(id);
    expect((await where(a.key)).publicAll).toBe(true);
  });
});

describe('races and cost', () => {
  it('a product hidden while its new photo is being copied ends with no public files', async () => {
    const id = await newProduct();
    await upload(id, 20);
    await setProductState(actor, id, 'publish');
    const put = files.storage.put.bind(files.storage);
    let hidden = false;
    files.storage.put = async (...args) => {
      await put(...args);
      if (!hidden && args[0] === 'public') {
        hidden = true;
        // Another request hides the product in the middle of the copy (no sync of its own yet).
        await testDb.db.update(product).set({ state: 'hidden' }).where(eq(product.id, id));
      }
    };
    try {
      const added = await upload(id, 90);
      expect(hidden).toBe(true);
      expect((await where(added.key)).publicAny).toBe(false);
    } finally {
      files.storage.put = put;
    }
    const rows = await testDb.db.select({ key: productImage.storageKey }).from(productImage);
    for (const row of rows) expect((await where(row.key)).publicAny).toBe(false);
  });

  it('a photo added to a hidden product gets no public copy', async () => {
    const id = await newProduct();
    await upload(id, 20);
    await setProductState(actor, id, 'publish');
    await setProductState(actor, id, 'hide');
    const added = await upload(id, 90);
    expect((await where(added.key)).publicAny).toBe(false);
  });

  it('reordering and choosing the main photo copy nothing; adding a photo copies only its variants', async () => {
    const id = await newProduct();
    const a = await upload(id, 20);
    const b = await upload(id, 90);
    await setProductState(actor, id, 'publish');
    const put = files.storage.put.bind(files.storage);
    const puts: string[] = [];
    files.storage.put = async (...args) => {
      if (args[0] === 'public') puts.push(args[1]);
      await put(...args);
    };
    try {
      await reorderImages(actor, id, [b.id, a.id]);
      await setMainImage(actor, id, a.id);
      expect(puts).toEqual([]);
      const c = await upload(id, 160);
      expect(puts.sort()).toEqual(variantKeys(c.key).sort());
    } finally {
      files.storage.put = put;
    }
  });
});

describe('stored size', () => {
  it('width and height are those of the 1600 variant', async () => {
    const id = await newProduct();
    const wide = await upload(id, 20, 3000, 2000);
    const [row] = await testDb.db.select().from(productImage).where(eq(productImage.id, wide.id));
    const stored = await files.storage.get('private', `${wide.key}-1600.webp`);
    const meta = await sharp(
      Buffer.from(await new Response(stored?.body).arrayBuffer()),
    ).metadata();
    expect([row?.width, row?.height]).toEqual([1600, 1067]);
    expect([meta.width, meta.height]).toEqual([1600, 1067]);
    // A smaller photo is never upscaled: its own size.
    const small = await upload(id, 90, 640, 480);
    const [smallRow] = await testDb.db
      .select()
      .from(productImage)
      .where(eq(productImage.id, small.id));
    expect([smallRow?.width, smallRow?.height]).toEqual([640, 480]);
  });
});

describe('order of photos', () => {
  it('reorderImages and setMainImage change positions; main is position 0', async () => {
    const id = await newProduct();
    const [a, b, c] = [await upload(id, 20), await upload(id, 90), await upload(id, 160)] as [
      { id: string },
      { id: string },
      { id: string },
    ];
    await setProductState(actor, id, 'publish');
    expect(await mainPhoto(id)).toBe(a.id);

    await reorderImages(actor, id, [c.id, a.id, b.id]);
    expect(await order(id)).toEqual([c.id, a.id, b.id]);
    expect(await mainPhoto(id)).toBe(c.id);

    await setMainImage(actor, id, b.id);
    expect(await order(id)).toEqual([b.id, c.id, a.id]);
    expect(await mainPhoto(id)).toBe(b.id);
    const positions = (await listImages(id)).map((image) => image.position);
    expect(positions).toEqual([0, 1, 2]);
  });

  it('refuses a reorder that does not list exactly the current photos', async () => {
    const id = await newProduct();
    const a = await upload(id, 20);
    const b = await upload(id, 90);
    expect(await reorderImages(actor, id, [a.id])).toMatchObject({ ok: false });
    expect(await reorderImages(actor, id, [a.id, b.id, a.id])).toMatchObject({ ok: false });
    expect(
      await reorderImages(actor, id, [a.id, '00000000-0000-4000-8000-000000000000']),
    ).toMatchObject({
      ok: false,
    });
    expect(await order(id)).toEqual([a.id, b.id]);
  });

  it('removing the main photo makes the next one main, keeps positions contiguous, and a reorder right after succeeds', async () => {
    const id = await newProduct();
    const [a, b, c] = [await upload(id, 20), await upload(id, 90), await upload(id, 160)] as [
      { id: string },
      { id: string },
      { id: string },
    ];
    await setProductState(actor, id, 'publish');
    await removeImage(actor, id, a.id);

    const [removed] = await testDb.db.select().from(productImage).where(eq(productImage.id, a.id));
    expect(removed?.position).toBeNull();
    expect(removed?.deletedAt).toBeInstanceOf(Date);
    expect((await listImages(id)).map((image) => [image.id, image.position])).toEqual([
      [b.id, 0],
      [c.id, 1],
    ]);
    expect(await mainPhoto(id)).toBe(b.id);

    expect((await reorderImages(actor, id, [c.id, b.id])).ok).toBe(true);
    expect((await listImages(id)).map((image) => image.id)).toEqual([c.id, b.id]);
  });

  it('refuses to remove the last photo of a published product', async () => {
    const id = await newProduct();
    const a = await upload(id);
    await setProductState(actor, id, 'publish');
    expect(await removeImage(actor, id, a.id)).toMatchObject({ ok: false });
    await setProductState(actor, id, 'draft');
    expect((await removeImage(actor, id, a.id)).ok).toBe(true);
  });

  it('rejects an image that belongs to another product', async () => {
    const one = await newProduct();
    const two = await newProduct();
    const foreign = await upload(two);
    await upload(one);
    expect(await removeImage(actor, one, foreign.id)).toMatchObject({ ok: false });
    expect(await setMainImage(actor, one, foreign.id)).toMatchObject({ ok: false });
  });
});

describe('setImageAlt', () => {
  it('trims, empties to null, limits to 200 characters, refuses a foreign image, and logs activity', async () => {
    const id = await newProduct();
    const other = await newProduct();
    const a = await upload(id, 20);
    const foreign = await upload(other, 90);

    expect((await setImageAlt(actor, id, a.id, { altHe: '  שמלה אדומה  ', altEn: '   ' })).ok).toBe(
      true,
    );
    const [row] = await testDb.db.select().from(productImage).where(eq(productImage.id, a.id));
    expect([row?.altHe, row?.altEn]).toEqual(['שמלה אדומה', null]);

    expect((await setImageAlt(actor, id, a.id, { altHe: 'x'.repeat(200) })).ok).toBe(true);
    expect((await setImageAlt(actor, id, a.id, { altEn: 'x'.repeat(201) })).ok).toBe(false);

    const refused = await setImageAlt(actor, id, foreign.id, { altHe: 'לא שלי' });
    expect(refused).toMatchObject({
      ok: false,
      formError: 'admin.products.errors.image_not_found',
    });
    const [untouched] = await testDb.db
      .select()
      .from(productImage)
      .where(eq(productImage.id, foreign.id));
    expect(untouched?.altHe).toBeNull();

    const logged = await testDb.db
      .select()
      .from(adminActivity)
      .where(eq(adminActivity.targetId, id));
    expect(
      logged.some(
        (entry) =>
          entry.action === 'product.updated' &&
          (entry.details as { field?: string } | null)?.field === 'images',
      ),
    ).toBe(true);
  });
});

describe('daily purge of soft-deleted images', () => {
  it('is registered as a daily task and deletes only images removed more than 30 days ago', async () => {
    expect(dailyTasks.map((task) => task.name)).toContain('purge-deleted-images');
    expect(purgeDeletedImagesTask.name).toBe('purge-deleted-images');

    const id = await newProduct();
    const keep = await upload(id, 20);
    const recent = await upload(id, 90);
    const old = await upload(id, 160);
    await removeImage(actor, id, recent.id);
    await removeImage(actor, id, old.id);
    const now = new Date();
    await testDb.db
      .update(productImage)
      .set({ deletedAt: new Date(now.getTime() - 31 * 86_400_000) })
      .where(eq(productImage.id, old.id));
    await testDb.db
      .update(productImage)
      .set({ deletedAt: new Date(now.getTime() - 29 * 86_400_000) })
      .where(eq(productImage.id, recent.id));

    const summary = await purgeDeletedImagesTask.run(testDb.db, now);
    expect(summary).toContain('1');

    expect((await where(old.key)).privateAll).toBe(false);
    for (const k of variantKeys(old.key))
      expect(await exists(files.storage, 'private', k)).toBe(false);
    expect((await where(recent.key)).privateAll).toBe(true);
    expect((await where(keep.key)).privateAll).toBe(true);
    const remaining = await testDb.db.select({ id: productImage.id }).from(productImage);
    expect(remaining.map((row) => row.id).sort()).toEqual([keep.id, recent.id].sort());

    // Thirty days later the other one goes too, and kept images never do.
    const later = new Date(now.getTime() + 2 * 86_400_000);
    await purgeDeletedImagesTask.run(testDb.db, later);
    expect((await where(recent.key)).privateAll).toBe(false);
    expect((await where(keep.key)).privateAll).toBe(true);
    expect(
      await testDb.db.select().from(productImage).where(isNotNull(productImage.deletedAt)),
    ).toHaveLength(0);
    expect(
      await testDb.db.select().from(productImage).where(isNull(productImage.deletedAt)),
    ).toHaveLength(1);
  });
});

describe('deleteImagesOfProduct', () => {
  it('deletes private and public variants of all images, including soft-deleted ones', async () => {
    const id = await newProduct();
    const a = await upload(id, 20);
    const b = await upload(id, 90);
    await setProductState(actor, id, 'publish');
    await removeImage(actor, id, b.id);
    await deleteImagesOfProduct(id);
    for (const key of [a.key, b.key]) {
      for (const bucket of ['private', 'public'] as const) {
        for (const k of variantKeys(key))
          expect(await exists(files.storage, bucket, k)).toBe(false);
      }
    }
  });
});
