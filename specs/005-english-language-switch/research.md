# Research: English Version and Language Switch

Decisions for feature 005. Spec 001 (frozen) already decided the address scheme, the cookie and the
switch's look; these entries only cover what is new or what the code survey changed.

## R1. The switch is a client island that builds its own link

**Decision**: `src/components/shop/LanguageSwitch.tsx` (`'use client'`) reads `usePathname()` and
`useSearchParams()` from `next/navigation`, swaps the first path segment (`/he` ↔ `/en`) and renders
a plain `<a href="/api/locale?to=<other>&path=<encoded other path + query>" rel="nofollow">`. Two
variants: `compact` (header pill, "EN"/"עב", `aria-label` "EN – English"/"עב – עברית": it starts with the visible text, WCAG 2.5.3, found by axe in T027) and `full` (menu and
footer, "English"/"עברית"). The anchor carries `lang` and `hrefLang` of the target language. It
lives in the locale layout, inside the existing `NextIntlClientProvider` (which already passes
`common.language`), and is passed to `Header` (`languageSwitch`, `menuLanguageSwitch`) and to
`Footer` (new `languageSwitch` prop).

**Rationale**: the layout neither receives the path nor re-renders on client navigation (spec 001
T097, storefront §7.19), so only a client component sees the current address. A plain `<a>` is
never prefetched (a Next `<Link>` would prefetch `/api/locale` and set the cookie with no click,
FR-004/FR-007). `rel="nofollow"` keeps crawlers off the switch (they find the other language
through hreflang, R4).

**Suspense**: every public page is rendered per request (the layout reads `headers()`), so
`useSearchParams()` has the real query during server rendering and the link works without
scripts. If the build still demands a Suspense boundary, wrap the island in `<Suspense>` with a
fallback that renders the same link from `usePathname()` only (query dropped); the e2e "switch keeps
the query" test must still pass with scripts on.

**Alternatives rejected**: a server-rendered switch fed the path through a request header from the
proxy (stale after client navigation); next-intl's `<Link locale>` (prefetches and writes its own
cookie, which is turned off on purpose).

## R2. `GET /api/locale` validates strictly and writes the only language cookie

**Decision**: `src/app/api/locale/route.ts`, `dynamic = 'force-dynamic'`, logic in a pure helper
`src/lib/locale-path.ts` (`parseSwitchTarget(to, path, origin)` → `{ locale, path } | null`) so it can be
unit-tested exhaustively. Rules (contract: [contracts/locale-switch.md](contracts/locale-switch.md)):

1. `to` is exactly `he` or `en`.
2. `path` (already decoded once by `URLSearchParams`) is ≤ 2,048 characters, starts with `/he` or
   `/en` followed by end, `/` or `?`, and its locale segment equals `to` (stricter than spec 001's
   contract, which did not tie them; a mismatch is a bug or tampering either way).
3. Refused if the path part (before `?`) contains `//`, a backslash, any ASCII control character,
   `%2f`/`%5c`/`%2e` (any case), or `/..`/`/.` segments.
4. Parse with `new URL(path, APP_ORIGIN)` (which also resolves encoded dot segments such as
   `%2e%2e`); the origin must stay `APP_ORIGIN` **and** the normalised `pathname` must still start
   with `/<to>`. The `Location` is `APP_ORIGIN + pathname + search` of that parsed URL, never the
   raw input (same pattern as `safeAdminNext` in `src/server/auth/next-path.ts`).

Valid → `303` with `Cache-Control: no-store`; the cookie `NEXT_LOCALE=<to>` (`HttpOnly`,
`SameSite=Lax`, `Path=/`, `Max-Age=31536000`, `Secure` exactly when `APP_ORIGIN` is https) is set
unless `Sec-Fetch-Site` is present and is neither `same-origin` nor `none` (then the redirect
happens without the cookie, FR-011). Fallback: a browser that sends no `Sec-Fetch-Site` header
(old browsers) gets no cookie if its `Referer` is from another origin; with neither header it is treated as same-origin; all current browsers send it. The worst case is a
visitor's language preference changed by another site, which they can switch back. Invalid → `400` with an empty body, no cookie, no redirect.

**Rationale**: an open redirect on the shop's own domain is a phishing tool (constitution IV,
OWASP A01); allow-listing the two locale prefixes and re-checking the origin closes it. Tying the
cookie to a click and to same-site requests keeps it a user-chosen, strictly necessary cookie
(constitution VII); other sites cannot set a visitor's language.

**Alternatives rejected**: a Server Action (needs a form and JavaScript; the switch must work as a
link); setting the cookie in the proxy on every `/en` view (stores a choice without a click,
breaks FR-007).

## R3. `/` keeps its current behaviour

**Decision**: no change. `src/proxy.ts` already redirects `/` to the `NEXT_LOCALE` locale when it is
`he`/`en`, else `/he`, with no `Accept-Language` detection, and next-intl's own cookie is off
(`localeCookie: false`). 005 only adds the tests (e2e: fresh `/` → `/he`; after switching, `/` →
`/en`; a bogus cookie value → `/he`).

## R4. One helper for canonical and hreflang addresses

**Decision**: `src/server/seo.ts` (server-only: it reads `getEnv()`) exports `alternates(pathWithoutLocale, locale)` → Next `Metadata
['alternates']`: `canonical: <origin>/<locale><path>`, `languages: { he, en, 'x-default': he }`
(absolute, from `getEnv().APP_ORIGIN`; `''` for the home page so it yields `/he` and `/en`, not
`/he/`). Every public page's `generateMetadata` uses it: home, category, product, search, cart,
checkout, content pages, contact, order page, payment return. Product and category replace their
inline objects. Canonicals never include the query (sort, search text, tokens stay out).

