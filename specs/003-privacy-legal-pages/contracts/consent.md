# Contract: device-storage registry and consent (003)

Builds 001 contracts/device-storage.md (background; its item table and behaviour are reused
unchanged). This file fixes the code shapes.

## `src/lib/consent/registry.ts` (pure; importable from client and server)

```ts
export type StorageKind = 'cookie' | 'localStorage' | 'sessionStorage';
export type CategoryId = 'analytics' | 'marketing';
export type StorageCategory = 'necessary' | CategoryId;

export interface StorageItem {
  name: string;
  kind: StorageKind;
  category: StorageCategory;
  purposeKey: string;     // consent.items.<name-key>.purpose
  durationKey: string;    // consent.items.<name-key>.duration
  firstParty: true;
  scope: 'public' | 'admin';
  onlyWhen?: 'consent-required' | 'test-category';
}

export const STORAGE_ITEMS: readonly StorageItem[];   // the 7 items in data-model.md

export interface ConsentConfig {
  required: boolean;
  categories: { id: CategoryId; scripts: { src: string }[] }[];
  test: boolean;          // the CONSENT_TEST_CATEGORY dummy is on
}

/** Items that can exist under `config` (the Cookie Policy table and the E2E allow-list). */
export function itemsFor(config: ConsentConfig): StorageItem[];
```

## `src/server/consent/config.ts` (server-only)

```ts
/** Real optional categories: [] at launch. Adding one is a code change reviewed with the
 *  Cookie Policy, the registry and the CSP (`optionalScriptHosts` in src/proxy.ts). */
export const OPTIONAL_CATEGORIES: ConsentConfig['categories'];

export function consentConfig(): ConsentConfig;   // adds the dummy when CONSENT_TEST_CATEGORY=analytics
export function consentRequired(): boolean;       // consentConfig().required
```

The dummy: `{ id: 'analytics', scripts: [{ src: '/test-optional.js' }] }`, setting cookie
`ac_test_optional` (registry item, `onlyWhen: 'test-category'`).

## `ac_consent` cookie

`<recordId>.<policyVersion>.<base64url(JSON choices)>`; `HttpOnly`, `SameSite=Lax`, `Path=/`,
`Max-Age` 12 months, `Secure` when `APP_ORIGIN` is https. Read only on the server
(`parseConsentCookie`): any shape error, unknown version format or JSON error → treated as "no
choice". `needsChoice = !parsed || parsed.policyVersion !== currentCookiesVersion`.

## Behaviour after a Cookie Policy change (FR-022, Clarifications 2026-11-09)

`needsChoice = !parsed || parsed.policyVersion !== currentCookiesVersion`. While `needsChoice` is
true, `effectiveChoices` = every category `false`: nothing optional loads until the visitor
chooses again (the old cookie is only used to pre-set the switches in the settings dialog), and
the cookies of every optional category are expired at once (Clarifications 2026-11-10), so nothing
optional set under the old version survives the change.

When the `consent` rate limit skips the `consent_record` insert (contracts/server-actions.md), the
cookie's `recordId` has no matching row; nothing may assume that it exists.

## Components

A Server Component's `next/dynamic` import does **not** code-split a Client Component in
Next.js 16 (`node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`), so the split happens
in a client loader. The loader uses `React.lazy` + `Suspense`, not `next/dynamic`: the split is the
same, and `next/dynamic`'s runtime alone would push the product route over its 150 KB budget
(implementation, 2026-11-10):

| Component | Kind | Rendered when | Behaviour |
|---|---|---|---|
| `ConsentRoot` (`src/components/shop/ConsentRoot.tsx`) | server | always (in the public layout) | returns `null` unless `consentRequired()`; otherwise reads `ac_consent` and the `cookies` page version and renders `ConsentLoader` inside its own `NextIntlClientProvider` carrying only the `consent` messages; also passes `staleOptional` (`needsChoice` and the request carries a cookie of an optional registry item) |
| `ConsentLoader` (`ConsentLoader.tsx`) | client (`'use client'`), tiny | only from `ConsentRoot` | `const Banner = lazy(() => import('./ConsentBanner'))`, `const Gate = lazy(() => import('./ConsentGate'))` inside `Suspense`; renders both with props `{config, choices, effectiveChoices, needsChoice, nonce, cookiesHref}` |
| `ConsentBanner` | client, own chunk | consent required | §7.21: bottom sheet when `needsChoice`; equal `secondary` "אישור הכול" / "דחייה של הכול"; "הגדרות" opens a `<dialog>` with one `role="switch"` per category; listens for `ac:consent-settings`; contains the marker string `ac-consent-banner-v1` (a `data-consent-banner="ac-consent-banner-v1"` attribute) used by no other module; on mount, when `ConsentRoot` passed `staleOptional = true` (a new choice is needed and the request still carries an optional cookie), calls `expireUndecidedCookies()` (contracts/server-actions.md) |
| `ConsentGate` | client, own chunk | consent required | for each category `true` in `effectiveChoices`, appends its scripts (`<script nonce src>`) once |
| `CookieSettingsButton` (`CookieSettingsButton.tsx`) | client, tiny | consent required (passed into the footer's `cookieSettings` slot by the layout) | a `button` whose label comes from the server as a prop (no client messages needed); dispatches `window.dispatchEvent(new Event('ac:consent-settings'))` |

At launch `ConsentRoot` returns `null`: no consent chunk is requested, no footer button, no
`ac_consent` cookie, no `consent_record` rows (SC-002). The E2E launch check (T009) asserts that no
same-origin `.js` response contains `ac-consent-banner-v1`; `CookieSettingsButton` and the loader
never contain that string.

## Test ids (pinned)

| Element | `data-testid` |
|---|---|
| banner | `consent-banner` |
| Accept all | `consent-accept-all` |
| Reject all | `consent-reject-all` |
| Settings link | `consent-settings-open` |
| settings dialog | `consent-dialog` |
| switch per category | `consent-switch-<categoryId>` |
| dialog save | `consent-save` |
| footer button | `footer-cookie-settings` |
