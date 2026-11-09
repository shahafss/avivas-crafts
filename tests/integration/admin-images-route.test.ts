import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { makeTestStorage, photo, type TestStorage } from '../helpers/catalog';
import { adminUser, product, productImage } from '@/server/db/schema';
import { createSession } from '@/server/auth/session';
import { GET as getMedia } from '@/app/api/admin/media/[...key]/route';
import { POST as postImage } from '@/app/api/admin/images/route';

let testDb: TestDbHandle;
let files: TestStorage;
const env = vi.hoisted(() => ({
  values: {
    APP_ENV: 'test',
    APP_ORIGIN: 'http://localhost:3100',
    SECRET_HMAC_KEY: Buffer.from('images-test-hmac-key-0123456789abcdef').toString('base64'),
  },
}));

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn),
}));
vi.mock('@/server/storage', () => ({ getStorage: () => files.storage }));
vi.mock('@/server/env', () => ({ getEnv: () => env.values }));
vi.mock('@/server/email/sender', () => ({ kickOutbox: vi.fn() }));

beforeAll(async () => {
  testDb = await createTestDb();
  files = await makeTestStorage();
});
afterAll(async () => {
  await testDb.close();
  await files.cleanup();
});

let adminId = '';
let productId = '';
let fullToken = '';
let pendingToken = '';

beforeEach(async () => {
  await testDb.reset();
  const [admin] = await testDb.db
    .insert(adminUser)
    .values({ displayName: 'Aviva', googleEmail: 'aviva@example.test' })
    .returning({ id: adminUser.id });
  adminId = admin?.id ?? '';
  const [row] = await testDb.db
    .insert(product)
    .values({ slug: 'p-aaaaaaaa', nameHe: 'בובה' })
    .returning({ id: product.id });
  productId = row?.id ?? '';
  fullToken = (await createSession(adminId, 'full')).token;
  pendingToken = (await createSession(adminId, 'pending_passkey', { purpose: 'sign_in' })).token;
});

interface UploadOptions {
  token?: string | null;
  origin?: string | null;
  file?: File | null;
  productId?: string;
}

async function upload(buffer: Buffer | null, options: UploadOptions = {}): Promise<Response> {
  const form = new FormData();
  if (options.file !== null) {
    form.set(
      'file',
      options.file ?? new File([new Uint8Array(buffer ?? [])], 'photo.png', { type: 'image/png' }),
    );
  }
  form.set('productId', options.productId ?? productId);
  const headers: Record<string, string> = {};
  const origin = options.origin === undefined ? 'http://localhost:3100' : options.origin;
  if (origin !== null) headers.Origin = origin;
  const token = options.token === undefined ? fullToken : options.token;
  if (token !== null) headers.Cookie = `__Host-ac_admin=${token}`;
  return postImage(
    new Request('http://localhost:3100/api/admin/images', { method: 'POST', headers, body: form }),
  );
}