Pages already marked `noindex` (search, cart, checkout, fake-pay, return, order) keep `noindex`
and also get alternates (spec 001 T095 checks every public route; harmless for noindex pages).
The not-found page gets none.

**Alternatives rejected**: per-page inline objects (already drifted: no `x-default`);
next-intl's `alternateLinks` response header: it is on by default and sends a `Link` header whose
`x-default` is the unprefixed path and which keeps the query, conflicting with the HTML tags. 005
sets `alternateLinks: false` in `src/i18n/routing.ts` so there is one set of hreflang signals.

## R5. Sitemap and robots as dynamic metadata routes

**Decision**: `src/app/sitemap.ts` and `src/app/robots.ts`, both `export const dynamic =
'force-dynamic'` (the build has no database; the sitemap follows the catalog live, SC-006). A new
query `listSitemapEntries()` in `src/server/catalog/public-queries.ts` returns the slugs and
`updatedAt` of published products (`state = 'published'`; drafts and hidden excluded) and the
slugs of categories that have published products (an empty category is hidden from the header
too). Entries: home, each category, each product, the six content pages
(`CONTENT_SLUGS` minus `contact`, at `/pages/<slug>`) and `/contact`, each once per locale with
`alternates.languages` {he, en}. Robots: `allow: '/'`, `disallow: ['/admin', '/api/']`,
`sitemap: <origin>/sitemap.xml`.

The proxy's matcher skips paths with a file extension, so `/robots.txt` and `/sitemap.xml` reach
the metadata routes without the locale redirect.

**Alternatives rejected**: a static sitemap built at deploy time (stale after Aviva publishes;
the build has no database).

## R6. The admin "no English" marker

**Decision**: `listAdminProducts()` (`src/server/catalog/admin-queries.ts`) adds `missingEnglish:
boolean` = English name empty, or English description empty while a Hebrew description exists
(null or only whitespace; a product with no Hebrew description needs no English one; owner
decision 2026-11-12; computed in the mapper). `ProductRow` in `src/app/admin/(protected)/products/page.tsx` shows one more
neutral badge "אין אנגלית" next to the state badges. New key `admin.products.noEnglish` in both
message files (en: "No English"). storefront.md gets a short §12.9 "Products list" note for the
badge.

**Rationale**: name and description are what an English visitor reads first; options and image
alt texts are left out to keep the marker simple (spec assumption).

## R7. Dates and money in English

**Decision**: the formatters already map `en` (money `en-US` with ILS → `₪120.00`; dates `en-GB`,
Israel time). 005 audits callers: every `formatMoney(..., 'he')`, `formatDate(..., 'he')` or
hard-coded `'he-IL'` in `src/app/[locale]`, `src/components/shop` and the customer email templates
must take the page/order locale. Admin and owner emails keep `'he'`. The audit is a grep in the
task; e2e asserts an English page price and the English confirmation email's total use the English
format.

## R8. "No stray Hebrew" check

**Decision**: a helper in `tests/e2e/language.spec.ts` collects visible text nodes of `<body>`
whose closest `[lang]` ancestor is not `lang="he"` and fails on any `[֐-׿]` character.
It runs on every `PUBLIC_ROUTES` page under `/en` with a catalog whose sample product has English
text, and once on a product without English to confirm the fallback is marked `lang="he"`.
`PUBLIC_ROUTES` = home, a category, a product, search (with a query), cart, the six content pages,
contact.

## R9. English copy pass is a reviewed diff

**Decision**: the implementer edits only values in `en.json` (no key changes; the parity test
guards keys and ICU placeholders) for namespaces `common`, `shop`, `cart`, `checkout`, `order`,
`emails`, `errors`, `consent`, `legal`, `contact` (not `admin`), following storefront.md §1 › Voice.
Every changed string is listed (key, before, after) in `specs/005-english-language-switch/copy-review.md`
so the owner can approve it at the Phase D gate (FR-015).

## R10. Where the tests run

**Decision**:
- `tests/unit/locale-path.test.ts`: every valid and tampered `to`/`path` pair (R2).
- `tests/unit/seo.test.ts`: `alternates()` output for home and a nested path.
- `tests/integration/locale-redirect.test.ts`: the route handler (status, `Location`, cookie
  attributes incl. `Secure` on https vs http origin, `Sec-Fetch-Site` cases, `no-store`) — spec 001
  T096.
- `tests/integration/sitemap.test.ts`: published only, both locales, content pages and contact;
  robots body.
- `tests/integration/catalog-products.test.ts` (extend): `missingEnglish` true/false cases.
- `tests/integration/order-emails.test.ts` (extend only if missing): cancelled and refunded emails
  for an `en` order are English with `/en/` links; owner emails Hebrew.
- `tests/e2e/language.spec.ts`: navigation and cookie scenarios on `chromium-desktop` and
  `chromium-mobile`; the English checkout + email test on the phone projects only (CLAUDE.md:
  checkout specs run on phones); one switch smoke test on `webkit-mobile` (Safari cookie handling).
  No new Playwright project, so `ci.yml` needs no new matrix entry.

Locally, run only `language.spec.ts` (CLAUDE.md: long E2E runs hang on this machine).
