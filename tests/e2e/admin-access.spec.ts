import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import {
  adminPageFiles,
  apiRouteFiles,
  pageUrl,
  REPO_ROOT,
  routeUrl,
} from '../helpers/admin-files';
import { expect, resetDb, sql, test } from './fixtures';

// Every admin page and admin API route must refuse a signed-out visitor and a visitor who only
// finished the Google step (`pending_passkey`), and must reveal none of the shop's private data.
// The lists come from the file tree, so routes added by later phases are covered automatically.

const SENTINELS = ['SENTINEL-DRAFT', 'sentinel@example.test', 'SENTINEL-ORDER-NOTE'];
const SESSION_COOKIE = '__Host-ac_admin';

let productId = '';
let pendingToken = '';

test.beforeAll(async () => {
  await resetDb();
  const [product] = await sql<{ id: string }[]>`
    INSERT INTO product (slug, name_he, name_en, state)
    VALUES ('sentinel-draft', 'SENTINEL-DRAFT', 'SENTINEL-DRAFT', 'draft')
    RETURNING id`;
  productId = product?.id ?? '';
  const [zone] = await sql<{ id: string }[]>`SELECT id FROM shipping_zone LIMIT 1`;
  await sql`
    INSERT INTO orders
      (public_token_hash, public_token_expires_at, locale, zone_id, currency, customer_name,
       customer_phone, customer_email, delivery_method, payment_method, subtotal_minor, total_minor,
       terms_accepted_at, terms_version, privacy_version, note)
    VALUES
      (${createHash('sha256').update('sentinel-order-token').digest()}, now() + interval '30 days',
       'he', ${zone?.id ?? ''}, 'ILS', 'Sentinel Customer', '+972501234567', 'sentinel@example.test',
       'pickup', 'offline', 10000, 10000, now(), 1, 1, 'SENTINEL-ORDER-NOTE')`;
  const [admin] = await sql<{ id: string }[]>`
    INSERT INTO admin_user (display_name, google_email, google_sub)
    VALUES ('Access Admin', 'access-admin@example.test', 'sub-access-admin')
    RETURNING id`;
  pendingToken = randomBytes(32).toString('base64url');
  await sql`
    INSERT INTO admin_session (token_hash, admin_id, stage, expires_at, purpose)
    VALUES (${createHash('sha256').update(pendingToken).digest()}, ${admin?.id ?? ''}, 'pending_passkey',
            now() + interval '12 hours', 'sign_in')`;
});

// The pending session idles out after 5 minutes: keep it alive so the "pending" runs stay meaningful.
test.beforeEach(async () => {
  await sql`UPDATE admin_session SET last_seen_at = now(), ended_at = NULL WHERE stage = 'pending_passkey'`;
});

const fill = (segment: string): string => (segment.startsWith('[...') ? 'unknown/page' : productId);

// Titles keep the `[id]` placeholders; the real URLs are built inside the tests, after the seeding above.
const pages = adminPageFiles().map((file) => ({
  path: file,
  file: relative(REPO_ROOT, file),
  title: pageUrl(file, (segment) => segment),
}));

function methodsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((method) =>
    new RegExp(
      `export\\s+(async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b`,
    ).test(source),
  );
}

const routes = apiRouteFiles().flatMap((file) =>
  methodsOf(file).map((method) => ({
    path: file,
    file: relative(REPO_ROOT, file),
    title: routeUrl(file, (segment) => segment),
    method,
  })),
);

const states = [
  { name: 'signed out', withPendingSession: false },
  { name: 'with only a pending_passkey session', withPendingSession: true },
];

test.describe('the lists of admin routes', () => {
  test('are built from the file tree and include the dashboard', () => {
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.map((page) => page.file)).toContain('src/app/admin/(protected)/page.tsx');
    expect(pages.map((page) => page.title)).toContain('/admin');
  });
});

for (const state of states) {
  const headersFor = (): Record<string, string> =>
    state.withPendingSession ? { Cookie: `${SESSION_COOKIE}=${pendingToken}` } : {};

  test.describe(state.name, () => {
    for (const page of pages) {
      test(`page ${page.title} redirects to sign-in and shows no private data`, async ({
        request,
      }) => {
        const response = await request.get(pageUrl(page.path, fill), {
          maxRedirects: 0,
          headers: headersFor(),
        });
        expect([302, 303, 307, 308]).toContain(response.status());
        const location = new URL(response.headers().location ?? '', 'http://localhost');
        expect(location.pathname).toBe('/admin/sign-in');
        const body = await response.text();
        for (const sentinel of SENTINELS) expect(body).not.toContain(sentinel);
        expect(response.headers()['cache-control']).toContain('no-store');
        expect(response.headers()['x-robots-tag']).toContain('noindex');
      });
    }

    for (const route of routes) {
      test(`${route.method} ${route.title} answers 401`, async ({ request }, testInfo) => {
        const origin = new URL(testInfo.project.use.baseURL ?? 'http://localhost:3100').origin;
        const response = await request.fetch(routeUrl(route.path, fill), {
          method: route.method,
          maxRedirects: 0,
          headers: { ...headersFor(), Origin: origin, 'Content-Type': 'application/json' },
          ...(route.method === 'GET' ? {} : { data: {} }),
        });
        expect(response.status()).toBe(401);
        const body = await response.text();
        for (const sentinel of SENTINELS) expect(body).not.toContain(sentinel);
        expect(response.headers()['cache-control']).toContain('no-store');
        expect(response.headers()['x-robots-tag']).toContain('noindex');
      });
    }
  });
}

test.describe('the sign-in pages', () => {
  test('are admin responses too: no-store and noindex', async ({ request }) => {
    for (const url of ['/admin/sign-in', '/admin/setup']) {
      const response = await request.get(url, { maxRedirects: 0 });
      expect(response.status(), url).toBe(200);
      expect(response.headers()['cache-control'], url).toContain('no-store');
      expect(response.headers()['x-robots-tag'], url).toContain('noindex');
    }
  });

  test('the passkey and recovery steps need the Google step first', async ({ request }) => {
    for (const url of ['/admin/sign-in/passkey', '/admin/sign-in/recovery']) {
      const response = await request.get(url, { maxRedirects: 0 });
      expect([302, 303, 307, 308], url).toContain(response.status());
      expect(new URL(response.headers().location ?? '', 'http://localhost').pathname).toBe(
        '/admin/sign-in',
      );
    }
  });
});
