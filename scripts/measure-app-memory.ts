/**
 * Whole-app memory gate (tasks.md T052, research.md R7): builds the app, runs `next start` in a
 * 512 MB linux/arm64 container without swap (like Render), uploads an 8160x6144 JPEG and a HEIC
 * photo through `POST /api/admin/images`, and records the container's memory (cgroup v2).
 *
 *   pnpm exec tsx --conditions=react-server scripts/measure-app-memory.ts --build
 *   pnpm exec tsx --conditions=react-server scripts/measure-app-memory.ts \
 *       [--heic tests/fixtures/images/heic-16mp.heic --heic tests/fixtures/images/heic-12mp.heic]
 *
 * Each HEIC candidate runs in its own fresh container (idle, JPEG, HEIC, then the 50 MP
 * `large.heic`, which must be refused). The script stops at the first candidate that passes: no
 * OOM kill and a peak (`memory.peak`) of at most 460 MB.
 *
 * It uses the Docker dev database (host.docker.internal:5433) and creates a temporary admin (role
 * `admin`) with a session and a draft product there; both are removed afterwards. It refuses to run unless
 * APP_ENV=development. The dependencies are installed inside the container (the host's
 * node_modules are for macOS); `node_modules` and `.next` live in named Docker volumes.
 */
import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import postgres from 'postgres';
import sharp from 'sharp';

const IMAGE = 'node:24-bookworm-slim';
const NAME = 'avivas-measure-app';
const PORT = 4012;
const ORIGIN = `http://localhost:${String(PORT)}`;
const PEAK_LIMIT_MB = 460;
const VOLUMES = [
  '-v',
  'avivas-measure-node-modules:/app/node_modules',
  '-v',
  'avivas-measure-next:/app/.next',
];
const REPO = resolve(import.meta.dirname, '..');

if (process.env.APP_ENV !== 'development') {
  console.error(
    'Refusing to run: APP_ENV must be "development" (this script writes to the dev database).',
  );
  process.exit(1);
}
const HOST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/avivas_crafts_dev';
if (!/\/avivas_crafts_dev(\?|$)/.test(HOST_DATABASE_URL)) {
  console.error('Refusing to run: DATABASE_URL must point at the avivas_crafts_dev database.');
  process.exit(1);
}

const APP_ENV_VARS: Record<string, string> = {
  APP_ENV: 'development',
  APP_ORIGIN: ORIGIN,
  IMAGE_PUBLIC_ORIGIN: ORIGIN,
  TRUSTED_PROXY_HOPS: '0',
  DATABASE_URL: 'postgres://postgres:postgres@host.docker.internal:5433/avivas_crafts_dev',
  SECRET_HMAC_KEY: 'bG9jYWwtZGV2LW9ubHktaG1hYy1rZXktMzItYnl0ZXMhIQ==',
  STORAGE_DRIVER: 'fs',
  LOCAL_DATA_DIR: '/tmp/data',
  EMAIL_DRIVER: 'outbox',
  EMAIL_FROM: 'shop@example.test',
  PAYMENT_PROVIDER: 'fake',
  OIDC_ISSUER: 'http://localhost:4011',
  GOOGLE_CLIENT_ID: 'local-google-client-id',
  GOOGLE_CLIENT_SECRET: 'local-google-client-secret',
};
const ENV_FLAGS = Object.entries(APP_ENV_VARS).flatMap(([key, value]) => ['-e', `${key}=${value}`]);

function docker(args: string[], options: { allowFail?: boolean } = {}): string {
  const run = spawnSync('docker', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (run.status !== 0 && options.allowFail !== true) {
    throw new Error(
      `docker ${args.slice(0, 3).join(' ')} failed (${String(run.status)}): ${run.stderr}`,
    );
  }
  return run.stdout.trim();
}

function exec(script: string): string {
  return docker(['exec', NAME, 'sh', '-c', script], { allowFail: true });
}

function build(): void {
  console.log('Installing dependencies and building inside the container (no memory limit)...');
  const run = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '--platform',
      'linux/arm64',
      '-v',
      `${REPO}:/app`,
      ...VOLUMES,
      '-w',
      '/app',
      ...ENV_FLAGS,
      IMAGE,
      'bash',
      '-c',
      'corepack enable pnpm && pnpm install --frozen-lockfile && pnpm build',
    ],
    { stdio: 'inherit' },
  );
  if (run.status !== 0) throw new Error('Build in the container failed');
}

interface StepReport {
  step: string;
  seconds?: number;
  status?: number;
  response?: string;
  memoryCurrentMb: number;
  memoryPeakMb: number;
  anonPeakMbDuringStep: number;
  oomKills: number;
}

