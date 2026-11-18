import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  PROTECTED_DIR,
  REPO_ROOT,
  SRC_DIR,
  adminPageFiles,
  apiRouteFiles,
  findFiles,
  findSourceFiles,
  routeUrl,
} from '../helpers/admin-files';
import { setRequestCookie } from '../setup/next-mocks';

// requireAdmin() looks the session up through getSession(); the test controls its answer and
// spies on the database: a guarded action must throw the sign-in redirect before touching it.
// `roleUser` runs the real getSession() against a fake database that holds one live session whose
// user has role `user`: the only reads and writes allowed are the guard's own.
const state = vi.hoisted(() => ({
  session: null as object | null,
  roleUser: false,
  dbAccess: [] as string[],
}));

vi.mock('@/server/auth/session', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/server/auth/session')>();
  return {
    ...original,
    getSession: vi.fn((...args: Parameters<typeof original.getSession>) =>
      state.roleUser ? original.getSession(...args) : Promise.resolve(state.session),
    ),
  };
});
vi.mock('@/server/env', () => ({
  getEnv: () => ({ APP_ORIGIN: 'http://localhost:3100', APP_ENV: 'test' }),
}));
vi.mock('@/server/privacy/export', () => ({
  exportCustomer: vi.fn(() =>
    Promise.resolve({ ok: true, data: { filename: 'customer.json', content: '{}' } }),
  ),
}));
vi.mock('@/server/privacy/anonymize', () => ({
  anonymizePerson: vi.fn(() =>
    Promise.resolve({ ok: true, data: { count: 1, skipped: 0, keptCheckouts: 0 } }),
  ),
}));
vi.mock('@/server/db/client', () => {
  const spy = new Proxy(
    {},
    {
      get(_target, property) {
        const name = String(property);
        state.dbAccess.push(name);
        return () => {
          throw new Error(`database touched: ${name}`);
        };
      },
    },
  );
  // Any chain of calls, awaited, gives `result`.
  const chain = (result: unknown): unknown =>
    new Proxy(function () {}, {
      get: (_target, property) =>
        property === 'then'
          ? (resolve: (value: unknown) => void) => {
              resolve(result);
            }
          : chain(result),
      apply: () => chain(result),
    });
  const now = new Date();
  const roleUserRow = {
    session: {
      tokenHash: Buffer.alloc(32),
      adminId: 'u1',
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + 3_600_000),
      userAgentSummary: '',
    },
    admin: { id: 'u1', displayName: 'User', googleEmail: 'user@example.test', role: 'user' },
  };
  const roleUserDb = new Proxy(
    {},
    {
      get(_target, property) {
        const name = String(property);
        state.dbAccess.push(name);
        return () => chain(name === 'select' ? [roleUserRow] : []);
      },
    },
  );
  return {
    get db() {
      return state.roleUser ? roleUserDb : spy;
    },
    withTx: () => Promise.reject(new Error('database touched: withTx')),
  };
});

const INPUTS: unknown[][] = [
  [undefined],
  [],
  [{}],
  [42, 'x', null],
  [{ id: 'x', confirm: true }],
  [
    {
      adminId: 'x',
      displayName: 'x',
      googleEmail: 'x@example.test',
      confirm: true,
    },
  ],
  ['x', true],
];

const actionFiles = findFiles(PROTECTED_DIR, 'actions.ts');

function isSignInRedirect(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === 'string' &&
    digest.startsWith('NEXT_REDIRECT') &&
    digest.includes('/admin/sign-in')
  );
}

async function exportedActions(
  file: string,
): Promise<[string, (...args: unknown[]) => Promise<unknown>][]> {
  const loaded = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
  return Object.entries(loaded).filter(
    (entry): entry is [string, (...args: unknown[]) => Promise<unknown>] =>
      typeof entry[1] === 'function',
  );
}

describe('admin file walk', () => {
  it('finds the dashboard page, so an empty walk is never mistaken for "no actions"', () => {
    expect(adminPageFiles().map((file) => relative(REPO_ROOT, file))).toContain(
      'src/app/admin/(protected)/page.tsx',
    );
  });
});

describe('the order Server Actions are among the discovered exports', () => {
  it('lists all six, so moving or renaming the file cannot drop them from the guard checks', async () => {
    const file = actionFiles.find((entry) =>
      relative(REPO_ROOT, entry).endsWith('orders/[id]/actions.ts'),
    );
    expect(file).toBeDefined();
    const names = (await exportedActions(file ?? '')).map(([name]) => name);
    for (const name of [
      'setOrderStatus',
      'stepBackOrderStatus',
      'updateFulfilmentDetails',
      'markOrderPaid',
      'markOrderRefunded',
      'updateOrderCustomer',
    ]) {
      expect(names).toContain(name);
    }
  });
});

describe('the customer Server Actions are among the discovered exports', () => {
  it('lists all four, so renaming or moving one cannot drop it from the guard checks', async () => {
    const file = actionFiles.find((entry) =>
      relative(REPO_ROOT, entry).endsWith('customers/actions.ts'),
    );
    expect(file).toBeDefined();
    const names = (await exportedActions(file ?? '')).map(([name]) => name);
    for (const name of [
      'searchCustomers',
      'exportCustomer',
      'withdrawMarketingConsent',
      'anonymizeCustomer',
    ]) {
      expect(names).toContain(name);
    }
  });
});

