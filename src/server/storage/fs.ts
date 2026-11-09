import 'server-only';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { assertSafeKey, type Bucket, type Storage, type StoredObject } from './storage';

const CONTENT_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.json': 'application/json',
  '.sql': 'application/sql',
  '.gz': 'application/gzip',
};

/** Local-folder driver for development and tests: `<dataDir>/storage/<bucket>/<key>`. */
export function createFsStorage(dataDir: string, publicBase = '/dev-images'): Storage {
  const root = resolve(dataDir, 'storage');

  function pathFor(bucket: Bucket, key: string): string {
    assertSafeKey(key);
    const base = join(root, bucket);
    const full = resolve(base, key);
    if (!full.startsWith(base + sep)) throw new Error('Invalid storage key');
    return full;
  }

  async function exists(path: string): Promise<boolean> {
    try {
      return (await stat(path)).isFile();
    } catch {
      return false;
    }
  }

  return {
    async put(bucket, key, body) {
      const path = pathFor(bucket, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    },
    async get(bucket, key): Promise<StoredObject | null> {
      const path = pathFor(bucket, key);
      if (!(await exists(path))) return null;
      return {
        body: Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>,
        contentType: CONTENT_TYPES[extname(path)] ?? 'application/octet-stream',
      };
    },
    async copy(fromBucket, key, toBucket, toKey = key) {
      const from = pathFor(fromBucket, key);
      const to = pathFor(toBucket, toKey);
      await mkdir(dirname(to), { recursive: true });
      await copyFile(from, to);
    },
    async delete(bucket, key) {
      await rm(pathFor(bucket, key), { force: true });
    },
    async deletePrefix(bucket, prefix) {
      if (prefix === '') throw new Error('deletePrefix needs a prefix');
      assertSafeKey(prefix.replace(/\/$/, ''));
      const base = join(root, bucket);
      // Prefix semantics as in object stores: every key that starts with the string.
      const slash = prefix.lastIndexOf('/');
      const dir = slash === -1 ? base : resolve(base, prefix.slice(0, slash));
      const stem = prefix.slice(slash + 1);
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        if (entry.startsWith(stem)) await rm(join(dir, entry), { recursive: true, force: true });
      }
    },
    publicUrl(key) {
      assertSafeKey(key);
      return `${publicBase}/${key}`;
    },
  };
}

/** Test/readback helper kept out of the interface. */
export async function readFsObject(dataDir: string, bucket: Bucket, key: string): Promise<Buffer> {
  return readFile(join(resolve(dataDir, 'storage'), bucket, key));
}
