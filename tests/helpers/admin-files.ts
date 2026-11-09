// Shared by the admin access tests (tests/e2e/admin-access.spec.ts and
// tests/integration/admin-actions-guard.test.ts). Walks directories with fs.readdirSync
// (recursive) instead of a glob library: glob syntax reads `(protected)` as a pattern group and
// can silently match nothing, so callers also assert that the walk found the dashboard.
import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const PROTECTED_DIR = join(REPO_ROOT, 'src/app/admin/(protected)');
export const SRC_DIR = join(REPO_ROOT, 'src');

/** Absolute paths of files called `fileName` below `dir`, sorted. */
export function findFiles(dir: string, fileName: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((entry) => entry === fileName || entry.endsWith(`${sep}${fileName}`))
    .map((entry) => join(dir, entry))
    .sort();
}

/** Absolute paths of every .ts/.tsx file below `dir`. */
export function findSourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((entry) => /\.(ts|tsx)$/.test(entry))
    .map((entry) => join(dir, entry))
    .sort();
}

export function adminPageFiles(): string[] {
  return findFiles(PROTECTED_DIR, 'page.tsx');
}

/** `/admin/orders/[id]/page.tsx` -> URL path with dynamic segments filled from `values`. */
export function pageUrl(file: string, fill: (segment: string) => string): string {
  const folder = relative(join(REPO_ROOT, 'src/app'), dirname(file));
  const segments = folder
    .split(sep)
    .filter((segment) => !/^\(.*\)$/.test(segment)) // route groups are not part of the URL
    .map((segment) => (segment.startsWith('[') ? fill(segment) : segment));
  return `/${segments.join('/')}`;
}

export function apiRouteFiles(): string[] {
  const apiDir = join(REPO_ROOT, 'src/app/api');
  const wanted = [
    join(apiDir, 'admin'),
    join(apiDir, 'auth', 'passkey', 'register'),
    join(apiDir, 'auth', 'reauth'),
  ];
  const files: string[] = [];
  for (const dir of wanted) {
    try {
      files.push(...findFiles(dir, 'route.ts'));
    } catch {
      // A directory that does not exist yet (no admin API routes before T051): nothing to check.
    }
  }
  return files;
}

/** `/api/auth/reauth/verify/route.ts` -> `/api/auth/reauth/verify` (dynamic segments filled). */
export function routeUrl(file: string, fill: (segment: string) => string): string {
  return pageUrl(file, fill);
}
