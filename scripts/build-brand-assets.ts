/**
 * pnpm brand:assets (contracts/brand-assets.md, research R9, R11, R12).
 *
 * Builds the logo, favicon, icons and link-preview image from `assets/logo/logo-original.jpg`
 * (a checkerboard is drawn into the picture) and the hero photo:
 * - finds the cream disc by colour (the cream is close to the checker white, so brightness would
 *   not do), compares it with the hand-measured disc in `src/lib/brand/config.ts`, cuts it out
 *   with an anti-aliased circular mask and trims to the disc;
 * - writes header logos (WebP with alpha), the favicon (ICO with 16/32/48 PNG entries) and
 *   `icon-32` from the yarn crop, the touch/Android icons, the link preview, `site.webmanifest`
 *   and `src/lib/brand/manifest.json`.
 * Files are named `<name>.<8 hex of the sha-256>.<ext>` except `favicon.ico` and
 * `site.webmanifest`. Empties `public/brand/` before writing. Same inputs and same sharp version
 * give the same bytes and names.
 *
 * Exit 0 on success; exit 1 with a reason when an input is missing, too small, the disc is not
 * where it should be or not square, or a budget is exceeded. Nothing on disk is touched before
 * every file has been built and checked.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp, { type Sharp } from 'sharp';
import {
  ANDROID_ICON_PADDING,
  ANDROID_ICON_SIZES,
  APPLE_TOUCH_SIZE,
  BRAND_SOURCES,
  BUDGETS,
  CREAM_RGB,
  DISC_TOLERANCE,
  EXPECTED_DISC,
  FAVICON_SIZES,
  LOGO_SIZES,
  MASK_INSET_PX,
  OG,
  WEB_MANIFEST,
  YARN_CROP,
} from '../src/lib/brand/config';
import { HOME_PHOTOS } from '../src/lib/home-photos/config';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BRAND_DIR = join(ROOT, 'public/brand');
const FAVICON_PATH = join(ROOT, 'public/favicon.ico');
const WEB_MANIFEST_PATH = join(ROOT, 'public/site.webmanifest');
const MANIFEST_PATH = join(ROOT, 'src/lib/brand/manifest.json');
const HERO_PATH = join(ROOT, 'assets/home-photos', HOME_PHOTOS.hero.source);

const MIN_SOURCE = 1000;
/** A pixel is "disc" when its blue channel is this much below red and green (cream, brown, pastels). */
const COLOUR_GAP = 8;
/** A row or column needs this many disc pixels to count (ignores JPEG specks). */
const MIN_RUN = 5;

const WEBP_QUALITY = 90;
const WEBP_EFFORT = 6;

interface Entry {
  file: string;
  width: number;
  height: number;
}
interface Built extends Entry {
  buffer: Buffer;
}
interface Disc {
  cx: number;
  cy: number;
  r: number;
}

class BuildError extends Error {}

function need(path: string, what: string): void {
  if (!existsSync(path)) throw new BuildError(`${what} is missing (${path})`);
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The disc's bounding box, found by colour. */
async function detectDisc(path: string): Promise<Disc> {
  const { data, info } = await sharp(path)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  if (W !== H) {
    throw new BuildError(`the logo is ${String(W)}x${String(H)}, it must be square`);
  }
  if (W < MIN_SOURCE || H < MIN_SOURCE) {
    throw new BuildError(
      `the logo is ${String(W)}x${String(H)}, smaller than ${String(MIN_SOURCE)}x${String(MIN_SOURCE)}`,
    );
  }
  const rows = new Uint32Array(H);
  const cols = new Uint32Array(W);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      if (Math.min(r, g) - b >= COLOUR_GAP) {
        rows[y] = (rows[y] ?? 0) + 1;
        cols[x] = (cols[x] ?? 0) + 1;
      }
    }
  }
  const extent = (counts: Uint32Array): [number, number] => {
    const first = counts.findIndex((n) => n >= MIN_RUN);
    let last = counts.length - 1;
    while (last >= 0 && (counts[last] ?? 0) < MIN_RUN) last--;
    if (first < 0 || last < first) throw new BuildError('no disc found in the logo');
    return [first, last];
  };
  const [x0, x1] = extent(cols);
  const [y0, y1] = extent(rows);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  if (Math.abs(w - h) > Math.max(w, h) * DISC_TOLERANCE) {
    throw new BuildError(`the disc box is ${String(w)}x${String(h)}, not square within 2 %`);
  }
  const disc: Disc = { cx: round1(x0 + w / 2), cy: round1(y0 + h / 2), r: round1((w + h) / 4) };
  const tolerance = EXPECTED_DISC.r * DISC_TOLERANCE;
  if (
    Math.abs(disc.cx - EXPECTED_DISC.cx) > tolerance ||
    Math.abs(disc.cy - EXPECTED_DISC.cy) > tolerance ||
    Math.abs(disc.r - EXPECTED_DISC.r) > tolerance
  ) {
    throw new BuildError(
      `the detected disc (centre ${String(disc.cx)},${String(disc.cy)}, radius ${String(disc.r)}) is more than 2 % away from the expected one in src/lib/brand/config.ts`,
    );
  }
  return disc;
}