describe('every admin Server Action guards itself first', () => {
  it('redirects to sign-in before touching the database or validating input (signed out)', async () => {
    state.session = null;
    for (const file of actionFiles) {
      for (const [name, action] of await exportedActions(file)) {
        for (const input of INPUTS) {
          state.dbAccess.length = 0;
          let thrown: unknown;
          try {
            await action(...input);
          } catch (error) {
            thrown = error;
          }
          const where = `${relative(REPO_ROOT, file)} › ${name}(${JSON.stringify(input)})`;
          expect(
            isSignInRedirect(thrown),
            `${where} must throw the sign-in redirect, got ${String(thrown)}`,
          ).toBe(true);
          expect(state.dbAccess, `${where} touched the database`).toEqual([]);
        }
      }
    }
  });
});

describe('a signed-in admin passes the guard with no second check (FR-009, SC-003)', () => {
  const admin = {
    id: 'a1',
    displayName: 'Aviva',
    googleEmail: 'aviva@example.test',
    role: 'admin',
  };
  const input = { q: 'dana@example.com', orderIds: [] as string[] };

  it('exportCustomer and anonymizeCustomer reach the data layer and return no formError', async () => {
    const [{ exportCustomer: exportRecord }, { anonymizePerson }] = await Promise.all([
      import('@/server/privacy/export'),
      import('@/server/privacy/anonymize'),
    ]);
    const file = actionFiles.find((entry) =>
      relative(REPO_ROOT, entry).endsWith('customers/actions.ts'),
    );
    const actions = Object.fromEntries(await exportedActions(file ?? '')) as Record<
      string,
      (...args: unknown[]) => Promise<{ ok: boolean; formError?: string }>
    >;
    state.session = { admin, session: { tokenHash: Buffer.alloc(32) } };
    try {
      const exported = await actions.exportCustomer?.(input);
      const erased = await actions.anonymizeCustomer?.({ ...input, confirm: true });
      expect(exported).toMatchObject({ ok: true });
      expect(erased).toMatchObject({ ok: true });
      expect(exported?.formError).toBeUndefined();
      expect(erased?.formError).toBeUndefined();
      expect(exportRecord).toHaveBeenCalledTimes(1);
      expect(anonymizePerson).toHaveBeenCalledTimes(1);
    } finally {
      state.session = null;
    }
  });
});

describe('a session whose user has role user is refused everywhere (FR-002, SC-002)', () => {
  const COOKIE = '__Host-ac_admin';

  it("every Server Action redirects to sign-in and touches only the guard's own reads", async () => {
    state.roleUser = true;
    try {
      for (const file of actionFiles) {
        for (const [name, action] of await exportedActions(file)) {
          setRequestCookie(COOKIE, 'role-user-token');
          state.dbAccess.length = 0;
          let thrown: unknown;
          try {
            await action({ q: 'dana@example.com', orderIds: [], confirm: true });
          } catch (error) {
            thrown = error;
          }
          const where = `${relative(REPO_ROOT, file)} › ${name}`;
          expect(isSignInRedirect(thrown), `${where} must redirect, got ${String(thrown)}`).toBe(
            true,
          );
          expect(state.dbAccess, `${where} went past the guard`).toEqual(['select', 'delete']);
        }
      }
    } finally {
      state.roleUser = false;
    }
  });

  it('every admin API route answers 401', async () => {
    const files = apiRouteFiles();
    expect(files.length).toBeGreaterThan(0);
    state.roleUser = true;
    try {
      for (const file of files) {
        const loaded = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
        for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
          const handler = loaded[method];
          if (typeof handler !== 'function') continue;
          const url = routeUrl(file, () => 'x');
          const response = await (handler as (request: Request) => Promise<Response>)(
            new Request(`http://localhost:3100${url}`, {
              method,
              headers: {
                cookie: `${COOKIE}=role-user-token`,
                origin: 'http://localhost:3100',
                'content-type': 'application/json',
              },
            }),
          );
          expect(response.status, `${method} ${url}`).toBe(401);
        }
      }
    } finally {
      state.roleUser = false;
    }
  });
});

describe('every admin page guards itself', () => {
  it('calls requireAdmin() as its first await, before loading data', () => {
    const pages = adminPageFiles();
    expect(pages.length).toBeGreaterThan(0);
    for (const file of pages) {
      const source = readFileSync(file, 'utf8');
      const start = source.search(/export default (async )?function/);
      expect(
        start,
        `${relative(REPO_ROOT, file)} needs a default exported component`,
      ).toBeGreaterThanOrEqual(0);
      const firstAwait = /await\s+([A-Za-z_]+)\(/.exec(source.slice(start));
      expect(
        firstAwait?.[1],
        `${relative(REPO_ROOT, file)} must call requireAdmin() before any other await`,
      ).toBe('requireAdmin');
    }
  });
});

describe("'use server' lives only in actions.ts", () => {
  it('has no other file with the directive, so the walk above sees every Server Action', () => {
    const offenders = findSourceFiles(SRC_DIR).filter(
      (file) =>
        !file.endsWith('/actions.ts') &&
        /^\s*['"]use server['"];?\s*$/m.test(readFileSync(file, 'utf8')),
    );
    expect(offenders.map((file) => relative(REPO_ROOT, file))).toEqual([]);
  });
});
