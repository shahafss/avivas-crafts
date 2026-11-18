/**
 * pnpm check:image-metadata <url|path> (research D9, contracts/operations.md).
 *
 * Fails when an image carries an EXIF or XMP block. Every format, WebP included, is read with
 * `sharp().metadata()` (exifr cannot read WebP). When EXIF is present, exifr decodes that buffer
 * only to name the fields found; values are never printed.
 *
 * Exit 0: `clean: <name>`. Exit 1: `metadata found: <field names>`. Exit 2: `error: <reason>`.
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import exifr from 'exifr';
import sharp, { type Metadata } from 'sharp';

const MAX_BYTES = 25 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 20_000;

export interface CheckResult {
  code: 0 | 1 | 2;
  line: string;
}

class ReadError extends Error {}

async function readUrl(url: string): Promise<Buffer> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    throw new ReadError('could not fetch the URL (network error or timeout)');
  }
  if (!response.ok) throw new ReadError(`HTTP ${String(response.status)}`);
  const declared = Number(response.headers.get('content-length') ?? '0');
  if (declared > MAX_BYTES) throw new ReadError('file is larger than 25 MB');
  if (!response.body) throw new ReadError('empty response');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > MAX_BYTES) throw new ReadError('file is larger than 25 MB');
      chunks.push(chunk);
    }
  } catch (error) {
    if (error instanceof ReadError) throw error;
    throw new ReadError('could not fetch the URL (network error or timeout)');
  }
  return Buffer.concat(chunks);
}

async function readInput(input: string): Promise<{ buffer: Buffer; name: string }> {
  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input);
    return { buffer: await readUrl(input), name: basename(url.pathname) || url.host };
  }
  let buffer: Buffer;
  try {
    buffer = await readFile(input);
  } catch {
    throw new ReadError('file not found or not readable');
  }
  if (buffer.length > MAX_BYTES) throw new ReadError('file is larger than 25 MB');
  return { buffer, name: basename(input) };
}

/** Names the kinds of data in an EXIF buffer: GPS, Make, Model, other. */
async function exifFields(exif: Buffer): Promise<string[]> {
  const fields: string[] = [];
  try {
    // sharp returns the block with the "Exif\0\0" prefix; exifr wants the TIFF part.
    const tiff = exif.subarray(0, 4).toString('latin1') === 'Exif' ? exif.subarray(6) : exif;
    const data = (await exifr.parse(tiff, { gps: true, tiff: true, exif: true, xmp: false })) as
      Record<string, unknown> | undefined;
    const keys = Object.keys(data ?? {});
    if (keys.some((key) => key.startsWith('GPS') || key === 'latitude' || key === 'longitude'))
      fields.push('GPS');
    if (keys.includes('Make')) fields.push('Make');
    if (keys.includes('Model')) fields.push('Model');
    if (keys.some((key) => !/^(GPS|latitude$|longitude$|Make$|Model$)/.test(key)))
      fields.push('other');
  } catch {
    // An EXIF block that cannot be decoded is still metadata.
  }
  return fields.length > 0 ? fields : ['other'];
}

export async function checkImageMetadata(input: string): Promise<CheckResult> {
  try {
    const { buffer, name } = await readInput(input);
    let metadata: Metadata;
    try {
      metadata = await sharp(buffer).metadata();
    } catch {
      throw new ReadError('not an image');
    }
    const found: string[] = [];
    if (metadata.exif) found.push(...(await exifFields(metadata.exif)));
    if (metadata.xmp) found.push('XMP');
    if (found.length > 0) return { code: 1, line: `metadata found: ${found.join(', ')}` };
    return { code: 0, line: `clean: ${name}` };
  } catch (error) {
    const reason = error instanceof ReadError ? error.message : 'could not read the image';
    return { code: 2, line: `error: ${reason}` };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const input = process.argv[2];
  if (!input) {
    console.log('error: usage: pnpm check:image-metadata <url|path>');
    process.exit(2);
  }
  void checkImageMetadata(input).then((result) => {
    console.log(result.line);
    process.exit(result.code);
  });
}
