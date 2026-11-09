import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFsStorage } from '@/server/storage/fs';
import type { Storage } from '@/server/storage/storage';

let dir: string;
let storage: Storage;

async function text(object: Awaited<ReturnType<Storage['get']>>): Promise<string> {
  if (!object) throw new Error('missing');
  return new Response(object.body).text();
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'storage-fs-'));
  storage = createFsStorage(dir);
});
afterAll(() => rm(dir, { recursive: true, force: true }));

describe('fs storage', () => {
  it('puts and gets an object with its content type', async () => {
    await storage.put('private', 'p/a/x-400.webp', Buffer.from('hello'), 'image/webp');
    const object = await storage.get('private', 'p/a/x-400.webp');
    expect(object?.contentType).toBe('image/webp');
    expect(await text(object)).toBe('hello');
  });

  it('returns null for a missing object and keeps buckets apart', async () => {
    expect(await storage.get('private', 'nope.webp')).toBeNull();
    expect(await storage.get('public', 'p/a/x-400.webp')).toBeNull();
  });

  it('copies between buckets, with an optional new key', async () => {
    await storage.copy('private', 'p/a/x-400.webp', 'public');
    expect(await text(await storage.get('public', 'p/a/x-400.webp'))).toBe('hello');
    await storage.copy('private', 'p/a/x-400.webp', 'public', 'q/y-400.webp');
    expect(await text(await storage.get('public', 'q/y-400.webp'))).toBe('hello');
  });

  it('deletes one object and a whole prefix', async () => {
    await storage.put('public', 'z/1.webp', Buffer.from('1'), 'image/webp');
    await storage.put('public', 'z/2.webp', Buffer.from('2'), 'image/webp');
    await storage.put('public', 'zz/3.webp', Buffer.from('3'), 'image/webp');
    await storage.delete('public', 'z/1.webp');
    expect(await storage.get('public', 'z/1.webp')).toBeNull();
    await storage.deletePrefix('public', 'z/');
    expect(await storage.get('public', 'z/2.webp')).toBeNull();
    expect(await storage.get('public', 'zz/3.webp')).not.toBeNull();
    await storage.deletePrefix('public', 'does/not/exist/');
  });

  it('builds public URLs for the dev route', () => {
    expect(storage.publicUrl('p/a/x-400.webp')).toBe('/dev-images/p/a/x-400.webp');
  });

  it('rejects keys that escape the bucket', async () => {
    await expect(
      storage.put('private', '../escape', Buffer.from('x'), 'image/webp'),
    ).rejects.toThrow();
    await expect(storage.get('private', 'a/../../b')).rejects.toThrow();
    await expect(storage.deletePrefix('private', '')).rejects.toThrow();
  });
});