const toMb = (bytes: number): number => Math.round(bytes / 1024 / 1024);
let sampleLine = 0;

function readCgroup(file: string): number {
  return Number(exec(`cat /sys/fs/cgroup/${file}`)) || 0;
}

/** Highest anonymous memory (heap, WASM, buffers: not page cache) sampled since the last call. */
function anonPeakSinceLastStep(): number {
  const out = exec(
    `awk -v m=${String(sampleLine)} 'NR>m {if ($1>p) p=$1} END {print p+0, NR}' /tmp/samples.txt`,
  ).split(' ');
  sampleLine = Number(out[1] ?? sampleLine);
  return toMb(Number(out[0] ?? 0));
}

function oomKills(): number {
  const events = exec('cat /sys/fs/cgroup/memory.events');
  return Number(/oom_kill (\d+)/.exec(events)?.[1] ?? 0);
}

function report(step: string, extra: Partial<StepReport> = {}): StepReport {
  const entry: StepReport = {
    step,
    memoryCurrentMb: toMb(readCgroup('memory.current')),
    memoryPeakMb: toMb(readCgroup('memory.peak')),
    anonPeakMbDuringStep: anonPeakSinceLastStep(),
    oomKills: oomKills(),
    ...extra,
  };
  console.log(JSON.stringify(entry));
  return entry;
}

/** Resident set of every node process in the container, in MB. */
function nodeRssMb(): number {
  const out = exec(
    `for p in /proc/[0-9]*; do if grep -Eq '^Name:.(node|next)' $p/status 2>/dev/null; then awk '/^VmRSS/{print $2}' $p/status; fi; done`,
  );
  return Math.round(out.split('\n').reduce((sum, line) => sum + (Number(line) || 0), 0) / 1024);
}

