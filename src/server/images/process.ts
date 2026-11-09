import 'server-only';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import sharp, { type Sharp } from 'sharp';

// One image at a time, and no cache: the instance has 512 MB (research.md R7).
sharp.concurrency(1);
sharp.cache(false);

export const MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PIXELS = 51_000_000;
/**
 * HEIC/HEIF only: decoding needs about 11 bytes per pixel in the WebAssembly heap (T025 measured
 * 544 MB for 50 MP), so the limit is the phone's normal resolution. Set from the whole-app memory
 * measurement (T052, research.md R7); JPEG/PNG/WebP keep `MAX_PIXELS`.
 */
export const HEIC_MAX_PIXELS = 16_000_000;
export const VARIANT_WIDTHS = [400, 800, 1600] as const;

export type UploadErrorCode = 'unsupported_type' | 'too_large' | 'too_many_pixels' | 'corrupt';

export class ImageError extends Error {
  constructor(readonly code: UploadErrorCode) {
    super(code);
    this.name = 'ImageError';
  }
}

export interface ProcessedImage {
  /** `width` is the variant's name (the 400/800/1600 in the file key); a smaller source is never upscaled. */
  variants: { width: number; buffer: Buffer }[];
  /** Size of the photo after the EXIF orientation. */
  width: number;
  height: number;
}

export function exceedsPixelLimit(width: number, height: number): boolean {
  return width * height > MAX_PIXELS;
}

export function exceedsHeicPixelLimit(width: number, height: number): boolean {
  return width * height > HEIC_MAX_PIXELS;
}

const HEIC_BRANDS = new Set(['heic', 'heix', 'heif', 'mif1', 'msf1']);
const AVIF_BRANDS = new Set(['avif', 'avis']);

/** Brands of the `ftyp` box, or null when the buffer is not an ISO base media file. */
function readBrands(buffer: Buffer): { major: string; compatible: string[] } | null {
  if (buffer.length < 16 || buffer.toString('ascii', 4, 8) !== 'ftyp') return null;
  const size = Math.min(buffer.readUInt32BE(0), buffer.length);
  const compatible: string[] = [];
  for (let offset = 16; offset + 4 <= size; offset += 4) {
    compatible.push(buffer.toString('ascii', offset, offset + 4));
  }
  return { major: buffer.toString('ascii', 8, 12), compatible };
}

type Detected = 'jpeg' | 'png' | 'webp' | 'heic' | 'unsupported';

function detect(buffer: Buffer): Detected {
  const brands = readBrands(buffer);
  if (brands) {
    const all = [brands.major, ...brands.compatible];
    // AVIF can also carry mif1/msf1, so any AVIF brand rejects the file.
    if (all.some((brand) => AVIF_BRANDS.has(brand))) return 'unsupported';
    return HEIC_BRANDS.has(brands.major) ? 'heic' : 'unsupported';
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return 'jpeg';
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return 'unsupported';
}

/** Finds the child boxes of `type` inside `buffer[start, end)`. */
function childBoxes(
  buffer: Buffer,
  start: number,
  end: number,
): { type: string; start: number; end: number }[] {
  const boxes: { type: string; start: number; end: number }[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) break;
      size = Number(buffer.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) break;
    boxes.push({
      type: buffer.toString('ascii', offset + 4, offset + 8),
      start: offset + header,
      end: offset + size,
    });
    offset += size;
  }
  return boxes;
}

/** Image size from the HEIF header (the largest `ispe`), without decoding. */
export function readHeicDimensions(buffer: Buffer): { width: number; height: number } | null {
  const meta = childBoxes(buffer, 0, buffer.length).find((box) => box.type === 'meta');
  if (!meta) return null;
  // `meta` is a full box: 4 bytes of version and flags precede its children.
  const iprp = childBoxes(buffer, meta.start + 4, meta.end).find((box) => box.type === 'iprp');
  if (!iprp) return null;
  const ipco = childBoxes(buffer, iprp.start, iprp.end).find((box) => box.type === 'ipco');
  if (!ipco) return null;
  let best: { width: number; height: number } | null = null;
  for (const box of childBoxes(buffer, ipco.start, ipco.end)) {
    if (box.type !== 'ispe' || box.end - box.start < 12) continue;
    const width = buffer.readUInt32BE(box.start + 4);
    const height = buffer.readUInt32BE(box.start + 8);
    if (best === null || width * height > best.width * best.height) best = { width, height };
  }
  return best;
}

