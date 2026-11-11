/**
 * Everything the site stores on a visitor's device: the single source of truth for the Cookie
 * Policy table and the E2E allow-list (003 contracts/consent.md). Pure: no env access, no
 * `server-only`, importable from client and server.
 */
export type StorageKind = 'cookie' | 'localStorage' | 'sessionStorage';
export type CategoryId = 'analytics' | 'marketing';
export type StorageCategory = 'necessary' | CategoryId;

export interface StorageItem {
  name: string;
  kind: StorageKind;
  category: StorageCategory;
  /** Translation key `consent.items.<key>.purpose`. */
  purposeKey: string;
  /** Translation key `consent.items.<key>.duration`. */
  durationKey: string;
  firstParty: true;
  scope: 'public' | 'admin';
  /** The item exists only under this condition; no `onlyWhen` means it always can. */
  onlyWhen?: 'consent-required' | 'test-category';
}

export const STORAGE_ITEMS: readonly StorageItem[] = [
  {
    name: 'ac_cart_v1',
    kind: 'localStorage',
    category: 'necessary',
    purposeKey: 'consent.items.cart.purpose',
    durationKey: 'consent.items.cart.duration',
    firstParty: true,
    scope: 'public',
  },
  {
    name: 'NEXT_LOCALE',
    kind: 'cookie',
    category: 'necessary',
    purposeKey: 'consent.items.locale.purpose',
    durationKey: 'consent.items.locale.duration',
    firstParty: true,
    scope: 'public',
  },
  {
    name: 'ac_checkout',
    kind: 'sessionStorage',
    category: 'necessary',
    purposeKey: 'consent.items.checkout.purpose',
    durationKey: 'consent.items.checkout.duration',
    firstParty: true,
    scope: 'public',
  },
  {
    name: '__Host-ac_admin',
    kind: 'cookie',
    category: 'necessary',
    purposeKey: 'consent.items.admin.purpose',
    durationKey: 'consent.items.admin.duration',
    firstParty: true,
    scope: 'admin',
  },
  {
    name: '__Host-ac_oauth',
    kind: 'cookie',
    category: 'necessary',
    purposeKey: 'consent.items.oauth.purpose',
    durationKey: 'consent.items.oauth.duration',
    firstParty: true,
    scope: 'admin',
  },
  {
    name: 'ac_consent',
    kind: 'cookie',
    category: 'necessary',
    purposeKey: 'consent.items.consent.purpose',
    durationKey: 'consent.items.consent.duration',
    firstParty: true,
    scope: 'public',
    onlyWhen: 'consent-required',
  },
  {
    name: 'ac_test_optional',
    kind: 'cookie',
    category: 'analytics',
    purposeKey: 'consent.items.testOptional.purpose',
    durationKey: 'consent.items.testOptional.duration',
    firstParty: true,
    scope: 'public',
    onlyWhen: 'test-category',
  },
];

export interface ConsentConfig {
  required: boolean;
  categories: { id: CategoryId; scripts: { src: string }[] }[];
  /** The `CONSENT_TEST_CATEGORY` dummy category is on. */
  test: boolean;
}

/** Items that can exist under `config` (the Cookie Policy table and the E2E allow-list). */
export function itemsFor(config: ConsentConfig): StorageItem[] {
  return STORAGE_ITEMS.filter(
    (item) =>
      item.onlyWhen === undefined ||
      (item.onlyWhen === 'consent-required' && config.required) ||
      (item.onlyWhen === 'test-category' && config.test),
  );
}
