# Contract: Search-Engine Addresses, Sitemap, Robots

## `alternates(pathWithoutLocale, locale)` — `src/server/seo.ts`

```ts
alternates('', 'en') ===
  { canonical: `${O}/en`, languages: { he: `${O}/he`, en: `${O}/en`, 'x-default': `${O}/he` } }
alternates('/p/clay-bowl', 'he') ===
  { canonical: `${O}/he/p/clay-bowl`,
    languages: { he: `${O}/he/p/clay-bowl`, en: `${O}/en/p/clay-bowl`, 'x-default': `${O}/he/p/clay-bowl` } }
```

`O` = `getEnv().APP_ORIGIN`. `pathWithoutLocale` is `''` or starts with `/`; never a query.

Rendered HTML on every public page (both locales):

```html
<link rel="canonical" href="O/<locale><path>">
<link rel="alternate" hreflang="he" href="O/he<path>">
<link rel="alternate" hreflang="en" href="O/en<path>">
<link rel="alternate" hreflang="x-default" href="O/he<path>">
```

| Page | `pathWithoutLocale` | Already `noindex` |
|---|---|---|
| Home | `''` | no |
| Category | `/c/<slug>` | no |
| Product | `/p/<slug>` | no |
| Search | `/search` | yes |
| Cart | `/cart` | yes |
| Checkout, fake-pay, return | `/checkout`, `/checkout/fake-pay`, `/checkout/return` | yes |
| Order | `/order/<token>` | yes |
| Content page | `/pages/<slug>` | no |
| Contact | `/contact` | no |

The not-found page has no alternates.

## `GET /sitemap.xml` — `src/app/sitemap.ts`

`force-dynamic`. For each of: home, every category that has a published product, every product with `state = 'published'`, the
content pages `about`, `privacy`, `terms`, `cookies`, `shipping-returns`, `accessibility`
(`/pages/<slug>`), and `/contact`; one `<url>` per locale whose `<loc>` is that locale's absolute
address and whose `xhtml:link` alternates list `he` and `en`. Products add `<lastmod>` from
`updated_at`. Nothing else (no search, cart, checkout, order, admin, api).

## `GET /robots.txt` — `src/app/robots.ts`

`force-dynamic`.

```text
User-Agent: *
Allow: /
Disallow: /admin
Disallow: /api/

Sitemap: O/sitemap.xml
```
