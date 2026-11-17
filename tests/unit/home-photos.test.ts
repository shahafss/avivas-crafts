import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { checkImageMetadata } from '../../scripts/check-image-metadata';

// Budgets and file rules of contracts/home-photos.md (FR-011, SC-005).
const ROOT = process.cwd();
const MANIFEST_PATH = join(ROOT, 'src/lib/home-photos/manifest.json');
const PHOTOS_DIR = join(ROOT, 'public/site-photos');
const IDS = ['hero', 'bannerChild', 'bannerShelf'] as const;
const NAMES: Record<(typeof IDS)[number], string> = {
  hero: 'hero-workshop',
  bannerChild: 'banner-child-play',
  bannerShelf: 'banner-shelf',
};
const PHONE_MAX_BYTES = 190 * 1024;
const WIDE_MAX_BYTES = 450 * 1024;
const PHONE_SIZES = [
  { variant: 'p400', width: 400, height: 600 },
  { variant: 'p565', width: 565, height: 848 },
];
const WIDE_WIDTHS = [800, 1200, 1600, 2000];

interface Entry {
  file: string;
  width: number;
  height: number;
  bytes: number;
}
type Manifest = Record<string, { phone: Entry[]; wide: Entry[] }>;

function loadManifest(): Manifest {
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')) as Manifest;
}

describe('home photos', () => {
  it('has a manifest entry for each photo with the listed variants', () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
    const manifest = loadManifest();
    expect(Object.keys(manifest).sort()).toEqual([...IDS].sort());
    for (const id of IDS) {
      const photo = manifest[id];
      expect(photo?.phone.map((e) => e.width)).toEqual(PHONE_SIZES.map((s) => s.width));
      expect(photo?.phone.map((e) => e.height)).toEqual(PHONE_SIZES.map((s) => s.height));
      expect(photo?.wide.map((e) => e.width)).toEqual(WIDE_WIDTHS);
      for (const entry of photo?.wide ?? []) {
        expect(Math.abs(entry.height - Math.round((entry.width * 848) / 2000))).toBeLessThanOrEqual(
          1,
        );
      }
    }
  });

  it('names every file <name>-<variant>.<8 hex>.webp', () => {
    const manifest = loadManifest();
    for (const id of IDS) {
      const photo = manifest[id];
      const variants = [
        ...PHONE_SIZES.map((s) => s.variant),
        ...WIDE_WIDTHS.map((w) => `w${String(w)}`),
      ];
      const files = [...(photo?.phone ?? []), ...(photo?.wide ?? [])].map((e) => e.file);
      expect(files).toHaveLength(variants.length);
      files.forEach((file, i) => {
        expect(file).toMatch(
          new RegExp(`^${NAMES[id]}-${variants[i] ?? ''}\\.[0-9a-f]{8}\\.webp$`),
        );
      });
    }
  });

  it('has every file as WebP with the listed size, within budget, and without EXIF or XMP', async () => {
    const manifest = loadManifest();
    for (const id of IDS) {
      const photo = manifest[id];
      const groups = [
        { entries: photo?.phone ?? [], max: PHONE_MAX_BYTES },
        { entries: photo?.wide ?? [], max: WIDE_MAX_BYTES },
      ];
      for (const { entries, max } of groups) {
        for (const entry of entries) {
          const path = join(PHOTOS_DIR, entry.file);
          expect(existsSync(path), entry.file).toBe(true);
          const bytes = statSync(path).size;
          expect(bytes, `${entry.file} size`).toBe(entry.bytes);
          expect(bytes, `${entry.file} budget`).toBeLessThanOrEqual(max);
          const meta = await sharp(path).metadata();
          expect(meta.format, entry.file).toBe('webp');
          expect([meta.width, meta.height], `${entry.file} dimensions`).toEqual([
            entry.width,
            entry.height,
          ]);
          expect((await checkImageMetadata(path)).code, `${entry.file} metadata`).toBe(0);
        }
      }
    }
  });

  it('keeps no file in public/site-photos that the manifest does not list', () => {
    const manifest = loadManifest();
    const listed = IDS.flatMap((id) =>
      [...(manifest[id]?.phone ?? []), ...(manifest[id]?.wide ?? [])].map((e) => e.file),
    ).sort();
    expect(existsSync(PHOTOS_DIR)).toBe(true);
    expect(readdirSync(PHOTOS_DIR).sort()).toEqual(listed);
  });
});
