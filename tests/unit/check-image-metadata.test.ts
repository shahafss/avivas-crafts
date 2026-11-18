import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processUpload } from '@/server/images/process';
import { checkImageMetadata } from '../../scripts/check-image-metadata';

// The check reads every format with sharp (exifr cannot read WebP), so the test builds a WebP and
// a JPEG that carry EXIF with GPS, Make and Model, and a clean WebP from the shop's own pipeline.
const EXIF = {
  IFD0: { Make: 'X', Model: 'Y' },
  IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '32/1 4/1 0/1' },
};

let dir = '';

function flat() {
  return sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 120, b: 60 } },
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'check-image-metadata-'));
  const processed = await processUpload(await flat().jpeg().withExif(EXIF).toBuffer());
  const variant = processed.variants[0];
  if (!variant) throw new Error('No variant');
  writeFileSync(join(dir, 'clean.webp'), variant.buffer);
  writeFileSync(join(dir, 'exif.webp'), await flat().webp().withExif(EXIF).toBuffer());
  writeFileSync(join(dir, 'exif.jpg'), await flat().jpeg().withExif(EXIF).toBuffer());
  writeFileSync(
    join(dir, 'xmp.webp'),
    await flat().webp().withXmp('<x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta>').toBuffer(),
  );
  writeFileSync(join(dir, 'note.txt'), 'not an image');
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('checkImageMetadata', () => {
  it('exits 0 for a WebP made by the shop pipeline', async () => {
    const result = await checkImageMetadata(join(dir, 'clean.webp'));
    expect(result).toEqual({ code: 0, line: 'clean: clean.webp' });
  });

  it('exits 1 for a WebP with EXIF and names the fields, not the values', async () => {
    const result = await checkImageMetadata(join(dir, 'exif.webp'));
    expect(result.code).toBe(1);
    expect(result.line).toMatch(/^metadata found: /);
    for (const field of ['GPS', 'Make', 'Model']) expect(result.line).toContain(field);
    expect(result.line).not.toMatch(/32|\bX\b|\bY\b/);
  });

  it('exits 1 for a JPEG with EXIF', async () => {
    const result = await checkImageMetadata(join(dir, 'exif.jpg'));
    expect(result.code).toBe(1);
    for (const field of ['GPS', 'Make', 'Model']) expect(result.line).toContain(field);
  });

  it('exits 1 for a WebP with XMP only and names XMP', async () => {
    const result = await checkImageMetadata(join(dir, 'xmp.webp'));
    expect(result).toEqual({ code: 1, line: 'metadata found: XMP' });
  });

  it('exits 2 for a missing path', async () => {
    const result = await checkImageMetadata(join(dir, 'missing.webp'));
    expect(result.code).toBe(2);
    expect(result.line).toMatch(/^error: /);
  });

  it('exits 2 for a file that is not an image', async () => {
    const result = await checkImageMetadata(join(dir, 'note.txt'));
    expect(result.code).toBe(2);
    expect(result.line).toMatch(/^error: /);
  });
});
