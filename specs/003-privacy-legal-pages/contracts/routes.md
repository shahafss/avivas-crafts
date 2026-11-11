# Contract: routes (003)

## Public pages (both locales; every page renders per request, nonce CSP unchanged)

| Path | File | Notes |
|---|---|---|
| `/{locale}/pages/{slug}` for `about`, `shipping-returns`, `terms`, `privacy`, `cookies`, `accessibility` | `src/app/[locale]/(shop)/pages/[slug]/page.tsx` | storefront.md §8.9. Any other slug, including `contact`, → 404. `cookies` adds `StorageTable` (§7.25). `<title>` = picked page title. Indexable (no `noindex`). |
| `/{locale}/contact` | `src/app/[locale]/(shop)/contact/page.tsx` | storefront.md §8.10. Exact path linked by the order page and the product page (002). |

Already-existing links that must now resolve (spec US1 #6): header (`/pages/about`,
`/pages/shipping-returns`), product page (`/pages/shipping-returns`), checkout (`/pages/terms`,
`/pages/privacy`), order page and product page (`/contact`), order confirmation email
(`/pages/shipping-returns`).

## Admin pages (each `page.tsx` calls `requireAdmin()` first; `no-store`, `noindex` from existing headers)

| Path | File | Design |
|---|---|---|
| `/admin/content` | `src/app/admin/(protected)/content/page.tsx` | storefront.md §12.5 |
| `/admin/content/[slug]` | `…/content/[slug]/page.tsx` + `actions.ts` | §12.6; unknown slug → 404 (after the guard) |
| `/admin/content/[slug]/versions` | `…/content/[slug]/versions/page.tsx` | §12.6; only `terms`/`privacy`, else 404 |
| `/admin/content/[slug]/versions/[version]` | `…/versions/[version]/page.tsx` | §12.6; read-only, rendered with `Prose` |
| `/admin/customers` | `…/customers/page.tsx` + `actions.ts` | §12.7; URL never carries the search term |
| `/admin/stats` | `…/stats/page.tsx` | §12.8; `?days=7|30|90` (default 30; anything else → 30) |
| `/admin/orders/[id]` (changed) | existing | §12.3 gains, in the "terms" line, links to the Terms and Privacy versions the order recorded |

The existing file-tree access tests cover these automatically.

## Route handlers

### `POST /api/v` — `src/app/api/v/route.ts`

Cookieless page-view beacon (001 contracts/http-endpoints.md, research R12). Body: `text/plain`
or `application/json`, ≤ 1 KB, `{"p": "/he/p/doll", "r": "instagram.com"}`; `r` only on the first
beacon of a document load (`""` for none). Always `204` with no body, `Cache-Control: no-store`.
A request whose `Origin` header is missing or not exactly `APP_ORIGIN` changes nothing
(`isSameOrigin()` in `src/server/security/origin.ts`; CSRF protection, constitution IV).
Never sets cookies; stores nothing about the requester. Not an admin route.

### `GET /test-optional.js` — `src/app/test-optional.js/route.ts`

Test-only script of the dummy optional category. `404` unless `CONSENT_TEST_CATEGORY=analytics`
(which production refuses). Otherwise `200`, `Content-Type: text/javascript`,
`Cache-Control: no-store`, body: sets `ac_test_optional=1; Path=/; Max-Age=31536000; SameSite=Lax`
(plus `Secure` on https). Not in `public/` (served unconditionally there).
