import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getEnv } from '@/server/env';
import * as schema from './schema';

type Database = ReturnType<typeof drizzle<typeof schema>>;

let instance: Database | undefined;

function create(): Database {
  const env = getEnv();
  const client = postgres(env.DATABASE_URL, {
    max: 5,
    ssl: env.APP_ENV === 'staging' || env.APP_ENV === 'production' ? 'require' : false,
    onnotice: () => undefined,
  });
  return drizzle(client, { schema });
}

function getDb(): Database {
  instance ??= create();
  return instance;
}

/** Lazily created so that importing this module (e.g. during `next build`) needs no secrets. */
export const db: Database = new Proxy({} as Database, {
  get: (_target, property) => {
    const real = getDb();
    const value = Reflect.get(real, property) as unknown;
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(real)
      : value;
  },
});

export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Runs `fn` in a transaction (rolled back when it throws). */
export function withTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(fn);
}