describe('POST /api/admin/images', () => {
  it('401 without a session and without a full session', async () => {
    expect((await upload(await photo(), { token: null })).status).toBe(401);
    expect((await upload(await photo(), { token: pendingToken })).status).toBe(401);
    expect((await upload(await photo(), { token: 'bogus' })).status).toBe(401);
    expect(await testDb.db.select().from(productImage)).toHaveLength(0);
  });

  it('checks the session before looking at the size or the body (guard order)', async () => {
    const headers = {
      Origin: 'http://localhost:3100',
      'Content-Type': 'multipart/form-data; boundary=x',
    };
    const oversized = await postImage(
      new Request('http://localhost:3100/api/admin/images', {
        method: 'POST',
        headers: { ...headers, 'Content-Length': String(30 * 1024 * 1024) },
        body: 'x',
      }),
    );
    expect(oversized.status).toBe(401);
    const malformed = await postImage(
      new Request('http://localhost:3100/api/admin/images', {
        method: 'POST',
        headers,
        body: '--x\r\nthis is not a valid multipart body',
      }),
    );
    expect(malformed.status).toBe(401);
    // Signed in with a foreign Origin: 403 before the body is read as well.
    const foreign = await postImage(
      new Request('http://localhost:3100/api/admin/images', {
        method: 'POST',
        headers: {
          ...headers,
          Origin: 'https://evil.example',
          Cookie: `__Host-ac_admin=${fullToken}`,
          'Content-Length': String(30 * 1024 * 1024),
        },
        body: 'x',
      }),
    );
    expect(foreign.status).toBe(403);
  });

  it('403 with a foreign or missing Origin', async () => {
    const foreign = await upload(await photo(), { origin: 'https://evil.example' });
    expect(foreign.status).toBe(403);
    expect(await foreign.json()).toEqual({ error: 'bad_origin' });
    expect((await upload(await photo(), { origin: null })).status).toBe(403);
    expect(await testDb.db.select().from(productImage)).toHaveLength(0);
  });

  it('answers unsupported_type for a text file named .jpg', async () => {
    const file = new File(['this is only text\n'.repeat(40)], 'cute.jpg', { type: 'image/jpeg' });
    const response = await upload(null, { file });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'unsupported_type' });
  });

  it('answers too_large for a body over 20 MB, before parsing it (declared length and chunked)', async () => {
    const headers = {
      Origin: 'http://localhost:3100',
      Cookie: `__Host-ac_admin=${fullToken}`,
      'Content-Type': 'multipart/form-data; boundary=x',
    };
    // Declared by the client (browsers always send Content-Length).
    const declared = await postImage(
      new Request('http://localhost:3100/api/admin/images', {
        method: 'POST',
        headers: { ...headers, 'Content-Length': String(30 * 1024 * 1024) },
        body: 'x',
      }),
    );
    expect(declared.status).toBe(400);
    expect(await declared.json()).toEqual({ error: 'too_large' });

    // No Content-Length: the stream is cut as soon as it passes the limit.
    const chunk = new Uint8Array(1024 * 1024).fill(1);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= 40) controller.close();
        else {
          sent += 1;
          controller.enqueue(chunk);
        }
      },
    });
    const chunked = await postImage(
      new Request('http://localhost:3100/api/admin/images', {
        method: 'POST',
        headers,
        body: stream,
        duplex: 'half',
      } as RequestInit),
    );
    expect(chunked.status).toBe(400);
    expect(await chunked.json()).toEqual({ error: 'too_large' });
    expect(sent).toBeLessThan(40);
  });

  it('answers corrupt for a damaged photo and bad_request for a missing file or product', async () => {
    const png = await photo();
    const damaged = new File([new Uint8Array(png.subarray(0, 60))], 'x.png', { type: 'image/png' });
    expect(await (await upload(null, { file: damaged })).json()).toEqual({ error: 'corrupt' });
    const missingFile = await upload(null, { file: null });
    expect(missingFile.status).toBe(400);
    const missingProduct = await upload(await photo(), { productId: 'not-a-uuid' });
    expect(missingProduct.status).toBe(400);
    const unknown = await upload(await photo(), {
      productId: '00000000-0000-4000-8000-000000000000',
    });
    expect(unknown.status).toBe(404);
  });

  it('answers too_many_images after 12 images', async () => {
    for (let i = 0; i < 12; i += 1) {
      expect((await upload(await photo(64, 64, 10 + i))).status).toBe(201);
    }
    const response = await upload(await photo());
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'too_many_images' });
    expect(await testDb.db.select().from(productImage)).toHaveLength(12);
  });

  it('answers too_many_pixels for an image over the limit (header only)', async () => {
    // A tiny PNG whose header claims 8000x6875 = 55 MP.
    const { crc32 } = await import('node:zlib');
    const png = Buffer.from(await photo(1, 1));
    const ihdr = png.indexOf('IHDR');
    png.writeUInt32BE(8000, ihdr + 4);
    png.writeUInt32BE(6875, ihdr + 8);
    png.writeUInt32BE(crc32(png.subarray(ihdr, ihdr + 17)), ihdr + 17);
    const response = await upload(png);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'too_many_pixels' });
  });

  it('succeeds with {id, position, previewUrl}; positions increase; the response carries security headers', async () => {
    const first = await upload(await photo(640, 480, 20));
    expect(first.status).toBe(201);
    expect(first.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(first.headers.get('Cache-Control')).toBe('no-store');
    const a = (await first.json()) as { id: string; position: number; previewUrl: string };
    const second = (await (await upload(await photo(640, 480, 90))).json()) as typeof a;

    expect(a.position).toBe(0);
    expect(second.position).toBe(1);
    const [row] = await testDb.db.select().from(productImage).where(eq(productImage.id, a.id));
    expect(a.previewUrl).toBe(`/api/admin/media/${row?.storageKey ?? ''}-400.webp`);
    expect(a.previewUrl).toMatch(/^\/api\/admin\/media\/p\/[a-z2-7]{26}-400\.webp$/);
    // Stored privately only.
    const key = `${row?.storageKey ?? ''}-400.webp`;
    expect(await files.storage.get('private', key)).not.toBeNull();
    expect(await files.storage.get('public', key)).toBeNull();
  });
});

