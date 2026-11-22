/**
 * pnpm brand:assets (specs/009 contracts/brand-assets.md, research D1-D9).
 *
 * Builds the logo, favicon, icons and link-preview image from
 * `assets/logo/logo-wordmark-original.jpg` (a checkerboard is drawn into the picture) and the hero
 * photo:
 * - cuts the drawing out of the checkerboard (`scripts/brand-cutout.ts`), finds its content box,
 *   compares it with the hand-measured box in `src/lib/brand/config.ts` and trims to it;
 * - writes header logos (WebP with alpha) at several widths;
 * - finds the yarn region (balls, needles, tail) from a seed point and writes the favicon (ICO
 *   with 16/32/48 PNG entries), `icon-32`, the touch and Android icons from it, on cream;
 * - writes the link preview (hero crop, a light card, the full logo), `site.webmanifest` and
 *   `src/lib/brand/manifest.json` (which records the detected boxes).
 * Files are named `<name>.<8 hex of the sha-256>.<ext>` except `favicon.ico` and
 * `site.webmanifest`. Empties `public/brand/` before writing. Same inputs and same sharp version
 * give the same bytes and names.
 *
 * Exit 0 on success; exit 1 with a reason when an input is missing or too small, a detected box is
 * not where it should be, or a budget is exceeded. Nothing on disk is touched before every file
 * has been built and checked.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp, { type Sharp } from 'sharp';
import {
  ANDROID_ICON_SIZES,
  APPLE_TOUCH_SIZE,
  BOX_TOLERANCE_PX,
  BRAND_SOURCES,
  BUDGETS,
  CREAM_RGB,
  CUTOUT,
  EXPECTED_BOX,
  EXPECTED_YARN_BOX,
  FAVICON_SIZES,
  ICON_ART_SHARE,
  LOGO_MARGIN_PX,
  LOGO_WIDTHS,
  OG,
  WEB_MANIFEST,
  YARN_SEED,
} from '../src/lib/brand/config';
import { HOME_PHOTOS } from '../src/lib/home-photos/config';
import { type Box, contentBox, cutOut, regionFrom } from './brand-cutout';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BRAND_DIR = join(ROOT, 'public/brand');
const FAVICON_PATH = join(ROOT, 'public/favicon.ico');
const WEB_MANIFEST_PATH = join(ROOT, 'public/site.webmanifest');
const MANIFEST_PATH = join(ROOT, 'src/lib/brand/manifest.json');
const HERO_PATH = join(ROOT, 'assets/home-photos', HOME_PHOTOS.hero.source);

const MIN_SOURCE = 1000;

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

class BuildError extends Error {}

/** Runs a pure helper; its plain errors become `BuildError`s so the script prints `error: <reason>`. */
function plain<T>(run: () => T): T {
  try {
    return run();
  } catch (err) {
    if (err instanceof BuildError || !(err instanceof Error)) throw err;
    throw new BuildError(err.message);
  }
}

function need(path: string, what: string): void {
  if (!existsSync(path)) throw new BuildError(`${what} is missing (${path})`);
}

const fmt = (b: Box): string =>
  `x ${String(b.x0)}-${String(b.x1)}, y ${String(b.y0)}-${String(b.y1)}`;