function circleSvg(size: number, radius: number): Buffer {
  const c = size / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(size)}" height="${String(size)}"><circle cx="${String(c)}" cy="${String(c)}" r="${String(radius)}" fill="#fff"/></svg>`,
  );
}

/** Applies a circular alpha mask (anti-aliased) of the given radius to a square RGB(A) buffer. */
async function circleMask(input: Buffer, size: number, radius: number): Promise<Buffer> {
  return sharp(input)
    .ensureAlpha()
    .composite([{ input: circleSvg(size, radius), blend: 'dest-in' }])
    .png()
    .toBuffer();
}

function named(name: string, ext: string, buffer: Buffer, width: number, height: number): Built {
  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 8);
  return { file: `${name}.${hash}.${ext}`, width, height, buffer };
}

async function png(name: string, pipeline: Sharp, size: number): Promise<Built> {
  const buffer = await pipeline
    .png({ compressionLevel: 9, effort: 10, palette: true, quality: 80, colours: 64, dither: 0.5 })
    .toBuffer();
  return named(name, 'png', buffer, size, size);
}

function ico(images: { size: number; buffer: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = Buffer.alloc(16 * images.length);
  let offset = 6 + entries.length;
  images.forEach(({ size, buffer }, i) => {
    const at = i * 16;
    entries.writeUInt8(size, at);
    entries.writeUInt8(size, at + 1);
    entries.writeUInt8(0, at + 2);
    entries.writeUInt8(0, at + 3);
    entries.writeUInt16LE(1, at + 4);
    entries.writeUInt16LE(32, at + 6);
    entries.writeUInt32LE(buffer.length, at + 8);
    entries.writeUInt32LE(offset, at + 12);
    offset += buffer.length;
  });
  return Buffer.concat([header, entries, ...images.map((i) => i.buffer)]);
}

function checkBudget(label: string, bytes: number, max: number): void {
  if (bytes > max) {
    throw new BuildError(`${label} is ${String(bytes)} bytes, over the budget of ${String(max)}`);
  }
}

const entry = ({ file, width, height }: Built): Entry => ({ file, width, height });

async function main(): Promise<void> {
  const logoPath = join(ROOT, BRAND_SOURCES.logo);
  need(logoPath, 'the logo original');
  need(HERO_PATH, 'the hero photo');
  const heroMeta = await sharp(HERO_PATH).metadata();
  if (heroMeta.width < OG.width || heroMeta.height < OG.height) {
    throw new BuildError(
      `the hero photo is ${String(heroMeta.width)}x${String(heroMeta.height)}, smaller than ${String(OG.width)}x${String(OG.height)}`,
    );
  }
  const disc = await detectDisc(logoPath);

  // Square around the disc, cut out with a mask 2 px inside the edge.
  const R = Math.round(disc.r);
  const side = 2 * R;
  const left = Math.round(disc.cx) - R;
  const top = Math.round(disc.cy) - R;
  const square = await sharp(logoPath)
    .removeAlpha()
    .extract({ left, top, width: side, height: side })
    .png()
    .toBuffer();
  const badge = await circleMask(square, side, R - MASK_INSET_PX); // RGBA PNG, transparent outside

  const logos: Built[] = [];
  for (const size of LOGO_SIZES) {
    const buffer = await sharp(badge)
      .resize(size, size)
      .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT, alphaQuality: 100 })
      .toBuffer();
    const file = named(`logo-${String(size)}`, 'webp', buffer, size, size);
    checkBudget(file.file, buffer.length, BUDGETS.logo);
    logos.push(file);
  }

  // Yarn crop (fractions of the disc square), circle-masked: keeps the cream behind it.
  const cropSide = Math.round(YARN_CROP.size * side);
  const yarn = await sharp(square)
    .extract({
      left: Math.round(YARN_CROP.x * side),
      top: Math.round(YARN_CROP.y * side),
      width: cropSide,
      height: cropSide,
    })
    .png()
    .toBuffer();
  const yarnIcon = async (size: number): Promise<Buffer> => {
    const resized = await sharp(yarn).resize(size, size, { fit: 'cover' }).png().toBuffer();
    return circleMask(resized, size, size / 2);
  };
  const favicons: { size: number; buffer: Buffer }[] = [];
  for (const size of FAVICON_SIZES) {
    favicons.push({
      size,
      buffer: await sharp(await yarnIcon(size))
        .png({ compressionLevel: 9, effort: 10 })
        .toBuffer(),
    });
  }
  const faviconIco = ico(favicons);
  checkBudget('favicon.ico', faviconIco.length, BUDGETS.favicon);
  const icon32 = await png('icon-32', sharp(await yarnIcon(32)), 32);
  checkBudget(icon32.file, icon32.buffer.length, BUDGETS.png);

  // Full badge on opaque cream.
  const onCream = async (size: number, padding: number): Promise<Sharp> => {
    const inner = Math.round(size * (1 - 2 * padding));
    const margin = Math.floor((size - inner) / 2);
    const resized = await sharp(badge).resize(inner, inner).png().toBuffer();
    return sharp({ create: { width: size, height: size, channels: 3, background: CREAM_RGB } })
      .composite([{ input: resized, left: margin, top: margin }])
      .removeAlpha();
  };
  const apple = await png('apple-touch-icon', await onCream(APPLE_TOUCH_SIZE, 0), APPLE_TOUCH_SIZE);
  checkBudget(apple.file, apple.buffer.length, BUDGETS.png);
  const icons: Built[] = [];
  for (const size of ANDROID_ICON_SIZES) {
    const built = await png(
      `icon-${String(size)}`,
      await onCream(size, ANDROID_ICON_PADDING),
      size,
    );
    checkBudget(built.file, built.buffer.length, BUDGETS.png);
    icons.push(built);
  }

  // Link preview: hero photo, cover crop around the focal point, logo in the centre.
  const scale = Math.max(OG.width / heroMeta.width, OG.height / heroMeta.height);
  const scaledW = Math.max(Math.round(heroMeta.width * scale), OG.width);
  const scaledH = Math.max(Math.round(heroMeta.height * scale), OG.height);
  const ogLeft = Math.min(
    Math.max(Math.round(HOME_PHOTOS.hero.focusX * scaledW - OG.width / 2), 0),
    scaledW - OG.width,
  );
  const ogTop = Math.round((scaledH - OG.height) / 2);
  const heroCrop = await sharp(HERO_PATH)
    .resize(scaledW, scaledH)
    .extract({ left: ogLeft, top: ogTop, width: OG.width, height: OG.height })
    .png()
    .toBuffer();
  const ogLogo = await sharp(badge).resize(OG.logoSize, OG.logoSize).png().toBuffer();
  const ogBuffer = await sharp(heroCrop)
    .composite([
      {
        input: ogLogo,
        left: Math.round((OG.width - OG.logoSize) / 2),
        top: Math.round((OG.height - OG.logoSize) / 2),
      },
    ])
    .removeAlpha()
    .jpeg({ quality: OG.quality })
    .toBuffer();
  const og = named('og', 'jpg', ogBuffer, OG.width, OG.height);
  checkBudget(og.file, ogBuffer.length, BUDGETS.og);

  const webManifest = {
    background_color: WEB_MANIFEST.themeColor,
    dir: 'rtl',
    display: 'browser',
    icons: icons.map((i) => ({
      purpose: 'any',
      sizes: `${String(i.width)}x${String(i.height)}`,
      src: `/brand/${i.file}`,
      type: 'image/png',
    })),
    lang: 'he',
    name: WEB_MANIFEST.name,
    short_name: WEB_MANIFEST.shortName,
    start_url: WEB_MANIFEST.startUrl,
    theme_color: WEB_MANIFEST.themeColor,
  };
  const manifest = {
    appleTouchIcon: entry(apple),
    disc,
    icon32: entry(icon32),
    icons: icons.map(entry),
    logo: logos.map(entry),
    og: entry(og),
  };

  // Everything is built and within budget: replace the folder's content.
  await mkdir(BRAND_DIR, { recursive: true });
  for (const old of await readdir(BRAND_DIR)) await rm(join(BRAND_DIR, old), { recursive: true });
  const files = [...logos, icon32, apple, ...icons, og];
  for (const file of files) await writeFile(join(BRAND_DIR, file.file), file.buffer);
  await writeFile(FAVICON_PATH, faviconIco);
  await writeFile(WEB_MANIFEST_PATH, `${JSON.stringify(webManifest, null, 2)}\n`);
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`disc: centre ${String(disc.cx)},${String(disc.cy)} radius ${String(disc.r)}`);
  for (const file of files) {
    console.log(
      `${file.file}  ${String(file.width)}x${String(file.height)}  ${(file.buffer.length / 1024).toFixed(1)} KB`,
    );
  }
  console.log(`favicon.ico  ${(faviconIco.length / 1024).toFixed(1)} KB`);
}

main().catch((error: unknown) => {
  console.error(error instanceof BuildError ? `error: ${error.message}` : error);
  process.exit(1);
});
