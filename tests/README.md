# Tests

| Project       | Folder                              | Runs on                                  | Command                 |
| ------------- | ----------------------------------- | ---------------------------------------- | ----------------------- |
| `unit`        | `tests/unit/**/*.test.ts`           | Node, no database                        | `pnpm test:unit`        |
| `integration` | `tests/integration/**/*.test.ts`    | PGlite (in-process Postgres)             | `pnpm test:integration` |
| `pg`          | `tests/integration-pg/**/*.test.ts` | real PostgreSQL 17 (`DATABASE_URL_TEST`) | `pnpm test:pg`          |
| E2E           | `tests/e2e/*.spec.ts`               | Playwright against `pnpm start`          | `pnpm test:e2e`         |

`pnpm test` runs `unit` and `integration`. `test:pg` needs `docker compose up -d db` and
`DATABASE_URL_TEST` (see `.env.example`) exported in the shell: nothing loads `.env*` files, so run
`export DATABASE_URL_TEST=...` first. PGlite is a single connection, so every concurrency or
locking test belongs in `tests/integration-pg/`.

## Setup shared by all Vitest projects

- `server-only` is aliased to an empty module (`tests/setup/empty.ts`) and `@/` maps to `src/`.
- `tests/setup/next-mocks.ts` (registered as setup file) mocks `next/headers` and
  `next/navigation`. `cookies()`/`headers()` read a per-test in-memory jar; the jar is cleared
  before every test. Set it from a test with the helpers re-exported by the setup file:

  ```ts
  import { setRequestCookie, setRequestHeader, setCookieCalls } from '../setup/next-mocks';

  setRequestCookie('NEXT_LOCALE', 'he');
  setRequestHeader('x-forwarded-for', '203.0.113.7');
  ```

  `redirect()` and `notFound()` throw errors whose `digest` starts with `NEXT_REDIRECT` /
  `NEXT_NOT_FOUND`; assert with `expect(...).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT/) })`.

## Integration tests on PGlite

`createTestDb()` (`tests/setup/pglite.ts`) starts an in-memory PGlite, applies every migration
from `src/server/db/migrations/` and returns `{ db, client, reset, close }`. Inject it in place
of the app's client:

```ts
import { afterAll, beforeAll, beforeEach, vi } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';

let testDb: TestDbHandle;

vi.mock('@/server/db/client', () => ({
  get db() {
    return testDb.db;
  },
  withTx: <T>(fn: (tx: unknown) => Promise<T>) => testDb.db.transaction(fn as never),
}));

beforeAll(async () => {
  testDb = await createTestDb();
});
beforeEach(() => testDb.reset());
afterAll(() => testDb.close());
```

(`vi.mock` is hoisted, so the factory reads `testDb` lazily through a getter.)

## Concurrency tests on real PostgreSQL

`tests/setup/pg-global-setup.ts` migrates a template database `avivas_crafts_test_tpl` once per
run. In each test file, `createPgTestDb()` (`tests/setup/pg.ts`) runs
`CREATE DATABASE test_<random> TEMPLATE avivas_crafts_test_tpl` (a fresh database, because
drizzle-kit migrations hard-code the `public` schema), gives out two independent connections
`a` and `b` for race tests, and `close()` drops the database:

```ts
const pg = await createPgTestDb();
// race: run two transactions on pg.a and pg.b at the same time
await pg.close();
```

## Moving the E2E ports

The E2E app servers use ports 3100 (app) and 3101 (consent). When another process holds them, set
`E2E_PORT` and/or `CONSENT_PORT` for the run, e.g. `E2E_PORT=3200 CONSENT_PORT=3201 pnpm exec
playwright test`. `baseURL`, `APP_ORIGIN`, `IMAGE_PUBLIC_ORIGIN` and the helpers' `serverEnv()` all
follow them (`tests/e2e/env.ts`). The mock OIDC port (4011) is fixed.
