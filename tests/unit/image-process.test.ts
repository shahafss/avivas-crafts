import { readFileSync } from 'node:fs';
import { crc32 } from 'node:zlib';
import exifr from 'exifr';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ImageError,
  HEIC_MAX_PIXELS,
  MAX_BYTES,
  MAX_PIXELS,
  exceedsHeicPixelLimit,
  exceedsPixelLimit,
  processUpload,
  readHeicDimensions,
  type UploadErrorCode,
} from '@/server/images/process';

const heicSample = readFileSync(new URL('../fixtures/images/sample.heic', import.meta.url));

let jpegWithExif: Buffer;
let png: Buffer;
let webp: Buffer;
let gif: Buffer;

function flat(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } } });
}

async function codeOf(promise: Promise<unknown>): Promise<UploadErrorCode | 'no error'> {
  try {
    await promise;
    return 'no error';
  } catch (error) {
    if (error instanceof ImageError) return error.code;
    throw error;
  }
}

/** A 1x1 PNG whose header claims another size (header-only reads see the claimed size). */
async function pngClaiming(width: number, height: number): Promise<Buffer> {
  const buffer = Buffer.from(await flat(1, 1).png().toBuffer());
  const ihdr = buffer.indexOf('IHDR');
  buffer.writeUInt32BE(width, ihdr + 4);
  buffer.writeUInt32BE(height, ihdr + 8);
  buffer.writeUInt32BE(crc32(buffer.subarray(ihdr, ihdr + 17)), ihdr + 17);
  return buffer;
}

function box(type: string, ...payload: Buffer[]): Buffer {
  const body = Buffer.concat(payload);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length + 8, 0);
  head.write(type, 4, 'ascii');
  return Buffer.concat([head, body]);
}

/** Only the boxes needed to read the image size from a HEIF header. */
function fakeHeic(width: number, height: number, brand = 'heic'): Buffer {
  const ispe = Buffer.alloc(12);
  ispe.writeUInt32BE(width, 4);
  ispe.writeUInt32BE(height, 8);
  const ftyp = box('ftyp', Buffer.from(brand), Buffer.alloc(4), Buffer.from('mif1'));
  const meta = box('meta', Buffer.alloc(4), box('iprp', box('ipco', box('ispe', ispe))));
  return Buffer.concat([ftyp, meta]);
}

async function readTags(buffer: Buffer): Promise<Record<string, unknown> | undefined> {
  try {
    return (await exifr.parse(buffer, true)) as Record<string, unknown> | undefined;
  } catch {
    return undefined;
  }
}

async function variantInfo(buffer: Buffer) {
  return { metadata: await sharp(buffer).metadata(), exif: await readTags(buffer) };
}

beforeAll(async () => {
  jpegWithExif = await flat(4000, 3000)
    .jpeg({ quality: 70 })
    .withExif({
      IFD0: { Make: 'SecretCam', Model: 'Model X' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '32/1 4/1 0/1',
        GPSLongitudeRef: 'E',
        GPSLongitude: '34/1 46/1 0/1',
      },
    })
    .toBuffer();
  png = await flat(1000, 800).png().toBuffer();
  webp = await flat(1200, 900).webp().toBuffer();
  gif = await sharp(await flat(50, 50).png().toBuffer())
    .gif()
    .toBuffer();
});

describe('fixtures', () => {
  it('the source JPEG really carries GPS and the camera make', async () => {
    const tags = await readTags(jpegWithExif);
    expect(tags?.Make).toBe('SecretCam');
    expect(tags?.latitude).toBeTypeOf('number');
  });
});