async function waitForHealth(): Promise<void> {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try {
      if ((await fetch(`${ORIGIN}/api/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(
    `The app did not answer /api/health\n${docker(['logs', '--tail', '40', NAME], { allowFail: true })}`,
  );
}

async function upload(
  file: string,
  bytes: Buffer,
  mime: string,
  token: string,
  productId: string,
): Promise<{ status: number; body: string; seconds: number }> {
  const form = new FormData();
  form.set('file', new File([new Uint8Array(bytes)], file, { type: mime }));
  form.set('productId', productId);
  const started = Date.now();
  const response = await fetch(`${ORIGIN}/api/admin/images`, {
    method: 'POST',
    headers: { Origin: ORIGIN, Cookie: `__Host-ac_admin=${token}` },
    body: form,
  });
  const body = await response.text();
  return { status: response.status, body, seconds: (Date.now() - started) / 1000 };
}

async function makeJpeg(): Promise<Buffer> {
  // Textured, so the JPEG has a realistic size (a flat picture would hide decoder cost).
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
  return base;
}

interface CandidateResult {
  heic: string;
  passed: boolean;
  reasons: string[];
  steps: StepReport[];
}

async function runCandidate(heicFile: string, jpeg: Buffer): Promise<CandidateResult> {
  const sql = postgres(HOST_DATABASE_URL, { max: 1, onnotice: () => undefined });
  const token = randomBytes(32).toString('base64url');
  const email = `measure-${randomBytes(4).toString('hex')}@example.test`;
  let adminId = '';
  let productId = '';
  const steps: StepReport[] = [];
  const reasons: string[] = [];
  try {
    const [admin] = await sql<{ id: string }[]>`
      INSERT INTO admin_user (display_name, google_email, role) VALUES ('Measure', ${email}, 'admin') RETURNING id`;
    adminId = admin?.id ?? '';
    await sql`
      INSERT INTO admin_session (token_hash, admin_id, expires_at)
      VALUES (${createHash('sha256').update(token).digest()}, ${adminId}, now() + interval '2 hours')`;
    const [row] = await sql<{ id: string }[]>`
      INSERT INTO product (slug, name_he) VALUES (${`measure-${randomBytes(4).toString('hex')}`}, 'מדידה') RETURNING id`;
    productId = row?.id ?? '';

    docker(['rm', '-f', NAME], { allowFail: true });
    docker([
      'run',
      '-d',
      '--name',
      NAME,
      '--memory=512m',
      '--memory-swap=512m',
      '--platform',
      'linux/arm64',
      '-v',
      `${REPO}:/app`,
      ...VOLUMES,
      '-w',
      '/app',
      '-p',
      `127.0.0.1:${String(PORT)}:${String(PORT)}`,
      ...ENV_FLAGS,
      IMAGE,
      'sh',
      '-c',
      `mkdir -p /tmp/data && exec node node_modules/next/dist/bin/next start -p ${String(PORT)}`,
    ]);
    await waitForHealth();
    // Memory sampler (anonymous memory, 20 samples a second), stopped with the container.
    docker([
      'exec',
      '-d',
      NAME,
      'sh',
      '-c',
      `while :; do awk '/^anon /{print $2}' /sys/fs/cgroup/memory.stat >> /tmp/samples.txt; sleep 0.05; done`,
    ]);
    sampleLine = 0;
    await new Promise((done) => setTimeout(done, 8000)); // let the first-request work settle
    steps.push(report('idle'));
    console.log(JSON.stringify({ step: 'idle node RSS', rssMb: nodeRssMb() }));

    const jpegResult = await upload('large.jpg', jpeg, 'image/jpeg', token, productId);
    steps.push(
      report('JPEG 8160x6144', {
        status: jpegResult.status,
        seconds: jpegResult.seconds,
        response: jpegResult.body.slice(0, 120),
      }),
    );
    if (jpegResult.status !== 201)
      reasons.push(`JPEG upload answered ${String(jpegResult.status)}`);

    const heicResult = await upload(
      'photo.heic',
      readFileSync(heicFile),
      'image/heic',
      token,
      productId,
    );
    steps.push(
      report(`HEIC ${heicFile}`, {
        status: heicResult.status,
        seconds: heicResult.seconds,
        response: heicResult.body.slice(0, 120),
      }),
    );
    if (heicResult.status !== 201)
      reasons.push(
        `HEIC upload answered ${String(heicResult.status)}: ${heicResult.body.slice(0, 80)}`,
      );

    const largeResult = await upload(
      'large.heic',
      readFileSync(join(REPO, 'tests/fixtures/images/large.heic')),
      'image/heic',
      token,
      productId,
    );
    steps.push(
      report('HEIC 50 MP (must be refused)', {
        status: largeResult.status,
        seconds: largeResult.seconds,
        response: largeResult.body.slice(0, 120),
      }),
    );
    if (largeResult.status !== 400 || !largeResult.body.includes('too_many_pixels')) {
      reasons.push(
        `50 MP HEIC was not refused: ${String(largeResult.status)} ${largeResult.body.slice(0, 80)}`,
      );
    }

    const healthy = (await fetch(`${ORIGIN}/api/health`).catch(() => null))?.ok === true;
    const state = docker(['inspect', '-f', '{{.State.OOMKilled}} {{.State.Running}}', NAME], {
      allowFail: true,
    });
    const finalPeak = toMb(readCgroup('memory.peak'));
    console.log(
      JSON.stringify({
        step: 'end',
        finalPeakMb: finalPeak,
        oomKilledAndRunning: state,
        healthy,
        oomKills: oomKills(),
      }),
    );
    if (state.startsWith('true')) reasons.push('container was OOM-killed');
    if (oomKills() > 0) reasons.push('the kernel killed a process (oom_kill > 0)');
    if (!healthy) reasons.push('the app does not answer after the uploads');
    if (finalPeak > PEAK_LIMIT_MB)
      reasons.push(`peak ${String(finalPeak)} MB is above ${String(PEAK_LIMIT_MB)} MB`);
    return { heic: heicFile, passed: reasons.length === 0, reasons, steps };
  } finally {
    docker(['rm', '-f', NAME], { allowFail: true });
    if (adminId !== '') {
      if (productId !== '') await sql`DELETE FROM product WHERE id = ${productId}`; // images cascade
      await sql`DELETE FROM admin_activity WHERE admin_id = ${adminId}`;
      await sql`DELETE FROM admin_user WHERE id = ${adminId}`; // sessions cascade
    }
    await sql.end();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--build')) {
    build();
    return;
  }
  const heics = args.flatMap((arg, index) => (arg === '--heic' ? [args[index + 1] ?? ''] : []));
  if (heics.length === 0) {
    heics.push('tests/fixtures/images/heic-16mp.heic', 'tests/fixtures/images/heic-12mp.heic');
  }
  const jpeg = await makeJpeg();
  for (const heic of heics) {
    console.log(`\n=== candidate ${heic} ===`);
    const result = await runCandidate(resolve(REPO, heic), jpeg);
    console.log(
      JSON.stringify({ candidate: heic, passed: result.passed, reasons: result.reasons }),
    );
    if (result.passed) return;
  }
  process.exitCode = 1;
}

void main().catch((error: unknown) => {
  docker(['rm', '-f', NAME], { allowFail: true });
  console.error(error);
  process.exit(1);
});
