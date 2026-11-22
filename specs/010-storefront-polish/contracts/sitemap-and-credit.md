# Contract: sitemap (US3) and footer credit (US4)

## `GET /sitemap.xml` — `src/app/sitemap.ts`

This replaces the alternates part of `specs/005-english-language-switch/contracts/seo.md`:
- Same entries as before: home, `/shop`, every category with a published product, every published product,
  the six content pages, and `/contact`, once per locale.
- Products keep `<lastmod>` from `updated_at`.
- **No** `alternates` / `xhtml:link` and no `xmlns:xhtml` namespace.

The page heads keep `canonical` + `alternate hreflang` `he` / `en` / `x-default` from
`src/server/seo.ts` (unchanged, FR-017).

Tests:
- `tests/integration/sitemap.test.ts`: the alternates expectation becomes "no entry has
  `alternates`". Count and `lastModified` expectations stay.
- `tests/e2e/language.spec.ts`: wherever it checks the sitemap or page-head hreflang, the
  sitemap's XML no longer contains `xhtml:link`, and a product page and a content page still
  carry the three hreflang links.

## Footer credit — `src/components/shop/Footer.tsx`

Bottom row, after the copyright `<p>`:

```text
<p class="text-sm text-ink-2" data-testid="footer-credit">
  {t.rich('credit', { name: chunks => <a href="https://shahafs.com" target="_blank" rel="noopener"
        class="inline-flex min-h-6 items-center underline underline-offset-[3px]">
        {chunks}<span class="sr-only">{t('newTab')}</span></a> })}
</p>
```

Messages (`common.footer`):
- `credit`: en `"Designed & built by <name>Shahaf Shmuel</name>"`, he `"נבנה ועוצב על ידי
  <name>שחף שמואל</name>"`
- `newTab`: en `" (opens in a new tab)"`, he `" (נפתח בלשונית חדשה)"`

Tests (`tests/e2e/storefront-layout.spec.ts` or the footer's existing spec):
- on `/he` and `/en`, `footer-credit` text equals the message
- the link's `href` is `https://shahafs.com`, `target="_blank"`, `rel` contains `noopener`
- its accessible name ends with the new-tab text
- no sideways scroll at 320 px
- axe passes (already covered by `a11y.spec.ts`)
