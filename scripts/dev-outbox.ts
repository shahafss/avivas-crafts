// `pnpm dev:outbox`: lists the 20 newest outbox rows and writes each HTML body to
// `.data/outbox/<id>.html` so it can be opened in a browser. Development and test only.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { desc } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/server/db/schema';

try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local: use the environment as it is.
}

if (process.env.APP_ENV === 'production') {
  console.error('Refusing to run with APP_ENV=production.');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const client = postgres(url, { max: 1, onnotice: () => undefined });
try {
  const rows = await drizzle(client, { schema })
    .select()
    .from(schema.emailOutbox)
    .orderBy(desc(schema.emailOutbox.createdAt))
    .limit(20);
  const dir = join(process.env.LOCAL_DATA_DIR ?? '.data', 'outbox');
  await mkdir(dir, { recursive: true });
  for (const row of rows) {
    const file = join(dir, `${row.id}.html`);
    if (row.html !== '') await writeFile(file, row.html);
    console.log(
      [
        row.createdAt.toISOString(),
        row.status.padEnd(7),
        row.kind.padEnd(20),
        row.toAddress,
        `"${row.subject}"`,
        row.html === '' ? '(body erased)' : file,
      ].join('  '),
    );
  }
  if (rows.length === 0) console.log('The outbox is empty.');
} finally {
  await client.end();
}
