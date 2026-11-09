// Shared by the catalog integration tests (T044, T045, T046, seed).
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { adminUser } from '@/server/db/schema';
import type { Actor } from '@/server/catalog/result';
import { createFsStorage } from '@/server/storage/fs';
import type { Storage } from '@/server/storage/storage';
import type { TestDb } from '../setup/pglite';

export interface TestStorage {
  storage: Storage;
  dir: string;
  cleanup: () => Promise<void>;
}

export async function makeTestStorage(): Promise<TestStorage> {
  const dir = await mkdtemp(join(tmpdir(), 'catalog-test-'));
  return {
    storage: createFsStorage(dir),
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

/** Inserts an admin and returns the `Actor` the catalog functions take. */
export async function makeActor(db: TestDb, name = 'Aviva'): Promise<Actor> {
  const [row] = await db
    .insert(adminUser)
    .values({
      displayName: name,
      googleEmail: `${name.toLowerCase()}-${String(Math.random()).slice(2)}@example.test`,
    })
    .returning({ id: adminUser.id });
  return { adminId: row?.id ?? null, label: name };
}

/** A small valid photo (PNG), different colours give different bytes. */
export function photo(width = 640, height = 480, red = 200): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: red, g: 120, b: 60 } } })
    .png()
    .toBuffer();
}

export async function exists(
  storage: Storage,
  bucket: 'private' | 'public',
  key: string,
): Promise<boolean> {
  const object = await storage.get(bucket, key);
  if (!object) return false;
  await object.body.cancel();
  return true;
}
