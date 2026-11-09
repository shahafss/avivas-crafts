/**
 * Early-warning memory measurement of the image pipeline (research.md R7).
 * Run it inside a 512 MB linux/arm64 container with dependencies installed in the container:
 *
 *   docker run --rm --memory=512m --platform linux/arm64 \
 *     -v "$PWD":/app -v avivas-measure-node-modules:/app/node_modules -w /app node:24-bookworm-slim \
 *     bash -c 'corepack enable pnpm && pnpm install --frozen-lockfile \
 *       && pnpm exec tsx --conditions=react-server scripts/measure-image-memory.ts'
 *
 * Each case runs in its own fresh process so that the printed peak RSS belongs to that case only.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';

async function measure(label: string, file: string): Promise<void> {
  const { processUpload } = await import('../src/server/images/process');
  const started = Date.now();
  const result = await processUpload(readFileSync(file));
  const peakMb = process.resourceUsage().maxRSS / 1024; // kilobytes on Linux
  console.log(
    JSON.stringify({
      label,
      peakRssMb: Math.round(peakMb),
      seconds: (Date.now() - started) / 1000,
      variants: result.variants.length,
    }),
  );
}

async function main(): Promise<void> {
  const [flag, label, file] = process.argv.slice(2);
  if (flag === '--measure' && label && file) {
    await measure(label, file);
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), 'measure-image-'));
  const jpeg = join(dir, 'large.jpg');
  // Textured, so the JPEG is a realistic size (a flat picture would hide decoder cost).
  const base = await sharp({
    create: {
      width: 1020,
      height: 768,
      channels: 3,
      background: '#808080',
      noise: { type: 'gaussian', mean: 128, sigma: 40 },
    },
  })
    .resize(8160, 6144, { kernel: 'cubic' })
    .jpeg({ quality: 85 })
    .toBuffer();
  writeFileSync(jpeg, base);
  sharp.cache(false);

  const cases: [string, string][] = [
    ['jpeg 8160x6144', jpeg],
    ['heic sample', join(process.cwd(), 'tests/fixtures/images/sample.heic')],
    ['heic >= 48 MP', join(process.cwd(), 'tests/fixtures/images/large.heic')],
  ];
  for (const [name, path] of cases) {
    const run = spawnSync(
      process.execPath,
      [...process.execArgv, process.argv[1] ?? '', '--measure', name, path],
      {
        encoding: 'utf8',
      },
    );
    process.stdout.write(run.stdout);
    if (run.status !== 0) {
      process.stderr.write(run.stderr);
      console.log(
        JSON.stringify({ label: name, failed: true, status: run.status, signal: run.signal }),
      );
    }
  }
}

void main();
