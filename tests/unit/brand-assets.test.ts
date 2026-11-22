import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { checkImageMetadata } from '../../scripts/check-image-metadata';
import { contentBox, cutOut, regionFrom } from '../../scripts/brand-cutout';
import {
  BOX_TOLERANCE_PX,
  BUDGETS,
  CUTOUT,
  EXPECTED_BOX,
  EXPECTED_YARN_BOX,
  LOGO_MARGIN_PX,
  LOGO_WIDTHS,
} from '../../src/lib/brand/config';

// specs/009 contracts/brand-assets.md "Tests" (FR-010 to FR-013, research D1-D9).
const ROOT = process.cwd();
const BRAND_DIR = join(ROOT, 'public/brand');
const MANIFEST_PATH = join(ROOT, 'src/lib/brand/manifest.json');

interface Entry {
  file: string;
  width: number;
  height: number;
}
interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface BrandManifest {
  appleTouchIcon: Entry;
  box: Box;
  icon32: Entry;
  icons: Entry[];
  logo: Entry[];
  og: Entry;
  yarnBox: Box;
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

async function rgbaOf(
  file: string | Buffer,
): Promise<{ data: Buffer; width: number; height: number }> {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

const pixel = (
  img: { data: Buffer; width: number },
  x: number,
  y: number,
): [number, number, number, number] => {
  const i = (y * img.width + x) * 4;
  return [img.data[i] ?? -1, img.data[i + 1] ?? -1, img.data[i + 2] ?? -1, img.data[i + 3] ?? -1];
};

describe('brand assets', () => {
  it('lists only files that exist, with the real dimensions, formats and hashed names', async () => {
    const m = loadManifest();
    expect(m.logo.map((e) => e.width)).toEqual([...LOGO_WIDTHS]);
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

  it('sizes each logo to the trimmed ratio, as WebP with alpha', async () => {
    const m = loadManifest();
    const trimmedW = m.box.x1 - m.box.x0 + 1 + 2 * LOGO_MARGIN_PX;
    const trimmedH = m.box.y1 - m.box.y0 + 1 + 2 * LOGO_MARGIN_PX;
    for (const entry of m.logo) {
      expect(Math.abs(entry.height - (entry.width * trimmedH) / trimmedW)).toBeLessThanOrEqual(1);
      const meta = await sharp(join(BRAND_DIR, entry.file)).metadata();
      expect([meta.format, meta.hasAlpha], entry.file).toEqual(['webp', true]);
    }
  });

  it('records a content box and a yarn box near the measured ones', () => {
    const m = loadManifest();
    for (const key of ['x0', 'y0', 'x1', 'y1'] as const) {
      expect(Math.abs(m.box[key] - EXPECTED_BOX[key]), `box.${key}`).toBeLessThanOrEqual(
        BOX_TOLERANCE_PX,
      );
      expect(
        Math.abs(m.yarnBox[key] - EXPECTED_YARN_BOX[key]),
        `yarnBox.${key}`,
      ).toBeLessThanOrEqual(BOX_TOLERANCE_PX);
    }
  });

  describe('the 321 px logo', () => {
    const load = async (): Promise<{
      img: Awaited<ReturnType<typeof rgbaOf>>;
      at: (sx: number, sy: number) => [number, number, number, number];
    }> => {
      const m = loadManifest();
      const entry = m.logo.find((e) => e.width === 321);
      expect(entry).toBeDefined();
      const img = await rgbaOf(join(BRAND_DIR, entry?.file ?? ''));
      const left = m.box.x0 - LOGO_MARGIN_PX;
      const top = m.box.y0 - LOGO_MARGIN_PX;
      const trimmedW = m.box.x1 - m.box.x0 + 1 + 2 * LOGO_MARGIN_PX;
      const trimmedH = m.box.y1 - m.box.y0 + 1 + 2 * LOGO_MARGIN_PX;
      const clamp = (v: number, max: number): number => Math.min(Math.max(Math.round(v), 0), max);
      return {
        img,
        at: (sx, sy) =>
          pixel(
            img,
            clamp(((sx - left) * img.width) / trimmedW, img.width - 1),
            clamp(((sy - top) * img.height) / trimmedH, img.height - 1),
          ),
      };
    };

    it('is transparent on the outer frame and in the "A" counter, opaque on the yarn', async () => {
      const { img, at } = await load();
      // The source margin is transparent; resizing leaves at most a faint trace (alpha 1-4 seen
      // next to the first letter), invisible on any background.
      const FRAME_MAX = 8;
      for (let x = 0; x < img.width; x++) {
        expect(pixel(img, x, 0)[3], `top row x=${String(x)}`).toBeLessThanOrEqual(FRAME_MAX);
        expect(pixel(img, x, img.height - 1)[3], `bottom row x=${String(x)}`).toBeLessThanOrEqual(
          FRAME_MAX,
        );
      }
      for (let y = 0; y < img.height; y++) {
        expect(pixel(img, 0, y)[3], `first column y=${String(y)}`).toBeLessThanOrEqual(FRAME_MAX);
        expect(pixel(img, img.width - 1, y)[3], `last column y=${String(y)}`).toBeLessThanOrEqual(
          FRAME_MAX,
        );
      }
      // The source alpha there is 0; the 5x downscale leaves a trace of 2 (see above).
      expect(at(320, 1145)[3], 'A counter').toBeLessThanOrEqual(FRAME_MAX);
      expect(at(930, 660)[3], 'yarn ball').toBe(255);
      expect(at(1000, 646)[3], 'grey-blue yarn').toBe(255);
    });

    it('has no checkerboard left (under 0.5 % light neutral pixels)', async () => {
      const { img } = await load();
      let opaque = 0;
      let lightNeutral = 0;
      for (let i = 0; i < img.width * img.height; i++) {
        const r = img.data[i * 4] ?? 0;
        const g = img.data[i * 4 + 1] ?? 0;
        const b = img.data[i * 4 + 2] ?? 0;
        if ((img.data[i * 4 + 3] ?? 0) < 128) continue;
        opaque++;
        const spread = Math.max(r, g, b) - Math.min(r, g, b);
        if (spread <= 6 && 0.299 * r + 0.587 * g + 0.114 * b >= 200) lightNeutral++;
      }
      expect(opaque).toBeGreaterThan(0);
      expect(lightNeutral / opaque).toBeLessThan(0.005);
    });
  });

  describe('cut-out helpers on a synthetic picture', () => {
    const W = 80;
    const H = 40;
    const rgb = new Uint8Array(W * H * 3);
    const set = (x: number, y: number, v: [number, number, number]): void => {
      rgb.set(v, (y * W + x) * 3);
    };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const g = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0 ? 206 : 253;
        set(x, y, [g, g, g]);
      }
    }
    // Two 32x32 squares: a 3 px brown ring each. The first encloses a neutral 190 fill, the second
    // keeps the checker squares.
    for (const left of [4, 44]) {
      for (let y = 4; y < 36; y++) {
        for (let x = left; x < left + 32; x++) {
          const edge = x < left + 3 || x >= left + 29 || y < 7 || y >= 33;
          if (edge) set(x, y, [88, 55, 38]);
          else if (left === 4) set(x, y, [190, 190, 190]);
        }
      }
    }
    const alpha = cutOut(rgb, W, H, CUTOUT);
    const a = (x: number, y: number): number => alpha[y * W + x] ?? -1;

    it('removes the checker, keeps brown and the enclosed grey fill, drops enclosed checker', () => {
      expect(a(0, 0)).toBe(0);
      expect(a(10, 38)).toBe(0);
      expect(a(5, 20)).toBe(255);
      expect(a(20, 20)).toBe(255);
      expect(a(60, 20)).toBe(0);
      expect(a(52, 12)).toBe(0);
    });

    it('needs the hole rule to make the grey fill opaque', () => {
      const soft = cutOut(rgb, W, H, { ...CUTOUT, holeMeanLum: 0 });
      const own = soft[20 * W + 20] ?? 255;
      expect(own).toBeGreaterThan(0);
      expect(own).toBeLessThan(255);
    });

    it('finds the box of both rings and the region of one', () => {
      expect(contentBox(alpha, W, H)).toEqual({ x0: 4, y0: 4, x1: 75, y1: 35 });
      const { mask, box } = regionFrom(alpha, W, H, { x: 5, y: 20 });
      expect(box).toEqual({ x0: 4, y0: 4, x1: 35, y1: 35 });
      expect(mask[20 * W + 20]).toBe(1);
      expect(mask[20 * W + 45]).toBe(0);
      expect(() => regionFrom(alpha, W, H, { x: 0, y: 0 })).toThrow();
    });
  });

  it('draws the icons from the yarn on cream', async () => {
    const m = loadManifest();
    for (const entry of [m.appleTouchIcon, m.icons.find((e) => e.width === 512)]) {
      const img = await rgbaOf(join(BRAND_DIR, entry?.file ?? ''));
      const [r, g, b, al] = pixel(img, 0, 0);
      expect(Math.abs(r - 0xfa), entry?.file).toBeLessThanOrEqual(2);
      expect(Math.abs(g - 0xf8), entry?.file).toBeLessThanOrEqual(2);
      expect(Math.abs(b - 0xe9), entry?.file).toBeLessThanOrEqual(2);
      expect(al).toBe(255);
    }
    // A cream square with no yarn on it would pass the corner check, so look near the centre.
    const big = await rgbaOf(join(BRAND_DIR, m.icons.find((e) => e.width === 512)?.file ?? ''));
    const [cr, cg, cb] = pixel(big, 256, 256);
    const nearCream =
      Math.abs(cr - 0xfa) <= 8 && Math.abs(cg - 0xf8) <= 8 && Math.abs(cb - 0xe9) <= 8;
    expect(nearCream, 'icon-512 centre is not cream').toBe(false);
    const small = await rgbaOf(join(BRAND_DIR, m.icon32.file));
    expect(pixel(small, 0, 0)[3]).toBe(0);
    expect(pixel(small, 16, 16)[3]).toBe(255);
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
      expect((await rgbaOf(payload)).data[3], `ico entry ${String(sizes[i])} corner alpha`).toBe(0);
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

  it('shows a light card over the hero photo in the preview', async () => {
    const m = loadManifest();
    const path = join(BRAND_DIR, m.og.file);
    const img = await rgbaOf(path);
    // The exact centre (600, 315) lies on the logo's brown yarn outline, so sample the card
    // near its top-left corner (the card is 760 x 460 centred, so it starts at 220, 85).
    const [r, g, b] = pixel(img, 250, 100);
    expect(0.299 * r + 0.587 * g + 0.114 * b).toBeGreaterThanOrEqual(200);
    // The logo's outline is at the centre of the card.
    const [cr, cg, cb] = pixel(img, 600, 315);
    expect(0.299 * cr + 0.587 * cg + 0.114 * cb).toBeLessThan(100);
    const { channels } = await sharp(path).stats();
    expect(Math.max(...channels.map((c) => c.stdev))).toBeGreaterThan(20);
  });

  it('carries no EXIF or XMP in any output image', async () => {
    const m = loadManifest();
    for (const entry of allEntries(m)) {
      const result = await checkImageMetadata(join(BRAND_DIR, entry.file));
      expect(result.code, `${entry.file}: ${result.line}`).toBe(0);
    }
  });
});
