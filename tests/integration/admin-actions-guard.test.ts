import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  PROTECTED_DIR,
  REPO_ROOT,
  SRC_DIR,
  adminPageFiles,
  findFiles,
  findSourceFiles,
} from '../helpers/admin-files';

// requireAdmin() looks the session up through getSession(); the test controls its answer and
// spies on the database: a guarded action must throw the sign-in redirect before touching it.
const state = vi.hoisted(() => ({
  session: null as object | null,
  dbAccess: [] as string[],
  dbWrites: [] as string[],
}));

vi.mock('@/server/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/auth/session')>()),
  getSession: vi.fn(() => Promise.resolve(state.session)),
}));
vi.mock('@/server/db/client', () => {
  const spy = new Proxy(
    {},
    {
      get(_target, property) {
        const name = String(property);
        state.dbAccess.push(name);
        if (['insert', 'update', 'delete', 'transaction', 'execute'].includes(name))
          state.dbWrites.push(name);
        return () => {
          throw new Error(`database touched: ${name}`);
        };
      },
    },
  );
  return { db: spy, withTx: () => Promise.reject(new Error('database touched: withTx')) };
});

const admin = { id: 'admin-1', displayName: 'Aviva', googleEmail: 'aviva@example.test' };
const baseSession = {
  tokenHash: Buffer.alloc(32),
  adminId: admin.id,
  stage: 'full',
  reauthAt: new Date(),
  purpose: null,
  nextPath: null,
};
const pendingSession = {
  admin,
  session: { ...baseSession, stage: 'pending_passkey', reauthAt: null },
};
const staleSession = {
  admin,
  session: { ...baseSession, reauthAt: new Date(Date.now() - 10 * 60_000) },
};

/** ⟳ actions of contracts/server-actions.md; those that do not exist yet are skipped. */
const REAUTH_ACTIONS = [
  'addAdmin',
  'removeAdmin',
  'regenerateSetupLink',
  'removePasskey',
  'regenerateRecoveryCodes',
  'approvePasskey',
  'rejectPasskey',
  'clearSignInBlock',
  // 003 FR-019a: the customer export and erase.
  'exportCustomer',
  'anonymizeCustomer',
];

const INPUTS: unknown[][] = [
  [undefined],
  [],
  [{}],
  [42, 'x', null],
  [{ id: 'x', confirm: true }],
  [
    {
      adminId: 'x',
      passkeyId: 'x',
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
  it('lists all four, so renaming or moving one cannot drop it from the re-check checks', async () => {
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
    // Both re-check names are in the list the stale-passkey test walks.
    expect(REAUTH_ACTIONS).toEqual(expect.arrayContaining(['exportCustomer', 'anonymizeCustomer']));
  });
});

describe('every admin Server Action guards itself first', () => {
  for (const [label, session] of [
    ['signed out', null],
    ['with only a pending_passkey session', pendingSession],
  ] as const) {
    it(`redirects to sign-in before touching the database or validating input (${label})`, async () => {
      state.session = session;
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
  }

  it('asks for the passkey re-check on every ⟳ action when reauth_at is older than 5 minutes', async () => {
    state.session = staleSession;
    for (const file of actionFiles) {
      for (const [name, action] of await exportedActions(file)) {
        if (!REAUTH_ACTIONS.includes(name)) continue;
        state.dbWrites.length = 0;
        const result = await action({ id: 'x', adminId: 'x', passkeyId: 'x', confirm: true });
        expect(result, `${name} must answer admin.reauth_required`).toMatchObject({
          ok: false,
          formError: 'admin.reauth_required',
        });
        expect(state.dbWrites, `${name} wrote to the database before the re-check`).toEqual([]);
      }
    }
  });
});

describe('search and marketing withdrawal need no passkey re-check (003 Q7)', () => {
  it('do not answer admin.reauth_required when reauth_at is older than 5 minutes', async () => {
    state.session = staleSession;
    const file = actionFiles.find((entry) =>
      relative(REPO_ROOT, entry).endsWith('customers/actions.ts'),
    );
    const actions = new Map(await exportedActions(file ?? ''));
    for (const name of ['searchCustomers', 'withdrawMarketingConsent']) {
      let result: unknown;
      state.dbAccess.length = 0;
      try {
        // The database is a spy that throws: getting past the guard is what is checked.
        result = await actions.get(name)?.({
          q: 'nobody@example.test',
          orderIds: [],
          confirm: true,
        });
      } catch (error) {
        result = error;
      }
      expect(result, name).not.toMatchObject({ formError: 'admin.reauth_required' });
      expect(state.dbAccess.length, `${name} must reach the data layer`).toBeGreaterThan(0);
    }
  });
});

describe('every admin page guards itself', () => {
  it('calls requireAdmin() (or requireRecentAuth()) as its first await, before loading data', () => {
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
        ['requireAdmin', 'requireRecentAuth'],
        `${relative(REPO_ROOT, file)} must call requireAdmin() before any other await`,
      ).toContain(firstAwait?.[1]);
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