describe('GET /api/admin/media/[...key]', () => {
  function request(token: string | null): Request {
    return new Request('http://localhost:3100/api/admin/media/x', {
      headers: token === null ? {} : { Cookie: `__Host-ac_admin=${token}` },
    });
  }
  const params = (key: string) => ({ params: Promise.resolve({ key: key.split('/') }) });

  async function stored(): Promise<string> {
    const response = await upload(await photo(640, 480, 33));
    const body = (await response.json()) as { previewUrl: string };
    return body.previewUrl.replace('/api/admin/media/', '');
  }

  it('401 without a full session and with a pending session', async () => {
    const key = await stored();
    expect((await getMedia(request(null), params(key))).status).toBe(401);
    expect((await getMedia(request(pendingToken), params(key))).status).toBe(401);
  });

  it('401 before the key is looked at, even for a bad key', async () => {
    expect((await getMedia(request(null), params('p/../x-400.webp'))).status).toBe(401);
    expect((await getMedia(request(pendingToken), params('nonsense'))).status).toBe(401);
  });

  it('streams the private object with the image headers when signed in', async () => {
    const key = await stored();
    const response = await getMedia(request(fullToken), params(key));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(bytes.subarray(8, 12).toString('ascii')).toBe('WEBP');
  });

  it('404 for a missing key', async () => {
    const response = await getMedia(
      request(fullToken),
      params('p/aaaaaaaaaaaaaaaaaaaaaaaaaa-400.webp'),
    );
    expect(response.status).toBe(404);
  });

  it('rejects keys with .. or that do not match the pattern', async () => {
    for (const key of [
      'p/../orders/abc-400.webp',
      'p/a/../b-400.webp',
      'p/abc-500.webp',
      'p/abc-400.png',
      'x/abc-400.webp',
      'p/ABC-400.webp',
      'p/abc-400.webp/extra',
      'p//abc-400.webp',
      'p/abc%2F..%2Fx-400.webp',
    ]) {
      const response = await getMedia(request(fullToken), params(key));
      expect(response.status, key).toBe(400);
    }
  });

  it('serves order snapshot keys (orders/…) from the private bucket too', async () => {
    await files.storage.put(
      'private',
      'orders/abc_def-400.webp',
      Buffer.from('RIFFxxxxWEBP'),
      'image/webp',
    );
    const response = await getMedia(request(fullToken), params('orders/abc_def-400.webp'));
    expect(response.status).toBe(200);
  });
});