/** Refuses a detected box with any edge more than BOX_TOLERANCE_PX from the expected one. */
function checkBox(label: string, found: Box, expected: Box): void {
  const keys = ['x0', 'y0', 'x1', 'y1'] as const;
  if (keys.some((k) => Math.abs(found[k] - expected[k]) > BOX_TOLERANCE_PX)) {
    throw new BuildError(
      `the ${label} box (${fmt(found)}) is more than ${String(BOX_TOLERANCE_PX)} px away from the expected one (${fmt(expected)}) in src/lib/brand/config.ts`,
    );
  }
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
  const { data: rgb, info } = await sharp(logoPath)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  if (W < MIN_SOURCE || H < MIN_SOURCE) {
    throw new BuildError(
      `the logo is ${String(W)}x${String(H)}, smaller than ${String(MIN_SOURCE)}x${String(MIN_SOURCE)}`,
    );
  }

  // Cut-out and content box.
  const alpha = cutOut(rgb, W, H, CUTOUT);
  const box = plain(() => contentBox(alpha, W, H));
  checkBox('logo content', box, EXPECTED_BOX);
  const rgba = Buffer.alloc(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    rgba[p * 4] = rgb[p * 3] ?? 0;
    rgba[p * 4 + 1] = rgb[p * 3 + 1] ?? 0;
    rgba[p * 4 + 2] = rgb[p * 3 + 2] ?? 0;
    rgba[p * 4 + 3] = alpha[p] ?? 0;
  }
  const raw = { raw: { width: W, height: H, channels: 4 as const } };
  const tLeft = Math.max(box.x0 - LOGO_MARGIN_PX, 0);
  const tTop = Math.max(box.y0 - LOGO_MARGIN_PX, 0);
  const tW = Math.min(box.x1 + LOGO_MARGIN_PX, W - 1) - tLeft + 1;
  const tH = Math.min(box.y1 + LOGO_MARGIN_PX, H - 1) - tTop + 1;
  const trimmed = await sharp(rgba, raw)
    .extract({ left: tLeft, top: tTop, width: tW, height: tH })
    .png()
    .toBuffer();

  // Header logos.
  const logos: Built[] = [];
  for (const width of LOGO_WIDTHS) {
    const height = Math.round((width * tH) / tW);
    const buffer = await sharp(trimmed)
      .resize(width, height)
      .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT, alphaQuality: 100 })
      .toBuffer();
    const file = named(`logo-${String(width)}`, 'webp', buffer, width, height);
    checkBudget(file.file, buffer.length, BUDGETS.logo);
    logos.push(file);
  }

  // Yarn art: the region holding the seed, cut out, cropped to its box.
  const yarn = plain(() => regionFrom(alpha, W, H, YARN_SEED));
  checkBox('yarn', yarn.box, EXPECTED_YARN_BOX);
  const yarnRgba = Buffer.from(rgba);
  for (let p = 0; p < W * H; p++) {
    yarnRgba[p * 4 + 3] = yarn.mask[p] ? (alpha[p] ?? 0) : 0;
  }
  const art = await sharp(yarnRgba, raw)
    .extract({
      left: yarn.box.x0,
      top: yarn.box.y0,
      width: yarn.box.x1 - yarn.box.x0 + 1,
      height: yarn.box.y1 - yarn.box.y0 + 1,
    })
    .png()
    .toBuffer();

  // Yarn on cream, square; circle-masked for the favicon sizes.
  const yarnOnCream = async (size: number, circle: boolean): Promise<Buffer> => {
    const inner = Math.round(size * ICON_ART_SHARE);
    const fitted = await sharp(art)
      .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    const offset = Math.floor((size - inner) / 2);
    const square = await sharp({
      create: { width: size, height: size, channels: 3, background: CREAM_RGB },
    })
      .composite([{ input: fitted, left: offset, top: offset }])
      .removeAlpha()
      .png()
      .toBuffer();
    return circle ? circleMask(square, size, size / 2) : square;
  };
  const favicons: { size: number; buffer: Buffer }[] = [];
  for (const size of FAVICON_SIZES) {
    favicons.push({
      size,
      buffer: await sharp(await yarnOnCream(size, true))
        .png({ compressionLevel: 9, effort: 10 })
        .toBuffer(),
    });
  }
  const faviconIco = ico(favicons);
  checkBudget('favicon.ico', faviconIco.length, BUDGETS.favicon);
  const icon32 = await png('icon-32', sharp(await yarnOnCream(32, true)), 32);
  checkBudget(icon32.file, icon32.buffer.length, BUDGETS.png);
  const apple = await png(
    'apple-touch-icon',
    sharp(await yarnOnCream(APPLE_TOUCH_SIZE, false)),
    APPLE_TOUCH_SIZE,
  );
  checkBudget(apple.file, apple.buffer.length, BUDGETS.png);
  const icons: Built[] = [];
  for (const size of ANDROID_ICON_SIZES) {
    const built = await png(`icon-${String(size)}`, sharp(await yarnOnCream(size, false)), size);
    checkBudget(built.file, built.buffer.length, BUDGETS.png);
    icons.push(built);
  }

  // Link preview: hero photo (cover crop around the focal point), a light card, the full logo.
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
  const card = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${String(OG.card.width)}" height="${String(OG.card.height)}"><rect width="${String(OG.card.width)}" height="${String(OG.card.height)}" rx="${String(OG.card.radius)}" ry="${String(OG.card.radius)}" fill="#fff" fill-opacity="${String(OG.card.opacity)}"/></svg>`,
  );
  const ogLogoBuf = await sharp(trimmed).resize({ width: OG.logoWidth }).png().toBuffer();
  const ogLogoMeta = await sharp(ogLogoBuf).metadata();
  const ogBuffer = await sharp(heroCrop)
    .composite([
      {
        input: card,
        left: Math.round((OG.width - OG.card.width) / 2),
        top: Math.round((OG.height - OG.card.height) / 2),
      },
      {
        input: ogLogoBuf,
        left: Math.round((OG.width - OG.logoWidth) / 2),
        top: Math.round((OG.height - ogLogoMeta.height) / 2),
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
    box,
    icon32: entry(icon32),
    icons: icons.map(entry),
    logo: logos.map(entry),
    og: entry(og),
    yarnBox: yarn.box,
  };

  // Everything is built and within budget: replace the folder's content.
  await mkdir(BRAND_DIR, { recursive: true });
  for (const old of await readdir(BRAND_DIR)) await rm(join(BRAND_DIR, old), { recursive: true });
  const files = [...logos, icon32, apple, ...icons, og];
  for (const file of files) await writeFile(join(BRAND_DIR, file.file), file.buffer);
  await writeFile(FAVICON_PATH, faviconIco);
  await writeFile(WEB_MANIFEST_PATH, `${JSON.stringify(webManifest, null, 2)}\n`);
  await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`logo box: ${fmt(box)} (expected ${fmt(EXPECTED_BOX)})`);
  console.log(`yarn box: ${fmt(yarn.box)} (expected ${fmt(EXPECTED_YARN_BOX)})`);
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
