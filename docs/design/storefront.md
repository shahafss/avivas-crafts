# Storefront design: brief and design system

> **The shop's design system, binding for every feature.** Moved from `specs/001-online-crafts-shop/`
> on 2026-11-09. A feature that changes the storefront or admin design updates this file in its own
> branch; plans and tasks cite the sections they use (e.g. "storefront.md §7.20"). Unqualified
> references to `spec.md`, `plan.md`, `research.md` (R-numbers), `data-model.md`, `contracts/`,
> FR-/SC- numbers and task IDs mean the ones in
> [`specs/001-online-crafts-shop/`](../../specs/001-online-crafts-shop/) unless a later spec is named.
> **Amended 2026-11-09 by `002-order-handling`**: §8.8 is now the customer's order status page, and
> the document also designs the admin order screens ([§12](#12-admin-area)). New text qualifies
> requirement ids as "002 FR-xxx" / "002 SC-xxx".
>
> **Amended 2026-11-09 by `003-privacy-legal-pages`**: content pages (§8.9), contact (§8.10),
> the consent mechanism (§7.21), the footer (§7.20), `Checkbox` (§7.10), `ui/Markdown` and `Prose`
> (§7.24), `StorageTable` (§7.25), the order page's consent block (§12.3 block 8a) and four new
> admin screens (§12.5 Content list, §12.6 Content editor and versions, §12.7 Customers,
> §12.8 Statistics). New text qualifies requirement ids as "003 FR-xxx".
>
> **Amended 2026-11-16 by `007-storefront-redesign`**: the whole look is replaced by the Shopify-like
> direction the owner approved on 2026-11-16 (white page, near-black green text, sage and dark
> green buttons, peach band, mint footer, Assistant font, full-width photos on the home page,
> square product photos). New tokens and type ([§3](#3-tokens)), the page frame and the header
> states ([§4](#4-global-layout-and-direction-rtlltr)), three new icons ([§5](#5-icons)), square
> photos and the home photos ([§6](#6-images)), updated components and the new `HomePhoto`,
> `HomeHero`, `PhotoBanner`, `StatementBand`, `SocialLinks`, `HomeRow` and `RowArrows`
> ([§7](#7-components)), the new home page, product page and "All pieces" page ([§8](#8-screens)),
> the admin colours and the social-links and category screens ([§12](#12-admin-area)). Section
> numbers are unchanged. New text qualifies requirement ids as "007 FR-xxx" / "007 D-xx"
> (`specs/007-storefront-redesign/`: `research.md` decisions D1–D20, `contracts/`). The Phase D gate (2026-11-16) changed the header, the free-shipping strip and the hero line; see §3.3, §4, §7.17–§7.19, §7.33, §14.

**Feature**: `001-online-crafts-shop` · **Status**: Approved by the user (2026-11-08); amended after plan-review rounds 1–2 the same day; look replaced 2026-11-16 (007) ·
**Visual authority** (since 2026-11-16): the approved home page example
`docs/design/home-example.src.html` (owner approval 2026-11-16; it is a reference document, not
served: its embedded photos are links to `assets/home-photos/`). The earlier product page sample
`design/sample-product-page.src.html` (user approval 2026-11-08) is kept for history and is
**superseded 2026-11-16**: it shows the old warm look, so nothing in it is binding for colour,
type, radius or layout; only the behaviours this document still describes (gallery, buy box,
cart, order page) carry over from it.

This document is binding for every public storefront screen (`src/app/[locale]/**`,
`src/components/shop/**`, `src/components/ui/**`). Where it and the home example differ, this
document wins; every deliberate difference is listed in
[§13](#13-deviations-from-the-home-example-and-the-sample). It also designs the admin order
screens (`src/app/admin/**`, `src/components/admin/**`) in [§12](#12-admin-area).

---

## 1. Brief

### Job and audience

- **Who arrives**: mostly Hebrew speakers in Israel, on a phone, from a link someone shared
  (WhatsApp, social, family), often buying a gift. A smaller group of English speakers (family
  abroad, tourists). Nobody signs in.
- **Mode**: storefront screens are **Persuade-lite + Operate**. Catalog and product pages let the
  photos persuade. Cart, checkout and the payment pages are Operate: plain, predictable,
  nothing between the visitor and "order placed". Content pages are **Read**.

### Outcome and proof

- Primary action: from a product link to a confirmed order in under 3 minutes on a phone (SC-002).
- The proof is Aviva's own photos of the work (one plain backdrop, shown as a square, §6), real
  prices with VAT, the stated preparation time, real delivery terms and the seller's business
  details. **Amended honesty rule (2026-11-16, owner decision 11):** product photos are Aviva's own
  photos of the work. The only other photos are the three lifestyle images the owner supplied for
  the home page (AI-generated from Aviva's real pieces and her real look, approved by the owner on
  2026-11-16). No other invented photos, and never reviews, badges, counters, urgency or invented
  social proof (PRODUCT.md principle 5).

### Selected direction

- **The Shopify look the owner chose** (her own Shopify shop, "Horizon" theme, "Balance" style;
  approved 2026-11-16): a white page, near-black green text, soft sage buttons with dark text, a
  dark green main action button, a peach band, a mint green footer, Assistant for all text, full-width
  photos on the home page and square product photos with sharp corners. It stays warm through
  Aviva's first-person voice, her own photos and the warm photos on the home page; it must not feel
  like a childish toy store or a cold luxury boutique.
- **Structure**: `forest` free-shipping strip → plain full-width sticky white header (see-through
  over the home page's top photo while scrolled to the very top, [§4](#header-states)) →
  breadcrumbs → content directly on the white page, with a panel (white, 1 px `line` outline,
  12 px radius) only where a form or summary needs grouping → mint footer. Product photos sit in
  square `photo` wells with sharp corners and no frame. No shadow anywhere except floating
  surfaces (menu drawer, consent sheet, dialogs).
- **Home page**: hero photo with the shop name → swipeable row of "Featured" pieces → child photo
  banner → peach statement band with a "shop now" link → shelf photo banner → footer
  ([§8.1](#81-home-locale)).
- **Focal moment on the product page**: the peach "made just for you" note. It is the page's one
  highlight, beside the `forest` add-to-cart button.
- **Authored motion moment**: the add-to-cart confirmation (button label swaps to "Added" with a
  drawn check, cart badge count pops). Everything else is quiet; nothing moves by itself
  (no autoplay anywhere).

### Voice

- **Aviva speaks in the first person**, Hebrew feminine singular ("סרגתי", "אני שולחת",
  "אענה לכם"). Customers are addressed in the **plural** ("בחרו", "הוסיפו", "שלכם").
  English mirrors it: "I crocheted…", "I'll email you…", "Choose…".
- Plain words, short sentences, no exclamation-mark enthusiasm except the order thank-you.
- Controls name their action ("הוספה לסל", "המשך לקופה", "ביצוע הזמנה"). Errors name the problem
  and the way out.
- Copy states only facts that are true for this shop (made to order, preparation time, delivery
  terms from settings). Never fabricate: no "best seller", no "only 2 left", no story beyond what
  Aviva writes on the About page, and no photos other than Aviva's own product photos and the
  three owner-supplied home page images ("Outcome and proof").

### Scope and anti-goals

- **In scope**: every public screen in [§8](#8-screens), their states, both directions; and, since
  002, the admin order screens in [§12](#12-admin-area) (Hebrew, right-to-left, Operate mode,
  phone first).
- **Feels wrong** (user, 2026-11-07): a childish toy store; a cold luxury boutique. Also out:
  the rejected themed directions (knitting chart, ball band, wrapped gift, market stall). Do not
  revive them as decoration.
- No dark theme. No carousel of banners (the home page's product row is a plain scroll row the
  visitor moves herself: no autoplay, [§7.32](#732-shophomerow-and-shoprowarrows)). No pop-ups. No sticky
  "buy" bar on mobile (the buy box is reachable and the header cart is always there).

---

## 2. Implementation constraints (binding, from plan.md)

| Constraint                                     | What it means for every component                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Strict nonce CSP, `style-src 'self' 'nonce-…'` | **No `style` attribute and no `style` prop anywhere.** Dynamic visuals use classes, data attributes (`data-state`, `aria-*` selectors), `<progress>`/`<meter>`, or SVG presentation attributes. Lint bans the `style` prop (T002).                                                                                                                                                                                                                                                                                                                      |
| Images                                         | Plain `<img>` with hand-written `srcset` (`-400.webp 400w, -800.webp 800w, -1600.webp 1600w`), a `sizes` value from [§6](#6-images), `width`/`height` (or an aspect-ratio box) so nothing shifts, `decoding="async"`. **Never `next/image`.** The three home photos are served as a hand-written `<picture>` (a `(min-width: 640px)` wide `<source>` with 800/1200/1600/2000 px WebP, and a phone `<img>` with 400/565 px portrait crops), made by `pnpm photos:home` into `public/site-photos/` ([§6](#6-images), [§7.27](#727-shophomephoto-server)). |
| Tailwind 4, logical properties only            | `ms-* me-* ps-* pe-* start-* end-* text-start text-end rounded-s-* rounded-e-* border-s border-e`. Physical utilities (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l/r-`, `border-l/r`) are lint errors (T002), and physical CSS properties in `.css` files fail `pnpm check:css`. Direction-dependent icons flip with the `rtl:` variant.                                                                                                                                                                       |
| Fonts                                          | **Assistant** only (variable, one file per subset, so every weight 200–800 is available), self-hosted with `next/font/google` at build time (no runtime request, `font-src 'self'` unchanged), subsets `hebrew` + `latin`, `display: 'swap'`, exposed as `--font-assistant`; `--font-sans` points to it. No other font (Heebo is removed).                                                                                                                                                                                                              |
| Scripts                                        | No third-party scripts, widgets, embeds, icon fonts or CDNs. Icons are authored inline SVG ([§5](#5-icons)).                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| JS budget                                      | Storefront first-load JS ≤ 150 KB gzipped on every public page; the checkout page ≤ 155 KB (user decision 2026-11-09); the product page ≤ 152 KB, and 157 KB with the cart drawer opened (owner answer 2026-11-17) (checked by `tests/e2e/bundle-size.spec.ts`, T087; extended in T131). Server Components by default; client islands only as listed in [§10](#10-performance-budget).                                                                                                                                                                                                                                                               |
| Accessibility                                  | WCAG 2.1 AA (IS 5568) in RTL and LTR: contrast ([§3.1](#31-colour)), 44×44 px touch targets, visible focus, labelled controls, logical reading and focus order in both directions, `prefers-reduced-motion` respected ([§3.5](#35-motion)); text over photos is readable by construction ([§3.3](#33-space-size-radius-shadow-scrims)).                                                                                                                                                                                                                 |
| Dependencies                                   | **None added.** The design needs no new package, font or service (constitution V). Zoom, popovers and dialogs use native `<dialog>`, the `popover` attribute and CSS scroll-snap; the header over the hero and the swipeable row are CSS ([§4](#header-states), [§7.32](#732-shophomerow-and-shoprowarrows)).                                                                                                                                                                                                                                           |

---

## 3. Tokens

All tokens live in `src/app/globals.css` in a Tailwind 4 `@theme` block (007), so each one
becomes a utility (`bg-paper`, `text-ink`, `rounded-card`, `shadow-float`…). Components never
use raw hex values.

### 3.1 Colour

Replaced 2026-11-16 (007 D1). Values start from the approved home example; every pair below was
computed against WCAG 2.1 (AA needs 4.5:1 for normal text, 3:1 for large text and for control
borders). No example shade had to change.

| Token          | Value     | Use                                                                                                                                                                  | Contrast                                                                                         |
| -------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `paper`        | `#FFFFFF` | page and surfaces (replaces `ground` and `panel`)                                                                                                                    | ink 18.9, ink-2 8.9                                                                              |
| `photo`        | `#EEF2EE` | photo wells, skeletons, table header rows, admin page background                                                                                                     | ink 16.7, ink-2 7.9, alert 6.7                                                                   |
| `ink`          | `#061406` | text, focus ring, selected borders                                                                                                                                   | —                                                                                                |
| `ink-2`        | `#3E4E3F` | secondary text, chip borders, outlined quantity box                                                                                                                  | 8.9 paper, 7.2 peach, 6.5 sage, 5.5 mint                                                         |
| `line`         | `#DDE5DD` | dividers and panel outlines only (decorative)                                                                                                                        | 1.3 (decorative)                                                                                 |
| `field`        | `#6B7D6C` | borders of text inputs, selects, checkboxes, radio cards                                                                                                             | 4.4 paper, 3.9 photo                                                                             |
| `sage`         | `#CFE2D0` | `soft` buttons, selected chips and radio cards, cart badge, text selection, offline-payment panel, "new" / "paid" badges                                             | ink on it 13.9                                                                                   |
| `sage-hover`   | `#BCD6BE` | `soft` button hover                                                                                                                                                  | ink 12.2                                                                                         |
| `forest`       | `#1E4620` | main action buttons, free-shipping strip, current-photo and current-step rings, facts icons, skip link                                                               | paper on it 10.8; 9.5 on photo                                                                   |
| `forest-hover` | `#163518` | main button hover                                                                                                                                                    | paper 13.5                                                                                       |
| `peach`        | `#F7E5D7` | statement band, made-to-order note (the one highlight, FR-020)                                                                                                       | ink 15.4, ink-2 7.2                                                                              |
| `mint`         | `#A3D9A5` | footer                                                                                                                                                               | ink 11.7, ink-2 5.5                                                                              |
| `alert`        | `#A32018` | errors and "not available" only                                                                                                                                      | 7.6 paper, 6.7 photo, 6.2 peach, 5.6 sage                                                        |
| `on-photo`     | `#FFFFFF` | text and icons over photos: under a scrim on the hero, straight on the photo in the two banners, an accepted exception ([§3.3](#33-space-size-radius-shadow-scrims)) | 3.0 or better under `--scrim-large`, 4.6 or better under `--scrim-text`; banners: not guaranteed |

Rules:

- Text on `forest` is always `paper`; text on `sage`, `peach`, `mint` and `photo` is always `ink`
  (or `ink-2` where the table lists it). Never put `alert` text on `forest` or `mint`.
- `alert` is never decorative and never used for sale/urgency messaging.
- **Sage on white is only 1.4:1**, so sage is never the only sign of a state: a selected chip or
  radio card also gets a 1.5 px `ink` border and bold text (WCAG 1.4.11 and 1.4.1). A `soft`
  (sage) button is identified by its text, which needs no border contrast.
- `line` is 1.3:1 and is only ever a decoration (dividers, panel outlines); every control boundary
  uses `field` (3:1 or better) or `ink-2` / `ink`.
- The made-to-order note is `peach` with `ink` text and a `forest` yarn icon; on the product page
  it is the only peach element, so it stays the page's one highlight.
- Text selection: `::selection { background: sage; color: ink }`. Caret: `caret-color: ink`.
- Focus ring: 3 px `ink` outline, offset 3 px (the global `:focus-visible`); inside photo sections
  it is `on-photo` (white); in the header it is `currentColor`, so it follows the header's own
  colour (white over the photo, `ink` on the white bar) The search field is the one exception: its
  focus ring is the inset `forest` ring on the round field ([§7.33](#733-shopheadersearch-server)).
- **Removed names**: `ground`, `panel`, `sun`, `sun-hover`, `sun-soft`, `sun-ink`, `rose`,
  `rose-ink`. Tailwind's `--color-*: initial` already drops every colour not listed, so an old
  class name would silently produce nothing; `tests/unit/design-tokens.test.ts` fails when any
  removed name is still used in `src/`, and recomputes the contrast table above (and the two scrim
  strengths) from the values in `globals.css`, so a later shade change cannot quietly break AA.
  `peach` changed meaning (it was the footer; it is now the band and the note).

### 3.2 Typography (Assistant)

All text is Assistant (variable; [§2](#2-implementation-constraints-binding-from-planmd)). Weights
used: 300 (hero shop name and band sentence, thin as in the Shopify shop, owner answer Q2), 400
body, 600 buttons, 700 titles and brand, 800 banner headings (007 D2, D11).

| Role                                                                  | Size / line height (mobile → ≥ 900 px) | Weight  | Tracking     |
| --------------------------------------------------------------------- | -------------------------------------- | ------- | ------------ |
| Hero shop name (h1 on the home page)                                  | `clamp(56px, 12vw, 128px)` / 0.95      | 300     | −0.02em      |
| "All pieces" intro line (`shop.catalog.intro`; no longer on the hero) | 24 / 1.3                               | 400     | 0            |
| Banner heading (h2 on a photo)                                        | `clamp(40px, 6.4vw, 76px)` / 1.0       | 800     | −0.02em      |
| Banner line (on a photo)                                              | 24 / 1.35                              | 400     | 0            |
| Band sentence (peach)                                                 | `clamp(28px, 4.4vw, 52px)` / 1.2       | 300     | 0            |
| Page title (h1: All pieces, category, cart, checkout, content)        | 32/1.15 → 44/1.15                      | 700     | −0.01em      |
| Product title (h1 on the product page)                                | 30/1.15 → 36/1.15                      | 700     | −0.01em      |
| Section title (h2: home row, "You may also like")                     | 28/1.15 → 40/1.15                      | 700     | −0.01em      |
| Card name                                                             | 19/1.2 → 22/1.2                        | 400     | 0            |
| Card price                                                            | 14/1.4 `ink-2`                         | 400     | tabular-nums |
| Price (product)                                                       | 24/1.2                                 | 700     | tabular-nums |
| Body                                                                  | 16/1.6                                 | 400     | 0            |
| Prose body (content pages)                                            | 17/1.75                                | 400     | 0            |
| Label / legend / summary                                              | 14–15/1.4                              | 700     | 0            |
| Small (hints, crumbs, VAT note, badges)                               | 13/1.45                                | 400–700 | 0            |
| Brand (header)                                                        | `clamp(19px, 4.6vw, 22px)`             | 700     | 0            |
| Footer column heading (h2)                                            | 18/1.3                                 | 700     | 0            |

- Every price, quantity, order number and count uses `tabular-nums` (`.tnum` utility).
- Body measure ≤ 65ch (description, prose, notes). Headings use `text-wrap: balance`.
- Form inputs are 16 px so iOS does not zoom on focus.
- The hero line and the banner lines are 24 px regular on purpose: that is "large text" (WCAG), so
  they pass AA under the lighter scrim ([§3.3](#33-space-size-radius-shadow-scrims)).

### 3.3 Space, size, radius, shadow, scrims

- Spacing: Tailwind's 4 px scale. Page gutter 16 px below 900 px, 24 px from 900 px. Panels pad
  18–22 px on mobile, 30–32 px on desktop. Container max width 1240 px, centred with
  `margin-inline: auto`. Home page sections: product row padding 48 / 64 px (72 / 88 px from
  900 px); statement band 80 px (128 px from 900 px) above and below.
- Touch targets: every interactive element ≥ 44×44 px (icon buttons 44×44, chips min-height 44,
  primary buttons 52 px tall, `secondary` and `soft` buttons 48 px, inputs 52 px).
- **Radius** (007 D11): photos and product wells 0 (sharp); `rounded-card` 12 px (panels, notices,
  dialogs, the menu drawer); `rounded-chip` 8 px (inputs, selects); `rounded-pill` 999 px (buttons,
  chips, language pill, quantity box, badges, social circles). The footer has no rounded corners.
- **Shadow**: the header has none. One token, `shadow-float` = `0 3px 14px rgb(6 20 6 / 0.12)`
  (the old brown re-tinted to green-black), used only on floating surfaces: the menu drawers, the
  consent sheet, dialogs. Cards and panels are flat.
- **Header height**: custom property `--header-h` = 64 px, 72 px from 900 px. The hero is pulled up
  by this amount under the header ([§4](#header-states)); `html { scroll-padding-top:
var(--header-h) }`.
- **Scrims** (007 D4): white text on a photo is readable for any photo, any wording and any shop
  name, because the dark layer belongs to the text, not to fixed areas of the photo.
  - **Text bands.** In each photo section the photo fills the section from behind (the section
    background is `ink`, so the text is readable even before the photo arrives) and the text sits
    in full-width bands that carry their own scrim: the hero has a top band (the space under the
    header) and a bottom band (the shop name). **The two banners have no dark layer at all** (owner
    decision 2026-11-17, spec "Owner visual fixes"): their text sits straight on the photo with only
    the soft text shadow, in a plain `.banner-copy` box (bottom on phones; the reading-start half
    from 640 px, right in Hebrew and left in English). The owner chose this knowing the white text
    may not reach WCAG AA on light parts of those photos: an accepted exception, measured and
    reported at the gate (007 T087). A hero band is as tall as its text, so a longer shop name or a
    line that wraps further makes the band, and its dark layer, taller. Outside the bands a 48 px
    feathered edge fades the scrim out and the rest of the photo stays light. Classes in
    `globals.css`: `.scrim-band` with `-top` and `-bottom` variants (the `-banner` variant was
    removed on 2026-11-17). The hero has no text in its top band any more (Phase D gate, 007 D20):
    the top band is the blended strip below.
  - **Blended strip behind the header** (007 D20, FR-042): the hero's top band holds no text and is
    only the darkening behind the see-through header. Its element has a fixed block size
    `calc(var(--header-h) + 140px)`, no padding, no `::after` feather and no `.scrim-band` base
    layer; one gradient does everything: `rgb(0 0 0 / 0.62)` at the top, `--scrim-text` (0.55) at
    `var(--header-h)`, then easing to 0 at the element's bottom edge through stops at 0.40, 0.22
    and 0.08, so no edge is visible. The header's text and icons sit entirely above `--header-h`,
    where the darkness is at least 0.55 (white on the brightest pixel is at least 4.6:1, as below).
  - **Two strengths**, both custom properties in `globals.css` (the token test recomputes their
    contrast): `--scrim-large: 0.42` (black at 42 %; white text on the brightest possible pixel is
    then at least 3.0:1, enough for large text, at least 24 px regular or 19 px bold, and for
    icons: the hero's shop name) and `--scrim-text: 0.55`
    (at least 4.6:1, enough for normal text: the blended strip of the hero behind the transparent
    header, down to `var(--header-h)` at least, because the header holds 15 px links; it stays the
    minimum behind the header and the token test keeps checking it).
  - Section heights are minimums (`min-h-[…]`), so long text grows the section instead of
    overflowing it. A soft text shadow is added for comfort and is not counted.
  - `tests/e2e/home.spec.ts` checks, at 320, 375 and 1280 px in both languages and with a
    60-character shop name, that every text element over the hero photo lies inside a scrim band
    (the banners are checked for no dark layer instead, 2026-11-17) and that
    the whole header lies inside the blended strip's first `var(--header-h)` at the top of the page
    ([§11](#11-verification)).

### 3.4 Breakpoints

Tailwind 4 `@theme`: `--breakpoint-sm: 40rem` (640 px), `--breakpoint-lg: 56.25rem` (900 px,
the sample's desktop switch), `--breakpoint-xl: 77.5rem` (1240 px), and (007 D20) `--breakpoint-nav: 64rem` (1024 px), used
only by the header and the menu drawer ([§7.18](#718-shopheader-server-shell--two-islands)); every
other rule keeps the other breakpoints. Design at 375 px first.

### 3.5 Motion

- Durations 150–200 ms, `ease-out`. Card image hover zoom 1.03 over 400 ms. Disclosure "+" icon
  rotates 45° when open. Primary button `:active` scales to 0.98.
- The authored moment: add-to-cart confirmation ([§7.12](#712-shopbuybox-island-price-options-quantity-add-to-cart)).
- **Drawers** (007 D21, FR-044–FR-048): the menu and cart drawers slide in from their own side
  (`translate` from fully off-screen to 0) in 300 ms with `cubic-bezier(0.32, 0.72, 0, 1)`, closing
  reverses it; the backdrop fades from transparent to `rgb(0 0 0 / 0.4)` in the same time; the
  menu button's three lines turn into an X (top and bottom lines move to the centre and turn ±45°,
  the middle line fades) over the same time. Entry uses `@starting-style`, exit uses
  `transition-behavior: allow-discrete` on `display` and `overlay` (a browser without `overlay`,
  Safari, closes without the slide-out). A drawer opens only on the visitor's own action (a tap,
  or a successful "add to cart"), so "nothing moves by itself" still holds.
- **No autoplay anywhere**: nothing on any page moves, slides or changes by itself.
- `@media (prefers-reduced-motion: reduce)` (007 FR-036): no transforms (so no card photo zoom, no
  press scale), no smooth scrolling (the home row's arrow buttons then move it instantly,
  `behavior: 'auto'`; the row's own touch and keyboard scrolling is the browser's), the row's
  sliding is off, the spinner becomes a static icon with text, and `transition: none` applies to
  everything, so the drawers and the X appear and disappear without sliding or turning (the same
  end states, FR-048). **The header's fade** (home page, [§4](#header-states)) is a 250 ms
  CSS `transition`, so `transition: none` makes it instant under reduced motion: the same end
  states for every visitor, no movement.

### 3.6 Layering

`z-header` 20 (sticky header; the hanging logo is a child of the header and lives in this context, so it sits above the page content, below the drawers (top layer) and below the consent banner), `z-banner` 40 (consent); `z-popover` 30 is no longer used by the menu (the two drawers are native popovers, so no z-index applies); dialogs and the two drawers use
the top layer.

---

## 4. Global layout and direction (RTL/LTR)

- `<html lang="he" dir="rtl">` or `<html lang="en" dir="ltr">` from the locale segment. Nothing
  else sets direction except the bidi isolation rules below.
- Layout is written once with logical properties; English is **not** a mirrored Hebrew page: in
  English the gallery sits on the left and the details on the right, the menu links on the
  left, icons on the right, and text aligns left — because "start" is left in LTR.
- **Direction-dependent icons** (chevrons, arrows, breadcrumb separators, "next/previous" in the
  zoom dialog) point toward inline-end/inline-start and flip with `rtl:-scale-x-100`. Icons that
  are not directional (search, cart, plus, check) never flip.
- **Bidi isolation**: prices from `formatMoney`, order numbers, phone numbers, emails, postal
  codes and the search query are wrapped in `<bdi>` (phone/email/postal also `dir="ltr"`). Email
  and phone inputs are `dir="ltr"` with `text-align: end` in RTL so they sit on the right.
- **Hebrew fallback content on English pages** (FR-045): an owner-written field shown in Hebrew
  on an `/en` page is wrapped with `lang="he" dir="auto"` so it is read and aligned correctly.
  `pick()` (T058) returns `{text, lang}` so components can set this.
- Keyboard arrows that mean "next/previous" follow the visual direction: in RTL `ArrowLeft` is
  next, in LTR `ArrowRight` is next.
- Skip link "דילוג לתוכן" / "Skip to content" is the first focusable element and targets `<main>`.

### Page frame (every public page)

```
┌ free-shipping strip (forest, not sticky): text centred · language switch at reading end ┐
├ sticky header bar (id + data-testid "site-header"), 64 / 72 px ──────────────────────────┤
│  < 1024 px:  menu button       logo (centred, hangs below)   cart                        │
│  ≥ 1024 px:  All pieces · cat 1 · cat 2 · home cat · About · Shipping & Returns ·        │
│              logo · [search field] · cart                 (one row, reading order)       │
├ <main id="main"> (top padding = the logo's overhang + 8 px) ──────────────────────────────┤
├ footer (mint) ───────────────────────────────────────────────────────────────────────────┤
└ consent banner (only when consentRequired()) ────────────────────────────────────────────┘
```

(Contract: `specs/007-storefront-redesign/contracts/ui.md`, "Page frame"; component details in
[§7.17](#717-shopannouncementbar-server)–[§7.20](#720-shopfooter-server) and
[§7.33](#733-shopheadersearch-server).) Amended at the Phase D gate (owner answers 2026-11-16,
007 D20).

- The header is one plain full-width bar on every page: no floating pill, no shadow, no account
  icon, no favourites icon, no language switch in the bar (FR-004, FR-008). `data-testid="header-brand"`
  is on the brand link (home link, shop name from settings); the existing ids and accessible names
  stay (`cart-link`, `cart-badge`, the header's menu button with `popovertarget="site-menu"`); the language
  switch now lives in the free-shipping strip ([§7.17](#717-shopannouncementbar-server)).
- **Breakpoint `nav` = 1024 px.** From 1024 px the header is one row in reading order (the owner's
  order): "All pieces" (`/{locale}/shop`), header category 1, header category 2, the home-row
  category, "About", "Shipping & Returns", the brand, the search field, the cart. Below 1024 px:
  menu button, brand, cart; the menu drawer holds the search field, "All pieces", every category
  with published pieces, "About", "Shipping & Returns", "Contact" and the full-word language link
  ([§7.18](#718-shopheader-server-shell--two-islands)). The menu drawer is a native popover that
  slides in from the reading-start side, from the header's top edge ([§7.18](#718-shopheader-server-shell--two-islands)); the cart
  button opens the cart drawer from the reading-end side ([§7.34](#734-shopcartdrawer-server-shell--client-body)).
- **Gutters.** The header's own side gutter is 16 px (`px-4`) at every width, while `<main>` keeps
  24 px from 900 px, so from 900 px the header's edges sit 8 px further out than the page content.
  Accepted: it buys the room the one-row header needs.
- **`<main>` and full-bleed pages** (007 D6): `<main id="main">` is limited to 1240 px with side
  padding. A page whose root element carries `data-full-bleed` drops that limit
  (`has-[>[data-full-bleed]]:max-w-none has-[>[data-full-bleed]]:px-0 has-[>[data-full-bleed]]:pb-0`, so no gap is left above the footer); only the home page does.
  Its non-photo sections (the row, the band) put their content back in the 1240 px container.
  Never use `100vw` break-outs (they scroll sideways where scrollbars take space).
- **The logo** (008, `specs/008-post-launch-fixes/contracts/ui.md`): the brand link holds the round
  logo image, 88 px (`--logo-size`; 112 px from 900 px). Its centre is on the header's bottom edge:
  half of it (`--logo-overhang`, half of `--logo-size`) is inside the bar and half hangs over the
  page. So `<main>` has a top padding of `--logo-overhang` plus 8 px on every page but the home page
  (where the hero is under the header), and `html` `scroll-padding-top` is `--header-h` plus
  `--logo-overhang`, so an anchor jump does not hide a heading under the logo. The logo never covers
  the menu button, cart button or search field. Details: [§7.18](#718-shopheader-server-shell--two-islands),
  [§6](#6-images).
- **Breadcrumbs** sit right under the header on category, product, search and content pages.

#### Header states

Amended 2026-11-17 (owner visual fixes and clarification): the home header is see-through only at
scroll 0 and fades in time to the frosted white bar from 1 px of scroll; the white bar is frosted.

| Page                                                                        | Hero under the header? | Header look                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home, scrolled all the way to the top                                       | yes                    | transparent, `on-photo` text and icons, no border, no blur, focus ring `currentColor` (white); the photo behind it is darkened by the blended strip, at least `--scrim-text` (55 %) behind the header and fading to nothing below it ([§3.3](#33-space-size-radius-shadow-scrims)); the search field keeps its own `paper` fill and `ink` text |
| Home, scrolled by 1 px or more                                              | -                      | the white bar (below), reached by a fade of about 250 ms (background, border, text colour and blur together); scrolling back to the very top fades back. The fade is a brief moving state, never a resting one                                                                                                                                 |
| Home, reduce motion on                                                      | -                      | the same end states, with no fade (`transition: none`)                                                                                                                                                                                                                                                                                         |
| Home, page opened part-way down (reload, `#fragment` link, restored scroll) | -                      | white text over content until the island hydrates, then the fade to the white bar (the server always renders `data-at-top`; the CSP forbids an inline script that could correct it earlier). Accepted                                                                                                                                          |
| Home, JavaScript off                                                        | -                      | the frosted white bar at every scroll position (`@media (scripting: none)`), covering the photo's top `--header-h`; readable everywhere                                                                                                                                                                                                        |
| Home, forced colours (Windows high contrast)                                | -                      | no transparency, no blur, no transition: `Canvas` background, `CanvasText` text, at the top and below                                                                                                                                                                                                                                          |
| Every other page                                                            | -                      | the white bar                                                                                                                                                                                                                                                                                                                                  |

**The white bar** (every page, and the home page once scrolled): `color-mix(in srgb, var(--color-paper)
85%, transparent)` background with `backdrop-filter: blur(12px) saturate(1.4)` (and the `-webkit-`
prefix), 1 px `line` bottom border, `ink` text; so blurred shapes of what is behind show through.
It is declared under `@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter:
blur(1px))`; browsers without it keep the solid `paper` bar.

How (007 D5, amended 2026-11-17): the header's resting style is the white bar, with a 250 ms
`transition` of `background-color`, `border-color`, `color` and `backdrop-filter`. On the home page
the hero (`data-hero`) is pulled up under the header by a negative top margin of `--header-h`. The
server renders `data-at-top` on `#site-header`; the tiny client island `HeaderScrollState` (a
passive `scroll` listener, renders nothing) keeps it present exactly while `window.scrollY <= 0`.
`body:has([data-hero]) #site-header[data-at-top]` is the see-through look, so other pages never see
it. A time transition cannot be started from scroll position in CSS alone in every browser, hence
the island (a few hundred bytes; no scroll-driven animations are used, so Firefox and Safari behave
like Chrome). The text is white only at the very top, over the blended strip, and `ink` on the bar
the moment the transition has run its course. Without JavaScript, `@media (scripting: none)` keeps the frosted bar at
every scroll position; browsers without the `scripting` feature (before Chrome 120, Firefox 113,
Safari 17) keep the see-through look there. The cart badge and menu are unchanged; their colours
follow `currentColor`. The search field sets its own colours

([§7.33](#733-shopheadersearch-server)).

---

## 5. Icons

Client components do not import `Icon.tsx`: they import `Icon` from `ui/ClientIcon.tsx`, which
draws only the 10 glyphs defined in `ui/icon-core.tsx` (the set client islands need), so the full
set does not reach the browser's first load. `Icon.tsx` (server) and `ClientIcon.tsx` share the
frame and the glyph drawings from `icon-core.tsx`.

`src/components/ui/Icon.tsx`: one Server Component rendering authored inline SVG from a fixed
set; `viewBox="0 0 24 24"`, 22 px default, `stroke="currentColor"`, `fill="none"`, stroke width
1.7, round caps and joins, `aria-hidden="true"` and `focusable="false"` (the control carries the
accessible name). Set: `search`, `cart`, `menu`, `close`, `zoom`, `chevron` (directional),
`arrow` (directional), `plus`, `minus`, `check`, `truck`, `pin`, `card`, `yarn` (the made-to-order
ball, as drawn in the sample), `alert`, `info`, `mail`, `phone`, and, added 2026-11-16 (007 D9),
`instagram`, `facebook` and `tiktok`, and, added 2026-11-20 (008), `whatsapp` (authored simple outlines in the set's own style and stroke;
social links in the footer, [§7.31](#731-shopsociallinks-server); never the platforms' logo files; `whatsapp` is a speech bubble with a handset, 24 px, used by the contact page's WhatsApp button, [§8.10](#810-contact-localecontact)). No Unicode glyphs or emoji as
icons (the sample's `−`, `+` and `✓` become SVG).

---

## 6. Images

| Context                                                     | Variants                                                                                                      | `sizes`                                                  | Loading                                                                                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product card (grid and home row)                            | 400, 800                                                                                                      | `(min-width: 900px) 25vw, (min-width: 640px) 33vw, 50vw` | `lazy`, except the first `eagerCount` cards: 4 on All pieces, category and search, 0 on the home page ([§7.15](#715-shopproductcard-and-shopproductgrid-server)) |
| Gallery main                                                | 400, 800, 1600                                                                                                | `(min-width: 900px) 55vw, 100vw`                         | first image `eager` + `fetchpriority="high"`, others `lazy`                                                                                                      |
| Gallery thumbnails                                          | 400 (a one-entry `srcset`, so every catalog and product image has `srcset` and `sizes`)                       | `72px`                                                   | `lazy`                                                                                                                                                           |
| Zoom dialog                                                 | 1600 (one-entry `srcset`)                                                                                     | `100vw`                                                  | loaded when the dialog opens                                                                                                                                     |
| Cart / checkout line                                        | 400 (one-entry `srcset`)                                                                                      | `72px`                                                   | `lazy`                                                                                                                                                           |
| Order summary line (checkout)                               | 400 (one-entry `srcset`)                                                                                      | `48px` (rendered 48×48)                                  | `lazy`                                                                                                                                                           |
| Home hero (`<picture>`, [§7.27](#727-shophomephoto-server)) | phone `<img>`: 400×600 and 565×848 portrait crops; wide `<source>` from 640 px: 800, 1200, 1600, 2000 px wide | `100vw`                                                  | `eager` + `fetchpriority="high"` (the page's largest element)                                                                                                    |
| Home banners (`<picture>`)                                  | the same six variants per photo                                                                               | `100vw`                                                  | `lazy`                                                                                                                                                           |
| Open Graph                                                  | 800 (stays 4:5; WhatsApp previews are unaffected)                                                             | —                                                        | meta tag only (WhatsApp drops preview images over about 300 KB)                                                                                                  |

- **Square display** (007 D7, FR-015): every product photo box is `aspect-square`, `rounded-none`,
  no border, `bg-photo`, with `object-cover object-center` (a centred square crop). Places:
  cards (grid and home row); gallery main photos; thumbnails (72×72); "You may also like" (it uses
  the cards); cart lines (72×72); checkout order-summary lines (48×48). The admin order page's item
  photos stay as they are (admin changes colours and font only). This is display only: the stored
  photos and their 4:5 variants are unchanged, and `<img>` keeps its real `width`/`height`
  (800×1000 etc.), so the layout reserves space and nothing shifts while loading. The zoom dialog
  keeps `object-contain`, so the whole photo is shown. (The order status page shows no product
  photos: order photos are private.) `storefront-layout.spec.ts` asserts `|width − height| ≤ 1 px`
  for each of these boxes.
- Every photo box is `photo`-coloured, so missing or slow images never collapse the layout.
- Alt text: card images `alt=""` (the product name is the link text right below). Gallery images
  use the owner's alt text for that photo in the current locale (Hebrew fallback), otherwise
  "{product name}, תמונה {n} מתוך {N}" / "{name}, photo {n} of {N}". Home photos use the
  translated `shop.home.<id>.alt` text, never empty.
- A product without any public image cannot be published, so no "no image" art is needed;
  a broken image shows the empty `photo` box.

### Brand assets (008, contracts/brand-assets.md)

The logo is a round badge supplied by the owner (2026-11-20): original `assets/logo/logo-original.jpg`
(2000 x 2000, not served). `pnpm brand:assets` (`scripts/build-brand-assets.ts`, settings in
`src/lib/brand/config.ts`) finds the disc by colour, cuts it with an anti-aliased circular alpha mask
and writes, deterministically, `<name>.<8 hex of sha-256>.<ext>` files to `public/brand/`: the header
logo as WebP with alpha at 176, 224, 264 and 336 px (each at most 40 KB), `icon-32`, `apple-touch-icon`
(180), `icon-192` and `icon-512` (PNG), and the link-preview image `og` (1200 x 630 JPEG: the home hero
photo with the logo centred). It also writes `public/favicon.ico` (16, 32 and 48 px PNG entries: the
yarn crop of the logo on cream, since the whole badge is unreadable at 16 px) and
`public/site.webmanifest`. `src/lib/brand/manifest.json` lists every file with its size and the
detected disc; `src/lib/brand/index.ts` gives the URLs. The files are committed, like the home photos;
run the script again (and commit the result) only when the logo changes. The preview image is cached
for a year (`immutable`; the hash is in the name). The page metadata that uses them:
`specs/008-post-launch-fixes/contracts/metadata.md`.

### Home photos (007 D3, contracts/home-photos.md)

The three photos on the home page are lifestyle images the owner supplied (AI-generated from
Aviva's real pieces and her real look; approved 2026-11-16; no marking). They are code, not data:
built in, changed by the maintainer, not through the admin area. Originals (2000×848 JPEG) live in
`assets/home-photos/` (not served); the generated WebP variants live in `public/site-photos/`
(served at `/site-photos/`, committed, named `<name>-<variant>.<hash8>.webp`, variants `p400`,
`p565`, `w800`, `w1200`, `w1600`, `w2000`), listed in `src/lib/home-photos/manifest.json`.

| id            | Source file             | Phone crop centre (`focusX`) | Wide crop (literal classes in `config.ts`) | Alt text key                | Loading                         |
| ------------- | ----------------------- | ---------------------------- | ------------------------------------------ | --------------------------- | ------------------------------- |
| `hero`        | `hero-workshop.jpg`     | 30 %                         | `sm:object-[50%_50%]`                      | `shop.home.hero.alt`        | `eager`, `fetchpriority="high"` |
| `bannerChild` | `banner-child-play.jpg` | 58 %                         | `sm:object-[58%_50%]`                      | `shop.home.bannerChild.alt` | `lazy`                          |
| `bannerShelf` | `banner-shelf.jpg`      | 50 %                         | `sm:object-[50%_50%]`                      | `shop.home.bannerShelf.alt` | `lazy`                          |

- Phone crops are portrait 2:3 at the original's full height (848): width `round(848 × 2 / 3)`
  = 565, left edge `clamp(round(focusX × 2000 − 565 / 2), 0, 2000 − 565)`; written at 565×848 and
  at 400×600. Wide versions are the whole photo at 800, 1200, 1600 and 2000 px (never upscaled).
  All WebP, metadata stripped.
- Budgets (checked by `tests/unit/home-photos.test.ts`): every phone file at most 190 KB (hero
  `p565` and `p400` included; SC-005 says a phone's hero download is under 200 KB); every wide file
  at most 450 KB (guidance for 4G desktops). On a phone the hero download is a `p…` variant, checked
  in `home.spec.ts`.
- Serving: `next.config.ts` sends `Cache-Control: public, max-age=31536000, immutable` for
  `/site-photos/:path*` (every name carries its fingerprint, so a replaced photo gets a new name).
  CSP `img-src 'self'` and `nosniff` already cover these paths.

**Changing a home photo** (FR-013, D3), done by the maintainer:

1. Replace the JPEG in `assets/home-photos/` (keep the file name, or change `source` in
   `src/lib/home-photos/config.ts`). It must be at least 2000×848; the script exits with an error
   when a source is missing or smaller.
2. If the main subject moved, adjust its `focusX` (and the wide crop classes) in `config.ts`.
3. Update the alt text in `src/i18n/messages/he.json` and `en.json` (`shop.home.<id>.alt`) when the
   picture's content changed; the heading and line texts live in the same files.
4. Run `pnpm photos:home`: it empties `public/site-photos/`, writes the new variants and
   `manifest.json` (same originals give the same files).
5. Run `pnpm test` (the home-photos unit test checks sizes, formats, metadata and the manifest)
   and commit the originals, `public/site-photos/` and `manifest.json` together.

Note (owner answer 2026-11-16): the originals are 848 px tall, so on very sharp phone screens they
look slightly soft; taller versions can be swapped in with the steps above.

---

## 7. Components

Paths are under `src/components/`. "Server" = React Server Component; "island" = client
component. Components take every visible string as a prop or read it with next-intl in the
server parent; none contains literal display text (constitution I).

### 7.1 `ui/Button` and `ui/LinkButton` (server)

| Variant           | Look                                                                                                      | Use                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `primary`         | `forest` fill, `paper` text 16/600, pill, 52 px tall, hover `forest-hover`, active scale 0.98             | one per view: add to cart, continue to checkout, place order, send                                              |
| `secondary`       | the outlined button: transparent, 1.5 px `ink` border, `ink` text 16/600, pill, 48 px, hover `photo` fill | alternatives of equal standing: "pay another way", consent accept/reject, dialogs, admin. Callers are unchanged |
| `soft` (new, 007) | `sage` fill, `ink` text 16/600, pill, 48 px, hover `sage-hover`                                           | the banner buttons on the home page                                                                             |
| `quiet`           | text link style, underline offset 3 px                                                                    | tertiary actions: remove, edit, "back to the shop"                                                              |

- All variants are at least 44 px tall.
- Busy state: `aria-busy="true"`, label replaced by an inline spinner + "רגע…" / "One moment…",
  pointer events off. Busy is the only time a button is disabled.
- **Buttons are never disabled to signal a missing choice** (approved behaviour): pressing them
  explains what is missing inline and moves focus there.
- Focus: 3 px outline, offset 3 px, `ink` (`on-photo` inside photo sections), the global
  `:focus-visible` ([§3.1](#31-colour)).

### 7.2 `ui/IconButton` (server)

44×44 circle, icon in `currentColor`, hover fill a 10 % tint of `currentColor` (`hover:bg-current/10`, so it works on the
white bar and over the photo); disabled: `opacity-40`, default cursor, no hover fill (used by the
home row's arrows); required `label` prop rendered as `aria-label` (translated).
Optional `badge` slot.

### 7.3 `ui/ChipLink` and `ui/ChipRow` (server)

- Pill chips (`rounded-pill`, min-height 44, padding-inline 18, 15/400), `paper` fill, 1 px `ink-2`
  border (8.9:1, WCAG 1.4.11), hover `photo` fill; **current chip**: `sage` fill, 1.5 px `ink`
  border, bold (700) and `aria-current="page"` (sage alone is 1.4:1, so the border and weight
  carry the state).
- `ChipRow` scrolls horizontally on mobile (`overflow-x: auto`, scroll-snap, no visible
  scrollbar on touch, scrollbar thumb themed `line` on desktop) and wraps from 900 px.
- Used for category navigation and sort options on the "All pieces", category and search pages
  (the "All" chip points to `/{locale}/shop`), and for the admin filters.

### 7.4 `ui/Notice` (server)

Box with `rounded-card` (12 px), icon + text. Tones: `made` (`peach` fill, `ink` text, `forest`
`yarn` icon), `info` (`paper` panel, 1 px `line` outline, `info` icon, ink text), `attention`
(`sage` fill, ink text — offline payment instructions), `alert` (`paper` panel, `alert` text and
icon, 1.5 px `alert` border). Alerts that appear in response to an action are in a live region
(`role="alert"` for errors, `role="status"` otherwise).

### 7.5 `ui/Price` (server)

`<bdi class="tnum">{formatMoney(minor, currency, locale)}</bdi>`. Props: `from` (prefix
"החל מ־" / "From") and `size` (`lg` 24/700 for product, `md` 15/500 for cart and summary lines; on cards the same component is 14/400 `ink-2`).
No VAT label follows the price (008: the owner will be an exempt dealer and charges no VAT, so the old "כולל מע״מ" / "incl. VAT" line is gone from every price).

### 7.6 `ui/Disclosure` (server)

Native `<details>`/`<summary>`; summary 700 weight, 14 px block padding, `plus` icon at inline-end
rotating 45° when open; top border `line`, last one also bottom border. No JS.

### 7.7 `ui/Breadcrumbs` (server)

`<nav aria-label="…">` with an ordered list; 13 px `ink-2`; links underline on hover; separator
is the directional `chevron` icon (points to inline-end, flips in RTL); last item is plain text
with `aria-current="page"`. Shown on category, product, search and content pages.

### 7.8 `ui/EmptyState` (server)

Centred block in a `paper` panel (1 px `line` outline, `rounded-card`): 56 px `sage` circle with an
`ink` icon, h2, one sentence in `ink-2`, one `primary` or `secondary` action. Used for
empty All pieces / category / search / cart, expired order link, not found. (On the home page there
is no empty state: the row is left out, [§8.1](#81-home-locale); the empty shop message "עוד אין כאן
יצירות" lives on [§8.14](#814-all-pieces-localeshop).)

### 7.9 `ui/Skeleton` (server)

`photo`-coloured rounded blocks matching the final layout (card, cart line, summary row) with a
slow opacity pulse (static with reduced motion). Marked `aria-hidden`; the container has
`aria-busy="true"` and a visually hidden "טוען…" / "Loading…" status.

### 7.10 Form controls: `ui/TextField`, `ui/TextArea`, `ui/SelectField`, `ui/Checkbox`, `ui/RadioCard`, `ui/ErrorSummary` (server markup; used inside islands)

- Label above the control (14/700), optional hint below the label (13, `ink-2`), control 52 px
  tall, `paper`, 1.5 px `field` border (4.4:1 on `paper`, 3.9:1 on `photo`), `rounded-chip` (8 px), 16 px text; focus = 2 px `ink` border + the
  global focus outline; error = `alert` border, `aria-invalid="true"`, message under the control
  (13, `alert`, `alert` icon), linked with `aria-describedby`.
- Correct `autocomplete`, `inputmode` and `type` per field (see checkout).
- `Checkbox`: 24 px box, `field` border, checked = `ink` fill with white check icon. The input's
  hit area is a 44×44 px square centred on the 24 px box; the label text toggles the box through
  `<label for>`. Links inside the label are plain links, not lifted above the input, so a tap on a
  link opens the link and never toggles the box (003 FR-028; replaces the former "whole label row
  is the target").
- `Checkbox` disabled state (006): box fill `photo` with a `line` border (a checked box keeps its
  check, filled `ink-2` instead of `ink`), label in `ink-2`, `cursor: not-allowed`, no hover
  change, a hint line under the label tied by `aria-describedby`; the row stays at least 44 px
  high. Used only for a setting the shop cannot offer (for example the card option while no card
  provider is configured), never to signal a missing choice (there the control stays enabled and
  the form says what is missing).
- `RadioCard`: a full-width option card (`paper`, 1.5 px `field` border, `rounded-chip`, padding 14–16);
  selected = `sage` fill + 1.5 px `ink` border (sage alone is 1.4:1) and the bold title; title 16/700 with the price at
  inline-end, description 14 `ink-2` below; native radio input visually hidden but focusable
  (focus ring drawn on the card).
- `ErrorSummary`: an `alert` Notice at the top of the form with heading "יש לתקן כמה פרטים" /
  "Please fix a few details" and a list of links to each invalid field; receives focus after a
  failed submit. An optional `onSelect` replaces the plain jump to the field (the content editor
  uses it to show a field that sits in the other language tab first).
- `FormField` (T054, admin) wraps the same primitives so admin and storefront share one set.

### 7.11 `shop/QuantityStepper` (island part)

Outlined pill, 1 px `ink-2` border, 52 px tall (40 px in cart lines, still with 44 px hit areas):
`minus` button, `<output aria-live="polite">` value (700, tabular), `plus` button. Range 1–20; at the
limit the button stays focusable and announces the limit instead of disabling. Group label
"כמות" / "Quantity"; buttons "הפחתת יחידה" / "Remove one", "הוספת יחידה" / "Add one".

### 7.12 `shop/BuyBox` island (price, options, quantity, add to cart)

`shop/BuyBox.tsx` is one client island that owns details items 2–6 of [§8.4](#84-product-localepslug):
the live price, the option selector, the quantity stepper and add to cart. The made-to-order
note and Aviva's description (items 3–4) are server-rendered and passed in as `children`, so
they stay in the order of §8.4 without shipping their text as JS props. It is created in US1
with the price and options (so the price updates with the selection there) and gains the
stepper and add to cart with the cart store in US2.

- Row: quantity stepper + primary "הוספה לסל" / "Add to cart" filling the rest.
- Missing choice: pressing shows "יש לבחור {group} לפני ההוספה לסל" / "Choose a {group} before
  adding to the cart" under the button (`alert`, `aria-live="polite"`), marks the first
  unchosen fieldset `aria-invalid` (chip borders turn `alert`) and focuses its first radio. The
  message space is reserved (no layout jump).
- Success (the authored moment): the `forest` label morphs to `check` icon + "נוסף לסל" / "Added to cart"
  for 1.8 s; the header badge count updates with a short scale pop; a persistent row appears
  under the button: "{name} בסל · מעבר לסל" / "{name} is in your cart · Go to cart" (a button, test id
  `go-to-cart`, that opens the cart drawer; the page `/cart` no longer exists); the cart drawer also
  opens by itself after the add (FR-047, focus on its close button); a polite live region announces "נוסף לסל. בסל יש עכשיו {count} פריטים".
- **Not orderable** (`orderable=false`): the options are shown **read-only** as plain text, one
  line per group ("צבע הכובע: ירוק, צהוב (+15 ₪), ורוד"), keeping FR-011; the stepper and button
  are replaced by an `alert` Notice "לא זמין להזמנה כרגע" / "Not available to order right now" and a quiet link
  "אפשר לכתוב לי" / "You can write to me" to Contact.

### 7.13 `shop/OptionSelector` (rendered by BuyBox)

- One `<fieldset>` per group; `<legend>` = group name (14/700) + "(בחרו אחד)" / "(choose one)"
  in `ink-2` 500.
- Values are radio chips: label + optional colour dot ([§7.13a](#713a-option-colour-dot-decided-2026-11-08-keep-fixed-palette))
  - price delta "+15 ₪" / "−10 ₪" in 13 `ink-2` (none when delta is 0). Selected chip as in 7.3.
- Rendered only when the product has groups (FR-008). The product price shows "החל מ־" with the
  lowest possible price until every group is chosen, then the exact unit price for the selection.

### 7.13a Option colour dot (decided 2026-11-08: keep, fixed palette)

- Data: nullable `option_value.swatch`, one of 12 named yarn colours (data-model.md ›
  option_value). Null = no dot. The label always names the colour, so the dot is decorative
  (`aria-hidden`) and needs no contrast ratio.
- Look: 16 px circle before the label, 1 px border `rgb(6 20 6 / 0.18)` so white shows.
- CSP: each colour is a plain CSS class `.swatch-<name>` in `globals.css` (not a Tailwind
  `@utility`: the class name is built at runtime, which Tailwind's scanner cannot see); no inline
  style.

| Name    | Hex       | Name    | Hex       | Name     | Hex       |
| ------- | --------- | ------- | --------- | -------- | --------- |
| `white` | `#FFFFFF` | `grey`  | `#9E9A96` | `orange` | `#EE8A3A` |
| `cream` | `#F3E6C9` | `black` | `#2B2522` | `yellow` | `#F2C94C` |
| `beige` | `#D9C3A0` | `red`   | `#C8442F` | `green`  | `#9DB83F` |
| `brown` | `#8B5E3C` | `pink`  | `#F2A7B5` | `blue`   | `#6A9BD1` |

- Admin: the option-value row in the option editor has a "צבע (לא חובה)" picker: "ללא צבע"
  first, then 12 large (44 px) swatch buttons with Hebrew colour names as their labels
  (`admin.products.swatch.*`); a radio group, so it works with the keyboard.

### 7.14 `shop/Gallery` island (+ zoom dialog)

- **Main**: a horizontal scroll-snap track of all photos inside a **square** `photo` box
  (`aspect-square`, sharp corners, no border; swipe works natively on touch, also without JS;
  [§6](#6-images)). Overlays: counter "1 / 4" (pill, `paper` at 95 %, 13/700, inline-start bottom) and a
  zoom `IconButton` (`paper` at 95 %, inline-end bottom, label "הגדלת התמונה" / "Enlarge photo"). The
  track is a focusable, labelled group (`role="group"`, "Photos of {product}", `tabIndex=0`: a
  scrollable region needs a keyboard stop). Its focus ring (3 px `ink`, inside,
  `-outline-offset-4`) is drawn by a positioned `aria-hidden` overlay after the track
  (`peer-focus-visible`), because the photos are positioned and would paint over an outline on the
  track, and the box clips outside it.
- **Thumbnails** (when ≥ 2 photos): row of **72×72** square buttons (no radius), below the main
  image, horizontally scrollable; each labelled "תמונה {n} מתוך {N}"; the shown one has
  `aria-current="true"` and a 3 px `forest` ring (9.5:1 on `photo`, so it passes WCAG 1.4.11 on its
  own). Clicking scrolls the track to that photo. An `IntersectionObserver` keeps counter and
  current thumb in sync while swiping.
- **Zoom dialog**: native `<dialog>` opened with `showModal()` from the zoom button or by
  tapping the main image; full viewport, `photo` background (not black); the 1600 variant
  centred with `object-fit: contain` (the whole photo is shown); buttons: close (inline-end top),
  previous/next (directional chevrons, vertically centred at each side), counter. Double-tap /
  double-click toggles a 2× zoom inside a scrollable container (pan by scrolling/dragging);
  pinch-zoom is allowed (`touch-action: pinch-zoom`). `Esc` closes, arrows navigate per
  [§4](#4-global-layout-and-direction-rtlltr), focus returns to the control that opened it, page
  scroll locked with a class on `<html>`. Dialog label "תמונות {product}".
- One photo only: no thumbnails, no counter, no previous/next.

### 7.15 `shop/ProductCard` and `shop/ProductGrid` (server)

- Card = one link: **square** `photo` box (no radius, no border; hover image zoom 1.03 over
  400 ms, off with reduced motion), name (19 → 22 px, 400, line height 1.2, max 2 lines with
  ellipsis) and price (`Price` at 14/400 `ink-2`, "החל מ־" when option prices vary), 10 px gap.
- Not orderable: price stays, plus "לא זמין להזמנה כרגע" in `alert` 13/700 under it (no "sold out"
  label, FR-004).
- Grid: 2 columns (gap 28 px vertical, 12 px horizontal) → 3 from 640 px → 4 from 900 px (gap 40 /
  20 px). The grid is a `<ul>` of `<li>` cards with an `aria-label` on the list ("יצירות" /
  "Pieces").
- **`eagerCount`** (007 D13): `ProductGrid` takes the number of leading cards whose photo is
  `loading="eager"`: 4 on All pieces, category and search; 0 on the home row and in "You may also
  like" (they sit below the hero or the product, so all `lazy`). The home hero alone gets
  `fetchpriority="high"`.
- The home row uses the same card in a one-line scrolling track ([§7.32](#732-shophomerow-and-shoprowarrows)).

### 7.16 `shop/SortLinks` (server)

A `ChipRow` of three links: "החדשים ביותר" / "Newest", "מחיר: מהנמוך" / "Price: low to high",
"מחיר: מהגבוה" / "Price: high to low", building `?sort=` URLs; current one `aria-current="page"`.
Zero JS (replaces the planned `SortSelect`). Price sorts order by the ₪ base price (research.md ›
R18), not the "from" price.

### 7.17 `shop/AnnouncementBar` (server)

Full-width `forest` bar, `paper` text 13/700 (10.8:1), at least 44 px tall (`min-h-11`, block
padding 4 px so text that wraps to two lines at 320 px still has room), not sticky, not
dismissible (nothing stored on the device), not a link. Test id `announcement-bar`. Amended at the
Phase D gate (007 D20, FR-007, FR-041).

- **Text** is built from settings (Israel zone), unchanged: shipping enabled with a threshold →
  "משלוח חינם בהזמנה מעל {amount}"; pickup enabled → "איסוף עצמי חינם"; both joined with " · ".
  It is centred in the remaining space and may wrap to two lines at 320 px.
- **Always shown.** The strip is rendered on every page, also when there is no text (no
  free-shipping amount and pickup off, or the zone off); then it holds only the switch.
- **Language switch** ([§7.19](#719-shoplanguageswitch-island)) at the strip's inline-end
  (reading-end) side, the left in Hebrew and the right in English, white
  border and text on `forest`, a 44 × 44 hit box around the 36 px pill. Its focus ring is `paper`
  (the `ink` ring would not show on `forest`) with a 1 px offset
  (`focus-visible:outline-offset-1`) instead of the global 3 px, so the 3 px ring around the 36 px
  pill spans exactly the strip's 44 px and is neither cut off at the top of the page nor covered by
  the sticky header.
- No other place for the switch in the bar; the footer and the menu drawer keep the full-word link.

### 7.18 `shop/Header` (server shell + two islands)

Rewritten at the Phase D gate (007 D20, FR-008, FR-039, FR-040, FR-043); replaces the three-column
centred header.

- One sticky bar, `id="site-header"` and `data-testid="site-header"`, `top: 0`, `z-header`, height
  `--header-h` (64 px; 72 px from 900 px), full width, side gutter 16 px at every width (`px-4`,
  [§4](#page-frame-every-public-page)). Look: `paper` background, `ink` text, 1 px `line` bottom
  border, no shadow, no pill; the bar is frosted (85 % paper, backdrop blur, [§4](#header-states)).
  On the home page it is see-through over the hero at the very top and fades to the bar in 250 ms
  from 1 px of scroll ([§4](#header-states)); every colour except the search field's is
  `currentColor`-based, so the icons, links and cart badge follow.
- **Below 1024 px** (the `nav` breakpoint): a grid `1fr minmax(0,auto) 1fr`: menu button | brand
  (centred, truncates with an ellipsis; the centre column is `minmax(0,auto)` so a long shop name
  shrinks instead of pushing the side columns over it) | cart. No search icon and no language
  switch in the bar at any width.
- **From 1024 px**: one row in reading order (logical properties, so Hebrew runs right to left):
  `<nav aria-label>` (`common.menuNav`, "תפריט האתר" / "Site menu"; the menu drawer that has the same
  name is hidden from 1024 px, so the names never clash) holding "All pieces" (`/{locale}/shop`),
  header category 1, header category 2, the home-row category, "About"
  (`/{locale}/pages/about`), "Shipping & Returns" (`/{locale}/pages/shipping-returns`); then the
  brand, the search field ([§7.33](#733-shopheadersearch-server)) and the cart. No menu button.
  The brand is centred in the free space between the links and the search field
  (`margin-inline: auto`, `nav:mx-auto`; the search wrapper no longer carries `nav:ms-auto`), owner
  decision 2026-11-17.
  - Labels reuse `common.nav.allPieces`, `common.nav.about` ("אודות") and
    `common.nav.shippingReturns` ("משלוחים והחזרות"); the sheet also uses `common.nav.contact`
    ("יצירת קשר"). The footer's own "עלינו" is unchanged. "All pieces", "About" and "Shipping &
    Returns" always render, also in a shop with no published piece; only the category entries depend
    on data.
  - **Categories**: `pickHeaderCategories(settings, categoriesWithProducts)`
    (`src/server/catalog/header-categories.ts`) builds [header 1, header 2, home-row] from the two
    results the locale layout already loads; it drops nulls, categories without a published piece
    and repeats (first wins), so there are at most 3, and the home-row link is absent when the
    home row is set to none. Each name is shown for the page language with the Hebrew fallback
    (`lang="he"` on `/en`).
  - **Spacing** (reduced by the owner): 12 px between links, 16 px between the groups (links,
    brand, search, cart). Links are 15/400, hover underline offset 4 px, a 44 px hit area
    (`min-w-11`, `min-h-11`).
  - **Nothing overlaps, by construction**: every item is `shrink-0` except the brand, which is
    capped at 160 px with an ellipsis (a 60-character shop name truncates) and is the one item that
    absorbs a narrower viewport (a classic 17 px scrollbar leaves about 1007 px). Each category
    name sits in an inner `<span>` with `max-inline-size: 95px` (`max-w-[95px]`),
    `overflow: hidden`, `text-overflow: ellipsis`, `white-space: nowrap`; the focus ring is drawn
    on the `<a>`, outside the clipped span, so it is never hidden (WCAG 2.4.7). Only the text
    inside a link is ever cut, never the link or its ring.
  - **Width budget at 1024 px** (container 992 px): six fixed links 218 px (59 + 44 + 115; "About"
    held at 44 by its target), 5 link gaps × 12 = 60, brand cap 160, search 176, cart 44, 3 group
    gaps × 16 = 48 → 706 px, leaving 286 px for three category links, 95 px each. An ordinary
    12-character name (about 80–88 px) shows in full; a name of only wide letters (capitals like W
    or M) can be wider and ends with "…" (owner answer: rare, acceptable). Hence the 12-character
    limit on category names ([§12.12](#1212-categories-admincategories), FR-040).
- Brand (`data-testid="header-brand"`, home link; 008 replaced the text wordmark with the owner's
  logo): the link is `relative block`, `--logo-size` wide (88 px; 112 px from 900 px) and as tall as
  the bar (`self-stretch`), so the bar height is unchanged. It holds one `<img
  data-testid="header-logo">` (the logo files in `srcset`, `width` and `height` 112,
  `sizes="(min-width: 900px) 112px, 88px"`, `decoding="async"`, `rounded-full`), placed `absolute` with
  its centre on the bar's bottom edge (`inset-block-start: calc(var(--header-h) -
  var(--logo-overhang))`): half inside the bar, half hanging below it over the page; centred below
  1024 px (centre column) and between the links and the search field from 1024 px (`nav:mx-auto`).
  The image is round (`rounded-full`), so only the badge takes clicks, not the corners of its box. It
  is a child of the header, so it shares the header's stacking context (`z-header`): above the page,
  below the drawers and the consent banner.
  - **Name**: the link has no `aria-label`; its accessible name is the image's `alt` (the shop name
    from settings, `shop_name_he/en`, English falling back to Hebrew through `pick()`; the img, not
    the link, carries `lang="he"` when the Hebrew fallback is used, so it is read correctly) plus a
    visually hidden `<span class="sr-only">` with `common.homeLinkSuffix` (", דף הבית" / ", home
    page"): "{name}, דף הבית". No visible text. Not the legal `business_name_*`.
  - **Focus**: the ring is drawn on the round image, not on the link's rectangle (the link has no
    outline; `group-focus-visible:outline-3 outline-offset-3 outline-current` on the image): 3 px
    wide, 3 px out. On the home page at scroll 0 the ring is white (`currentColor`) and the lower
    half of the logo is over the bare photo, so a soft dark halo (`box-shadow: 0 0 0 7px rgb(6 20 6 /
    0.55)`) sits under the ring there; without JavaScript the bar is white and the halo is off.
  - The logo is the owner's: never edit it, redraw it or make another mark (PRODUCT.md).
- **Menu drawer** (below 1024 px; replaces the menu sheet, 007 D21, FR-044, FR-045): the header's
  menu button is `<button popovertarget="site-menu">` (name "תפריט" / "Menu", native
  `aria-expanded`; test locator `#site-header [popovertarget="site-menu"]`, because the drawer's
  own close button carries the same `popovertarget`). The drawer is a native popover
  (`popover="auto"`, hidden from 1024 px): `<div id="site-menu" data-testid="site-menu" popover
  role="dialog" aria-modal="true" aria-label={common.menuNav}>` wrapping the existing `<nav>`
  (a `dialog` role on `<nav>` is not allowed; the inner `<nav>` has no `aria-label`, so the dialog
  is the only thing named "Site menu"). It is modal: while it is open the strip, header,
  `<main>`, footer, consent banner and both skip links are `inert`: `DrawerController` makes every
  top-level child of `<body>` other than the open drawer inert (generic, not a named list), so Tab
  and the screen-reader cursor stay inside it; `Esc`, the X, a tap on the dimmed page or following a link
  closes it and focus returns to the menu button; at 1024 px it closes by itself.
  - **Shape**: `position: fixed`, `inset-block: var(--drawer-top, 0px) 0`, `inset-inline-start: 0`
    (right in Hebrew, left in English), `inline-size: min(24rem, calc(100vw - 3rem))` so a strip of
    page stays visible to tap, `paper` background, `ink` text, no shadow. The drawer itself
    clips (`overflow: clip`) and is a flex column (`display: flex` while open): the close button
    counter-translates outside the drawer's box while it slides, and a scrolling drawer made WebKit
    scroll it sideways to the focused button. Only `.drawer-scroll` (below the head, `flex: 1 1
    auto`, `min-block-size: 0`) scrolls (`overflow-y: auto`, `overscroll-behavior: contain`).
    `--drawer-top` is the header's top edge as
    it is on screen (the bottom of the green strip at scroll 0, 0 once the strip has scrolled
    away), set on `<html>` through the CSSOM just before it opens; the drawer therefore covers the
    header but never the strip, and `::backdrop` starts at the same line, so the strip is not
    dimmed (it is inert, a tap on it closes the drawer). Without JavaScript `--drawer-top` is 0.
  - **Close button** (`data-testid="menu-close"`, name `common.menuClose`, "סגירת התפריט" / "Close
    menu"): the drawer's first element, a 44 × 44 button (`popovertargetaction="hide"`,
    `autofocus`, so focus moves into the drawer on open) on exactly the pixels of the header's menu
    button (the header's `px-4`, centred in the first `--header-h` of the drawer), at every scroll
    position.
  - **Hamburger to X**: `MenuBurger` draws three 2 px line spans (not the SVG icon), used by both
    the header's menu button and the close button, so the swap is invisible. When the drawer is
    open the lines move to the centre and turn ±45° while the middle line fades; the button
    counter-translates by the drawer's offset (same duration and easing, `:dir(rtl)` flips the
    sign) so it stays still on screen. Reduced motion: the X appears at once.
  - **Backdrop and scroll lock**: `::backdrop` `rgb(0 0 0 / 0.4)`; `html:has(:popover-open)`-style
    rule `overflow: hidden` (CSS only); `html { scrollbar-gutter: stable }` so nothing shifts
    sideways.
    Where scrollbars are visible the gutter is painted by `<html>`, which the backdrop does not
    cover, so while a drawer is open `html` gets `background-color: color-mix(in srgb, black 40%,
    paper)`, the backdrop's dim over `paper`, and the gutter strip is dimmed like the page (the
    same applies to the cart drawer, §7.34).
  - **Content, in order**: the close button, the search field (`menu-search`,
    [§7.33](#733-shopheadersearch-server)), "All pieces", every category with published pieces
    (as before), "About", "Shipping & Returns", "Contact", then the language link in full words
    ("English" / "עברית").
- `CartLink` island (007 D21: now a `popovertarget="cart-drawer"` button that opens the cart drawer,
  [§7.34](#734-shopcartdrawer-server-shell--client-body); name, badge and test id unchanged): cart `IconButton` with label "סל קניות, {count, plural, …}" /
  "Cart, {count} items"; `sage` badge (`ink` text, min 18 px, 11/800, inline-end top) only when
  count > 0. Server-renders without a badge; the island reads `ac_cart_v1` after hydration. The
  accessible name always contains the digits the badge shows ("סל קניות, 1 פריט", "Cart, 1 item"), so
  it contains the visible text (WCAG 2.5.3, axe `label-content-name-mismatch`; 006).
- No account icon, no favourites icon and no sign-in for buyers (FR-004; a sign-in and a favourites
  icon may come in a later feature).

### 7.19 `shop/LanguageSwitch` (island)

- A small client island, because the header lives in the locale layout, which neither receives
  the current path nor re-renders on client-side navigation. It reads `usePathname()` and
  `useSearchParams()` and builds `/api/locale?to=<other>&path=<same path in the other locale +
query>` on every navigation (001 FR-042).
- Rendered as a plain `<a>`, **never** a Next/next-intl `<Link>`: a prefetch would call
  `/api/locale` and set `NEXT_LOCALE` without a click.
- Strip variant (the compact one; it moved from the header into the free-shipping strip at the
  Phase D gate, [§7.17](#717-shopannouncementbar-server), FR-041): compact pill, 36 px tall bordered
  box (1.5 px white on `forest`), 13/700, text "EN" on Hebrew pages and "עב" on English pages,
  `lang` set to the target language, `aria-label` "EN – English" / "עב – עברית" (it starts with
  the visible text, WCAG 2.5.3), hover `sage` fill with `ink` text; the 44×44 hit area comes from a
  transparent `::before` that extends past the border (padding would grow the visible box); focus
  ring `paper`, 1 px offset ([§7.17](#717-shopannouncementbar-server)). Test ids and accessible
  name are unchanged. The menu and footer use the full-word variant ("English" /
  "עברית"; in the footer the hover fill is `sage`).

### 7.20 `shop/Footer` (server)

`mint` background, `ink` text, **no rounded corners**, padding-block 48 px, padding-inline 16 px (64 px and 24 px from
900 px), 15 px text. Columns (stacked on mobile, `2fr 1fr 1fr` from 900 px, gap 32), headings h2
18/700:

1. Business: shop name (`shop_name_*`) as h2, then the legal business name
   (`business_name_*`), address (each owner-written value through `pick()`, `lang="he"` when it
   falls back to Hebrew on `/en`), email (`mailto:`), phone (`tel:`,
   `<bdi dir="ltr">`) — FR-047, from `shop_settings` — then the social links
   ([§7.31](#731-shopsociallinks-server)): nothing at all when no address is saved.
2. "מידע" / "Info": About, Shipping & returns, Contact.
3. "משפטי" / "Legal": Terms of use and sale, Privacy policy, Cookie policy, Accessibility
   statement; plus "הגדרות עוגיות" / "Cookie settings" only when `consentRequired()`. It is a
   `button` (not a link; `CookieSettingsButton`, §7.21, test id `footer-cookie-settings`) that
   opens the consent settings dialog, and is absent from the page when consent is not required.
   Link rows are at least 44 px tall, hover underline (offset 3 px). Bottom row: a 1 px rule
   (`ink` at 25 %) above, then the language switch in full words ("English" / "עברית", the
   `LanguageSwitch` island, §7.19) and "© {year} {shop name}" (`shop_name_*`), 14 px, `ink-2`, wrapping. The two link
   lists are `nav` landmarks labelled "מידע על החנות" / "Information about the shop" and "מסמכים
   משפטיים" / "Legal documents". Existing test ids stay: `footer-business-name`,
   `footer-business-address`, `footer-email`, `footer-phone`,
   `footer-cookie-settings`. No business number is shown (008, owner decision 2:
   `footer-business-vat` is removed); the number appears only in order emails.

### 7.21 Consent: `ConsentRoot`, `ConsentLoader`, `ConsentBanner`, `ConsentGate`, `CookieSettingsButton` (dormant at launch)

Code shapes and test ids are fixed in `specs/003-privacy-legal-pages/contracts/consent.md`.

- **`ConsentRoot`** (server, in the public layout) returns nothing unless `consentRequired()`.
  Otherwise it renders the client `ConsentLoader` inside its own `NextIntlClientProvider` that
  carries only the `consent` messages. At launch it renders nothing: no consent chunk is
  requested, no footer button, no cookie.
- **`ConsentLoader`** (client, tiny) does the split with `React.lazy` + `Suspense` (a dynamic
  import inside a Server Component does not code-split a Client Component; `next/dynamic` is not
  used because its runtime adds about 1.5 KB gzipped to every page's first load, which would push
  the product route past its 150 KB budget) and loads `ConsentBanner` and
  `ConsentGate` as separate chunks. `ConsentBanner` and `ConsentGate` load only through
  `ConsentLoader`.
- **`ConsentBanner`**: bottom sheet, `paper`, top corners 12 px, `shadow-float`, max width 40rem
  centred, padding 20; heading "עוגיות" / "Cookies", one or two sentences, link to the cookie
  policy; buttons **"אישור הכול" and "דחייה של הכול" are both `secondary`, same size, side by
  side** (equal prominence, 003 FR-021); "הגדרות" / "Settings" as a `quiet` button opening a native
  `<dialog>` with one switch per optional category (`role="switch"`, necessary shown as always
  on), a primary "שמירה" and a `quiet` "סגירה" that closes it without saving. The sheet shows only while the visitor still has to choose (no valid choice, or
  a newer Cookie Policy version); the dialog also opens from the `ac:consent-settings` event.
- **`ConsentSkipLink`** (server, exported from `ConsentRoot.tsx`, rendered at the start of the
  page): the skip link "מעבר להגדרות העוגיות", only while the visitor still has to choose.
- **`ConsentGate`**: appends the scripts of every category the visitor has accepted, once each.
  **Nothing optional loads while a new Cookie Policy version awaits a choice** (003 FR-022): the
  earlier choices only pre-set the switches in the dialog.
- **`CookieSettingsButton`** (client, tiny; the footer's "הגדרות עוגיות" button): dispatches the
  `ac:consent-settings` window event, and also marks `<html>` (`data-consent-settings-requested`)
  so a banner chunk that is still loading opens the dialog when it mounts. Its label comes from
  the server as a prop.
- The bottom banner is not a modal: the page stays usable; focus is not trapped; it sits at the
  end of the tab order after a skip link "מעבר להגדרות העוגיות" at the start. The settings
  dialog, by contrast, is a modal native `<dialog>` (`showModal()`: focus trapped inside, `Esc`
  closes it, the page behind is inert). After a choice is saved, if focus was inside the
  banner or the dialog it moves to the footer "הגדרות עוגיות" button, because the banner that held
  it is gone; otherwise focus stays where it was. Withdrawing a category that
  is already running reloads the page, so its script stops at once. While a new choice is needed
  (no valid choice, or a newer Cookie Policy version), optional cookies set under the earlier
  version are expired at once, on the server.
- Pinned test ids: `consent-banner`, `consent-accept-all`, `consent-reject-all`,
  `consent-settings-open`, `consent-dialog`, `consent-switch-<categoryId>`, `consent-save`,
  `footer-cookie-settings`.

### 7.22 `shop/CartLine` (inside the cart drawer body)

Row: **72×72** square thumbnail (no radius, no border) · name (link to product, 16/700, at least 44 px high) · options "{group}:
{value}" (14 `ink-2`) · unit price · `QuantityStepper` (compact) · line total (700, tabular) ·
quiet "הסרה" / "Remove" with `close` icon. Mobile: thumbnail at inline-start, text stacked,
stepper and line total on one row. Flagged line: `paper` panel with a 1.5 px `alert` border
and the flag message ([§7.34](#734-shopcartdrawer-server-shell--client-body)).

### 7.23 `shop/OrderSummary` (server markup)

`paper` panel (1 px `line` outline, `rounded-card`): lines (**48×48** square thumb, name × qty, line total; under the name "זמן הכנה: {prepTime}" / "Time to
make: {prepTime}" in 14 `ink-2`, the distance-selling disclosure before ordering), divider, subtotal, delivery ("חינם" when 0),
total (18/800). Used in checkout (collapsible on mobile) and the order page (no thumbnails).
Created by the checkout task (T082) at `src/components/shop/OrderSummary.tsx`; the order page (T084)
reuses it.

### 7.24 `ui/Prose` (server)

Wrapper for Markdown output: 17/1.75, measure 68ch, h2 22/800 with 32 px above and 8 px below,
h3 18/700 with 24 px above and 6 px below (already in `Prose`), lists with logical padding, links
`ink` underlined (offset 3 px), tables styled like `StorageTable`.

Markdown is rendered only by `renderMarkdown()` on the server and shown only through
`ui/Markdown` inside `Prose` (public pages, the editor preview and the admin version page). `#`
in the source renders as h2 (the page's own title is the h1), `##` as h2, `###` and deeper as h3.
Images, tables, code, quotes and rules are not rendered (003 FR-003).

### 7.25 `shop/StorageTable` (server)

Table of the device-storage registry. From 640 px a normal table (header row `photo` fill,
`line` row dividers). Below 640 px each row becomes a stacked card using
`td::before { content: attr(data-label) }` (labels from translations). Admin-scope items (the
admin sign-in cookies) come after the public rows, each marked "באזור הניהול בלבד" / "Admin area
only".

### 7.26 `ui/ConfirmDialog` (island) and its secondary action (002)

Native modal `<dialog>` for every action that cannot be undone (§12.3). White `rounded-card`,
`shadow-float`, width `min(92vw, 26rem)`, padding 24; h2 (20/800), a short consequence in
`ink-2`, then the buttons stacked in one column with a 12 px gap. Focus starts on **Cancel**, so a
stray Enter never confirms anything; `Esc` and a tap on the backdrop cancel (not while busy).

- Default: **Cancel** (`secondary`) then the confirm button (`primary`, labelled with the action,
  e.g. "סימון כהושלמה").
- **Optional secondary action** (002): the props `secondaryLabel` and `onSecondary` add a second
  `secondary` button **between** Cancel and the confirm button. Order: Cancel · secondary ·
  confirm. It has the same size and busy handling as the others (`aria-busy`, label replaced by
  the spinner, no second press); focus still starts on Cancel. Without these props the dialog is
  unchanged for every existing caller. Used once: completing an offline order that still awaits
  payment, "השלמה בלי תשלום" beside the primary "סימון כשולם והשלמה" (§12.3).
- **Optional dismiss label** (002): the prop `cancelLabel` replaces the text of the Cancel button
  (default: the common "ביטול" / "Cancel"). Behaviour, position, size and initial focus are
  unchanged. Used once: the cancel-order dialog, where "ביטול" would be confused with the
  order's own cancel action, so its dismiss button reads "חזרה" / "Back" (§12.3).

### 7.27 `shop/HomePhoto` (server)

One of the three home photos as a `<picture>` (007 D3; contract `contracts/home-photos.md`). Props:
`id` (`hero | bannerChild | bannerShelf`), `alt` (the translated text, passed by the section that
uses it, so the component itself holds no text) and `priority` (`loading` and `fetchpriority` are
derived from it). It reads `config.ts` (focus, wide classes) and `manifest.json` (file names,
sizes) from `src/lib/home-photos/`:

```html
<picture>
  <source
    media="(min-width: 640px)"
    srcset="/site-photos/…-w800.….webp 800w, …-w1200 1200w, …-w1600 1600w, …-w2000 2000w"
    sizes="100vw"
  />
  <img
    src="/site-photos/…-p565.….webp"
    srcset="/site-photos/…-p400.….webp 400w, /site-photos/…-p565.….webp 565w"
    sizes="100vw"
    width="565"
    height="848"
    alt="{translated alt}"
    loading="eager|lazy"
    fetchpriority="high (hero only)"
    decoding="async"
    class="size-full object-cover {wideObjectPosition}"
  />
</picture>
```

- Hero: `loading="eager"`, `fetchpriority="high"`. Banners: `loading="lazy"`, no priority. The phone
  never sees the wide `<source>`, so it never downloads a wide file.
- It fills its section from behind (positioned `absolute inset-0` inside the section); the section
  carries the minimum height and the `ink` background ([§3.3](#33-space-size-radius-shadow-scrims)),
  so nothing shifts while the photo loads and white text is readable before it arrives.
- No `style` attribute (the crop position is a literal class). Never `next/image`.

### 7.28 `shop/HomeHero` (server)

`<section data-hero data-testid="home-hero" aria-labelledby="home-hero-title">`, the first section
of the home page, pulled up under the header by `--header-h`
([§4](#header-states)). Minimum height: phone `clamp(560px, 150vw, 640px)`; from 640 px
`clamp(460px, 48vw, 720px)`. `HomePhoto` (hero) behind; the blended strip on top and the text band at the
bottom of the section (`justify-between`):

1. **Top band**: no text since the Phase D gate (007 D20, FR-010, FR-042). It is only the blended
   strip behind the transparent header ([§3.3](#33-space-size-radius-shadow-scrims)): a fixed block
   size `calc(var(--header-h) + 140px)`, no padding, a single gradient from 0.62 at the top through
   `--scrim-text` (0.55) at `var(--header-h)` to 0 at its bottom edge. There is no tagline (the
   `shop.catalog.intro` line stays on the "All pieces" page only).
2. **Bottom band**: `--scrim-large`; holds the `<h1 id="home-hero-title">` = the shop name from
   settings (`lang="he"` when it falls back on `/en`; the page's only h1), 300 weight,
   `clamp(56px, 12vw, 128px)` / 0.95, −0.02em, balanced, **centred** (`text-center`, owner
   decision 2026-11-17; phones and computers); padding-bottom 28 px (40 px from 900 px).

Text is `on-photo`; a soft text shadow is added for comfort and not counted. A longer shop name
makes its band, and the section, taller.

### 7.29 `shop/PhotoBanner` (server)

`<section aria-labelledby data-testid="home-banner-child|home-banner-shelf">` with `HomePhoto`
(lazy), one band of text and one button; used twice on the home page. Minimum height: phone
`clamp(520px, 140vw, 600px)`; from 640 px `clamp(420px, 42vw, 620px)`. The band sits at the bottom on
phones and in the reading-start half from 640 px (right in Hebrew, left in English), vertically
centred there, in a plain `.banner-copy` box with **no dark layer** (owner decision 2026-11-17:
only the soft text shadow; the white text may miss WCAG AA on light parts of the photo, an
accepted exception reported with measurements). Content (max 30rem, 14 px gap): h2 (`clamp(40px, 6.4vw, 76px)` / 1.0, 800,
balanced), one line (24/1.35, max 34ch), and a `soft` `LinkButton` to `/{locale}/shop`
(`data-testid="home-banner-button"`). Texts: `shop.home.bannerChild.*` and
`shop.home.bannerShelf.*` ([§8.1](#81-home-locale)).

### 7.30 `shop/StatementBand` (server)

`<section data-testid="home-band">`, `peach` full-width block, content in the 1240 px container,
padding-block 80 px (128 px from 900 px). One `<p>` (the sentence, `clamp(28px, 4.4vw, 52px)` / 1.2,
weight 300, `ink`, centred, max 24ch, balanced) and under it, centred, a text link
`shop.home.band.link` ("לקנייה" / "Shop now") with the directional `arrow` icon (points to the
reading end and flips in RTL) to `/{locale}/shop` (`data-testid="home-band-link"`, at least 44 px
tall, 18 px, 600 weight, underline offset 4 px). No heading.

### 7.31 `shop/SocialLinks` (server)

Used by the footer's business column (contract `contracts/social-links.md`). Renders nothing when no
address is saved (no empty list, no heading, no gap). Otherwise
`<ul data-testid="footer-social" aria-label="הרשתות החברתיות שלי">` ("My social pages" in English)
with one `<li>` per saved address, in the order Instagram, Facebook, TikTok. Each item is
`<a href={storedUrl} data-testid="footer-social-instagram|facebook|tiktok" aria-label="האינסטגרם
שלי">` ("הפייסבוק שלי", "הטיקטוק שלי"; English "My Instagram", "My Facebook", "My TikTok"):
a 44×44 px circle, 1.5 px `ink` border, `ink` icon (`instagram`, `facebook`, `tiktok` from
`ui/Icon`, 20 px, `aria-hidden`), hover `sage` fill. Same tab; no `target`, no script, no embed, no
request to the platform before a click (FR-026). Gap 6 px, 14 px above the first item.

### 7.32 `shop/HomeRow` and `shop/RowArrows`

The home page's swipeable row of the home-row category's pieces (contract
`contracts/home-row.md`, "Home row (public)"; 007 D18). `HomeRow` is a Server Component; `RowArrows`
is the one new, tiny client island (a few hundred bytes).

```text
[h2 category name]                             [view all →]   [‹] [›]  (arrows from 900 px)
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──      ← one row, scrolls sideways, snaps to cards
│ card │ │ card │ │ card │ │ card │ │ peek
└──────┘ └──────┘ └──────┘ └──────┘ └──
```

- `<section data-testid="home-row" aria-labelledby="home-row-title">` inside the 1240 px container,
  padding 48 / 64 px (72 / 88 px from 900 px), placed right after the hero. Omitted entirely when
  `getHomeRow` returns `null` (no category chosen, or no published pieces in it).
- Heading: h2 (section title size, [§3.2](#32-typography-assistant)), `id="home-row-title"`, the
  category name (`lang="he"` when it falls back on `/en`). "View all" link: `shop.home.row.viewAll`
  ("לכל היצירות" / "View all") with the directional `arrow` icon, to `/{locale}/shop`,
  `data-testid="home-row-view-all"`, at least 44 px tall.
- **Track**: `<ul data-testid="home-row-track" aria-label={category name}>` of `ProductCard`s (the
  same card as the grid, square photos, all `lazy`). CSS only: `display: grid; grid-auto-flow:
column; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain;
scrollbar-width: none` plus `::-webkit-scrollbar { display: none }`; each item
  `scroll-snap-align: start`. Card width: `calc((100% − 1 gap) / 2.15)` below 900 px (two cards and a
  peek of the third), `calc((100% − 3 gaps) / 4)` from 900 px. Gap 12 px (16 px from 900 px). The
  track's writing direction follows the page, so in Hebrew the first card is at the right and the
  row scrolls toward the left. The track is the only element that scrolls sideways (the page never
  does). Up to 12 published pieces, newest first.
- **`RowArrows`** (`src/components/shop/RowArrows.tsx`, client): two `<button type="button">`s with
  `aria-controls` = the track id and accessible names `shop.home.row.previous` / `.next`
  ("הקודמות" / "הבאות", "Previous" / "Next"), shown from 900 px, hidden when the track does not
  overflow, each `disabled` at its end. A press scrolls by the track's visible width toward the
  reading end (next) or start (previous) with `scrollBy`, `behavior: 'smooth'`, or `'auto'` when
  `prefers-reduced-motion: reduce` matches. RTL: "next" moves toward negative `scrollLeft`. The
  icons are the directional `chevron` (flips in RTL); the buttons are plain 44×44 `IconButton` circles (no border). State is updated on the track's `scroll` event (passive listener) and on resize.
  No autoplay, no timers. Without JavaScript the row still swipes and scrolls; the arrows render
  `null` on the server and until the first measurement.
- Keyboard: Tab moves through the card links; the browser scrolls the focused card into view (snap
  keeps it whole). The arrow buttons are in the tab order after the "view all" link.

### 7.33 `shop/HeaderSearch` (server)

Added at the Phase D gate (007 D20, FR-043). A plain `<form role="search" action="/{locale}/search"
method="get">` with no JavaScript, used twice: in the header row from 1024 px and at the top of the
menu drawer below it.

- **Parts**: `<input type="search" name="q" maxLength={80}>` (`MAX_QUERY_LENGTH` from
  `src/server/catalog/search.ts`) named by an `aria-label` "חיפוש" / "Search" on the input itself
  (no visible label; the placeholder is the same word), and a plain `<button type="submit">` with
  the `search` icon and the same `aria-label` (not an `IconButton`). Enter or the button goes to
  `/{locale}/search?q=<words>`.
- **Look**: 44 px tall (the WCAG target size used everywhere), `rounded-pill`, `paper` background
  (95 %), 16 px text (no zoom on iOS). The 1 px `field` outline is `ring-1 ring-field ring-inset`
  (a box-shadow, so the field keeps its 44 px) in both header states. About 176 px wide in the
  header row, full width in the sheet.
- **Colours are explicit** (`text-ink`, `placeholder:text-ink-2`, button `text-ink`), not inherited:
  over the photo the header sets `currentColor` to white, which would turn the ink-coloured field's
  text invisible.
- **Focus ring**: an inset `forest` outline on the round form, drawn when the input or the button
  has keyboard focus (`[data-header-search]:has(:focus-visible)`, outline 2 px, offset -3 px), so
  it follows the pill shape instead of sticking out square corners over the photo; the inner
  input and button draw no outline of their own. The ring does not move when focus passes from the
  input to the button, so the focused button is marked too: a `mint` fill with the `ink` icon on
  it (WCAG 2.4.7). The same rules serve the header and the menu drawer (the drawer lies outside
  `#site-header`). They are unlayered CSS in `globals.css`, because the header's
  `#site-header :focus-visible { outline-color: currentColor }` would beat a Tailwind utility. The
  rules that remove the inner outline sit in `@supports selector(:has(*))`: a browser without
  `:has` keeps its default focus ring on the input and button. Visible in both header states
  (WCAG 2.4.7, 1.4.11).
- **Forced colours**: the ring-1 outline is a box-shadow, which Windows high-contrast mode
  removes, so under `@media (forced-colors: active)` the form gets a real `1px solid CanvasText`
  border; the focus outline is a real outline and stays.
- **Names**: distinct `aria-label`s so the three search landmarks never share a name: the header
  "חיפוש בחנות" / "Search the shop", the menu drawer "חיפוש בתפריט" / "Search from the menu", the
  search page's own form "חיפוש יצירות" / "Search pieces". Test ids `header-search` (form) and
  `header-search-input`; in the sheet `menu-search` and `menu-search-input`.

---

### 7.34 `shop/CartDrawer` (server shell + client body)

Added 2026-11-17 (owner answers, 007 D21, FR-044, FR-046–FR-048); replaces the cart page.

- **Shell** (server, in `src/app/[locale]/layout.tsx`): `<div id="cart-drawer"
  data-testid="cart-drawer" popover role="dialog" aria-modal="true" aria-labelledby>` named by its
  heading (h2 "הסל שלי" / "My cart", `cart.drawer.title`). Same shape, dimming, scroll lock, motion
  and `--drawer-top` as the menu drawer ([§7.18](#718-shopheader-server-shell--two-islands),
  [§3.5](#35-motion)), but at the reading-end side (`inset-inline-end: 0`: left in Hebrew, right in
  English), at every screen width. Opening one drawer closes the other.
- **Scrolling and gutter**: as the menu drawer (the drawer clips, `.drawer-scroll` holds the lines
  and summary and scrolls; the open drawer gives `html` the dimmed `paper` background so the
  scrollbar gutter on computers is dimmed too, [§7.18](#718-shopheader-server-shell--two-islands)).
- **Close button** (`data-testid="cart-close"`, `autofocus`, name `cart.drawer.close`, "סגירת הסל" /
  "Close cart"): a 44 × 44 button with an `close` X at the cart button's place (16 px from the
  reading-end edge, or `max(16px, (100vw − 1240px) / 2 + 16px)` as in the header row; above 1240 px
  it sits at the drawer's corner, accepted). Focus returns to the control that opened the drawer
  (`cart-link`, or the add-to-cart button, `go-to-cart`, "back to cart").
- **Body** (`CartDrawerBody`, client, loaded with a plain dynamic `import()` on the first open (not `next/dynamic`: its loader adds to every page's first load; while it loads the body shows a `Skeleton`, and if the chunk fails to load a `Notice` with `cart.loadError`, and the next open tries again), or on mount if
  already open): one column. Lines (`CartLine`, [§7.22](#722-shopcartline-inside-the-cart-drawer-body)),
  each priced by `priceCart` (current prices only, from the server, unchanged); then the summary:
  subtotal; "דמי משלוח יחושבו בקופה" / "Delivery is calculated at checkout"; when shipping has a
  threshold and the subtotal is below it, the plain line "משלוח חינם מעל {threshold}" (the
  threshold comes from the layout's default-zone lookup, shared with the strip); primary "המשך
  לקופה" / "Continue to checkout" (`cart-continue`, a link to `/{locale}/checkout`); quiet "המשך
  בקניות" / "Keep shopping" (`cart-keep-shopping`, closes the drawer).
- **Flags** (from `priceCart`) are shown on the line in `alert`, exactly as the cart page did:
  `unavailable` / `not_orderable` ("המוצר הזה כבר לא זמין להזמנה." + "הסרה מהסל"),
  `choose_options_again` ("האפשרות שבחרתם כבר לא קיימת." + link "בחירה מחדש"),
  `no_usd_price` ("לא זמין למשלוח לחו״ל."). "Continue to checkout" is never disabled: with flagged
  lines, pressing it keeps the drawer open and shows the `ErrorSummary` "יש בסל פריטים שלא אפשר
  להזמין", whose links move focus to the line inside the drawer. Checkout itself also refuses
  flagged carts (server).
- **States**: loading (cart read, pricing in flight) → `Skeleton` lines; empty → `EmptyState` "הסל
  ריק" / "Your cart is empty" + "לכל היצירות" (`/{locale}/shop`, FR-038); pricing error → `alert`
  Notice + "נסו שוב"; storage unavailable → the cart works for the session.
- **Following links**: a link click inside the drawer closes it (except the blocked "to checkout"
  and in-drawer `#` links); so does any navigation. Removing the last piece while on `/checkout`
  shows the empty state; the shop goes to `/{locale}/shop` only once the drawer is closed.
- **Opening from code**: `openCartDrawer()` (`src/lib/cart/drawer.ts`), used after a successful add,
  by "in your cart" (`go-to-cart`), checkout's "back to cart" and the payment return page's cart
  links.

## 8. Screens

Each screen lists its structure, states and acceptance checks. "Both directions" is implied for
every check: the same check passes on `/he` (RTL) and `/en` (LTR).

### 8.1 Home `/{locale}`

Rewritten 2026-11-16 (007; contract `contracts/ui.md`). The page root carries `data-full-bleed`
([§4](#page-frame-every-public-page)). Sections in order, each with its test id:

1. `home-hero` ([§7.28](#728-shophomehero-server)): the hero photo with the `<h1>` shop name (no tagline line since the
   Phase D gate; the top of the photo carries only the blended strip behind the header). The only
   h1 on the page.
2. `home-row` ([§7.32](#732-shophomerow-and-shoprowarrows)): the swipeable row of the home-row category's pieces
   with the category name as h2, the "view all" link and, from 900 px, arrow buttons. No category
   or sort buttons on the home page. Omitted when the home-row category has no published pieces
   (or none is chosen, or the shop is empty): then the page shows the hero, banners and band only.
3. `home-banner-child`, `home-band`, `home-banner-shelf`, in the Shopify shop's order:
   - Banner ([§7.29](#729-shopphotobanner-server)): `HomePhoto` (lazy), h2, one line, and a `soft` (sage) link button to
     `/{locale}/shop` (`data-testid="home-banner-button"`).
   - Band ([§7.30](#730-shopstatementband-server)): `peach` block, one sentence in weight 300 and under it the "shop now" text
     link with the arrow (`data-testid="home-band-link"`). No heading.
4. The mint footer from the layout.

The banner buttons, the band link and the row's "view all" link all lead to the "All pieces" page
[§8.14](#814-all-pieces-localeshop), which holds the category and sort buttons and the full grid.

**Texts** (`shop.home.*`; Hebrew first; the owner approved these texts as final at the Phase D gate,
2026-11-16, FR-012):

| Key                                             | Hebrew                                                                      | English                                                                                                                |
| ----------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| (the "All pieces" intro; no longer on the hero) | כל בובה וכל חיה כאן אני סורגת ביד, אחרי שאתם מזמינים.                       | I knit or crochet every piece here by hand, after you order.                                                           |
| `row.viewAll`                                   | לכל היצירות                                                                 | View all                                                                                                               |
| `row.previous` / `row.next` (button names)      | הקודמות / הבאות                                                             | Previous / Next                                                                                                        |
| `shop.allPieces.title`, `common.nav.allPieces`  | כל היצירות                                                                  | All pieces                                                                                                             |
| `bannerChild.heading`                           | נסרגו כדי שישחקו בהן                                                        | Made to be played with                                                                                                 |
| `bannerChild.line`                              | רכות ונעימות לחיבוק, וכל אחת נסרגת במיוחד בשבילכם.                          | Soft and cuddly, and each one is made just for you.                                                                    |
| `bannerChild.button`                            | לכל היצירות                                                                 | See all pieces                                                                                                         |
| `bannerShelf.heading`                           | לכל אחת אופי משלה                                                           | Each one has its own character                                                                                         |
| `bannerShelf.line`                              | דובים, ארנבים, קופים ועוד. בחרו, ואני אסרוג בשבילכם.                        | Bears, bunnies, monkeys and more. You choose, and I'll crochet it for you.                                             |
| `bannerShelf.button`                            | לכל היצירות                                                                 | See all pieces                                                                                                         |
| `band.sentence`                                 | אני סורגת כל יצירה בעצמי, בסבלנות ובאהבה, במיוחד בשבילכם.                   | I crochet every piece myself, with patience and love, especially for you.                                              |
| `band.link`                                     | לקנייה                                                                      | Shop now                                                                                                               |
| `hero.alt`                                      | בובות וחיות סרוגות, כדורי צמר ומסרגות על שולחן עבודה, ואישה סורגת ליד החלון | Crocheted dolls and animals, balls of wool and needles on a work table, and a woman knitting by the window             |
| `bannerChild.alt`                               | פעוט משחק בכבשה סרוגה צהובה, ועוד חיות סרוגות על השטיח                      | A toddler playing with a yellow crocheted sheep, with more crocheted animals on the rug                                |
| `bannerShelf.alt`                               | מדף כוורת מלא בובות וחיות סרוגות: דובים, ארנב, קופים, פיל, שועל, אריה וכבשה | A honeycomb shelf full of crocheted dolls and animals: bears, a bunny, monkeys, an elephant, a fox, a lion and a sheep |

Accept: in order on a phone (strip, header over the hero, hero with readable name, row,
child banner, band, shelf banner, footer); `/en` reads left to right (menu links left, icons right,
text aligned left), not a mirrored Hebrew page; every banner button, the band link and the row's
"view all" lead to `/{locale}/shop`; the row swipes, its arrows work from 900 px, are disabled at
the ends and move the row instantly under reduced motion; no horizontal page scroll at 320 px;
header, banner buttons, band link and social links are at least 44×44 px; text over photos is
inside scrim bands in both languages; the phone hero download is a phone variant under 200 KB;
axe reports no violations.

States: no pieces in the home-row category → no row; empty shop → hero, banners and band. Error →
`error.tsx` ([§8.12](#812-not-found-not-available-and-error)).

### 8.2 Category `/{locale}/c/{slug}`

Breadcrumbs (Home › Category) → h1 category name + count "{n} יצירות" in `ink-2` → category
`ChipRow` with this category current → `SortLinks` → `ProductGrid`.
States: empty category → `EmptyState` "בקטגוריה הזאת עוד אין יצירות" + link to all pieces;
unknown slug → 404 page.

New look (007): page title 32 / 44 px; the category `ChipRow` has "All pieces" first (pointing to `/{locale}/shop`) and this category current (sage fill, `ink` border); the grid is the square-photo grid ([§7.15](#715-shopproductcard-and-shopproductgrid-server)). The empty-category action "לכל היצירות" points to `/{locale}/shop` (FR-038). A piece is listed here when this category is among its categories.

### 8.3 Search `/{locale}/search?q=`

Breadcrumbs (Home › Search) → h1 "חיפוש" / "Search" → search form: `type="search"` field
(`enterkeyhint="search"`, autofocus only when `q` is empty), primary-sized secondary button
"חיפוש" → results line "{n} יצירות עבור ״{q}״" (`<bdi>` around `q`, `role="status"`) →
`ProductGrid`.
States: no `q` → form + category `ChipRow`; no results → `EmptyState` "לא מצאתי יצירות עבור
״{q}״" + category chips; `q` over 80 chars → field error "אפשר לחפש עד 80 תווים".

New look (007): same structure; the search button is `secondary`, results use the square-photo grid, the category chips link to category pages and "All" to `/{locale}/shop`.

### 8.4 Product `/{locale}/p/{slug}`

Layout: one column below 900 px (gallery, then details); from 900 px a grid
`minmax(0,1.25fr) minmax(0,1fr)`, gap 40 px (`lg:gap-10`), gallery at **inline-start**, details at inline-end and
`position: sticky; top: 88px` (the 72 px header plus 16 px). **No panel** (007 FR-017): the details
sit directly on the white page, as in the Shopify shop. The gallery is square ([§7.14](#714-shopgallery-island--zoom-dialog)).

Details, in order (unchanged items, new look):

1. h1 product name (30 → 36 px, 700).
2. `Price lg` (updates with the selection; "החל מ־" until all groups chosen). No VAT label (008).
3. `Notice made` (`peach`): **"נסרג במיוחד בשבילכם."** bold, then "זמן הכנה לפני משלוח או איסוף:
   {prepTime}" / "**Made just for you.** Time to make before shipping or pickup: {prepTime}".
   `prepTime` is the owner's text (admin hint suggests "כשבועיים"). It is the page's one highlight
   (FR-020).
4. Description (Aviva's text, owner-written, max 65ch; paragraphs preserved).
5. `OptionSelector` (only with groups; read-only text when not orderable).
6. Buy row (outlined pill quantity box + `forest` "הוספה לסל" filling the rest) or the
   not-orderable notice. Items 2–6 are one `BuyBox` island; items 3–4 are server-rendered children
   ([§7.12](#712-shopbuybox-island-price-options-quantity-add-to-cart)).
7. Facts list (top border `line`, 15 px, `forest` icons): `truck` "משלוח בכל הארץ {fee}" + small
   "חינם בהזמנה מעל {threshold}" (when shipping is enabled); `pin` "איסוף עצמי חינם" + small
   "הכתובת והשעות מופיעות בקופה" (when pickup is enabled); `card` with the payment line: online only → "תשלום מאובטח בכרטיס
   אשראי"; online and offline → the same + small "או תשלום ישיר אליי — הפרטים בקופה"; offline
   only → "תשלום ישיר אליי — הפרטים בקופה" as the main line (the offline text never depends on
   the online line). Values come from settings; a disabled method's line is omitted.
8. Disclosures: "משלוח ואיסוף" (short generic text in Aviva's voice + link to the shipping &
   returns page) and "ביטולים והחזרות" (one sentence + link).

Below the details and gallery, **"You may also like"** (007 FR-019, D8; replaces "More {category}",
whose message `shop.product.related` is removed):
`<section data-testid="also-like" aria-labelledby="also-like-title">`, h2 `shop.product.alsoLike`
("אולי תאהבו גם" / "You may also like", section title size), then `ProductGrid` (label
`shop.product.relatedLabel`, 2 columns → 3 from 640 px → 4 from 900 px, all cards `lazy`) of up to 4 pieces chosen
by `listAlsoLike(productId, categoryIds, 4)`, where `categoryIds` are the piece's categories without
the home-row category: pieces sharing one of them, newest first, then the newest of the rest, never
the piece itself and never twice. The section is absent when the list is empty.

Head: `generateMetadata` (title "{name} · {shop}" with the shop name from `shop_name_*`; every public page's
`<title>` uses the same "{page} · {shop}" template, the home page the shop name alone), description starting with the formatted price (WhatsApp and Telegram ignore `product:price:*`), OG 800 image, price tags) per FR-049;
JSON-LD Product. Where one category must be named for a piece (the breadcrumb, structured data) the
first category that is not the home-row category in the shop's order is used, else the home-row
category, else none (007 FR-037).

States: not orderable (7.12: options read-only, notice instead of the buy row); single photo (7.14); no options; Hebrew fallback text on `/en`
(`lang="he"`); hidden/draft/deleted → not-available page with 404 ([§8.12](#812-not-found-not-available-and-error)).

Accept: add without choosing → inline error + focus on the first unchosen group; add with
choice → badge count +qty, confirmation row with cart link, live announcement; price reflects
the chosen delta; zoom dialog opens, navigates with arrows in the correct direction, closes with
Esc and returns focus; gallery sits on the right in Hebrew and on the left in English at ≥ 900 px;
photo boxes are square; "You may also like" shows the expected cards and is absent when the shop
has one piece.

### 8.5 Cart (removed 2026-11-17)

The page `/{locale}/cart` no longer exists (it answers the normal "page not found", FR-048). The
cart is the cart drawer ([§7.34](#734-shopcartdrawer-server-shell--client-body)): the same lines,
pricing, flags, summary and states, in one column at the side of the screen. Every former link to
the page opens the drawer; automatic redirects that went there go to `/{locale}/shop`.

### 8.6 Checkout `/{locale}/checkout`

One page, no steps or step numbers. Below 900 px: a collapsible summary at the top
(`<details>`: "סיכום הזמנה · {total}") and the full totals again just above the submit button;
from 900 px: form column + sticky `OrderSummary` at inline-end.

Form sections (white panels, h2 each):

1. **פרטים ליצירת קשר / Contact details**: full name (`autocomplete="name"`), phone
   (`type="tel"`, `autocomplete="tel"`, `dir="ltr"`), email (`type="email"`,
   `autocomplete="email"`, `dir="ltr"`), hint under email "לשם אשלח את אישור ההזמנה".
2. **משלוח או איסוף / Delivery**: `RadioCard`s for enabled methods only: "משלוח עד הבית" with fee
   or "חינם" at inline-end; "איסוף עצמי" with "חינם" and the owner's pickup instructions shown in
   the card (always visible, not only when selected). Address block appears only for shipping:
   country select listing the enabled zones' countries plus a last choice "מדינה אחרת" / "Other
   country" (at launch: ישראל + מדינה אחרת; default ישראל), city (`address-level2`), street and number
   (`address-line1`), apartment (`address-line2`, optional), postal code (`postal-code`,
   `inputmode="numeric"`, `dir="ltr"`). Choosing "Other country" (UI-only value `other`, never
   stored) → inline `info` Notice "כרגע אני שולחת רק בתוך ישראל. אפשר לבחור איסוף עצמי או לכתוב
   לי." with a Contact link, and the server answers `checkout.ships_israel_only` if submitted.
3. **תשלום / Payment**: `RadioCard`s for enabled methods: "תשלום מאובטח באתר" ("בכרטיס אשראי,
   בעמוד המאובטח של חברת הסליקה") and "תשלום ישיר אליי" ("אחרי ההזמנה תקבלו את פרטי התשלום:
   העברה, Bit, PayBox או מזומן באיסוף" — the examples come from translations; the real
   instructions appear after ordering).
4. **הערה / Note**: `Disclosure` "הוספת הערה (לא חובה)" containing a `TextArea` (≤ 1,000).
5. Consent: required checkbox "קראתי את <התקנון> והסכמתי לו" (gender-neutral; link opens the terms page in a new
   tab with a visually hidden "(נפתח בכרטיסייה חדשה)"); optional unticked checkbox "אשמח לקבל
   עדכונים במייל" with one line saying what it means.
6. Collection notice (13, `ink-2`) beside the submit button: why the details are needed, who
   receives them, link to the privacy policy. Seller identity line (business name, ע.מ.) under it.
7. Totals (mobile) + primary submit: label "מעבר לתשלום מאובטח" / "Continue to secure payment"
   for online, "ביצוע הזמנה" / "Place order" for offline.

Behaviour:

- Live totals update on delivery or country change (`quoteCheckout`); the totals area has
  `aria-live="polite"` and shows a small inline spinner while quoting (no layout shift).
- Client checks are light (required, email shape, terms). Phone validity is checked **on the
  server only** (libphonenumber stays out of the client bundle) and comes back as a field error.
- Failed submit: field errors inline + `ErrorSummary` focused. Server `formError` (rate limit,
  payment unavailable, flagged lines) → `alert` Notice at the top with the recovery ("נסו שוב
  או בחרו תשלום ישיר", or a "back to cart" button that opens the cart drawer listing the lines).
- Submitting: primary button busy; the rest of the form stays visible.
- Inputs mirror into `sessionStorage` `ac_checkout` (T082) and are restored whenever the page loads
  with a saved copy (e.g. the visitor comes back from the payment page with the browser's back
  button). There is no `?resume=` URL: retry and "pay directly instead" after a failed payment live
  on the payment return page (§8.7).
- Offline order placed → the cart (`ac_cart_v1`) and `ac_checkout` are cleared **before** the
  redirect to the order page (online orders clear them on the return page when confirmed).
- Empty cart (checked client-side after hydration, since the cart lives in `localStorage`) →
  redirect to `/{locale}/shop` (FR-047); if the cart drawer is open (the last piece was removed in
  it) the drawer shows the empty state and the redirect waits until it is closed.

Accept: every FR-013 field present with the right `autocomplete`; no account or password prompt;
errors next to fields in the visitor's language; pickup instructions visible before ordering;
the submit label matches the payment choice; works with the keyboard alone.

New look (007): the form sections are `paper` panels with a 1 px `line` outline and 12 px radius (on the white page); radio cards select with `sage` fill and a 1.5 px `ink` border; summary thumbnails are 48×48 squares; the place-order button is `primary` (`forest`). No field, step or text changes.

### 8.7 Payment return `/{locale}/checkout/return`

A single centred `paper` panel (max 32rem, 1 px `line` outline) on the white page, `role="status"` region:

- **Checking**: spinner (static icon with reduced motion) + "בודקת את התשלום…" / "Checking your
  payment…".
- **Confirmed**: "התשלום אושר" then redirect to the order page.
- **Failed / cancelled**: `alert` icon, h1 "התשלום לא הושלם" / "The payment didn't go through",
  one sentence that the details are saved; primary "נסו שוב" / "Try again"; secondary "תשלום ישיר
  אליי במקום" / "Pay me directly instead". If prices changed since the order was started, either
  button first shows an `attention` Notice with the new total and "אישור והמשך" / "Confirm and
  continue" (same rule for retry and switch, contracts/server-actions.md).
- **Mismatch**: `info` icon, "הייתה בעיה בסכום התשלום. אצור איתכם קשר בהקדם."
- **Expired / unknown**: "הקישור הזה כבר לא פעיל" + a button that opens the cart drawer.
- **Timeout with `r=success`**: "התשלום עדיין בבדיקה. אישור יגיע אליכם במייל."

New look (007): the panel is `paper` with a 1 px `line` outline on the white page; "Try again" is `primary`; the links back to the shop lead to `/{locale}/shop` (FR-038).

### 8.8 Order status page `/{locale}/order/{token}`

Rewritten by 002 (002 FR-014, 002 FR-015, 002 US4): the confirmation page is now the place where the
customer follows their order. It is in the order's language, server-rendered, `noindex`,
`no-store`, and never shows the customer's name, address, phone or email (001 routes contract,
002 FR-014). Centred column (max 40rem). Content, top to bottom:

1. **Check circle**: 56 px `sage` circle with the `check` icon. Not shown on a Cancelled order.
2. **h1**: "תודה! ההזמנה התקבלה" / "Thank you! Your order is in" only while `justPlaced` (the order
   was placed less than one hour ago, as today); after that "ההזמנה שלכם" / "Your order"
   (`order.headingLater`).
3. **Number**: "מספר הזמנה" with the number large (24/800, `<bdi>`, `tnum`), `data-testid="order-number"`;
   then "אישור נשלח גם במייל." / "A confirmation was also sent by email." at all times, with no
   address (the existing `emailSent` line).
4. **Payment chip** (`data-testid="order-payment-state"`), text label always present, three states:
   "שולם" / "Paid" (`sage` fill), "ממתין לתשלום" / "Awaiting payment" (white, 1.5 px `field`
   border), "הוחזר" / "Refunded" (`photo` fill). On a Cancelled order that is still
   `awaiting_payment` there is **no chip** (nothing is owed); paid and refunded chips stay.
5. **`OrderProgress`** (`src/components/shop/OrderProgress.tsx`, server): an `<ol
data-testid="order-progress" aria-label="התקדמות ההזמנה" / "Order progress">` of four `<li
data-testid="order-step" data-state="done|current|todo">`, shown for open and Completed orders
   (not Cancelled). Status → current step: New 1, In preparation 2, Shipped / Ready for pickup 3,
   Completed 4. Labels: 1 "התקבלה" / "Received"; 2 "בהכנה" / "Being made"; 3 by delivery method:
   "נשלחה" / "Shipped" for shipping orders and "מוכנה לאיסוף" / "Ready for pickup" for pickup
   orders; 4 "הושלמה" / "Completed".
   - **done**: 28 px `ink` dot with a white `check` icon, label `ink` 400.
   - **current**: 28 px dot with a 3 px `forest` ring (10.8:1 on `paper`, so it
     passes WCAG 1.4.11 on its own; §13), label `ink` 700, `aria-current="step"` on the `<li>`.
   - **todo**: 28 px white dot with a 1.5 px `field` outline, label `ink-2`.
   - Below 640 px a **vertical** list (dot at inline-start, 12 px gap, a 2 px `line` connector
     between dots); from 640 px a **horizontal** row (four equal columns, dots joined by the
     connector, label centred under each dot). Looks come from `data-state` selectors, never a
     `style` attribute. Colour is never the only signal: the done check, the bold label and
     `aria-current` carry the state without it.
6. **Status `Notice`** (all `info`, h2 inside):
   - **Shipped**: "המשלוח בדרך" / "Your order is on its way", with the tracking number
     (`<bdi dir="ltr" class="tnum" data-testid="order-tracking-number">`) when there is one;
     without a number just "המשלוח בדרך".
   - **Ready for pickup** (`data-testid="order-pickup-note"`): Aviva's pickup note
     (`dir="auto"`, `whitespace-pre-line`); else the shop's pickup instructions (owner text
     through `pick()`, `lang="he" dir="auto"` on a Hebrew fallback on `/en`); else "כתבו לי כדי
     לתאם איסוף" / "Write to me to arrange pickup" with the seller's phone (`tel:`) and email
     (`mailto:`) from settings (`<bdi dir="ltr">`) and the Contact link.
   - **Cancelled** (`data-testid="order-cancelled"`): "ההזמנה בוטלה" / "This order was cancelled",
     plus "הכסף הוחזר" / "Your money was refunded" when the payment state is refunded, or "הכסף
     יוחזר אליכם" / "Your money will be refunded" while it is still paid; the seller's phone
     (`tel:`) and email (`mailto:`) from settings and the Contact link. It **replaces** the
     progress and the check circle. (`/{locale}/contact` belongs to roadmap item 003; until it
     ships the phone and email are the working contact.)
7. **Offline payment**: the `attention` Notice h2 "איך משלמים" with the owner's instructions
   (Markdown) and "בהעברה כתבו את מספר ההזמנה {number}" (`data-testid="offline-instructions"`),
   shown **only** while the order is offline, awaiting payment, and neither Cancelled nor
   Completed. Once Aviva marks it paid the Notice disappears and the chip reads "שולם".
8. **Pickup instructions**: pickup orders that are New or In preparation keep the `info` Notice
   h2 "איסוף עצמי" with the shop's pickup instructions (`data-testid="pickup-instructions"`).
   Not shown once Shipped / Ready for pickup (the pickup note replaces it), Completed or Cancelled.
9. **`Notice made`**: the first
   matching row of this table wins (002 plan.md > Design system updates, word for word):

   | Status                                          | Payment state            | `made` Notice                                                                                                                                            |
   | ----------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Shipped, Ready for pickup, Completed, Cancelled | any                      | hidden                                                                                                                                                   |
   | New, In preparation                             | refunded                 | hidden                                                                                                                                                   |
   | New                                             | awaiting payment         | "קיבלתי את ההזמנה ואתחיל לעבוד עליה בקרוב." / "I got your order and will start on it soon." (`madeAwaiting`, wording changed; Clarifications 2026-11-09) |
   | New                                             | paid                     | "עכשיו אני מתחילה לסרוג." (`madePaid`)                                                                                                                   |
   | In preparation                                  | awaiting payment or paid | "אני סורגת את ההזמנה שלכם עכשיו." (`madeInPreparation`; also for cash at pickup, Clarifications 2026-11-09)                                              |

   Each item in the summary still shows its own "זמן הכנה: {prepTime}" from the `order_line`
   snapshot (Clarifications 2026-11-08).

10. `OrderSummary` with per-item preparation time (no thumbnails: order photos are private;
    `data-testid` `order-summary`, `order-line`, `order-prep-time` unchanged).
11. Quiet link "חזרה לחנות" / "Back to the shop".
12. `OrderCleanup` (tiny island, renders nothing): removes `ac_checkout`, and removes the cart
    (`ac_cart_v1`) when the server says the order was created less than an hour ago (`justPlaced`),
    so opening an old order link later never empties a newer cart. Unchanged.

**Link validity** (002 FR-015): the link works while the order is open, and for 30 days after it
becomes Completed or Cancelled. After that, and for an unknown token: `EmptyState` "הקישור כבר לא
פעיל" / "This link is no longer active", a sentence that does **not** mention a fixed number of
days ("אם צריך משהו בקשר להזמנה, כתבו לי ואענה." / "If you need anything about your order, write
to me and I'll reply."), and the Contact link.

**Test ids** (002 contracts/routes.md): kept `order-number`, `order-payment-state`, `order-summary`,
`order-line`, `order-prep-time`, `offline-instructions`, `pickup-instructions`; new
`order-progress`, `order-step`, `order-tracking-number`, `order-pickup-note`, `order-cancelled`.

Accept (both directions): for each of the six statuses the right step is current (3 = "נשלחה" for
a shipping order, "מוכנה לאיסוף" for a pickup order) and only that `<li>` has `aria-current="step"`;
vertical at 375 px and horizontal at 640 px and wider, with no horizontal page scroll at 320 px;
Shipped shows the tracking number in a left-to-right isolate; Ready for pickup never renders blank
(note, instructions or contact fallback); Cancelled shows no progress, no check circle and no
"ממתין לתשלום" chip; the offline payment Notice is absent once Completed or Cancelled; the `made`
Notice text matches the table for every status and payment state; the h1 changes after one hour;
no name, address, phone or email of the customer anywhere on the page; axe reports no violations.

New look (007): the check circle and the "Paid" chip are `sage`; the current step's ring is `forest` (above); "back to the shop" leads to `/{locale}/shop` (FR-038). Behaviour, structure and test ids are unchanged.

### 8.9 Content pages `/{locale}/pages/{slug}`

Read mode. Breadcrumbs (Home › Title) → h1 → `Prose` (68ch) in a single column on the white page (no
panel, generous block spacing). `cookies` adds `StorageTable` after the prose. Drafts show their
"טיוטה" notice as the first paragraph (comes from the content). No sidebars, no images.

- The slug `contact` is not served here: `/{locale}/pages/contact` is 404 (the contact page is
  §8.10; its intro text lives in the `contact` content page).
- On `/en`, a page with no English text shows the Hebrew title and body with `lang="he"
dir="auto"` (`fallbackAttrs()`); the surrounding page stays English.
- Unknown slug → the storefront 404 (§8.12).
- Accept: each of the six pages opens in both locales with one h1; the legal pages show the draft
  notice; axe reports no violations.

New look (007): the white page, text in `ink`, `Prose` links underlined; nothing else changes.

### 8.10 Contact `/{locale}/contact`

h1 "יצירת קשר" / "Contact" + intro from the `contact` content page, then (008) the WhatsApp block,
then the form and the details. From 900 px: form panel (white) + business details panel (white) at
inline-end; stacked below 900 px with the form first.

- **WhatsApp block** (`data-testid="contact-whatsapp"`, a `paper` panel with a 1 px `line` outline, before
  the form in DOM and visual order): h2 "הכי מהיר: וואטסאפ" / "Fastest: WhatsApp", one line of text, and
  a `primary` link button (`contact-whatsapp-link`, at least 56 px tall, full width on a phone, the
  `whatsapp` icon at 24 px, name "לשליחת הודעה בוואטסאפ (נפתח בלשונית חדשה)"; `https://wa.me/<digits>`,
  `target="_blank"`, `rel="noopener noreferrer"`, no pre-filled text). The link is made from the
  business phone in Settings (`src/lib/whatsapp.ts`). The block is absent while the phone is the
  sample number or is not a valid number; the form is then the first thing, with its old heading. With
  the block, the form's heading is "או כתבו לי כאן" / "Or write to me here" (`formHeadingAlt`).

- Form: name, email (`dir="ltr"`), message (`TextArea`, 6 rows, 10–5,000 chars with a counter
  only near the limit), honeypot, primary "שליחה" / "Send".
- Details panel (heading "פרטי העסק"; the form panel's heading is "שליחת הודעה"): legal business
  name, address, email (`mailto:`), phone (`tel:`) (FR-047). No business number (008).
- Success: the form is replaced by a `status` panel with `check` icon "ההודעה נשלחה. אענה לכם
  במייל בהקדם." and focus moves to it. Errors as in checkout; rate limit → `alert` Notice "שלחתם
  כמה הודעות ברצף. נסו שוב בעוד {minutes, plural, one {דקה אחת} other {# דקות}}." / "You've sent several
  messages in a row. Try again in {minutes, plural, one {1 minute} other {# minutes}}." (an ICU
  plural, so one minute reads naturally; only messages actually sent count; the refusal says how long to
  wait). An expired form (the signed form age) → a generic `alert` Notice "הטופס פג תוקף. נא לטעון
  את הדף מחדש ולנסות שוב." / "The form has expired. Please reload the page and try again."
- Accept: empty, with errors and sent states pass axe with no violations in both locales.

New look (007): both panels are `paper` with a 1 px `line` outline; "שליחה" is `primary` (`forest`).

### 8.11 Header, footer, language switch

As [§7.17](#717-shopannouncementbar-server)–[§7.20](#720-shopfooter-server). Accept: the switch
keeps the same page and query and the cart count; header order mirrors between directions; all
header controls are 44×44; the menu opens and closes with keyboard and `Esc`; footer shows all
FR-047 details and all content links in both languages.

New look (007): see [§7.17](#717-shopannouncementbar-server)–[§7.20](#720-shopfooter-server), [§7.33](#733-shopheadersearch-server) and [§4](#header-states). From 1024 px the header links start with "All pieces"; the language switch is in the green strip; the footer is mint with the social links and keeps its own language link.

### 8.12 Not found, not available and error

- **404** (`not-found.tsx`): h1 "העמוד לא נמצא" / "Page not found", one sentence, search form,
  primary "לכל היצירות". HTTP 404.
- **Product not available** (`p/[slug]/not-found.tsx`): h1 "המוצר הזה כבר לא זמין" / "This piece
  isn't available any more", "אולי תמצאו כאן משהו אחר שתאהבו:" and up to 4 newest products.
  HTTP 404.
- **Error** (`error.tsx`): h1 "משהו השתבש" / "Something went wrong", "נסו שוב" (reset) and a link
  home; no technical details. `global-error.tsx` uses the same look with inline-free markup.

New look (007): the 404 page's primary "לכל היצירות" and the product-not-available page's links lead to `/{locale}/shop` (FR-038); the up-to-4 newest pieces use the square-photo grid.

### 8.13 Consent banner (dormant)

As [§7.21](#721-consent-consentroot-consentloader-consentbanner-consentgate-cookiesettingsbutton-dormant-at-launch). At launch it never
renders and its code is not loaded. Accept (consent test project): both choices equal in size
and style; nothing optional loads before acceptance.

New look (007): the sheet is `paper` with 12 px top corners; the two choices stay `secondary`, equal in size and style (003 FR-021).

---

### 8.14 All pieces `/{locale}/shop`

Added 2026-11-16 (007 FR-033, D19; contract `contracts/home-row.md`, "All pieces page"). The
current home page's catalog content moved here (route `src/app/[locale]/(shop)/shop/page.tsx`):

1. h1 `shop.allPieces.title` ("כל היצירות" / "All pieces", page title size).
2. The intro line (`shop.catalog.intro`).
3. Category `ChipRow` (`CategoryChips currentSlug={null}`): "All pieces" (current) + every category
   with published products, linking to `/c/{slug}`.
4. `SortLinks` with `basePath="/{locale}/shop"`.
5. `ProductGrid` of all published pieces (no pagination at this scale; first 4 cards `eager`).

States: empty catalog → `EmptyState` "עוד אין כאן יצירות" / "No pieces here yet" with "כתבו לי" /
"Write to me" (Contact). Metadata: title `shop.allPieces.title` with the shop name, canonical and
language versions via `alternates('/shop', locale)`; the page is in the sitemap. The language
switch keeps `/shop` and the `sort` value. Accept: card shows main photo, name, price and the
not-available label when `orderable=false`; products with varying option prices show "החל מ־"; grid
columns 2/3/4 at 375/640/900; no horizontal page scroll at 320 px; the "All" chip is current here
and on no other page.

## 9. States matrix

| Screen                                                                                                             | Empty                                                       | Loading                                  | Error                                                                      | Not orderable / flagged                                     |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Home                                                                                                               | no row pieces: row omitted; empty shop: hero, banners, band | server-rendered (no skeleton)            | error.tsx                                                                  | —                                                           |
| All pieces / category                                                                                              | EmptyState + contact / all pieces                           | server-rendered (no skeleton)            | error.tsx                                                                  | card label in `alert`                                       |
| Search                                                                                                             | form + chips; no-results EmptyState                         | server-rendered                          | field error (> 80 chars)                                                   | card label                                                  |
| Product                                                                                                            | —                                                           | server-rendered; images in `photo` wells | 404 not-available page                                                     | notice replaces buy row                                     |
| Cart drawer ([§7.34](#734-shopcartdrawer-server-shell--client-body))                                               | EmptyState                                                  | Skeleton lines                           | alert Notice + retry                                                       | per-line flags + ErrorSummary on continue                   |
| Checkout                                                                                                           | client-side redirect to All pieces when empty                     | inline quote spinner; busy submit        | field errors, ErrorSummary, formError Notice                               | flagged lines → error with link to cart                     |
| Payment return                                                                                                     | —                                                           | checking spinner                         | failed / mismatch / expired / timeout panels                               | —                                                           |
| Order                                                                                                              | —                                                           | server-rendered                          | expired-link EmptyState (no "30 days" in the text; unknown token the same) | Cancelled: `info` Notice replaces progress and check circle |
| Admin orders ([§12](#12-admin-area))                                                                               | list: "no orders match" EmptyState; home: "nothing waiting" | server-rendered; busy buttons            | stale / not-allowed / field errors; email-failed alerts                    | order not found → admin 404 page                            |
| Contact                                                                                                            | —                                                           | busy submit                              | field errors, rate-limit Notice, expired-form Notice                       | —                                                           |
| Content page ([§8.9](#89-content-pages-localepagesslug))                                                           | —                                                           | server-rendered                          | unknown slug and `contact` → 404                                           | English missing → Hebrew text marked `lang="he"`            |
| Admin content ([§12.5](#125-content-list-admincontent)–[§12.6](#126-content-editor-and-versions-admincontentslug)) | list always has the 7 pages                                 | server-rendered; busy save               | stale `alert` Notice; field errors                                         | unknown slug or version → admin 404                         |
| Admin customers ([§12.7](#127-customers-admincustomers))                                                           | "לא נמצאו לקוחות" EmptyState                                | busy search / action                     | stale result; field error                                                  | —                                                           |
| Admin statistics ([§12.8](#128-statistics-adminstats))                                                             | "עוד אין נתונים" EmptyState                                 | server-rendered                          | —                                                                          | —                                                           |

---

## 10. Performance budget

- Server Components everywhere except these islands: `CartLink`, `LanguageSwitch`, `BuyBox`
  (price + options + stepper + add to cart), `Gallery` (scroll sync + zoom dialog), cart drawer body (lazy, on first open), checkout form, payment
  return poller, `OrderCleanup` (order page, no markup), contact form, `StatsBeacon`, `RowArrows` (007: the home row's two
  arrow buttons, a few hundred bytes, the only new island), and the consent islands `ConsentLoader`, `ConsentGate` and
  `CookieSettingsButton` (present only when consent is required; `ConsentBanner` and
  `ConsentGate` are loaded only through `ConsentLoader` with `React.lazy` + `Suspense`, so none of their code
  is downloaded at launch).
- The header over the hero (CSS only, [§4](#header-states)), the swipeable row itself, the home
  photos, the social links and "You may also like" are server-rendered: no JavaScript.
- No client libraries beyond React/Next and next-intl. `libphonenumber-js` and `markdown-it`
  never reach the client. Shared Zod schemas used in a client island import only the light
  checks (or `zod/mini`), keeping the checkout page within budget.
- `NextIntlClientProvider` receives only the namespaces the islands on that page use.
- Assistant: one variable file per subset (`hebrew`, `latin`), `woff2`, preloaded by `next/font`;
  one file covers every weight, so the thin hero and bold titles cost nothing extra.
- LCP: on the home page the hero image is the largest element and alone gets `fetchpriority="high"`
  (`loading="eager"`); product cards on the home page are all `lazy` (they sit below the hero),
  banners are `lazy`. On All pieces, category and search pages the first 4 cards are eager; on the
  product page the first gallery photo is eager with `fetchpriority="high"`; everything else lazy.
- Home photos: a phone downloads a phone variant only (hero under 200 KB, SC-005; files are
  cached for a year by their fingerprinted names) and never a wide file.
- The first-load budgets stay: 150 KB gzipped on every storefront route, checkout 155 KB, product page 152 KB
  (157 KB with the cart drawer opened; owner answer 2026-11-17)
  (`bundle-size.spec.ts`).

---

## 11. Verification

| Check                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Where                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Axe WCAG 2.1 A/AA, zero violations, every screen in both locales                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `tests/e2e/a11y.spec.ts` (T124)                                                                                                                   |
| Direction and layout: `dir`/`lang`; gallery at inline-start (right in he, left in en) at 1280 px; header order mirrored; no horizontal overflow at 320 and 375 px on every public page; no `style=` attribute in the server-rendered HTML, and none in the DOM apart from Next's own `next-route-announcer`; every product `<img>` (cards, gallery photos, thumbnails and zoom image, cart and order lines) has `srcset`, `sizes`, `width`, `height`; header, buy-box, cart and checkout controls ≥ 44×44 px; zoom dialog arrow keys follow direction                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `tests/e2e/storefront-layout.spec.ts` (T125)                                                                                                      |
| No `style` prop, no physical Tailwind utilities, no physical CSS properties                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | ESLint (T002) + `pnpm check:css`                                                                                                                  |
| First-load JS ≤ 150 KB gz on every storefront route (checkout ≤ 155 KB, product ≤ 152 KB, 157 KB with the drawer open)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `tests/e2e/bundle-size.spec.ts` (T087): sums the gzipped size of the JS each route loads in Chromium; part of `pnpm test:e2e` (so in CI)          |
| Home page (`tests/e2e/home.spec.ts`, added to the storefront specs so it also runs on WebKit): section order; banner buttons, band link and "view all" lead to `/{locale}/shop`; the home row (cards from the home-row category only, swipe/scroll, arrows from 900 px, disabled at the ends, instant under reduced motion, RTL direction, no page sideways scroll); alt texts in both languages; the phone hero is a phone variant under 200 KB; text over the hero inside its scrim bands, and no dark layer on the two banners (no `scrim-band` class, transparent copy box, no feather), at 320 / 375 / 1280 px, both languages, also with a 60-character shop name; the hero shop name is centred (the text itself, measured with a Range, at 375 and 1280 px); header: transparent with no blur at scroll 0, the frosted white bar with ink text and a backdrop blur once scrolled 2 px (after the 250 ms transition), transparent again at 0, a 250 ms transition declared, and the same end states under reduced motion, in all three projects; the frosted bar also on a category page | `tests/e2e/home.spec.ts`                                                                                                                          |
| Design tokens: no removed colour name left in `src/`; every contrast pair in [§3.1](#31-colour) recomputed from `globals.css`; `on-photo` over `--scrim-large` at least 3:1 and over `--scrim-text` at least 4.5:1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `tests/unit/design-tokens.test.ts`                                                                                                                |
| Home photos: every manifest file exists with the listed size, is WebP with no EXIF/XMP; the phone files (hero included) at most 190 KB; wide files at most 450 KB; no file in `public/site-photos/` that the manifest does not list                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `tests/unit/home-photos.test.ts`                                                                                                                  |
| Square product photos: `\|width − height\| ≤ 1 px` for card, gallery main, thumbnail, cart-line and checkout-line photo boxes; the header, banner buttons, band link and social links are at least 44×44 px; no sideways scroll at 320 and 375 px on the home page and on a product with "You may also like"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `tests/e2e/storefront-layout.spec.ts`                                                                                                             |
| Social links: every validation rule; save, clear and reject in the admin; the footer shows exactly the saved icons with their names                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | `tests/unit/social-links.test.ts`, `tests/integration/settings.test.ts`, `tests/e2e/admin-settings.spec.ts`                                       |
| Header (Phase D gate, 007 D20): at exactly 1024 px in both languages, three ordinary 12-character category names ("סלסלות קטנות", "Small hearts") show in full and three names of wide letters ("WWWWWWWWWWWW", "שששששששששששש") keep the row inside the viewport with no overlap, their spans having computed `overflow: hidden` and `text-overflow: ellipsis`; no overlap and no sideways scroll from 320 px; below 1024 px the menu button shows and the sheet starts with the search field; the link order, the three search landmarks with distinct names, the search field's `forest` focus ring over the photo and on the white bar, the strip always present with the switch at its inline end and at least 44 px tall, the whole header inside the blended strip's first `--header-h`; axe at 1024 px; screenshots at 1024 and 1280 px in both languages                                                                                                                                                                                                                                | `tests/e2e/storefront-layout.spec.ts`, `tests/e2e/a11y.spec.ts`, `tests/e2e/design-review.spec.ts`, `tests/unit/header-categories.test.ts`        |
| Drawers (007 D21, FR-044–FR-048), phone projects for the menu, all projects for the cart: the drawer's top edge equals the header's top edge on screen and reaches the viewport bottom, on the right side for its language; the strip is not covered; the close button sits within 1 px of the opener at scroll 0 and after scrolling, and has focus after opening; `role="dialog"` + `aria-modal` + name; header, `<main>` and footer `inert` while open; `Esc`, the X and a tap outside close it and return focus to the opener; the burger lines form an X; no page scroll while open; links close it; widening to 1024 px closes the menu; reduced motion gives the same end states; the cart drawer shows lines, flags, subtotal, empty state, add to cart opens it, `/he/cart` and `/en/cart` answer 404; bundle sizes measured with the drawer closed and the drawer chunk reported | `tests/e2e/home.spec.ts`, `tests/e2e/storefront-layout.spec.ts`, `tests/e2e/cart.spec.ts`, `tests/e2e/consent.spec.ts`, `tests/e2e/bundle-size.spec.ts` |
| Visual review against this document and the home example at 375 / 768 / 1280 px, he and en                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | `tests/e2e/design-review.spec.ts` (T133, `DESIGN_REVIEW=1`) writing to `test-results/design-review/` (not committed), reviewed by the coordinator |

---

## 12. Admin area

Added by 002 (admin order handling). **Operate mode**: plain Hebrew (right-to-left), phone first,
one obvious next step, large targets, nothing decorative. It uses the same tokens (the 007 palette, [§3.1](#31-colour)), Assistant and `ui/`
primitives as the storefront (`Button`, `LinkButton`, `ChipLink`, `ChipRow`, `Notice`, `Price`,
`Disclosure`, `EmptyState`, `TextField`, `TextArea`, `FormField`, `ErrorSummary`, `ConfirmDialog`,
`Toast`, `Icon`); no new component library, no new colour. The admin changes only in colours and font
(007 FR-027): same screens, layout, texts and steps, apart from the new Settings section and the
home-row select and the two header-category selects ([§12.10](#1210-settings-adminsettings)), the
piece editor's category checkboxes ([§12.11](#1211-the-piece-editor-adminproductsid)) and the
12-character category names ([§12.12](#1212-categories-admincategories)). Every admin string is Hebrew with a real
English entry in `en.json`. Prices, order numbers, phones and emails are in `<bdi>` (phone and
email also `dir="ltr"`); numbers use `tnum`. No `style` attribute. Admin screens are `noindex`,
`no-store`, and each `page.tsx` calls `requireAdmin()` first (002 FR-019).

### 12.1 Frame

- **Layout** (existing, unchanged; 002 does not edit `src/app/admin/(protected)/layout.tsx`): a
  header with the brand, the admin's name (hidden below 640 px) and sign-out, a horizontally scrollable row of
  navigation pills (44 px high, `rounded-pill`, `hover:bg-sage`; "הזמנות" is already one of
  them; no current-page marker), and a `max-w-5xl` `<main id="main">` with 16 px side gutters and
  24 px block padding. The two-column order page (§12.3) switches at 900 px inside this main.
- **Sign-in** (`/admin/sign-in`, 004): one `AuthCard` with a single "Sign in with Google" button and
  nothing else; no passkey, recovery or setup screens exist. The only errors, shown in the card's
  `alert` Notice, are `not_allowed` (generic refusal for any unapproved account), `expired`, `error`
  and `rate_limited`.
- **Page background and cards** (007 D10): the page background is `photo` (pale grey-green; `bg-photo` on the admin `<body>`, which also covers the sign-in page), so the white `paper` cards with their 1 px `line` outline stand out as before. The Markdown preview is `paper` with a 1 px `line` outline.
- **Page title**: h1 28/800, `ink`, `text-wrap: balance`; one h1 per page.
- **Status badges** (`admin/OrderStatusBadge`, `rounded-pill`, 13/700, padding 4×12, text label
  always present, so colour is never the only signal):

  | Status           | Label          | Look                                              |
  | ---------------- | -------------- | ------------------------------------------------- |
  | New              | "חדשה"         | `sage` fill, `ink` text                           |
  | In preparation   | "בהכנה"        | `photo` fill, `ink` text                          |
  | Shipped          | "נשלחה"        | `paper` fill, 1.5 px `ink` border                 |
  | Ready for pickup | "מוכנה לאיסוף" | `paper` fill, 1.5 px `ink` border                 |
  | Completed        | "הושלמה"       | `paper` fill, 1.5 px `field` border, `ink-2` text |
  | Cancelled        | "בוטלה"        | `paper` fill, 1.5 px `alert` border, `alert` text |

- **Payment badges** (`PaymentStateBadge`, same shape): "ממתין לתשלום" `paper` fill + 1.5 px
  `field` border; "שולם" `sage` fill; "הוחזר" `photo` fill. All text `ink`.
- **`Toast`** after every successful action (e.g. "ההזמנה עברה להכנה"), `role="status"`, with the component's default duration and
  dismiss button; errors are never toasts: they are `Notice`s next to the action or under the field.
- **Dates** are shown in Israel time (`Asia/Jerusalem`, 24-hour clock), e.g. "9.11.2026, 14:05"
  (`formatDateTime`, 002 research R14).
- **Failure and stale messages** use the `alert` `Notice` with `role="alert"`; success feedback
  uses the `Toast`. Buttons are never disabled; while a change runs the pressed button is
  `aria-busy` (§7.1).

### 12.2 Orders list `/admin/orders`

Top to bottom, one column, within `max-w-5xl`:

1. h1 "הזמנות".
2. **Order-number box** (first, because customers quote the number): a `<form method="get">` with
   `TextField` label "מעבר להזמנה לפי מספר" (`inputmode="numeric"`, `dir="ltr"`, accepts "#1023"
   or "1023") and a `secondary` button "מעבר". Found → opens the order. Not found → an `info`
   `Notice` above the list naming the number without the "#" ("לא מצאתי הזמנה מספר 1023"); not digits → `info`
   "מספר הזמנה הוא רק ספרות, למשל 1023". Filters in the URL are kept.
3. **Status `ChipRow`** ("הכול" + the six labels) and **payment `ChipRow`** ("הכול" + three
   labels), each current chip `aria-current="page"` (§7.3). When `open=1` (the admin home link) a
   removable chip "בלי הזמנות שבוטלו" with a `close` icon shows in the same row area. A quiet
   link "ניקוי הסינון" appears when any filter is on.
4. **Cards** (a `<ul>` of `<li>`; the whole card is one link to the order, 44 px+ target, white,
   `rounded-card`, 1 px `line` border, padding 16): first line "#1023" (`<bdi>`, 700, `tnum`) and
   the date (`ink-2` 13) at inline-end; customer name (16/500); total (`Price md`); the two badges
   (status, payment) in a wrapping row.
5. **Paging row** (25 per page): "הקודם · עמוד 2 מתוך 5 · הבא", with directional `chevron` icons
   that flip in RTL; links keep `status`, `payment` and `open`; hidden when there is one page.

States:

- **Empty result**: `EmptyState` "אין הזמנות שמתאימות לסינון" with a primary link "ניקוי הסינון".
- **No orders at all**: `EmptyState` "עוד אין הזמנות" (no link).
- **Invalid filter value**: ignored (list shows everything for that filter).
- **Page beyond the last**: shows the last page.
- **Error**: no admin `error.tsx` exists; an uncaught error falls to the root `global-error.tsx` (§8.12), which replaces the whole document: no admin header, and its home link goes to the storefront. 002 adds no error file.

Accept: with 30 seeded orders page 1 shows 25 cards and a paging row; each filter narrows the list
and survives paging; the number box opens the order or explains; targets ≥ 44 px; no horizontal
scroll at 320 px; the list is unreachable signed out.

### 12.3 Order page `/admin/orders/[id]`

One column on phones; from 900 px two columns: **details at inline-start**, a **sticky actions
panel at inline-end** (`position: sticky; top: 24px`, because the admin header is not sticky; white, `rounded-card`). On a phone the actions
panel comes right after the alerts, before the details, so the next step is on top. Unknown or
malformed id → the admin 404 page, never an error. Order of blocks:

1. **Header**: "הזמנה #1023" (h1), the date and time, then the status and payment badges.
2. **Alerts** (only when they apply):
   - "order received" email failed (002 FR-007): `alert` `Notice` "הלקוח לא קיבל את מייל ההזמנה.
     כדאי להתקשר" with the customer's phone as a `tel:` `LinkButton`.
   - cancellation or refund email failed: a smaller `alert` line "מייל הביטול לא נשלח ללקוח" /
     "מייל ההחזר לא נשלח ללקוח" (one per failed email).
   - Customer anonymised (feature 003): `info` `Notice` "לא ניתן ליצור קשר עם הלקוח".
3. **Actions panel**: preceded, while the order is Cancelled and paid, by the **refund reminder**
   (002 SC-008): a persistent `attention` `Notice` "צריך להחזיר את הכסף" with the sentence chosen by
   payment method ("בתשלום באתר — דרך האתר של חברת הסליקה" for online, "בתשלום ישיר — באותה דרך
   שבה שולם" for offline) and the "סימון כהוחזר" button inside it. `OrderActions` renders it at the
   top of the actions panel, not in the Alerts block: on phones directly after the alerts, from
   900 px at the top of the sticky right-hand column. Shows only what the status and payment state allow (002 FR-008):
   - one **primary** button for the main next step ("בהכנה", "נשלחה", "מוכנה לאיסוף", "הושלמה" as
     the status allows; shipping orders never get "מוכנה לאיסוף", pickup orders never "נשלחה");
     **secondary** buttons for the other allowed steps ("נשלחה" or "מוכנה לאיסוף" from New, "ביטול
     ההזמנה"); a **quiet** button "חזרה שלב אחד" for the step back (In preparation, Shipped,
     Ready for pickup only).
   - Choosing "נשלחה" or "מוכנה לאיסוף" reveals `TextField` "מספר משלוח (לא חובה)" (`dir="ltr"`,
     max 100) or `TextArea` "הערה לאיסוף (לא חובה)" (max 500) above the confirm press; the field is
     pre-filled when the order re-enters that status. Next to the primary "שמירה" sits a quiet
     "סגירה" button that closes the field without saving (never "ביטול", which is the order's
     cancel button).
   - On a Shipped / Ready order the stored tracking number / pickup note is shown in the panel
     with a quiet "עריכה" button that opens the same field with a primary "שמירה" button (no status
     change; the history records the edit without the text).
   - **Payment buttons**: "סימון כשולם" (offline orders awaiting payment, any status), "סימון
     כהוחזר" (paid orders). While the refund reminder shows (Cancelled and paid) the panel leaves
     out "סימון כהוחזר": the Notice holds the only one, rendered by `OrderActions` so it has the
     same `ConfirmDialog` and busy handling. Never offered for online orders awaiting payment (002 FR-012).
   - **`ConfirmDialog`** (§7.26) for Completed, Cancel, mark paid and mark refunded; each states
     its consequence in plain words. Mark paid: "לסמן שהתשלום התקבל? אי אפשר לבטל את זה." Mark
     refunded: "לסמן שהכסף הוחזר ללקוח? הלקוח יקבל על כך מייל. אי אפשר לבטל את זה."
     Completing an offline order that still awaits payment opens a dialog with **primary "סימון
     כשולם והשלמה"**, **secondary "השלמה בלי תשלום"** and Cancel. The **cancel** dialog has the
     title "לבטל את ההזמנה?" and the body "הלקוח יקבל מייל שההזמנה בוטלה."; for a paid order the body
     also holds the refund reminder "ההזמנה שולמה. אחרי הביטול צריך להחזיר את הכסף: בתשלום באתר —
     דרך האתר של חברת הסליקה; בתשלום ישיר — באותה דרך שבה שולם." (the sentence by payment method). Its dismiss button reads "חזרה" / "Back" (`cancelLabel`, §7.26).
   - Busy: the pressed button is `aria-busy`; success → `Toast` and the page refreshes; stale → an
     `alert` `Notice` "ההזמנה השתנתה הרגע. הדף מציג עכשיו את המצב העדכני." and a refresh;
     not allowed → an `alert` `Notice` "אי אפשר לעשות את זה בהזמנה הזאת." and a refresh; field errors sit under the field (`ErrorSummary` when more than one).
   - Final states (Completed / Cancelled, nothing to do): the panel shows a plain line ("ההזמנה
     הושלמה" / "ההזמנה בוטלה") and only the payment buttons that still apply.
4. **Items**: one row per line: 72×90 (admin, unchanged by 007) `photo` well with the snapshot photo
   (`/api/admin/media/<key>`, or the empty well, `alt=""`, `loading="lazy"`), name, options
   "{group}: {value}", "{quantity} × {unit price}", line total (`Price md`), "זמן הכנה: {prepTime}".
   Then subtotal, delivery fee, total with currency.
5. **Customer**: name; phone and email as 44 px `LinkButton`s (`tel:` / `mailto:`) with `phone` /
   `mail` icons, in `<bdi dir="ltr">`.
6. **Delivery**: the address lines (shipping) or "איסוף עצמי".
7. **Customer's note**: `whitespace-pre-line`, `dir="auto"`; omitted when empty.
8. **Payment**: method ("תשלום מאובטח באתר" / "תשלום ישיר אליי": the same wording as `checkout.payment.*`, copied into
   `admin.orders.paymentMethod.*`, not reused keys), state, and the paid / refunded date and time.
   8a. **הסכמות** (003; after Payment, shown on every order that has the data): "אישור התקנון:
   {date and time}" with "תקנון גרסה {n}" and "מדיניות פרטיות גרסה {n}" (each is a link to
   `/admin/content/{terms|privacy}/versions/{n}`, the version the customer accepted); marketing consent as
   one line: "דיוור: אושר ב-{date}", "דיוור: אושר ב-{date}, בוטל ב-{date}" or "דיוור: לא אושר".
   On an anonymised order the marketing line reads "דיוור: —" (the columns are cleared) while the
   Terms line stays.
9. **Tracking number / pickup note**: `<bdi dir="ltr">` for the number; the note `dir="auto"`,
   `whitespace-pre-line`. Omitted when there is none.
10. **Customer details correction**: a `Disclosure` "תיקון פרטי הלקוח" holding the form (`FormField`
    primitives: name, phone, email and, for shipping orders, the address fields; `ErrorSummary`
    after a failed submit; primary "שמירה"). Items, amounts and delivery method cannot be edited.
    Anonymised: the disclosure is replaced by the `info` line above.
11. **History**: an `<ol>`, newest first, "{date} · {what} · {who}", where "who" is the admin's
    name, "מנהלת שהוסרה" when the admin was removed since, or "המערכת" for automatic entries (failed
    emails are system entries). Never any customer
    text, tracking number or note. 003 adds the `anonymized` entry "פרטי הלקוח נמחקו", shown as
    "המערכת" only for the 7-year task's events (`data.system = true`); an anonymisation Aviva
    requested shows her name.

States: **not found** (admin 404); **stale** and **not allowed** (Notice + refresh, above);
**error** (no admin `error.tsx`; root `global-error.tsx`, which shows no admin header and links to the storefront); **anonymised** (info Notice, correction form replaced, status
changes still work); **email failed** in its three forms (order received, cancellation, refund);
**refund reminder** (Cancelled and paid); **tracking / pickup-note edit** (inline field).

Accept: on a phone the allowed next step is visible without scrolling past the details; each
status offers exactly the buttons of 002 FR-009 / 002 FR-013 and no others; focus starts on Cancel in
every dialog; Escape cancels; a double tap changes the order once; the stale message appears when a
second tab acted first; the customer's phone and email are one tap away; every dynamic string in
`<bdi>`; axe reports no violations.

### 12.4 Admin home `/admin`

- h1 "לוח בקרה" and a one-line welcome.
- **Two count cards** (a two-column grid from 640 px, stacked below; `paper` `rounded-card`, 1 px
  `line` border, padding 20): the number large (40/800, `tnum`), the label under it ("הזמנות חדשות"
  / "ממתינות לתשלום"); **the whole card is one link** (44 px+) to `/admin/orders?status=new`
  and `/admin/orders?payment=awaiting_payment&open=1`, so the list shows exactly what the count
  counted (002 research R13: awaiting-payment orders that are not Cancelled).
- When both counts are zero: a plain line "אין כרגע הזמנות שמחכות לך" (instead of the cards).
- **Settings notice**: while any required shop setting still has its placeholder value, an
  `attention` `Notice` "כדאי להשלים בהגדרות:" listing them, with a link "להגדרות" to the
  settings page.
- Accept: the count equals the number of cards in the linked list; signed out it shows nothing.

### 12.5 Content list `/admin/content`

Added by 003. h1 "דפי תוכן" and a one-line explanation. A `<ul>` of seven cards (white,
`rounded-card`, 1 px `line` border, padding 16; the whole card is one link to the editor, 44 px+):
the page title; a badge, "טיוטה שסופקה עם האתר" (`sage` fill) or "נערך" (`paper` fill, 1.5 px
`field` border); "עודכן {date}" (`ink-2` 13). The Terms and Privacy cards add a quiet "גרסאות
קודמות" link to their versions page (outside the card link).
Accept: all seven pages are listed with the right badge; targets ≥ 44 px; no horizontal scroll at
320 px; unreachable signed out; axe reports no violations.

### 12.6 Content editor and versions `/admin/content/[slug]`

Added by 003. h1 is the page title.

- **Language tabs** "עברית" / "English" (44 px, `role="tablist"`). Each tab holds a title
  `TextField` and the body.
- **Toolbar**: four text-labelled `secondary` `Button`s, small but 44 px tall: "כותרת", "מודגש",
  "רשימה", "קישור". No icons: the icon set has none for these and words are clearer for Aviva.
- **Body** `TextArea`, 16 rows, `dir` per tab (`rtl` for עברית, `ltr` for English).
- **Preview**: a `secondary` toggle "תצוגה מקדימה" that shows a `Prose` panel (rendered by
  `ui/Markdown`) on `paper` with a 1 px `line` outline.
- **Save**: on phones a sticky bottom bar with the primary "שמירה"; field errors under the fields
  (`ErrorSummary` when more than one; the editor switches to the tab of the first error); success
  → `Toast` "הדף נשמר". Identical text saves nothing and says so ("לא היה מה לשמור: הטקסט זהה
  לקיים"). Stale (the
  page changed since it was opened) → `alert` `Notice` with a "לטעון מחדש" button.
- Terms and Privacy also show a link "גרסאות קודמות של הדף" under the preview.
- **Versions** `/admin/content/{terms|privacy}/versions`: a back link "חזרה לעריכת הדף", h1, a
  one-line explanation, then an `<ol>`, newest first, each "גרסה {n} · {date}" as a link. One
  version `/admin/content/{slug}/versions/{n}`: a back link "חזרה לכל הגרסאות", the Hebrew title
  (h1) and a header line "גרסה {n}, בתוקף מ-{date}", then the Hebrew text in `Prose`; when the
  version has an English text it follows under a rule with the English title as h2. Read only.
  Unknown slug or version → admin 404.
  Accept: a save raises the version by one and is listed in the history (Terms and Privacy only);
  the preview matches the public page; both tabs are reachable by keyboard; targets ≥ 44 px; axe
  reports no violations with the preview open.

### 12.7 Customers `/admin/customers`

Added by 003. h1 "לקוחות" and a one-line explanation.

- **Search**: `TextField` "מייל או טלפון" (`dir="ltr"`, `inputmode` not email) and a primary
  "חיפוש". The term never goes into the URL (Server Action).
- **Result**: a summary line ("נמצאו 2 הזמנות, תשלום אחד שלא הושלם, 5 מיילים"); order cards like
  §12.2 without the customer name; a line "פרטים נוספים שהופיעו בהזמנות האלה:" listing the other
  emails and phones used on those orders, each a quiet button that searches it.
- **Action row**: `secondary` "הורדת הנתונים"; `secondary` "הפסקת דיוור" (only when any order has
  marketing consent); `secondary` "מחיקת הפרטים" (only when orders or stored emails
  were found: unfinished checkouts alone expire by themselves; existing button variants only; no
  danger style).
  The last two open a `ConfirmDialog`:
  - Withdraw: title "להפסיק דיוור ללקוח?" / "Stop marketing emails to this customer?"; body
    "הלקוח לא יקבל מהחנות מיילים שיווקיים. ההזמנות נשארות כמו שהן, ותאריך ההסכמה המקורי נשמר." /
    "The customer will get no marketing emails from the shop. The orders stay as they are, and
    the original consent date is kept."; confirm "הפסקת דיוור" / "Stop marketing emails".
  - Anonymise: title "למחוק את פרטי הלקוח?" / "Erase this customer's details?"; body "השם, הטלפון,
    המייל והכתובת יימחקו מ-{count} הזמנות. ההזמנות עצמן (סכומים ופריטים) נשמרות לצורכי מס. אי
    אפשר לבטל את הפעולה." / "Name, phone, email and address will be erased from {count} orders.
    The orders themselves (amounts and items) are kept for tax records. This cannot be undone.";
    when an order is still open, an `attention` line "יש כאן הזמנה שעוד לא הושלמה. אחרי המחיקה לא
    תוכלי ליצור קשר עם הלקוח לגביה." / "One of these orders is still open. After erasing, you
    won't be able to contact the customer about it."; confirm "מחיקת הפרטים" / "Erase details".
    When the search found no orders, only stored emails, the body reads "המיילים השמורים של
    הלקוח יימחקו. אי אפשר לבטל את הפעולה." / "The customer's stored emails will be erased. This
    cannot be undone."
- **After anonymising**, or when the search found only unfinished checkouts, an `info` `Notice`:
  "לא נמחקו {count} תשלומים שעדיין בתהליך. הם יימחקו אוטומטית תוך 48 שעות, או עד 24 שעות
  מאוחר יותר אם אי אפשר להגיע לחברת הסליקה לבדיקה הסופית של התשלום (כלומר עד 72 שעות; או 30 יום
  אם יש פער בסכום). אם הלקוח ישלים תשלום, תופיע הזמנה חדשה עם הפרטים שלו, ולכן כדאי לחפש שוב
  בעוד שלושה ימים." / "{count} payments still in progress were not erased. They are deleted
  automatically within 48 hours, or up to 24 hours later if the payment provider cannot be reached
  for the final status check (so up to 72 hours; or 30 days if the amount did not match). If the
  customer completes a payment, a new order with their details will appear, so search again in 3
  days."
- **Export and anonymise** need only the confirmation dialog below (no second sign-in check, 004);
  they, search and marketing withdrawal all require a signed-in admin.
- **No results**: `EmptyState` "לא נמצאו לקוחות". Stale result (orders changed since the search):
  `alert` `Notice` and a fresh search.
  Accept: search by email or phone finds the orders; both dialogs state their consequence; focus
  starts on Cancel; targets ≥ 44 px; no personal data in the URL; axe reports no violations with the
  results and with each dialog open.

### 12.8 Statistics `/admin/stats`

Added by 003. h1 "סטטיסטיקה". A period `ChipRow` (7 / 30 / 90 days, current chip
`aria-current="page"`). "ביקורים ביום" bar chart: SVG, bars `forest`, today's bar `sage` with a 1.5 px `forest` outline, axis labels
13 `ink-2`, `role="img"` with an `aria-label` summary, and a `Disclosure` "הצגה כטבלה" with the same
numbers. Two ranked lists, "המוצרים הנצפים ביותר" and "מאיפה הגיעו" (`(direct)` is shown as "כניסה
ישירה"; a list with no entries in the period reads "אין נתונים בתקופה הזאת"). The period chips are
links (`?days=7|30|90`). The chart keeps time running left to right even on the right-to-left admin page (oldest day left, today right), with the
top value, the first and the last date as axis labels; the table lists the days newest first. No
data at all → `EmptyState` "עוד אין נתונים". The statistics hold no identifiers.
Accept: the chart and its table agree; the period chips change the range; unreachable signed out;
axe reports no violations.

### 12.9 Products list `/admin/products`

Added by 005. Besides the state badge and the "not orderable" badge, a row shows a third badge
"אין אנגלית" when the product's English name is empty, or when its Hebrew description is filled
and its English description is empty (a draft with no Hebrew description is not asked for an
English one). The badge has a dashed 1.5 px `field` border on a `paper` background with `ink-2`
text, and comes after the state badges, so it cannot be mistaken for a state. Only the name and
the description count: options and image descriptions do not.
Accept: the badge shows on a product with no English name and not on a product with both English
fields; axe reports no violations.

Several categories (007 FR-032): where a row shows the piece's category it shows all its names,
comma-separated, in the shop's category order. The category filter shows the pieces that have the
chosen category among theirs; it works through the category links, so a piece in two categories
appears under both.

### 12.10 Settings `/admin/settings`

Added by 006. Under `PAYMENT_PROVIDER=none` (production at launch, no card provider) the payment
section shows the card checkbox unchecked and disabled with the hint "תשלום בכרטיס עוד לא הוגדר"
and the offline checkbox checked and disabled (the disabled `Checkbox`, §7.10); the offline
instructions fields stay editable and saving them works. Behaviour of every surface in
`specs/006-launch-readiness/contracts/payment-mode.md`. The admin home (§12.4) lists empty Hebrew
offline payment details among the settings to complete while offline payment is on.
Accept: with `none` both checkboxes are disabled and saving changed instructions shows the saved
toast; axe reports no violations.

**Social links section** (007, contract `contracts/social-links.md`; FR-024–FR-026): a section
after "פרטי העסק", title "הרשתות החברתיות שלי", hint "אם יש לך עמוד באחת הרשתות, הדביקי כאן את
הכתובת שלו. כתובת שתישאר ריקה לא תופיע באתר." Three `FormField`s, `dir="ltr"`,
`inputMode="url"`, `autoComplete="url"`, `maxLength={300}`, each with a hint example in Latin
letters at the end of the line ("למשל: https://www.instagram.com/aviva"): "כתובת עמוד האינסטגרם",
"כתובת עמוד הפייסבוק", "כתובת עמוד הטיקטוק"; its own primary "שמירה" and the usual saved toast.
Test ids `settings-social`, `settings-socialInstagramUrl`, `settings-socialFacebookUrl`,
`settings-socialTiktokUrl`. An address is saved only when it is a secure (`https`) address on that
platform's own site with a page name; otherwise the field shows one plain Hebrew message that says
how to fix it, listed in the `ErrorSummary` when there is more than one, and nothing is saved. After
saving, the field shows the stored (normalised) address. Empty = the link is removed.

**Business number** (008, owner decision 2): the field "מספר עוסק (לא חובה)" / "Business number
(optional)" may be left empty; under it the hint "לא חובה. מופיע רק במיילים של ההזמנות, לא באתר."
(`admin.settings.business.regNumberHint`). A filled value may be up to 40 characters; the sample
value counts as not filled in. The business phone is the number the contact page's WhatsApp button
uses, so the sample phone keeps that button hidden. No setting blocks ordering any more; the admin home
still lists the details that need attention.

**Home page section** (007, FR-034): a section "דף הבית" with one select, "השורה בדף הבית מציגה את
הקטגוריה:", options "ללא (השורה לא תוצג)" plus every category; saved with the rest of the settings.
Phase D gate (007 D20, FR-039): the same section also holds two selects next to the home-row
select, "קטגוריה בתפריט 1" and "קטגוריה בתפריט 2" (test ids `settings-headerCategory1Id` and
`settings-headerCategory2Id`), each "ללא" (message key `admin.settings.home.headerNone`) plus every category, with a hint that says the header
shows them after "כל היצירות", then the home-row category, and only categories that have a
published piece; at release both are "ללא". An unknown category gives the field error
`admin.settings.errors.header_category_not_found`. Saved with the rest of the settings, same
`useSaver` / `FormAlert` / `ErrorSummary` pattern.
Accept: save one social address and the footer shows exactly that icon with its name; a wrong site
shows the Hebrew error and saves nothing; clearing removes the icon; the home-row category and each header category can be
changed or cleared; axe reports no violations at 375 and 1280 px.

### 12.11 The piece editor `/admin/products/[id]`

Added by 007 (FR-032; contract `contracts/home-row.md`, "Piece edit screen"). The single "קטגוריה"
dropdown becomes a fieldset "קטגוריות" of checkboxes (the `Checkbox` of [§7.10](#710-form-controls-uitextfield-uitextarea-uiselectfield-uicheckbox-uiradiocard-uierrorsummary-server-markup-used-inside-islands)),
`data-testid="field-categories"` on the fieldset, one checkbox per category in the shop's order,
each found by its label (the category's Hebrew name), with the hint "אפשר לסמן יותר מאחת. היצירות
שב'מומלצות' מוצגות בדף הבית." where "מומלצות" is the current home-row category's name (the hint's
second sentence is left out when none is chosen). Publishing still needs at least one category:
the existing "missing category" message is attached to the fieldset. Nothing else on the screen
changes.

**Order of sections, errors and focus** (008, Stories 3 and 4; `contracts/ui.md`): the sections are
now photos first (`data-testid="section-photos"`), then details, options and publish
(`section-<name>`), because the photos are what Aviva has in hand first. Every control that can be
missing has `data-field="<field>"` (`nameHe`, `descriptionHe`, `priceIls`, `priceUsd`, `categories` on
the first checkbox, `prepTimeHe`, `photos`, `options`). After a failed "Publish" each missing control
(or group: photos, categories, options) shows its own message under it
(the `admin.products.required.*` keys `nameHe`, `descriptionHe`, `priceIlsMinor`, `priceUsdMinor`, `categoryId`, `prepTimeHe`, `images`, `optionGroups`), is marked `aria-invalid="true"` with `aria-describedby` pointing at
that message, and a group gets a 1.5 px `alert` outline with 4 px offset. The page scrolls to the first
missing control in document order (centred; instantly under reduced motion) and focuses it
(`preventScroll`, so the scroll does not jump twice). The summary at the top (`publish-errors`) still
lists every missing item. Filling a field, adding a photo or changing an option removes that field's
mark and message at once, without another "Publish".

### 12.12 Categories `/admin/categories`

Phase D gate (007 D20, FR-040). The screen's layout and steps are unchanged (the list with the
Hebrew and English name inputs, the slug and the piece count, save, move up and down, delete, and
the create form); only the name rule changes.

- **At most 12 characters** for the Hebrew name and the optional English name, on create and on
  rename, so the name fits the header row ([§7.18](#718-shopheader-server-shell--two-islands)). Both
  name inputs carry `maxLength={12}`, so a 13th character cannot be typed; the server checks the
  rule again (the English name is trimmed before it is counted, so a trailing space never trips it).
- **The error** is plain Hebrew, `admin.categories.errors.nameTooLong`: "השם ארוך מדי: עד 12 תווים,
  כדי שיתאים לתפריט" (en "The name is too long: up to 12 characters, so it fits the menu"). Each
  error shows under its own input: the Hebrew name's under the Hebrew input and the English name's
  under the English one, both at once when both are too long. Any other failure keeps
  `admin.categories.errors.invalid`, whose text now says 12 as well.
- No existing category is longer, so there is no special handling of older names.
- Accept: a 13-character name is refused on create and on rename with the message under the right
  input and nothing saved; a 12-character name is accepted; axe reports no violations at 375 and
  1280 px.

---

## 13. Deviations from the home example and the sample

### From the approved home example (`docs/design/home-example.src.html`), 2026-11-16

| Home example                                                                           | This document                                                                                                                                                                                                                                               | Why                                                                                                                                                   |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google Fonts `<link>`, `Heebo` / Arial fallbacks                                       | `next/font` self-hosted Assistant                                                                                                                                                                                                                           | CSP and no third-party requests                                                                                                                       |
| `<style>` block and classes; the example's own script (language toggle, header switch) | Tailwind 4 utilities + `@theme` tokens, no `style` attributes; the header's see-through-to-white fade is a CSS transition keyed off `data-at-top`, set by the tiny `HeaderScrollState` island ([§4](#header-states)), and texts come from the message files | CSP, plan; one tiny client island for the header                                                                                                      |
| Hero line `clamp(18px, 2.2vw, 24px)` (18 px on phones)                                 | 24 px / 1.3 on every screen                                                                                                                                                                                                                                 | 24 px regular is "large text", so it passes AA under the lighter scrim by construction                                                                |
| Banner line `clamp(17px, 1.8vw, 20px)`                                                 | 24 px / 1.35                                                                                                                                                                                                                                                | same reason                                                                                                                                           |
| Hero shop name up to 150 px                                                            | `clamp(56px, 12vw, 128px)`                                                                                                                                                                                                                                  | the longest likely names fit on one or two lines at 1240 px                                                                                           |
| Gradient overlays over the whole photo (about 45 % top, 55 % bottom, 62–70 % banners)  | text bands with their own scrim (`--scrim-large` 42 %, `--scrim-text` 55 % behind the header), 48 px feathered edge, photo otherwise light                                                                                                                  | contrast holds for any text length and any photo without measuring pixels ([§3.3](#33-space-size-radius-shadow-scrims))                               |
| Header switches to white with a script                                                 | a 250 ms CSS transition keyed off `data-at-top`, set by a tiny client island (`HeaderScrollState`); white from 1 px of scroll; without JavaScript the frosted bar always (`scripting: none`)                                                                | owner: as little JavaScript as possible                                                                                                               |
| Focus ring `forest`                                                                    | `ink` (white on photos, `currentColor` in the header); the search field alone keeps an inset `forest` ring (see §7.33)                                                                                                                                      | one consistent ring that is visible on every surface                                                                                                  |
| Current chip: `sage` fill and `sage` border                                            | `sage` fill + 1.5 px `ink` border + bold                                                                                                                                                                                                                    | sage is 1.4:1 on white; WCAG 1.4.11 and 1.4.1                                                                                                         |
| Card name `clamp(19px, 2.2vw, 24px)`; section title `clamp(30px, 4vw, 44px)`           | 19 → 22 px; 28 → 40 px                                                                                                                                                                                                                                      | research D11                                                                                                                                          |
| Footer link rows 36 px tall                                                            | 44 px tall                                                                                                                                                                                                                                                  | the 44×44 rule of [§3.3](#33-space-size-radius-shadow-scrims)                                                                                         |
| One 1600×678 `<img>` per photo with a fixed height                                     | `<picture>`: portrait phone crops (400×600, 565×848) and four wide sizes                                                                                                                                                                                    | phones download a phone-sized file, SC-005 ([§6](#6-images))                                                                                          |
| Four-card product grid with category and sort chips on the home page                   | a swipeable row of the home-row category; chips, sort and the full grid on the "All pieces" page ([§8.14](#814-all-pieces-localeshop))                                                                                                                      | owner answers 2026-11-16                                                                                                                              |
| A "photo goes here" placeholder card                                                   | removed: a piece cannot be published without a photo                                                                                                                                                                                                        | [§6](#6-images)                                                                                                                                       |
| Brand `clamp(17px, 4.6vw, 22px)`                                                       | `clamp(19px, 4.6vw, 22px)`                                                                                                                                                                                                                                  | tasks.md T013: a slightly larger name on a 320 px phone (the doc follows the approved tasks)                                                          |
| Banner buttons 52 px                                                                   | `soft` 48 px                                                                                                                                                                                                                                                | the 44 px minimum is met; one `soft` size everywhere                                                                                                  |
| Language pill 34 px                                                                    | 36 px                                                                                                                                                                                                                                                       | closer to the 44 px target; hit area extended to 44×44                                                                                                |
| Centred-logo header with the language pill and icons around it                         | the owner's one-row order from 1024 px (links, brand, search field, cart); hamburger menu below; the language switch in the green strip; hero tagline removed; the strip behind the header is one blended gradient                                          | owner answers at the Phase D gate, 2026-11-16 (007 D20; [§7.18](#718-shopheader-server-shell--two-islands), [§7.17](#717-shopannouncementbar-server)) |
| Header colour change with a 0.2 s transition                                           | instant                                                                                                                                                                                                                                                     | reduced motion: the switch is not movement ([§4](#header-states))                                                                                     |
| Focus ring offset 2 px                                                                 | 3 px                                                                                                                                                                                                                                                        | one ring everywhere ([§3.1](#31-colour))                                                                                                              |
| Mock note ("design example, not the real shop") and demo language toggle               | removed                                                                                                                                                                                                                                                     | example-only                                                                                                                                          |

### From the earlier product page sample (superseded 2026-11-16, kept for history)

| Sample                                          | This document                                                                                                                  | Why                                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Google Fonts `<link>`                           | `next/font` self-hosted                                                                                                        | CSP and no third-party requests                                                        |
| `<style>` block and classes                     | Tailwind 4 utilities + `@theme` tokens; no `style` attributes                                                                  | CSP and plan                                                                           |
| Active thumbnail: marigold border only          | (2026-11-08) marigold ring + 1.5 px ink inner ring; since 2026-11-16 a 3 px `forest` ring alone                                | the colour changed; `forest` is 9.5:1 on the photo box                                 |
| Input/stepper borders in `line`                 | `field` token (and `ink-2` for the quantity box)                                                                               | `line` is 1.3:1; controls need 3:1 boundaries                                          |
| `−`, `+`, `✓` glyphs                            | SVG `minus`, `plus`, `check` icons                                                                                             | one drawn icon system                                                                  |
| Price = (base + delta) × quantity               | unit price for the selection; totals live in the cart                                                                          | FR-011 shows the product price; avoids a "price" that changes with quantity            |
| Breadcrumb separator `›` in RTL                 | directional chevron that flips                                                                                                 | it pointed the wrong way in RTL                                                        |
| "Sample photos" note, demo footer note          | removed                                                                                                                        | sample-only                                                                            |
| Options hidden when not orderable (first draft) | options shown read-only                                                                                                        | FR-011 (user decision 2026-11-08)                                                      |
| Thumbnail swap only                             | swipeable scroll-snap track + thumbnails + zoom dialog                                                                         | FR-011 zoom; native swipe on phones with no extra JS                                   |
| "Added to cart ✓" label only                    | label morph + persistent "in your cart · go to cart" row + live announcement                                                   | faster path to checkout (SC-002) and screen-reader feedback                            |
| Facts text hard-coded                           | built from settings; a disabled method's line is omitted                                                                       | honesty                                                                                |
| Colour dots from ad-hoc classes                 | `option_value.swatch` with a fixed 12-colour palette ([§7.13a](#713a-option-colour-dot-decided-2026-11-08-keep-fixed-palette)) | the data model had no colour field; a fixed palette fits the CSP and is easy for Aviva |
| White buy panel with a rose note                | no panel; peach note                                                                                                           | owner decision 6 (2026-11-16)                                                          |

---

## 14. Decisions and open points

1. **Option colour dot** (decided 2026-11-08): keep, with the fixed 12-colour palette (§7.13a).
2. **Shop name** (decided 2026-11-08): a separate setting `shop_name_he/_en`, different from the
   legal business name. It is still a working name; the header wordmark, home h1, `<title>`, ©
   line and email sender name read it from settings, so the final name needs no design change.
3. **Lower home page** (owner answer 2026-11-16, Q1): as in the Shopify shop: child banner, peach
   band (sentence plus a "shop now" text link with an arrow), shelf banner.
4. **Thin shop name and band sentence** (Q2): weight 300 as in the Shopify shop; banner headings
   stay bold (800).
5. **Header and motion** (Q3, Q4/Q7, Q5, reduced motion): see-through only at the very top of the
   home page, the plain white bar as soon as the visitor scrolls, the same for everyone (reduced
   motion included: the switch is instant, not movement); the plain white bar in older browsers
   (Firefox, Safari before 26) is accepted for now; the 55 % darker strip behind the header is
   accepted and judged on the finished page. Real movement (card photo zoom, the row's sliding) is
   off under reduced motion.
6. **The owner's AI photos** (Q6): used on the home page, unmarked. The originals are 848 px tall
   and look slightly soft on very sharp phone screens; taller versions can be swapped in
   ([§6](#6-images), "Changing a home photo").
7. **Texts** (owner's Phase D answer, 2026-11-16): the texts in [§8.1](#81-home-locale) are final
   (FR-012).
8. **Home row from a category** (third round): a swipeable row as in the Shopify shop, about 2 pieces
   visible on a phone and 4 on a computer, filled from the category chosen in Settings ("Featured"
   at release, an ordinary category that Aviva can rename); a piece can be in several categories;
   up to 12 newest pieces at release.
9. **"All pieces" page** (second round): the category and sort buttons and the full list live on
   `/{locale}/shop`; the row's "view all", the banner buttons, the band link and every "continue
   shopping" link lead there ([§8.14](#814-all-pieces-localeshop)).
10. **Phase D gate and plan-review answers** (2026-11-16, 007 D20, FR-007–FR-010, FR-039–FR-043):
    from 1024 px the header is one row in the owner's order ("All pieces", two header categories
    chosen in Settings, the home-row category, "About", "Shipping & Returns", the shop name, a
    search text field, the cart); below 1024 px a hamburger menu whose sheet also holds the search
    field, "Contact" and the full-word language link. The language switch moved into the green
    strip on every screen size; the strip is always shown and holds only the switch when it has no
    text (default approved by the owner). Spacing in the header is reduced. Category names are at
    most 12 characters (Hebrew and English); ordinary 12-character names show in full and a rare
    name of unusually wide letters may end with "…" in the header (acceptable); no existing category
    is longer. The hero has no tagline, and the dark strip behind the header fades smoothly to
    nothing. A sign-in icon and a favourites icon come in a later feature, not now.
11. **Owner visual fixes after testing** (2026-11-17, spec "Owner visual fixes after testing", 007
    T084-T090): the brand is centred between the links and the search field from 1024 px; the hero
    shop name is centred; the home header is see-through only at scroll 0 and fades in time (250 ms) to the
    frosted bar from 1 px, by a small client island (replaces the instant switch of item 5); the white bar is frosted (85 % paper, blur 12 px, saturate 1.4; solid
    where `backdrop-filter` is missing); the two banners lose their dark layer (accepted contrast
    exception, measured at the gate). Change log: sections 3.3, 3.5, 4, 7.18, 7.28, 7.29 amended.
12. **Menu and cart drawers** (owner answers 2026-11-17, spec "Owner answers: menu and cart drawers",
    007 D21, FR-044–FR-048, T091–T098): the hamburger menu is a modal drawer at the reading-start
    side and the cart button opens a modal cart drawer at the reading-end side, both from the
    header's top edge (never over the green strip), with a slide and a dimmed page; the menu's three
    lines turn into an X; "add to cart" opens the cart drawer; the cart page `/{locale}/cart` is
    removed and every link or redirect to it opens the drawer or goes to `/{locale}/shop`. Change
    log: sections 3.4, 3.5, 3.6, 4, 7.12, 7.18, 7.22, new 7.34, 8.5 (removed), 8.6, 8.7, 9, 10, 11
    amended.
13. **Icons for client components** (2026-11-17, T096/T098 size trims): new paragraph in section 5
    (`ClientIcon` and `icon-core.tsx`, a 10-glyph set for client components); section 7.34 body
    loading and failure states.
14. **Post-launch fixes** (2026-11-20, feature 008, owner decisions 1 to 7): the owner's round logo
    replaces the shop name in the header and hangs half below the bar (`--logo-size`,
    `--logo-overhang`, round click area, focus ring on the image); the business number is optional
    and never shown on the website (footer, contact page, checkout seller line); no "includes VAT"
    label on prices; the contact page leads with a WhatsApp block; the piece editor shows photos
    first with per-field errors and focus; new home band sentence; brand assets, favicon and link
    previews (`pnpm brand:assets`). Change log: sections 3.6, 4, 5, 6 (new "Brand assets"), 7.5, 7.18,
    7.20, 8.1, 8.4, 8.10, 12.10, 12.11 amended.
