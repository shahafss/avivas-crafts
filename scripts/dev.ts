// pnpm dev: starts `next dev` on the port of APP_ORIGIN and fails, instead of silently moving to
// another port, when that port is taken (the setup links and image URLs are built from APP_ORIGIN).
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local: use the environment as it is.
}

const origin = new URL(process.env.APP_ORIGIN ?? 'http://localhost:3001');
const port = Number(origin.port || (origin.protocol === 'https:' ? 443 : 80));

function portIsFree(): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.listen(port, () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

if (!(await portIsFree())) {
  console.error(
    `Port ${String(port)} is in use by another program. Stop it, or set APP_ORIGIN and IMAGE_PUBLIC_ORIGIN in .env.local to another port (e.g. http://localhost:${String(port + 1)}) and run pnpm dev again.`,
  );
  process.exit(1);
}

const child = spawn('pnpm', ['exec', 'next', 'dev', '-p', String(port)], { stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
