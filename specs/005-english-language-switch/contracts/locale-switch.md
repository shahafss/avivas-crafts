# Contract: Language Switch

Supersedes spec 001 `contracts/http-endpoints.md` › `/api/locale` for this feature (same endpoint,
one stricter rule: the path's locale must equal `to`).

## `GET /api/locale?to=he|en&path=<path>`

The only writer of the `NEXT_LOCALE` cookie. Reached only by clicking `LanguageSwitch`.

### Request

| Param | Rule |
|---|---|
| `to` | exactly `he` or `en` |
| `path` | URL-encoded once by the switch; after decoding: ≤ 2,048 chars; `^/(he|en)(?=$|/|\?)`; first segment equals `to`; the part before `?` contains no `//`, `\`, ASCII control character, `%2f`/`%5c`/`%2e` (any case), and no `.` or `..` segment, and no percent-encoded control character (`%00`–`%1f`, `%7f`); a raw backslash or control character is refused anywhere in `path`, the query included; then `url = new URL(path, APP_ORIGIN)`: `url.origin === APP_ORIGIN` and the normalised `url.pathname` still starts with `/<to>` (end or `/` after it). The redirect uses `url.pathname + url.search`, never the raw input |

### Responses

| Case | Status | Headers | Body |
|---|---|---|---|
| Valid, `Sec-Fetch-Site` absent, `same-origin` or `none` | `303` | `Location: <APP_ORIGIN><path>`, `Set-Cookie` for `NEXT_LOCALE=<to>` with attributes `Path=/`, `Max-Age=31536000` (Next also adds `Expires`), `HttpOnly`, `SameSite=lax`, and `Secure` exactly when `APP_ORIGIN` starts with `https://` (compare attribute names and values case-insensitively), `Cache-Control: no-store` | empty |
| Valid, `Sec-Fetch-Site` is `same-site` or `cross-site`, or absent with a `Referer` from another origin | `303` | `Location` as above, `Cache-Control: no-store`, **no** `Set-Cookie` | empty |
| Anything invalid (missing/unknown `to`, bad `path`, locale mismatch) | `400` | `Cache-Control: no-store`, no `Set-Cookie`, no `Location` | empty (no display text; constitution I) |
| Method other than GET | `405` (Next default) | | |

### Must be refused (test table)

`/hex`, `/en-x/a`, `/admin`, `/api/locale`, `https://evil.example/en`, `//evil.example/en`,
`/en//evil.example`, `/en/%2F%2Fevil.example`, `/en/%2f`, `/en\evil`, `/\evil`, `/en/../admin`,
`/en/./p`, `/en/%2e%2e/admin`, `/en/.%2e/admin`, `/en/%2E%2e/api/locale`, `/en/%2E/p`, a path with `%0d%0a`, `/en/p%00`, `/en/p%7f`, a raw backslash or control character in the query, `to=fr`, `to=en&path=/he/p/x` (mismatch), missing `path`,
a 2,049-character path.

### Must be accepted

`to=en&path=/en` → `/en`; `to=he&path=/he` → `/he`; `to=en&path=/en/p/clay-bowl`;
`to=en&path=/en/c/bowls?sort=price-asc`; `to=en&path=/en/search?q=%D7%A7%D7%A2%D7%A8%D7%94`
(Hebrew query kept, encoded); `to=he&path=/he/order/<token>`.

## `LanguageSwitch` component

| Prop | Values |
|---|---|
| `variant` | `compact` (header) or `full` (menu, footer) |

Renders `<a href="/api/locale?to=<other>&path=<encodeURIComponent(otherPath + search)>"
rel="nofollow" lang="<other>" hrefLang="<other>">`:

- `compact`: text `common.language.toEnglishShort` ("EN") on `/he`, `toHebrewShort` ("עב") on `/en`;
  `aria-label` = short text + " – " + full word (`EN – English` / `עב – עברית`; the name must start
  with the visible text, WCAG 2.5.3, which axe checks); look per storefront.md §7.19 (36 px `ink`-bordered pill,
  `me-1`, 44×44 hit area via a transparent `::before` at `-inset-[5.5px]` (4 px past the border box), hover `sun-soft`).
- `full`: visible text `toEnglish` / `toHebrew`, `min-h-11` like the other menu/footer links.

`otherPath` = current `usePathname()` with its first segment replaced (`/he` → `/en`, `/he/x` →
`/en/x`); `search` = `?` + `useSearchParams().toString()` when non-empty. Never a Next/next-intl
`<Link>`. Not rendered in the admin layout.

Placement: `Header` `languageSwitch` (compact, before the search button) and `menuLanguageSwitch`
(full, bottom of the menu sheet); `Footer` new `languageSwitch` prop (full, in the bottom row next
to the copyright, per storefront §7.20).
