import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The stored payment flags must only be read through effectivePaymentMethods
// (src/server/payments/availability.ts); anything else would ignore PAYMENT_PROVIDER=none.
const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');

const ALLOWED = new Set([
  'src/server/payments/availability.ts',
  'src/server/settings/settings.ts',
  'src/lib/validation/settings.ts',
  'src/server/db/schema/commerce.ts',
  'src/server/db/seed.ts',
  'src/components/admin/SettingsManager.tsx',
  'src/app/admin/(protected)/settings/page.tsx',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

describe('payment flag usage', () => {
  it('reads onlinePaymentEnabled / offlinePaymentEnabled only in the allow-list', () => {
    const offenders = walk(SRC)
      .map((file) => relative(ROOT, file))
      .filter((file) => !ALLOWED.has(file) && !file.includes('/migrations/'))
      .filter((file) =>
        /onlinePaymentEnabled|offlinePaymentEnabled/.test(readFileSync(join(ROOT, file), 'utf8')),
      );
    expect(offenders).toEqual([]);
  });
});
