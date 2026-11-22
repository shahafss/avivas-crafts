# Contract: UI changes (009)

Replaces the "Header logo (Story 6)" part of `specs/008-post-launch-fixes/contracts/ui.md`; the
rest of that contract is unchanged. Research D3–D6; `docs/design/storefront.md` §4, §7.18 updated
to match.

## Header logo (Stories 1 and 2)

- `#site-header [data-testid="header-brand"]`: `<a href="/{locale}">`, no `aria-label`, holding one
  `<img data-testid="header-logo">` and the visually hidden `common.homeLinkSuffix` span. Accessible
  name "{name}, דף הבית" / "{name}, home page" (an optional space before the comma is allowed, as in
  008). The img carries `alt` = shop name and `lang="he"` when English falls back to Hebrew.
  **Unchanged from 008.**
- Link classes: `inline-flex min-h-11 items-center rounded-card px-2 py-0.5` (plus `nav:mx-auto`); no
  `relative`, `self-stretch`, `w-(--logo-size)`, `group`.
- Image: `src={logoSrc(186)}`, `srcSet={logoSrcSet()}`, `sizes="(min-width: 900px) 107px, 93px"`,
  `width`/`height` from `logoSize()`, `decoding="async"`, classes `block h-(--logo-h)
  w-(--logo-w) max-w-none object-contain`. No `absolute`, `rounded-full`, outline classes.
- Tokens: `--logo-h` = 52 px and `--logo-w` = 93 px; 60 px and 107 px from `56.25rem` (900 px). `--logo-size` and `--logo-overhang` no
  longer exist anywhere in `src/`.

### Geometry (asserted in `tests/e2e/storefront-layout.spec.ts`)

At 320, 375, 640 (1280 px at 200 % zoom), 1024 and 1280 px, on a content page (scrolled 200 px and at 0) and on the home page at
scroll 0, in both locales:

- `logo.top ≥ header.top + 4` and `logo.bottom ≤ header.bottom − 4` (wholly inside, space above and
  below);
- `|(logo.top + logo.bottom) / 2 − (header.top + header.bottom) / 2| ≤ 1` (vertically centred);
- the logo's box does not intersect the menu button, cart button or search field;
- `brand.width ≤ 109.5` below 900 px and `≤ 123.5` from 900 px, also with a 60-character shop name.

### Page offsets (FR-004)

- `<main>`'s computed `padding-top` is `0px` on every page.
- `html`'s computed `scroll-padding-top` equals the header height (64 px / 72 px).
- From 1024 px, the product page's buy panel and the checkout summary have computed `top` =
  header height + 16 px (88 px at 1280 px).
- After a checkout error link moves focus, the focused field's top is at or below the header's
  bottom and less than 40 px under it.

### Backing (FR-007, asserted in `tests/e2e/home.spec.ts`; amended 2026-11-22, research D5)

- Home page at scroll 0 (JavaScript on): the logo image's computed `filter` contains `drop-shadow`
  (the soft white glow).
- Home page after scrolling (once the 250 ms fade settles, or with reduced motion at once): the
  image's `filter` is `none`. Reduced motion: the same end states as without it.
- Any other page at scroll 0: `none`.
- JavaScript off, home page at scroll 0: `none` (the bar itself is the frosted white bar).
- Forced colours: `none`.
- In every state the brand link's own `background-color` is transparent and its `box-shadow` is
  `none` (no box).

### Focus (FR-009)

- The link has a 2 px solid outline at offset 0 when it has keyboard focus. Its colour is ink (`rgb`
  of `--color-ink`) on the white bar (any other page, or the home page scrolled) and white
  (`--color-on-photo`) at the top of the home page.
- The outline box lies inside the header (its top ≥ header top, bottom ≤ header bottom).

### Layering (FR-008)

Unchanged rule: the logo is in the header's stacking context; the menu and cart drawers (top layer),
their backdrops, dialogs and the consent banner cover it. Tested: the menu and cart drawers (008
test kept); the rest follows from the layer order (`z-header` 20 < `z-banner` 40, top layer above both).
