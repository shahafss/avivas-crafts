// pnpm dev: one command for local development. In order it
//   1. creates .env.local from .env.example when it is missing,
//   2. checks that the port of APP_ORIGIN is free (fails instead of silently moving to another
//      port: the setup links and image URLs are built from APP_ORIGIN),
//   3. starts the database container (docker compose, left running on exit),
//   4. applies the migrations and the seed (both idempotent),
//   5. creates the first admin when there is none and prints the one-time setup link,
//   6. starts the mock Google (OIDC) issuer in this process, unless port 4011 is already served,
//   7. starts `next dev`, and stops the mock and next on Ctrl+C.
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:net';
import postgres from 'postgres';

if (!existsSync('.env.local')) {
  copyFileSync('.env.example', '.env.local');
  console.log('Created .env.local from .env.example.');
}
process.loadEnvFile('.env.local');

const origin = new URL(process.env.APP_ORIGIN ?? 'http://localhost:3001');
const port = Number(origin.port || (origin.protocol === 'https:' ? 443 : 80));

function portIsFree(portNumber: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.listen(portNumber, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Runs a command to the end with its output shown; stops `pnpm dev` when it fails. */
function runStep(label: string, command: string, args: string[]): void {
  console.log(`> ${label}`);
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) fail(`Step failed: ${label}. Fix it and run pnpm dev again.`);
}

if (!(await portIsFree(port))) {
  fail(
    `Port ${String(port)} is in use by another program. Stop it, or set APP_ORIGIN and IMAGE_PUBLIC_ORIGIN in .env.local to another port (e.g. http://localhost:${String(port + 1)}) and run pnpm dev again.`,
  );
}

// 1. Database.
const docker = spawnSync('docker', ['info'], { stdio: 'ignore' });
if (docker.error || docker.status !== 0) {
  fail('Docker is not running: start Docker Desktop and run pnpm dev again.');
}
runStep('Starting the database', 'docker', ['compose', 'up', '-d', '--wait', 'db']);
runStep('Applying migrations', 'pnpm', ['db:migrate']);
runStep('Seeding', 'pnpm', ['db:seed']);

// 2. The mock Google user (its email is the first admin's).
const { mockUserEmail, startOidcMock, OIDC_MOCK_PORT } = await import('./oidc-mock');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) fail('DATABASE_URL is not set in .env.local.');
const client = postgres(databaseUrl, { max: 1, onnotice: () => undefined });
let hasAdmin: boolean;
try {
  const rows = await client`select 1 from admin_user limit 1`;
  hasAdmin = rows.length > 0;
} finally {
  await client.end();
}
if (!hasAdmin) {
  runStep('Creating the first admin', 'pnpm', ['admin:add', mockUserEmail(), 'Local Admin']);
}

// 3. Mock OIDC issuer.
let mock: Awaited<ReturnType<typeof startOidcMock>> | undefined;
if (await portIsFree(OIDC_MOCK_PORT)) {
  mock = await startOidcMock();
  console.log(`Mock Google (OIDC) running at ${mock.issuer}`);
} else {
  console.log(`Port ${String(OIDC_MOCK_PORT)} is already in use: reusing the mock OIDC issuer there.`);
}

console.log(`\nShop and admin: ${origin.origin}   Emails: pnpm dev:outbox\n`);

// 4. next dev.
const child = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(port)], { stdio: 'inherit' });
let stopping = false;
async function shutdown(code: number): Promise<never> {
  if (!stopping) {
    stopping = true;
    await mock?.stop().catch(() => undefined);
  }
  process.exit(code);
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    child.kill(signal);
    // next exits on the signal and its exit handler finishes; this is the fallback.
    setTimeout(() => void shutdown(0), 5000).unref();
  });
}
child.on('exit', (code, signal) => {
  void shutdown(code ?? (signal ? 1 : 0));
});
