import type { PgDatabase } from 'drizzle-orm/pg-core';

/**
 * Anything that can run queries: the app's `db`, a transaction (`withTx`), or the PGlite handle
 * in tests. Modules that take a `tx` parameter use this so callers pass either.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbLike = PgDatabase<any, any, any>;