describe('processUpload', () => {
  it('re-encodes a JPEG as WebP at 400/800/1600, without metadata', async () => {
    const result = await processUpload(jpegWithExif);
    expect(result.variants.map((v) => v.width)).toEqual([400, 800, 1600]);
    expect([result.width, result.height]).toEqual([4000, 3000]);
    for (const variant of result.variants) {
      const { metadata, exif } = await variantInfo(variant.buffer);
      expect(metadata.format).toBe('webp');
      expect(metadata.width).toBe(variant.width);
      expect(metadata.exif).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
      expect(metadata.iptc).toBeUndefined();
      expect(exif?.latitude).toBeUndefined();
      expect(exif?.Make).toBeUndefined();
      expect(exif?.Model).toBeUndefined();
    }
  });

  it('never upscales', async () => {
    const result = await processUpload(png);
    const widths = await Promise.all(
      result.variants.map(async (v) => (await sharp(v.buffer).metadata()).width),
    );
    expect(widths).toEqual([400, 800, 1000]);
    const small = await processUpload(await flat(300, 200).png().toBuffer());
    const smallWidths = await Promise.all(
      small.variants.map(async (v) => (await sharp(v.buffer).metadata()).width),
    );
    expect(smallWidths).toEqual([300, 300, 300]);
  });

  it('accepts PNG and WebP', async () => {
    expect((await processUpload(png)).variants).toHaveLength(3);
    expect((await processUpload(webp)).variants).toHaveLength(3);
  });

  it('applies the EXIF orientation', async () => {
    const rotated = await flat(1200, 600).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const result = await processUpload(rotated);
    expect([result.width, result.height]).toEqual([600, 1200]);
    const large = result.variants[2];
    const info = await sharp(large?.buffer).metadata();
    expect([info.width, info.height]).toEqual([600, 1200]);
  });

  it('accepts a HEIC photo and produces the same three variants without metadata', async () => {
    const result = await processUpload(heicSample);
    expect(result.variants.map((v) => v.width)).toEqual([400, 800, 1600]);
    expect([result.width, result.height]).toEqual([640, 480]);
    for (const variant of result.variants) {
      const { metadata } = await variantInfo(variant.buffer);
      expect(metadata.format).toBe('webp');
      expect(metadata.exif).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
      expect(metadata.iptc).toBeUndefined();
    }
  });

  it('rejects other types by content: unsupported_type', async () => {
    const text = Buffer.from('this is not a picture\n'.repeat(50));
    expect(await codeOf(processUpload(text))).toBe('unsupported_type');
    expect(await codeOf(processUpload(gif))).toBe('unsupported_type');
  });

  it('rejects AVIF before decoding, including AVIF files with a mif1 brand', async () => {
    expect(await codeOf(processUpload(fakeHeic(100, 100, 'avif')))).toBe('unsupported_type');
    expect(await codeOf(processUpload(fakeHeic(100, 100, 'avis')))).toBe('unsupported_type');
    const mif1WithAvif = Buffer.concat([
      box('ftyp', Buffer.from('mif1'), Buffer.alloc(4), Buffer.from('avif')),
      box('meta', Buffer.alloc(4)),
    ]);
    expect(await codeOf(processUpload(mif1WithAvif))).toBe('unsupported_type');
  });

  it('rejects files over 20 MB: too_large', async () => {
    const big = Buffer.concat([jpegWithExif.subarray(0, 4), Buffer.alloc(MAX_BYTES + 1)]);
    expect(await codeOf(processUpload(big))).toBe('too_large');
  });

  it('rejects images over 51,000,000 pixels: too_many_pixels', async () => {
    expect(await codeOf(processUpload(await pngClaiming(8000, 6875)))).toBe('too_many_pixels');
    expect(await codeOf(processUpload(fakeHeic(8000, 6875)))).toBe('too_many_pixels');
  });

  it('rejects a HEIC whose header exceeds HEIC_MAX_PIXELS without decoding it', async () => {
    // The fake carries no image data: a decode attempt would end in `corrupt`, so
    // `too_many_pixels` proves the header check ran first.
    const side = Math.ceil(Math.sqrt(HEIC_MAX_PIXELS)) + 1;
    expect(exceedsHeicPixelLimit(side, side)).toBe(true);
    expect(await codeOf(processUpload(fakeHeic(side, side)))).toBe('too_many_pixels');
    // A 50 MP phone HEIC (the T025 case) is over the HEIC limit but within the JPEG one.
    expect(exceedsPixelLimit(8160, 6144)).toBe(false);
    expect(await codeOf(processUpload(fakeHeic(8160, 6144)))).toBe('too_many_pixels');
    // At the limit the header check passes and decoding starts (the fake then fails as corrupt).
    expect(exceedsHeicPixelLimit(4000, HEIC_MAX_PIXELS / 4000)).toBe(false);
    expect(await codeOf(processUpload(fakeHeic(4000, HEIC_MAX_PIXELS / 4000)))).toBe('corrupt');
  });

  it('keeps 51,000,000 pixels for JPEG, PNG and WebP while HEIC has its own, lower limit', () => {
    expect(HEIC_MAX_PIXELS).toBeLessThan(MAX_PIXELS);
    expect(HEIC_MAX_PIXELS).toBeGreaterThanOrEqual(12_000_000);
    expect(HEIC_MAX_PIXELS).toBeLessThanOrEqual(16_000_000);
  });

  it('accepts a 50 MP phone photo size at the limit', () => {
    expect(MAX_PIXELS).toBe(51_000_000);
    expect(exceedsPixelLimit(8160, 6144)).toBe(false);
    expect(exceedsPixelLimit(8000, 6875)).toBe(true);
    expect(readHeicDimensions(fakeHeic(8160, 6144))).toEqual({ width: 8160, height: 6144 });
    expect(readHeicDimensions(heicSample)).toEqual({ width: 640, height: 480 });
  });

  it('rejects damaged files: corrupt', async () => {
    expect(await codeOf(processUpload(jpegWithExif.subarray(0, 3000)))).toBe('corrupt');
    const garbage = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);
    expect(await codeOf(processUpload(garbage))).toBe('corrupt');
    expect(await codeOf(processUpload(box('ftyp', Buffer.from('heic'), Buffer.alloc(4))))).toBe(
      'corrupt',
    );
    expect(await codeOf(processUpload(heicSample.subarray(0, 2000)))).toBe('corrupt');
  });
});
