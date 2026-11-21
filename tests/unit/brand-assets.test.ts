import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { checkImageMetadata } from '../../scripts/check-image-metadata';
import { BUDGETS, EXPECTED_DISC, LOGO_SIZES } from '../../src/lib/brand/config';

// contracts/brand-assets.md "Tests" (FR-024 to FR-030, research R9, R11, R12).
const ROOT = process.cwd();
const BRAND_DIR = join(ROOT, 'public/brand');
const MANIFEST_PATH = join(ROOT, 'src/lib/brand/manifest.json');

interface Entry {
  file: string;
  width: number;
  height: number;
}
interface BrandManifest {
  appleTouchIcon: Entry;
  disc: { cx: number; cy: number; r: number };
  icon32: Entry;
  icons: Entry[];
  logo: Entry[];
  og: Entry;
}

function loadManifest(): BrandManifest {
  expect(existsSync(MANIFEST_PATH), 'src/lib/brand/manifest.json (run pnpm brand:assets)').toBe(
    true,
  );
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as BrandManifest;
}

function allEntries(m: BrandManifest): Entry[] {
  return [...m.logo, m.icon32, m.appleTouchIcon, ...m.icons, m.og];
}

async function alphaAt(file: string, points: [number, number][]): Promise<number[]> {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return points.map(([x, y]) => data[(y * info.width + x) * info.channels + 3] ?? -1);
}

describe('brand assets', () => {
  it('lists only files that exist, with the real dimensions, formats and hashed names', async () => {
    const m = loadManifest();
    expect(m.logo.map((e) => e.width)).toEqual([...LOGO_SIZES]);
    expect(m.icons.map((e) => e.width)).toEqual([192, 512]);
    for (const entry of allEntries(m)) {
      const path = join(BRAND_DIR, entry.file);
      expect(existsSync(path), entry.file).toBe(true);
      expect(entry.file, entry.file).toMatch(/^[a-z0-9-]+\.[0-9a-f]{8}\.(webp|png|jpg)$/);
      const meta = await sharp(path).metadata();
      expect([meta.width, meta.height], `${entry.file} dimensions`).toEqual([
        entry.width,
        entry.height,
      ]);
    }
    for (const entry of m.logo) {
      expect((await sharp(join(BRAND_DIR, entry.file)).metadata()).format).toBe('webp');
    }
    expect((await sharp(join(BRAND_DIR, m.og.file)).metadata()).format).toBe('jpeg');
  });

  it('keeps every file within its budget', () => {
    const m = loadManifest();
    const size = (file: string): number => statSync(join(BRAND_DIR, file)).size;
    for (const entry of m.logo)
      expect(size(entry.file), entry.file).toBeLessThanOrEqual(BUDGETS.logo);
    for (const entry of [m.icon32, m.appleTouchIcon, ...m.icons]) {
      expect(size(entry.file), entry.file).toBeLessThanOrEqual(BUDGETS.png);
    }
    expect(size(m.og.file)).toBeLessThanOrEqual(BUDGETS.og);
    expect(statSync(join(ROOT, 'public/favicon.ico')).size).toBeLessThanOrEqual(BUDGETS.favicon);
  });

  it('cuts the 336 px logo out of the checkerboard: transparent outside the disc, opaque inside', async () => {
    const m = loadManifest();
    const logo = m.logo.find((e) => e.width === 336);
    expect(logo).toBeDefined();
    const path = join(BRAND_DIR, logo?.file ?? '');
    const n = 336;
    const c = n / 2;
    const off = Math.round((c + 3) / Math.SQRT2); // 3 px outside the disc edge, on a diagonal
    const corners = await alphaAt(path, [
      [0, 0],
      [n - 1, 0],
      [0, n - 1],
      [n - 1, n - 1],
    ]);
    expect(corners).toEqual([0, 0, 0, 0]);
    const outside = await alphaAt(path, [
      [Math.round(c - off), Math.round(c - off)],
      [Math.round(c + off) - 1, Math.round(c - off)],
      [Math.round(c - off), Math.round(c + off) - 1],
      [Math.round(c + off) - 1, Math.round(c + off) - 1],
    ]);
    expect(outside).toEqual([0, 0, 0, 0]);
    expect(await alphaAt(path, [[c, c]])).toEqual([255]);
    // The cream rim is kept: a point on the cream band (just inside the disc edge) is opaque.
    expect(await alphaAt(path, [[c, 3]])).toEqual([255]);
  });

  it('writes favicon.ico with 16, 32 and 48 px PNG entries', async () => {
    const ico = readFileSync(join(ROOT, 'public/favicon.ico'));
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    expect(ico.readUInt16LE(4)).toBe(3);
    const sizes: number[] = [];
    for (let i = 0; i < 3; i++) {
      const at = 6 + i * 16;
      sizes.push(ico.readUInt8(at));
      expect(ico.readUInt8(at + 1)).toBe(ico.readUInt8(at));
      const bytes = ico.readUInt32LE(at + 8);
      const offset = ico.readUInt32LE(at + 12);
      expect(offset + bytes).toBeLessThanOrEqual(ico.length);
      const payload = ico.subarray(offset, offset + bytes);
      expect(payload.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      const meta = await sharp(payload).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['png', sizes[i], sizes[i]]);
    }
    expect(sizes).toEqual([16, 32, 48]);
  });

  it('writes a valid site.webmanifest whose icons exist', () => {
    const path = join(ROOT, 'public/site.webmanifest');
    expect(existsSync(path)).toBe(true);
    const web = JSON.parse(readFileSync(path, 'utf8')) as {
      icons: { src: string; sizes: string }[];
      theme_color: string;
      start_url: string;
      lang: string;
      dir: string;
    };
    expect(web.icons.length).toBeGreaterThanOrEqual(2);
    for (const icon of web.icons) {
      expect(existsSync(join(ROOT, 'public', icon.src)), icon.src).toBe(true);
    }
    expect([web.theme_color, web.start_url, web.lang, web.dir]).toEqual([
      '#ffffff',
      '/he',
      'he',
      'rtl',
    ]);
  });

  it('makes the link preview a 1200x630 JPEG', async () => {
    const m = loadManifest();
    const meta = await sharp(join(BRAND_DIR, m.og.file)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 1200, 630]);
  });

  it('records a disc within 2 % of the hand-measured one', () => {
    const { disc } = loadManifest();
    const tolerance = EXPECTED_DISC.r * 0.02;
    expect(Math.abs(disc.cx - EXPECTED_DISC.cx)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(disc.cy - EXPECTED_DISC.cy)).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(disc.r - EXPECTED_DISC.r)).toBeLessThanOrEqual(tolerance);
  });

  it('carries no EXIF or XMP in any output image', async () => {
    const m = loadManifest();
    for (const entry of allEntries(m)) {
      const result = await checkImageMetadata(join(BRAND_DIR, entry.file));
      expect(result.code, `${entry.file}: ${result.line}`).toBe(0);
    }
  });
});
