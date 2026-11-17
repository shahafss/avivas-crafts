/**
 * pnpm photos:home (contracts/home-photos.md "Script", research D3).
 *
 * Builds the home page photo variants from the originals in `assets/home-photos/`:
 * - phone crops, portrait 2:3 around the photo's `focusX`, at 565x848 and 400x600;
 * - wide versions of the whole photo, 800, 1200, 1600 and 2000 px wide (never enlarged).
 * All WebP, metadata stripped, named `<name>-<variant>.<8 hex of the sha-256>.webp`. Empties
 * `public/site-photos/`, writes the files and `src/lib/home-photos/manifest.json` (sorted keys).
 * Same originals and same sharp version give the same bytes and names.
 *
 * Exit 0 on success; exit 1 with a reason when a source is missing, smaller than 2000x848, or a
 * budget is exceeded (the same budgets as tests/unit/home-photos.test.ts). Nothing on disk is
 * touched before every file has been built and checked.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp, { type Sharp } from 'sharp';
import { HOME_PHOTOS, type HomePhotoId } from '../src/lib/home-photos/config';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_DIR = join(ROOT, 'assets/home-photos');
const OUTPUT_DIR = join(ROOT, 'public/site-photos');
const MANIFEST_PATH = join(ROOT, 'src/lib/home-photos/manifest.json');

const MIN_WIDTH = 2000;
const MIN_HEIGHT = 848;
const PHONE_SIZES = [
  { variant: 'p400', width: 400, height: 600 },
  { variant: 'p565', width: 565, height: 848 },
] as const;
const WIDE_WIDTHS = [800, 1200, 1600, 2000] as const;

/** WebP quality (0-100). Chosen so every phone file stays within the budget below. */
const PHONE_QUALITY = 90;
const WIDE_QUALITY = 88;
const WEBP_EFFORT = 6;

/** Budgets in bytes (SC-005 and contracts/home-photos.md "Budgets"). */
const PHONE_MAX_BYTES = 190 * 1024;
const WIDE_MAX_BYTES = 450 * 1024;

interface Entry {
  file: string;
  width: number;
  height: number;
  bytes: number;
}
interface Built extends Entry {
  buffer: Buffer;
}
interface ManifestEntry {
  phone: Entry[];
  wide: Entry[];
}

class BuildError extends Error {}

function encode(pipeline: Sharp, quality: number): Promise<Buffer> {
  // Metadata is stripped by default (no `withMetadata`), so no EXIF or XMP is written.
  return pipeline.webp({ quality, effort: WEBP_EFFORT }).toBuffer();
}

async function built(
  name: string,
  variant: string,
  pipeline: Sharp,
  quality: number,
): Promise<Built> {
  const buffer = await encode(pipeline, quality);
  const info = await sharp(buffer).metadata();
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 8);
  return {
    file: `${name}-${variant}.${hash}.webp`,
    width: info.width,
    height: info.height,
    bytes: buffer.length,
    buffer,
  };
}

async function buildPhoto(id: HomePhotoId): Promise<{ phone: Built[]; wide: Built[] }> {
  const config = HOME_PHOTOS[id];
  const path = join(SOURCE_DIR, config.source);
  if (!existsSync(path)) throw new BuildError(`${id}: source ${config.source} is missing`);
  const name = basename(config.source, extname(config.source));
  const meta = await sharp(path).metadata();
  const { width: W, height: H } = meta;
  if (W < MIN_WIDTH || H < MIN_HEIGHT) {
    throw new BuildError(
      `${id}: ${config.source} is ${String(W)}x${String(H)}, smaller than ${String(MIN_WIDTH)}x${String(MIN_HEIGHT)}`,
    );
  }

  // Phone crops: 2:3 at the full height, centred on the focal point.
  const cropWidth = Math.round((H * 2) / 3);
  const left = Math.min(Math.max(Math.round(config.focusX * W - cropWidth / 2), 0), W - cropWidth);
  const crop = await sharp(path).extract({ left, top: 0, width: cropWidth, height: H }).toBuffer();
  const phone: Built[] = [];
  for (const size of PHONE_SIZES) {
    const pipeline =
      size.width === cropWidth && size.height === H
        ? sharp(crop)
        : sharp(crop).resize(size.width, size.height, { fit: 'cover' });
    phone.push(await built(name, size.variant, pipeline, PHONE_QUALITY));
  }

  const wide: Built[] = [];
  for (const width of WIDE_WIDTHS) {
    const pipeline = sharp(path).resize({ width, withoutEnlargement: true });
    wide.push(await built(name, `w${String(width)}`, pipeline, WIDE_QUALITY));
  }
  return { phone, wide };
}

function entry({ file, width, height, bytes }: Built): Entry {
  return { file, width, height, bytes };
}

async function main(): Promise<void> {
  const ids = Object.keys(HOME_PHOTOS).sort() as HomePhotoId[];
  const results = new Map<HomePhotoId, { phone: Built[]; wide: Built[] }>();
  for (const id of ids) results.set(id, await buildPhoto(id));

  const lines: string[] = [];
  for (const [id, { phone, wide }] of results) {
    for (const file of phone) {
      if (file.bytes > PHONE_MAX_BYTES) {
        throw new BuildError(
          `${id}: ${file.file} is ${String(file.bytes)} bytes, over the phone budget of ${String(PHONE_MAX_BYTES)}`,
        );
      }
    }
    for (const file of wide) {
      if (file.bytes > WIDE_MAX_BYTES) {
        throw new BuildError(
          `${id}: ${file.file} is ${String(file.bytes)} bytes, over the wide budget of ${String(WIDE_MAX_BYTES)}`,
        );
      }
    }
    for (const file of [...phone, ...wide]) {
      lines.push(
        `${file.file}  ${String(file.width)}x${String(file.height)}  ${(file.bytes / 1024).toFixed(1)} KB`,
      );
    }
  }

  // Everything is built and within budget: replace the folder's content.
  await mkdir(OUTPUT_DIR, { recursive: true });
  for (const old of await readdir(OUTPUT_DIR)) await rm(join(OUTPUT_DIR, old), { recursive: true });
  const manifest: Record<string, ManifestEntry> = {};
  for (const [id, { phone, wide }] of results) {
    for (const file of [...phone, ...wide]) {
      await writeFile(join(OUTPUT_DIR, file.file), file.buffer);
    }
    manifest[id] = { phone: phone.map(entry), wide: wide.map(entry) };
  }
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  for (const line of lines) console.log(line);
}

main().catch((error: unknown) => {
  console.error(error instanceof BuildError ? `error: ${error.message}` : error);
  process.exit(1);
});