interface RawPixels {
  width: number;
  height: number;
  data: Buffer;
}

/** Decodes HEIC to RGBA in a worker thread that is terminated afterwards (frees the WASM heap). */
function decodeHeic(buffer: Buffer): Promise<RawPixels> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(process.cwd(), 'src/server/images/heic-worker.mjs'), {
      workerData: { buffer: new Uint8Array(buffer) },
    });
    let settled = false;
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      void worker.terminate();
      action();
    };
    worker.once(
      'message',
      (message: { ok: boolean; width: number; height: number; pixels: ArrayBuffer }) => {
        finish(() => {
          if (message.ok)
            resolve({
              width: message.width,
              height: message.height,
              data: Buffer.from(message.pixels),
            });
          else reject(new ImageError('corrupt'));
        });
      },
    );
    worker.once('error', () => {
      finish(() => {
        reject(new ImageError('corrupt'));
      });
    });
    worker.once('exit', () => {
      finish(() => {
        reject(new ImageError('corrupt'));
      });
    });
  });
}

async function encodeVariants(source: () => Sharp): Promise<{ width: number; buffer: Buffer }[]> {
  const variants: { width: number; buffer: Buffer }[] = [];
  for (const width of VARIANT_WIDTHS) {
    // No withMetadata/keepMetadata: EXIF (incl. GPS), XMP and IPTC are dropped.
    const buffer = await source()
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    variants.push({ width, buffer });
  }
  return variants;
}

function isPixelLimitError(error: unknown): boolean {
  return error instanceof Error && /pixel limit/i.test(error.message);
}

export async function processUpload(buffer: Buffer): Promise<ProcessedImage> {
  if (buffer.length > MAX_BYTES) throw new ImageError('too_large');
  const kind = detect(buffer);
  if (kind === 'unsupported') throw new ImageError('unsupported_type');

  try {
    if (kind === 'heic') {
      const size = readHeicDimensions(buffer);
      if (size === null) throw new ImageError('corrupt');
      // Checked on the header, before the memory-hungry decode.
      if (exceedsHeicPixelLimit(size.width, size.height)) throw new ImageError('too_many_pixels');
      const pixels = await decodeHeic(buffer);
      if (exceedsHeicPixelLimit(pixels.width, pixels.height))
        throw new ImageError('too_many_pixels');
      const raw = { raw: { width: pixels.width, height: pixels.height, channels: 4 as const } };
      return {
        variants: await encodeVariants(() =>
          sharp(pixels.data, { ...raw, limitInputPixels: MAX_PIXELS, failOn: 'error' }),
        ),
        width: pixels.width,
        height: pixels.height,
      };
    }

    const options = { limitInputPixels: MAX_PIXELS, failOn: 'error' as const };
    const metadata = await sharp(buffer, options).metadata();
    if (metadata.format !== 'jpeg' && metadata.format !== 'png' && metadata.format !== 'webp') {
      throw new ImageError('unsupported_type');
    }
    const { width, height } = metadata;
    if (!(width > 0 && height > 0)) throw new ImageError('corrupt');
    if (exceedsPixelLimit(width, height)) throw new ImageError('too_many_pixels');
    const variants = await encodeVariants(() => sharp(buffer, options));
    // EXIF orientations 5-8 swap the axes.
    const turned = (metadata.orientation ?? 1) >= 5;
    return { variants, width: turned ? height : width, height: turned ? width : height };
  } catch (error) {
    if (error instanceof ImageError) throw error;
    if (isPixelLimitError(error)) throw new ImageError('too_many_pixels');
    throw new ImageError('corrupt');
  }
}
