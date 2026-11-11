import { describe, expect, it } from 'vitest';
import en from '@/i18n/messages/en.json';
import he from '@/i18n/messages/he.json';
import { STORAGE_ITEMS, itemsFor, type ConsentConfig } from '@/lib/consent/registry';

function lookup(messages: unknown, path: string): unknown {
  let node: unknown = messages;
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

const LAUNCH = [
  { name: 'ac_cart_v1', kind: 'localStorage', scope: 'public' },
  { name: 'NEXT_LOCALE', kind: 'cookie', scope: 'public' },
  { name: 'ac_checkout', kind: 'sessionStorage', scope: 'public' },
  { name: '__Host-ac_admin', kind: 'cookie', scope: 'admin' },
  { name: '__Host-ac_oauth', kind: 'cookie', scope: 'admin' },
] as const;

const launchConfig: ConsentConfig = { required: false, categories: [], test: false };
const testConfig: ConsentConfig = {
  required: true,
  categories: [{ id: 'analytics', scripts: [{ src: '/test-optional.js' }] }],
  test: true,
};

describe('STORAGE_ITEMS', () => {
  it('has exactly the launch items, all necessary and first-party, when nothing is conditional', () => {
    const launch = STORAGE_ITEMS.filter((item) => item.onlyWhen === undefined);
    expect(launch.map(({ name, kind, scope }) => ({ name, kind, scope }))).toEqual([...LAUNCH]);
    for (const item of launch) {
      expect(item.category).toBe('necessary');
      expect(item.firstParty).toBe(true);
    }
  });

  it('marks ac_consent as needed only when consent is required', () => {
    const item = STORAGE_ITEMS.find((entry) => entry.name === 'ac_consent');
    expect(item).toMatchObject({
      kind: 'cookie',
      category: 'necessary',
      scope: 'public',
      onlyWhen: 'consent-required',
    });
  });

  it('marks ac_test_optional as an analytics item of the test category', () => {
    const item = STORAGE_ITEMS.find((entry) => entry.name === 'ac_test_optional');
    expect(item).toMatchObject({
      kind: 'cookie',
      category: 'analytics',
      scope: 'public',
      onlyWhen: 'test-category',
    });
  });

  it('has no other items', () => {
    expect(STORAGE_ITEMS).toHaveLength(LAUNCH.length + 2);
    expect(new Set(STORAGE_ITEMS.map((item) => item.name)).size).toBe(STORAGE_ITEMS.length);
  });

  it('has a purpose and a duration text in both languages for every item', () => {
    for (const item of STORAGE_ITEMS) {
      for (const key of [item.purposeKey, item.durationKey]) {
        for (const messages of [he, en]) {
          const text = lookup(messages, key);
          expect(typeof text, `${item.name}: ${key}`).toBe('string');
          expect((text as string).trim().length, `${item.name}: ${key}`).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('itemsFor', () => {
  it('at launch lists the five launch items and neither ac_consent nor ac_test_optional', () => {
    const names = itemsFor(launchConfig).map((item) => item.name);
    expect(names).toEqual(LAUNCH.map((item) => item.name));
    expect(names).not.toContain('ac_consent');
    expect(names).not.toContain('ac_test_optional');
  });

  it('with the test category lists both conditional items too', () => {
    const names = itemsFor(testConfig).map((item) => item.name);
    expect(names).toContain('ac_consent');
    expect(names).toContain('ac_test_optional');
    expect(names).toHaveLength(LAUNCH.length + 2);
  });

  it('adds ac_consent alone when consent is required without the test category', () => {
    const names = itemsFor({
      required: true,
      categories: [{ id: 'marketing', scripts: [] }],
      test: false,
    }).map((item) => item.name);
    expect(names).toContain('ac_consent');
    expect(names).not.toContain('ac_test_optional');
  });
});
