# Contract: Device Storage Registry and Consent

File: `src/lib/consent/registry.ts` is the **single source of truth** for everything the site
stores on a visitor's device. The Cookie Policy page renders its table from this registry
(FR-037a), and an E2E test fails if the browser ends up with any cookie or storage key not in
the registry, or with any non-necessary item before consent.

```ts
type StorageItem = {
  name: string;                     // cookie name or storage key
  kind: "cookie" | "localStorage" | "sessionStorage";
  category: "necessary" | "analytics" | "marketing";
  purposeKey: string;               // translation key for the purpose text
  durationKey: string;              // translation key for the lifetime text
  firstParty: boolean;
  scope: "public" | "admin";
};

type OptionalCategory = {
  id: "analytics" | "marketing";
  enabled: boolean;                 // from config; all false at launch
  scripts: { src: string; nonce: true }[]; // loaded only after consent
};
```

## Items at launch (all strictly necessary)

| Name | Kind | Purpose | Lifetime | Scope |
|---|---|---|---|---|
| `ac_cart_v1` | localStorage | keep the shopping cart | until cleared; items expire after 90 days | public |
| `NEXT_LOCALE` | cookie (Secure on https origins, HttpOnly, SameSite=Lax) | remember the chosen language, set only when the visitor switches language | 1 year | public |
| `ac_checkout` | sessionStorage | keep checkout form inputs while the visitor goes to the payment page and back | browser tab session | public |
| `__Host-ac_admin` | cookie (Secure, HttpOnly, SameSite=Strict) | admin session | ≤ 12 hours | admin |
| `__Host-ac_oauth` | cookie (Secure, HttpOnly, SameSite=Lax) | binds the Google sign-in round trip to the browser (holds the random state id) | 10 minutes | admin |

Only when an optional category is enabled:

| `ac_consent` | cookie (Secure, HttpOnly, SameSite=Lax; read on the server, choices passed to the page as props) | remember the visitor's cookie choice (random id + choices + policy version) | 12 months | public |

## Consent behaviour (FR-037a, SC-008)

- `consentRequired = categories.some(c => c.enabled)`. At launch it is `false`: no banner, no
  "cookie settings" link, no `ac_consent` cookie.
- When `true`: on first visit a banner shows **Accept all** and **Reject all** as equally
  prominent buttons (same size, style, position weight) plus "Settings" for per-category
  choices. Nothing in an optional category loads before acceptance. The footer shows
  "Cookie settings" on every page to reopen the dialog. A changed choice is recorded as a new
  `consent_record`. If the cookie policy version changes, the visitor is asked again.
- Optional scripts are injected only by `<ConsentGate category>` after consent, with the page
  nonce; the CSP for optional script hosts is added only when that category is enabled.
- The test configuration `CONSENT_TEST_CATEGORY=analytics` enables a dummy optional category
  whose script sets a cookie `ac_test_optional`, so E2E tests can prove it loads only after
  acceptance. It is the one non-HttpOnly cookie, exists only in that test configuration, and is
  rejected by the env schema in production.
