# Contract: page metadata, link previews and icons (008)

Research R11, R12.

## Every public page (`/he/...`, `/en/...`)

The `<head>` contains:

| Tag | Value |
|---|---|
| `<meta name="description">` | the page's own description, else `common.meta.description` |
| `og:type` | `website` (`product` is not used; product pages keep `website` as today) |
| `og:site_name` | shop name from settings for the locale (Hebrew fallback) |
| `og:locale` | `he_IL` / `en_US` |
| `og:url` | the page's canonical address (absolute, `APP_ORIGIN`) |
| `og:title` | the page title (without the " · shop name" suffix); home: the shop name |
| `og:description` | as `description` |
| `og:image` (+ `:width`, `:height`, `:alt`) | product pages: first product photo (800×1000) as today; every other page: `/brand/og.<hash>.jpg`, 1200×630, alt "{shop name}" |
| `twitter:card` | `summary_large_image` (product without photo: `summary`, as today) |
| `<link rel="icon">` | `/favicon.ico` (`sizes="16x16 32x32 48x48"`) and `/brand/icon-32.<hash>.png` (32×32, `image/png`) |
| `<link rel="apple-touch-icon">` | `/brand/apple-touch-icon.<hash>.png` (180×180) |
| `<link rel="manifest">` | `/site.webmanifest` |
| `<meta name="theme-color">` | `#ffffff` |

All `og:` and `twitter:` URLs are absolute.

## Admin pages

Same icon, apple-touch-icon and manifest links; no `og:` tags; `robots: noindex` unchanged.

## Not changed

Checkout, order status and payment-return pages keep `noindex` and get only the layout defaults.

## Tests

- `tests/unit/seo.test.ts` (existing file, extended): the helper returns the
  table's values for home, a content page and the contact page in both locales; absolute URLs.
- `tests/e2e/seo.spec.ts` (desktop project only): the home page and the contact page carry
  `og:image` that returns 200 with `image/jpeg`; `/favicon.ico` returns 200; the product page keeps
  its product image.
