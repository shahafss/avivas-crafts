# Contract: link underline and current page (US2)

## CSS — `src/app/globals.css`

```text
.nav-line                        inline box around a link's text
  background: linear-gradient(currentColor, currentColor) no-repeat 50% 100% / 0% 1.5px
  padding-block-end: 3px
  transition: background-size 200ms ease-out
@media (hover: hover) { a:hover > .nav-line }   (no sticky tap underline)
a:focus-visible > .nav-line,
a[aria-current="page"] > .nav-line    background-size: 100% 1.5px
@media (forced-colors: active) { a[aria-current="page"] > .nav-line: text-decoration underline }
```

The `>` selectors also apply when `.nav-line` is the truncating category span; the truncating
classes stay on that span. Reduced motion: covered by the existing global
`transition: none !important`. In forced-colours mode the background line may disappear, so the
current page falls back to a text underline; hover/focus keep the system focus ring.

## `NavLink` island — `src/components/shop/NavLink.tsx` (`'use client'`)

Props: `href: string`, `className?: string`, `markCurrent?: boolean` (default `false`),
`children`, and rest anchor props (for example `lang`, `data-testid`).

- Renders `next/link` with `children` wrapped in `<span class="nav-line">`, unless the caller
  passes `bareChildren` (the truncating category span carries `nav-line` itself).
- With `markCurrent`, sets `aria-current="page"` when `isCurrentPath(usePathname(), href)` is
  true. The pure function lives in `src/lib/nav/current-path.ts`: it compares the two paths with
  the query, hash and a trailing slash removed.

## Where it is used

| Place | File | `markCurrent` |
|---|---|---|
| Header row: All pieces, header categories, About, Shipping & returns | `HeaderCategories.tsx` › `HeaderNavLinks` | yes |
| Phone menu: All pieces, every category | `HeaderCategories.tsx` › `MenuCategories` | yes |
| Phone menu: About, Shipping & returns, Contact | `Header.tsx` | yes |

The `hover:underline` utilities on these links are removed. **Footer** Info and Legal links and the
"Cookie settings" button get no underline at all: no `.nav-line`, no `hover:underline`, no
`aria-current` (FR-014, revised at the Phase D gate). The credit link keeps its plain underline. The language switch, the logo, the
cart line link and links inside text are out of scope.

## Tests

- **Unit** (`tests/unit/current-path.test.ts`): `isCurrentPath`:
  - exact match
  - trailing slash
  - a query on the page path still matches
  - `/he/product/x` matches nothing
  - `/he` matches nothing
  - Hebrew and English paths
- **E2E** (`tests/e2e/storefront-layout.spec.ts`):
  - on `/en/pages/about` at 1280 px, the header "About" has `aria-current="page"` and its
    `.nav-line` computed `background-size` is `100% 1.5px`; no other header link has
    `aria-current`
  - on `/en` and a product page, no header link has it
  - footer links never have it, and their computed `text-decoration-line` stays `none` on hover
    and on focus, and they contain no `.nav-line`
  - on the phone projects, the menu marks the current category on `/he/category/{slug}`
  - hover on a header link ends at `100%` (after the transition), and `0%` after leaving
  - under `reducedMotion: 'reduce'`, the computed transition duration is `0s`
