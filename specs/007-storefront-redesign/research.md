# Research: Storefront redesign (007)

Decisions for the plan. The spec's [Owner decisions](spec.md#owner-decisions-2026-11-16) are
binding; each decision below says which owner decision or FR it serves. Background:
`docs/design/storefront.md` (the design system this feature rewrites), the approved home page
example (`home-mock.html` in the design-discussion notes; published privately at
https://claude.ai/artifact/EwiiHiG9DKyrSr5CZxVbz4), and the design notes
`redesign-direction.md`. "§x" means a section of `docs/design/storefront.md`.

A few words used below, explained once:

- **Token**: a named colour, size or radius (for example `forest`) defined once in
  `src/app/globals.css`; components use the name, never the raw colour code.
- **Island**: a small piece of the page that runs JavaScript in the visitor's browser. Everything
  else is plain HTML made on the server. Fewer islands means less to download.
- **Scrim**: a see-through dark layer laid over a photo so white text on it stays readable.
- **Variant**: one size of a photo (for example 800 pixels wide). Phones download a small variant,
  computers a large one.

## D1. Colour tokens (owner decision 1, FR-001, FR-022, FR-027)

**Decision**: replace the warm palette with this token set in `src/app/globals.css`. Values start
from the approved example; every pair below was computed against WCAG 2.1 (AA needs 4.5:1 for
normal text, 3:1 for large text and for control borders). No example shade had to change.

| Token          | Value     | Use                                                                                                                       | Contrast                                  |
| -------------- | --------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `paper`        | `#FFFFFF` | page and surfaces (replaces `ground` and `panel`)                                                                         | ink 18.9, ink-2 8.9                       |
| `photo`        | `#EEF2EE` | photo wells, skeletons, table header rows, admin page background                                                          | ink 16.7, ink-2 7.9, alert 6.7            |
| `ink`          | `#061406` | text, focus ring, selected borders                                                                                        | —                                         |
| `ink-2`        | `#3E4E3F` | secondary text, chip borders, outlined quantity box                                                                       | 8.9 paper, 7.2 peach, 6.5 sage, 5.5 mint  |
| `line`         | `#DDE5DD` | dividers and panel outlines only (decorative)                                                                             | 1.3 (decorative)                          |
| `field`        | `#6B7D6C` | borders of text inputs, selects, checkboxes, radio cards                                                                  | 4.4 paper, 3.9 photo                      |
| `sage`         | `#CFE2D0` | secondary buttons, selected chips and radio cards, cart badge, text selection, offline-payment panel, "new"/"paid" badges | ink on it 13.9                            |
| `sage-hover`   | `#BCD6BE` | secondary button hover                                                                                                    | ink 12.2                                  |
| `forest`       | `#1E4620` | main action buttons, free-shipping strip, current-photo and current-step rings, facts icons, skip link                    | paper on it 10.8; 9.5 on photo            |
| `forest-hover` | `#163518` | main button hover                                                                                                         | paper 13.5                                |
| `peach`        | `#F7E5D7` | statement band, made-to-order note (the one highlight, FR-020)                                                            | ink 15.4, ink-2 7.2                       |
| `mint`         | `#A3D9A5` | footer                                                                                                                    | ink 11.7, ink-2 5.5                       |
| `alert`        | `#A32018` | errors and "not available" only                                                                                           | 7.6 paper, 6.7 photo, 6.2 peach, 5.6 sage |
| `on-photo`     | `#FFFFFF` | text and icons over photos (always with a scrim, D4)                                                                      | see D4                                    |

- Removed names: `ground`, `panel`, `sun`, `sun-hover`, `sun-soft`, `sun-ink`, `rose`,
  `rose-ink`. Tailwind's `--color-*: initial` already drops every colour not listed, so an old
  class name would silently produce nothing; a unit test (`tests/unit/design-tokens.test.ts`)
  fails if any removed name is still used in `src/`, and recomputes the contrast table above from
  the values in `globals.css`, so a later shade change cannot quietly break AA.
- Sage on white is only 1.4:1, so sage is never the only sign of a state: a selected chip or
  radio card also gets a 1.5 px `ink` border and bold text (WCAG 1.4.11 and 1.4.1). A sage button
  is identified by its text, which needs no border contrast.
- The made-to-order note moves from rose to `peach` with `ink` text and a `forest` yarn icon; on
  the product page it is the only peach element, so it stays the page's one highlight.

**Rationale**: the example's shades already pass AA everywhere they are used, so the owner gets
exactly the approved colours. Renaming (rather than reusing `sun` for green) keeps the code
readable for years.

**Alternatives considered**: keep the old token names with new values (fewer file edits, but
`bg-sun` meaning dark green misleads every future reader; rejected). A separate admin palette
(rejected: decision 9 says same colours).

## D2. Font: Assistant, self-hosted (owner decision 2, FR-001)

**Decision**: `src/app/fonts.ts` exports `assistant` from `next/font/google`:
`Assistant({ subsets: ['hebrew', 'latin'], variable: '--font-assistant', display: 'swap' })`
with no `weight` list, so the variable font file (all weights 200–800 in one file per subset) is
used. `--font-sans` points to it. Heebo is removed from `fonts.ts`, the locale layout, the admin
layout and `global-error.tsx`.

- `next/font` downloads the files once at build time and serves them from the shop's own address
  (`/_next/static/media/…`), so the strict CSP rule `font-src 'self'` stays as it is and visitors'
  browsers never contact Google. This is exactly how Heebo works today.
- Weights used: 300 for the hero shop name and the band sentence (thin, as in the Shopify shop;
  owner answer Q2), 400 body, 600 buttons, 700 titles and brand, 800 banner headings. One
  variable file covers all of them, so this costs no extra download.
- Assistant is under the SIL Open Font License (free, may be bundled).

**Alternatives considered**: `next/font/local` with the woff2 files committed (no build-time
download; rejected for consistency with today's setup, which works in CI and on Render; it stays
the fallback if Google's font service is ever unreachable at build time). Keeping Heebo for
headings (rejected: decision 2 says Assistant for all text).

## D3. Home photos: where they live and how phones get small files (FR-011, FR-013, FR-014, SC-005)

**Decision**:

- **Originals** (the owner's three 2000×848 JPEGs) are committed in `assets/home-photos/`
  (`hero-workshop.jpg`, `banner-child-play.jpg`, `banner-shelf.jpg`). This folder is not served to
  visitors; it is the source the maintainer edits.
- **Settings in code**: `src/lib/home-photos/config.ts` lists each photo: its source file, the
  main subject's horizontal position (the "focal point": hero 30 %, child 58 %, shelf 50 %), the
  translation keys for its alt text, and the literal Tailwind classes for its wide-screen crop
  (literal strings, so Tailwind sees them; no `style` attribute, CSP).
- **Variants** are made by a script, `scripts/build-home-photos.ts` (`pnpm photos:home`), with
  `sharp` (already a dependency): for each photo
  - two **phone crops**, portrait 2:3, cut around the focal point at the full height of the
    original: 400×600 and 565×848 (the original is only 848 pixels tall, so this is the sharpest
    a phone can get);
  - four **wide** versions of the whole photo: 800, 1200, 1600 and 2000 pixels wide.
  - All WebP, all metadata stripped (sharp's default; checked by the same code as
    `pnpm check:image-metadata`). Quality is tuned so the 565-wide phone hero is at most 190 KB
    (SC-005 says under 200 KB; 10 KB margin).
  - Output goes to `public/site-photos/` with a short content fingerprint in each file name
    (`hero-workshop-p565.3f9a1c2e.webp`); the script first empties that folder, so no stale file
    is left. It also writes `src/lib/home-photos/manifest.json` (file names, widths, heights),
    which the page imports. Running the script twice on the same originals gives the same files.
  - The generated files are committed, so building the shop never runs the script.
- **Serving**: the files are plain static files of the Next.js server. Because every name carries
  its fingerprint, `next.config.ts` sends `Cache-Control: public, max-age=31536000, immutable` for
  `/site-photos/:path*`: a returning phone never downloads them again, and a replaced photo gets a
  new name. The proxy already skips paths with a file extension, and `img-src 'self'` already
  allows them.
- **Markup** (`shop/HomePhoto`, server): a `<picture>` with
  `<source media="(min-width: 640px)" srcset="…800w, …1200w, …1600w, …2000w" sizes="100vw">`
  and an `<img>` carrying the phone crops (`srcset="…400w, …565w" sizes="100vw"`), `width`,
  `height`, `alt`, `decoding="async"`. The phone never sees the wide `<source>`, so it never
  downloads a wide file. The hero image is `loading="eager"` and `fetchpriority="high"` (it is
  the page's largest element); the banners are `loading="lazy"`.
- **Changing a photo** (FR-013): replace the JPEG in `assets/home-photos/`, adjust the focal point
  in `config.ts` if needed, run `pnpm photos:home`, commit. Texts are in the translation files.
  This is written in the maintainer section of `docs/design/storefront.md` §6.

**Rationale**: zero extra JavaScript, no new service, phones get a file about a quarter the size
of the original, and the files are cached for a year.

**Alternatives considered**: `next/image` (banned by §2: it needs its own image endpoint and
`style` attributes); generating variants during `next build` (slower builds and the file names
would not be known to the code until build time); one wide image for every screen (a phone would
download a 2000-pixel file and crop away two thirds of it); AVIF in addition to WebP (smaller, but
doubles the files for little gain at this size; can be added later).

## D4. Readable text over photos (spec edge case "Text over photos", FR-001)

**Decision**: guarantee AA contrast whatever the photo shows and however long the text is,
without measuring the photos. The dark layer (scrim) is attached to the text, not to fixed areas
of the photo:

1. **Text bands.** In each photo section the photo fills the section from behind, and the text
   sits in full-width **bands** that carry their own scrim: the hero has a top band (the space
   under the header plus the line) and a bottom band (the shop name); a banner has one band
   (bottom on phones; the reading-start half from 640 px, right in Hebrew and left in English).
   Each band is as tall as its text, so a longer shop name or a line that wraps to three lines
   makes the band taller and the dark layer grows with it. Outside the bands, a 48 px feathered
   edge fades the scrim out, and the rest of the photo stays light.
2. **Strength.** White on the brightest possible pixel (pure white) under black of alpha _a_:
   - `--scrim-large: 0.42` → 3.0:1, enough for **large text** (at least 24 px regular or 19 px
     bold) and icons. Used behind the hero line (24 px, line height 1.3), the shop name, the
     banner headings and lines (24 px).
   - `--scrim-text: 0.55` → 4.6:1, enough for **normal text**. Used for the strip of the hero
     behind the transparent header (its first `var(--header-h)`), because the header holds
     small text: 15 px category links, the 13 px language pill. (Review round 1, C1.)
     Both values live in `globals.css`; the token test (D1) recomputes both contrasts.
3. Section heights are minimums (`min-h-[…]`), so long text grows the section instead of
   overflowing it. Explicit line heights: hero line 1.3, shop name 0.95, banner line 1.35.
4. An E2E check (`tests/e2e/home.spec.ts`), at 320, 375 and 1280 px in both languages and also
   with a 60-character shop name, checks that every text element over a photo lies inside a band
   element whose class is a scrim class, and that the header's bottom edge lies inside the hero's
   `--scrim-text` strip at the top of the page.
5. A soft text shadow is added for comfort, but is not counted.
6. Focus ring: inside photo sections it is `on-photo` (white); in the header it is
   `currentColor`, so it follows the header's own colour (white over the photo, `ink` on the
   white bar).

**Rationale**: automated accessibility tools cannot measure text on photos (axe reports it as
"incomplete", not as a failure); bands that grow with the text keep the guarantee true for any
photo, any shop name and any wording.

**Alternatives considered**: fixed percentage zones (fail when text wraps further than planned;
review round 1, W1); a pixel check of each photo under each text box (fragile: the crop changes
with the screen width); a full flat dark layer (dulls the photos more than needed).

## D5. Header over the hero with no JavaScript (owner decision 3, FR-008, FR-009)

**Amendment 2026-11-17 (T088, owner clarification; the text below is the history).** The header is
see-through only at scroll 0 and fades in time (about 250 ms, a CSS `transition`) to the frosted
white bar from 1 px of scroll, and back. CSS alone cannot start a time transition from the scroll
position in every browser (Safari), so one tiny client island, `HeaderScrollState`, toggles
`data-at-top` on `#site-header` from a passive `scroll` listener; the server renders the attribute,
so a page loaded at the top has no flash. Without JavaScript the attribute is never removed, so `@media (scripting: none)` makes the header
the frosted white bar at every scroll position (readable, covers the photo's top `--header-h`; browsers without the `scripting` feature, before Chrome 120, Firefox 113 and Safari 17, keep the see-through look there). A page
opened part-way down (reload, fragment link, restored scroll) shows white text over content until the
island hydrates and fades it (the CSP forbids an inline script that could correct it earlier;
accepted). The scroll-driven animations are gone, so Firefox and
Safari before 26 get the same behaviour as Chrome. Reduced motion: `transition: none`, the same end
states. Forced colours: no transparency, blur or transition. The amendment overrides "zero new
JavaScript", "How" and "Fallback" below.

**Decision**: CSS only; zero new JavaScript.

- The header is one sticky white bar on every page (`site-header`, 64 px tall, 72 px from
  900 px; heights in one custom property `--header-h`). The free-shipping strip stays above it and
  scrolls away as today.
- On the home page the hero section carries `data-hero` and is pulled up under the header by
  `--header-h` (negative top margin), so the photo starts right under the strip.
- **Behaviour (owner answer 2026-11-16)**: on the home page the header is see-through (white
  text and icons over the photo's dark top strip) only while the page is scrolled all the way to
  the top; as soon as the visitor scrolls down it is the plain white bar (white background, `ink`
  text, 1 px `line` bottom border). The same for every visitor. Because the header is see-through
  only at the very top, its small text always sits over the hero's `--scrim-text` strip, so it is
  readable (review round 2, C2).
- **How**, where the browser supports **scroll-driven animations** (Chrome, Edge, Samsung
  Internet and Safari 26+): the header gets a one-step animation tied to the page's own scroll
  position: `animation: header-solid steps(1, jump-end) both; animation-timeline: scroll(root);
animation-range: 0px 1px;` with keyframes from "see-through" to "white bar". At scroll 0 the
  header shows the first keyframe (see-through); from 1 px on, the last (white). The resting style,
  without the animation, is the white bar. All of it sits inside
  `@supports (animation-timeline: scroll())` and `body:has([data-hero])`, so other pages never
  see it. No view timeline or timeline scope is needed.
- **Fallback (accepted by the owner for now)**: in browsers without that support (Firefox; Safari
  before 26) the header stays the plain white bar and covers the top 64 px of the photo. Readable,
  no layout shift, nothing breaks.
- **Reduced motion**: the switch is instant (a one-step change, no fade or movement), so it is
  the same for every visitor (owner answer). The global reduced-motion rule
  (`animation: none !important`) excludes `#site-header`; `transition: none` still applies to
  everything.
- The cart badge, menu, search and language switch are unchanged islands and behave as today
  (FR-009). Their colours follow `currentColor`, so they turn white over the photo. The compact
  language pill's border becomes `currentColor` too.
- Phones: menu and search at the reading start, shop name centred, language pill and cart at the
  reading end. From 900 px: "All pieces" and up to 4 category links at the reading start (D19),
  with the menu button before them when there are more than 4 categories; shop name centred; language pill, search and cart
  at the reading end (FR-008). A three-column grid (`1fr auto 1fr`) keeps the name truly
  centred; when space is short the name truncates with an ellipsis, as today. The menu sheet now
  opens at the reading-start side, under the menu button.

**Rationale**: the owner asked for as little JavaScript as possible; this adds none, and the
fallback is the same white bar every other page has. A JavaScript watcher would also be wrong
during the first seconds on a slow phone (before the page's JavaScript has started), leaving
white text on a white page if the visitor scrolls quickly; the CSS version has no such window.

**Alternatives considered**: a tiny island with an `IntersectionObserver` (about 1 KB; rejected
for the hydration window above; kept as the fallback plan if the CSS approach misbehaves in
testing); two headers (one inside the photo, one sticky; duplicate landmarks and test ids);
never putting the header over the photo (does not meet decision 3).

## D6. Full-width sections inside the page frame (FR-010)

**Decision**: `<main>` today is limited to 1240 px with side padding. It keeps that by default,
and drops it when its page root carries `data-full-bleed`
(`has-[>[data-full-bleed]]:max-w-none has-[>[data-full-bleed]]:px-0`). Only the home page sets
it; its non-photo sections (the row, band) put their content back in the 1240 px container. The
footer's mint background is already full width.

**Alternatives considered**: a container wrapper on every page (touches all pages);
`100vw` break-outs (cause sideways scrolling where scrollbars take space).

## D7. Square product photos (owner decision 5, FR-015)

**Decision**: display only; stored photos and their 4:5 variants are unchanged.

- Every product photo box becomes `aspect-square`, `rounded-none`, no border, `bg-photo`, with
  `object-cover object-center` (centred square crop). Places: cards; gallery main photos;
  thumbnails (72×72 instead of 72×90); "You may also like" (it uses the cards); cart lines
  (72×72); order-summary lines at checkout (48×48). The admin order page's item photos stay as
  they are (admin is colours and font only, decision 9).
- `<img>` keeps its real `width`/`height` (800×1000 etc.), so the layout reserves space and
  nothing shifts while loading; the square box comes from CSS.
- The zoom dialog keeps `object-contain`, so the whole photo is shown (FR-015).
- The existing `sizes` values stay correct (the boxes have the same widths as before).
- Open Graph images stay 4:5 (WhatsApp previews are unaffected).

## D8. "You may also like" (FR-019)

**Decision**: a new query `listAlsoLike(productId, categoryIds: string[], limit = 4)` in
`src/server/catalog/public-queries.ts` replaces `listRelatedProducts` (its only caller is the
product page). `categoryIds` are the product's categories without the home-row category (D17),
because every piece is in "Featured" and sharing it says nothing:

1. If `categoryIds` is not empty: up to 4 other published products linked to any of them, newest
   first (`published_at` desc, then `created_at` desc, then `id`, the existing order), each once.
2. If that gave fewer than 4: fill with the newest other published products, excluding the
   product itself and those already chosen.
3. A product with no other category gets the 4 newest other published products.
4. None at all: the section is not rendered.

Heading "אולי תאהבו גם" / "You may also like" (h2), list label "יצירות נוספות" / existing
`relatedLabel`. Same cards and grid as the catalog (2 columns, 3 from 640 px, 4 from 900 px),
images `lazy`. Covered by integration tests on the query (all four cases).

## D9. Social links in Settings and the footer (owner decision 8, FR-024–FR-026, US3)

**Decision**:

- **Data**: three nullable text columns on `shop_settings`: `social_facebook_url`,
  `social_instagram_url`, `social_tiktok_url`, each with a database check (`NULL` or starting
  with `https://` and at most 300 characters) as a second line of defence. Migration
  `0005_social_links.sql` (generated by drizzle-kit). Empty by default; nothing to seed.
- **Validation** (shared Zod schema in `src/lib/validation/settings.ts`, run on the server in
  `updateSettings`), per field:
  1. Trim. Empty means "no link" (stored as `NULL`); this is how Aviva removes one.
  2. If the text has no `://`, add `https://` in front (Aviva often copies "instagram.com/…"
     without it).
  3. It must be a valid web address, use `https`, and have no user name, password or port.
  4. Its site must be the platform's own: the host equals `facebook.com` / `instagram.com` /
     `tiktok.com` or ends with `.` plus that name (so `www.` and `m.` work, and
     `facebook.com.example.net` or `notinstagram.com` do not).
  5. It must point to a page (a path other than `/`).
  6. At most 300 characters. The stored value is the normalised address.
     Each failure has its own plain Hebrew message naming the field and the fix
     ([contracts/social-links.md](contracts/social-links.md)).
- **Admin form**: a new section "הרשתות החברתיות שלי" in `SettingsManager.tsx`, after "Business
  details", same `Section`/`FormField` primitives as the other sections, three left-to-right
  fields with `inputmode="url"`, a one-line hint with an example, and its own "שמירה" button. Saving
  writes the existing `settings.updated` activity row (the addresses are not logged).
- **Footer**: under the business details, one 44×44 round icon link per saved address, in the
  order Instagram, Facebook, TikTok; no list at all when none is saved. Accessible names
  "האינסטגרם שלי" / "My Instagram" etc. Icons are new authored SVGs in `ui/Icon`
  (`instagram`, `facebook`, `tiktok`; simple outlines in the icon set's style). Plain links in the
  same tab: no script, widget or embed, and nothing is requested from the platforms until a click
  (FR-026). The site's existing `Referrer-Policy: strict-origin-when-cross-origin` sends them only
  the shop's address on a click.

**Rationale**: the platform-domain rule is what keeps the footer from ever linking somewhere
unexpected (spec edge case), and the `https` rule also blocks `javascript:` and similar tricks.

**Alternatives considered**: a free list of any links (more to validate, not asked for); opening
in a new tab (needs an extra "opens in a new tab" note for screen readers, no benefit here).

## D10. Admin area: colours and font only (owner decision 9, FR-027)

**Decision**: the admin gets the new tokens and Assistant through the same `globals.css` and
`fonts.ts`. Admin files change only where they name a removed token; each such class is swapped
for its new token (mapping table in [plan.md](plan.md#token-mapping)). No layout, text or flow
changes, apart from the new Settings section (D9). Admin page background becomes `photo` (pale
grey-green), so the white cards with their `line` outline still stand out as they do today. The
cream comes from the `body` rule in `globals.css`, not from an admin class, so this is done by
adding `bg-photo` to the `<body>` of `src/app/admin/layout.tsx` (it also covers the sign-in
page); the Markdown preview in `MarkdownEditor.tsx` (`bg-ground` today) becomes `bg-paper` with a
1 px `line` outline.
Status and payment badges: "New" and "Paid" use `sage` fill, the rest as today with the new
tokens. Statistics chart: bars `forest`, today's bar `sage` with a 1.5 px `forest` outline.

## D11. Look of the shared parts (FR-016, FR-018, FR-020–FR-023)

**Decision** (written into §3 and §7 of `storefront.md`; numbers follow the approved example):

- **Type scale** (Assistant): hero shop name `clamp(56px, 12vw, 128px)`, line height 0.95;
  page titles 32 px → 44 px from 900 px, weight 700; product title 30 → 36 px, 700; section
  titles 28 → 40 px, 700; banner headings `clamp(40px, 6.4vw, 76px)`, 800; band sentence
  `clamp(28px, 4.4vw, 52px)` weight 300; hero shop name weight 300 (owner answer Q2); card name 19 → 22 px, 400; card price 14 px `ink-2`; body
  16/1.6; inputs 16 px.
- **Radius**: photos 0; panels, notices and dialogs 12 px (`rounded-card`); inputs 8 px
  (`rounded-chip`); buttons, chips, quantity box, badges pill (`rounded-pill`). Footer has no
  rounded corners.
- **Shadow**: the header has none. `shadow-float` stays only for the menu sheet, the consent
  sheet and dialogs, re-tinted to green-black.
- **Panels**: on a white page, panels (cart summary, checkout sections, contact form, order
  page) are white with a 1 px `line` outline instead of white on cream. The product page has no
  panel: details sit directly on the page (as in the Shopify shop).
- **Buttons** (FR-022): `primary` = `forest` fill, `paper` text, 600, pill, 52 px; one per screen
  (add to cart, continue to checkout, place order, send). `secondary` keeps its meaning and its
  callers (the outlined button: transparent, 1.5 px `ink` border, `ink` text, 48 px, hover
  `photo`), so no caller changes (consent choices, "pay another way", dialogs, admin). New
  variant `soft` = `sage` fill, `ink` text, 48 px, hover `sage-hover`, for the banner buttons and
  the empty-state actions on photos. `quiet` = text link. All at least 44 px tall. (Review round
  1, W3: renaming `secondary` would have changed about 23 callers.)
- **Chips** (category and sort): pill, 44 px, 1 px `ink-2` border; current = `sage` fill, 1.5 px
  `ink` border, bold, `aria-current`.
- **Quantity box**: outlined pill, 1 px `ink-2` border, 52 px (40 px in cart lines, 44 px hit
  areas kept), FR-018.
- **Product page** (FR-017, FR-018): gallery at the reading start (wider column), details at the
  reading end, sticky from 900 px; same order of items as today; the facts icons turn `forest`.
- **Free-shipping strip**: `forest` with `paper` text (FR-007); text and rules unchanged.
- **Footer** (FR-023): `mint`, `ink` text, three columns from 900 px as today, social links under
  the business details, a thin rule above the bottom row (language switch, copyright).
- **Card hover**: the existing photo zoom 1.03 (off with reduced motion).

## D12. Home page structure and texts (owner decision 4, FR-010, FR-012)

**Decision**: `src/app/[locale]/(shop)/page.tsx` renders, in order: hero (photo, line, shop name
as the page's only h1), the home row (the home-row category's pieces, swipeable, D18; left out
when empty), then the child banner, the peach band (the sentence and a "shop now" text link with
the directional `arrow` icon; `data-testid="home-band-link"`) and the shelf banner, as in the
Shopify shop (owner answers), then the footer from the layout. Banner buttons are `soft` (sage)
links. The banner buttons, the band link and the row's "view all" link all lead to the new "All
pieces" page `/{locale}/shop` (D19), which replaces the earlier `#pieces` target and its
`fragment` props (no longer needed: sorting happens on a page without a hero). All texts live in
`src/i18n/messages/{he,en}.json` under `shop.home`; drafts are the spec's table plus the row's link and
arrow names and the alt texts (listed in [contracts/ui.md](contracts/ui.md)) for owner approval
(FR-012) before the Phase D gate.

## D13. Performance (FR-014, SC-004, SC-005)

**Decision**:

- One new island: `RowArrows` (D18), a few hundred bytes. The header change is CSS (D5), photos
  are HTML (D3), the row itself, social links and "You may also like" are server-rendered. The 150 KB (checkout 155 KB; product page 152 KB, 157 KB with the drawer open, owner answer 2026-11-17) budgets and the existing
  `bundle-size.spec.ts` stay as they are.
- Home page: the hero is the largest element, so it alone gets `fetchpriority="high"`; product
  cards in the home row are all `lazy` (they are below the hero). Category and search pages
  keep "first 4 eager". `ProductGrid` gets an `eager` count prop for this.
- Fonts: one variable Assistant file per subset instead of Heebo's files.
- SC-005 is checked twice: a unit test on the committed files (every phone variant of the hero
  ≤ 190 KB), and an E2E test on the phone projects that reads the hero's downloaded size from the
  browser's resource timing and checks it is a phone variant under 200 KB.
- "Usable within 3 seconds on mobile 4G" (SC-004) is measured as in 006: on the deployed site
  with a throttled phone profile, written in the walk-through record.

## D14. Tests and visual checks that change (SC-002, SC-003, SC-006)

**Decision**:

- **Changed E2E specs**:
  - `storefront-layout.spec.ts`: the brand locator becomes the `header-brand` test id (the brand is
    no longer the header's first link); new checks: product photo boxes are square on cards,
    gallery, thumbnails, cart and checkout lines; header and home controls (banner buttons, social
    links) are at least 44×44; 320/375 px no-sideways-scroll list gains the home page with the
    hero and a product with "You may also like"; the existing srcset/sizes/width/height check now
    also sees the hero and banner `<img>`.
  - `language.spec.ts`: header order and menu tests follow the new positions (menu at the reading
    start); no behaviour change.
  - `a11y.spec.ts`: same screens, plus the home page with social links saved and the admin
    Settings page with the new section, at 375 and 1280 px, both languages.
  - `admin-settings.spec.ts`: new test "social links: save one, footer shows exactly that icon;
    a wrong site shows the Hebrew error and saves nothing; clearing removes it".
  - `design-review.spec.ts`: adds the home page (hero, banners, band, footer) at 375/768/1280
    in both languages, the header after scrolling, a product with "You may also like", and the
    admin Settings page; the reference becomes the approved home example and the new §§.
  - `catalog.spec.ts`: the list, sort and category-chip tests move from `/he` to `/he/shop` (the
    "All" chip is current there and on no other page); product page shows "You may also like"
    with the expected cards; omitted when the shop has one product.
  - `language.spec.ts`: tests that start at `/he` to reach a category or sort link start at
    `/he/shop`.
  - `admin-products.spec.ts`: the piece editor's category checkboxes replace the dropdown
    (locators change, no assertion weakened); a piece ticked in two categories shows on both
    category pages; the "missing category" publish message still appears with none ticked.
  - `headers.spec.ts`: `/site-photos/…` answers with the long cache header and `nosniff`; the
    CSP is unchanged.
  - `privacy.spec.ts`: the "loads nothing from another origin" test keeps passing unchanged (it
    proves the font and icons are self-hosted); the footer test also checks that no social link
    shows by default.
- **New E2E spec** `tests/e2e/home.spec.ts` (added to `STOREFRONT_SPECS` in
  `playwright.config.ts`, so it also runs on `webkit-mobile`; no new project, so no CI matrix
  change): section order, banner buttons, band link and "view all" lead to `/{locale}/shop`, the
  home row (D18: cards from the home-row category only, swipe/scroll, arrows from 900 px, disabled
  at the ends, instant under reduced motion, RTL direction, no page sideways scroll), alt texts in both languages, the phone
  hero is a phone variant under 200 KB, text inside the scrim zones (D4), and the header state
  (transparent over the hero at scroll 0, plain white bar as soon as the page is scrolled, the
  same with reduced motion) on the Chromium
  projects; on WebKit the test accepts either state at the top (support differs by version) but
  always requires the white bar after scrolling.
- **Unit**: `design-tokens.test.ts` (D1, D4), `social-links.test.ts` (every validation rule),
  `home-photos.test.ts` (manifest files exist with the right sizes, phone hero ≤ 190 KB, no
  metadata). `i18n-parity.test.ts` covers the new keys automatically.
- **Integration**: `public-queries.test.ts` (the "You may also like" cases with several
  categories and the home category ignored; category pages through `product_category`; `limit`;
  `getHomeRow` unset / empty / drafts excluded / 12 max; `mainCategory`), `catalog-products.test.ts`
  (save several categories, replace, unknown id rejected, publish needs one), a migration test
  (`0004` on a database with pieces: each keeps its category, all are in `featured`, the setting
  points to it, an existing `featured` slug is reused)
  `settings.test.ts` (save, clear, reject social links; home category set, cleared, unknown id
  rejected), `schema.test.ts` (new checks and foreign keys).
- Unchanged and expected to pass as they are: cart, checkout, order tracking, contact, consent,
  admin flows, bundle size (SC-002).

## D15. Documents (FR-028–FR-030)

**Decision**:

- `docs/design/storefront.md`: rewritten in place, keeping its section numbers so existing
  references stay valid: header note "Amended 2026-11-16 by 007"; §1 brief (selected direction:
  the Shopify-like look; proof and honesty rule amended); §2 fonts row (Assistant); §3 tokens,
  type, radius, shadow, scrims; §4 page frame (strip, plain header, full-bleed home); §5 new
  icons; §6 square display and the home-photo table plus "changing a photo"; §7 component
  updates (Button, Chip, Notice `made`, Header, Footer with social links, ProductCard, Gallery,
  CartLine, OrderSummary, LanguageSwitch, strip) and new components (HomePhoto, PhotoBanner,
  StatementBand, SocialLinks); §8.1 home and §8.4 product page rewritten, other screens noted;
  §10 performance; §11 verification (new checks); §12 admin colours and §12.10 social section;
  §13 deviations from the approved home example; visual authority becomes the approved home
  example (committed as `docs/design/home-example.src.html`, with its embedded photos replaced by
  relative links to `assets/home-photos/`), the old product sample is kept and marked
  "superseded 2026-11-16".
- **Amended honesty rule** (in §1 "Outcome and proof" and §1 "Voice"): "Product photos are
  Aviva's own photos of the work. The only other photos are the three lifestyle images the owner
  supplied for the home page (AI-generated from Aviva's real pieces and her real look, approved
  by the owner on 2026-11-16). No other invented photos, and never reviews, badges, counters,
  urgency or invented social proof."
- `PRODUCT.md`: Brand Commitments "Storefront look" → the Shopify-like direction of 2026-11-16
  (white, dark green, sage, peach, mint, Assistant); Evidence on Hand gains the three
  owner-supplied AI-generated lifestyle images, and "photos of Aviva or her workspace" in the
  "never fabricate" list is narrowed to "any other photos of Aviva or her workspace"; principle 5
  gains "the owner-supplied lifestyle images on the home page are the one allowed exception to
  'never invent'".
- `docs/owner-guide-he.md`: short sections on adding or removing social links and on the home
  page row (tick "מומלצות" on a piece; change the row's category in Settings).
- `docs/security/threat-model.md`: one row for the owner-controlled outbound links (D9 rules).
- `docs/roadmap.md`: status of item 007 at the end of the feature.
- `CLAUDE.md`: "Where things are" gains `assets/home-photos/` and `pnpm photos:home`.

## D16. Owner answers at the plan gate (2026-11-16)

Recorded in the spec ("Owner answers at the plan gate"):

- **Q1 — Order of the lower home page**: as in the Shopify shop: child banner, peach band with a
  "shop now" text link with an arrow (to the "All pieces" page), shelf banner.
- **Products section** (second round): a swipeable row as in the Shopify shop (D18), filled from a
  category ("Featured", D17); the category and sort buttons and the full list move to a new "All pieces"
  page (D19).
- **Home row source** (third round): categories, not collections; a piece may be in several;
  "Featured" created at release with every existing piece and chosen for the row; an ordinary
  category (D17). "Continue shopping" links lead to the "All pieces" page (FR-038).
- **Reduced motion** (second round): respected for real movement (card photo zoom, the row's
  sliding); the header's instant switch stays the same for everyone.
- **Q2 — Shop name on the hero and the band sentence**: thin (weight 300), as in the Shopify
  shop. Banner headings stay bold (800), as in the approved example.
- **Q3 — Older browsers**: the plain white bar there is accepted for now.
- **Q4/Q7 — Header**: see-through only at the very top of the home page, white as soon as the
  visitor scrolls down, the same for everyone (D5).
- **Q5 — Darker strip behind the header** (55 %): accepted; judged on the finished page.
- **Q6 — AI photos**: no marking.
- **Texts**: the drafts are fine for now; reviewed again when the implementation is done.
- **Note (no decision needed)**: the original photos are 848 pixels tall, so on phones with very
  sharp screens they look slightly soft. If the owner has taller versions, swapping them in is the
  "changing a photo" step.

## D17. Several categories per piece and the home-row category (owner answers, FR-031–FR-032, FR-034–FR-037)

**Decision**: a join table `product_category` replaces `product.category_id`, so a piece can be in
several categories (owner: "Allow several"). The home row shows the category named by
`shop_settings.home_category_id`. The migration copies each piece's current category into the
join table, creates (or reuses) the category `featured` ("מומלצות" / "Featured") as the last
category, links every existing piece to it, and points the setting at it (data-model.md §5). The
piece editor's dropdown becomes checkboxes; the Settings screen gets one select. "Featured" is an
ordinary category everywhere (owner: "like any category"). Where one category must be named
(breadcrumb, structured data), the first non-home category in the shop's
order is used (FR-037).

**Why**: the owner chose categories over a separate collections list (one place to manage
groups) and several categories per piece, so putting every piece in "Featured" does not empty the
other categories. A setting rather than a fixed slug lets Aviva rename "Featured" or pick another
category, and lets a later feature add more rows, each naming a category.

**Alternatives considered**: a separate collections table (the previous plan; the owner replaced
it); one category per piece with every piece moved to "Featured" (empties the other categories);
keeping `product.category_id` as a "main category" plus extra categories (two concepts for Aviva
to understand); a fixed `featured` slug in code (breaks when renamed).

## D18. The swipeable row (owner answer, FR-035–FR-036)

**Decision**: CSS scroll snap for the row itself (a horizontal `overflow-x: auto` list with
`scroll-snap-type: x mandatory`; cards sized so 2 and a peek show on phones, 4 from 900 px), so it
swipes and scrolls without JavaScript and the page never scrolls sideways. A tiny client
component `RowArrows` adds previous / next buttons from 900 px (`scrollBy` by the visible width;
`behavior: 'auto'` under reduced motion; disabled at the ends; hidden when nothing overflows;
reversed in RTL where `scrollLeft` is negative). No autoplay, no carousel library. The track has
`scrollbar-width: none` and `::-webkit-scrollbar { display: none }` (the peek and the arrows show
there is more). Keyboard users tab through the card links and the browser scrolls each into view.

**Alternatives considered**: a carousel library (adds tens of KB and inline styles the CSP
forbids); CSS-only arrows with `::scroll-button()` (Chromium only so far); autoplay (never: it
moves by itself, against the reduced-motion rule and the owner's calm look).

## D19. The "All pieces" page (owner answer, FR-033)

**Decision**: a new route `/{locale}/shop` (`src/app/[locale]/(shop)/shop/page.tsx`) takes over the
current home page's catalog content unchanged: intro line, category chips (with "All" current),
sort links, grid, empty state, plus an h1 "כל היצירות" / "All pieces". The "All" chip on every
page points here. The header gains an "All pieces" link first (desktop links and the phone menu);
`HEADER_CATEGORY_LIMIT` drops to 4 so the desktop header keeps at most five links. Sitemap and
language versions include `/shop`. The address `shop` is short and the same in both languages,
like the existing `/c/`, `/p/` and `/search`.

**Alternatives considered**: `/c/all` (would look like a category and clash with a category slug
`all`); keeping the full grid under the row on the home page (the owner asked to move the filters
away from the home page).

## D20. Header redesign from the Phase D gate (owner answers 2026-11-16; FR-008, FR-039–FR-043)

**Decision**: replace the three-column centred header (D5's layout part) with the owner's one-row
order from **1024 px**, and the hamburger layout below 1024 px. D5's CSS-only switch over the hero
stays as it is.

- **Breakpoint**: a new Tailwind breakpoint `nav` = 64rem (1024 px) in `globals.css`
  (`--breakpoint-nav: 64rem`), used only by the header and the menu sheet. The other breakpoints
  (`sm` 640, `lg` 900, `xl` 1240) are unchanged; `--header-h` stays 64 / 72 px (from 900 px).
- **From 1024 px** (one row, reading order, logical properties so Hebrew runs right to left):
  `nav` (links; accessible name `common.menuNav` "תפריט האתר" / "Site menu", safe because the
  menu sheet that uses the same name is hidden from 1024 px; not "קטגוריות", which
  `catalog.spec.ts` uses for the "All pieces" page's own chips) · brand · search field · cart.
  The links "All pieces", "About" and "Shipping & Returns" (and in the sheet "Contact" and the
  language link) always render, also in a shop with no published piece; only the category entries
  depend on the data. Links: "All pieces", header category 1, header
  category 2, home-row category, "About" (`/{locale}/pages/about`), "Shipping & Returns"
  (`/{locale}/pages/shipping-returns`). Labels reuse the existing `common.nav.allPieces`,
  `common.nav.about` ("אודות") and `common.nav.shippingReturns` ("משלוחים והחזרות") keys, and
  `common.nav.contact` ("יצירת קשר") in the sheet (the menu sheet uses the same ones today; no new
  "About" key; the footer's own `common.footer.about` "עלינו" is unchanged). Gaps reduced (owner): 12 px between links, 16 px between the groups. The
  header's own side gutter is 16 px at every width (`px-4`), while `<main>` keeps 24 px from
  900 px, so from 900 px the header's edges sit 8 px further out than the page content; accepted,
  it buys the room the row needs. The brand keeps Assistant 700 at 22 px and is capped at 160 px
  wide with an ellipsis (a 60-character shop name truncates). Every item has `shrink-0` except the
  brand, so nothing is squeezed into another. On a browser with a classic 17 px scrollbar
  (Windows) the content is about 1007 px wide; the brand, the one shrinkable item, absorbs the
  difference, so nothing overlaps (headless tests hide scrollbars and cannot show this).
- **Below 1024 px**: grid `1fr minmax(0,auto) 1fr`: menu button | brand (centred, truncates) |
  cart. The menu sheet (native popover, reading-start side, under the header) holds, in order: the
  search field, "All pieces", every category with published pieces (as today), "About",
  "Shipping & Returns", "Contact", then the full-word language link (as today; owner answer). No
  search icon or language switch in the header bar at any width; the `HEADER_CATEGORY_LIMIT` /
  "menu on desktop" logic goes.
- **Width budget at 1024 px** (measured in the dev browser with Assistant 15 px / 400 for links
  and 22 px / 700 for the brand; widest of Hebrew and English per item): container 1024 − 2 × 16 =
  992 px. Fixed items: "All pieces" 59 + "About" 44 (its text is 38 px, but the link's `min-w-11`
  44 px target holds it at 44) + "Shipping & returns" 115 = 218; 5 gaps between the 6 links × 12 =
  60; brand cap 160; search field 176 (field plus its button); cart 44; 3 group gaps × 16 = 48.
  Total 706 px, leaving 286 px for the 3 category links, **95 px each**. Average glyph width is
  7.3 px (Hebrew) and 6.6 px (English), so an ordinary 12-character name takes about 80–88 px and
  fits. A name made only of wide letters (capitals like W or M, about 9–11 px each) can be wider
  than 95 px; it is cut with "…" (owner answer: rare and acceptable). Hence FR-040's limit of 12.
  Each category link is an `<a>` with the 44 px target and an inner `<span>` with
  `max-inline-size: 95px` (`max-w-[95px]`), `overflow: hidden`, `text-overflow: ellipsis`,
  `white-space: nowrap`; the focus ring sits on the `<a>`, outside the clipped span, so it is never
  hidden. The header test checks, at exactly 1024 px in both locales: three ordinary 12-character
  names (e.g. "סלסלות קטנות", "Small hearts") show in full; three 12-character names of wide
  letters ("WWWWWWWWWWWW", "שששששששששששש") keep the row inside the viewport with no overlap,
  and their spans have computed `text-overflow: ellipsis` and `overflow: hidden`.
- **Header categories** (FR-039): two new nullable columns `shop_settings.header_category_1_id`
  and `header_category_2_id` (FK `category.id`, `on delete set null`), migration `0006`; Settings
  "דף הבית" section gets two selects next to the home-row select. The public header list is
  [h1, h2, home] after removing nulls, categories without published pieces, and duplicates (first
  wins). No new query: the locale layout already loads `getSettings()` and
  `listCategoriesWithProducts()` on every request, so a pure function
  `pickHeaderCategories(settings, categoriesWithProducts)` (in
  `src/server/catalog/header-categories.ts`) builds the list from those two results.
- **Category name limit** (FR-040): `src/lib/validation/category.ts` `nameHe` and the optional
  `nameEn` max 80 → 12, on create and update alike. No existing category is longer (owner answer),
  so there is no special handling for older names and no data step. No database constraint (as
  today's 80 limit, validation only). The message must reach the field: today
  `src/server/catalog/categories.ts` passes every Zod issue through `zodFailure(…,
'admin.categories.errors.invalid')`, whose text says "up to 80 characters". The create and
  update actions instead map a `too_big` issue on `nameHe`/`nameEn` to the field error
  `admin.categories.errors.nameTooLong` ("השם ארוך מדי: עד 12 תווים, כדי שיתאים לתפריט"; en "The
  name is too long: up to 12 characters, so it fits the menu") and every other issue to `invalid`,
  whose text changes to "up to 12 characters" as well. The categories screen shows the field error
  under the name input (as it shows `invalid` today). Every `too_big` name issue is reported (both
  fields at once), each error under its own input (today `CategoriesManager.tsx` shows only the
  first field error, under the Hebrew input). In `optionalName` the length check runs after
  trimming, so a trailing space never trips it. The inputs carry `maxLength={12}`, so in the
  browser a 13th character cannot be typed; the server rule is tested by the integration tests and
  the E2E test checks the `maxlength` attribute. Seed and sample names already fit.
- **Language switch** (FR-041): `LanguageSwitch` (compact variant) moves into `AnnouncementBar`,
  at the inline-end side, white border and text on `forest`, 44 × 44 hit area, focus ring `paper`
  (the `ink` ring would not show on `forest`); the strip's text stays centred in the remaining
  space and may wrap to two lines at 320 px. Test ids and the accessible name stay. The footer's
  and the menu sheet's full-word switch stay. The strip is always rendered (`AnnouncementBar` no
  longer returns `null`): with text it shows the text centred and the switch at the inline end;
  with no text (no free-shipping amount and pickup off, or the zone off) it shows only the switch
  at the inline end. Owner answer: no other place for the switch. Height: the strip is at least
  44 px tall (`min-h-11`, block padding 4 px so wrapped text at 320 px still has room, was about
  36 px); the switch keeps its 36 px pill look inside a 44 × 44 hit box. Its focus ring uses a
  1 px offset (`focus-visible:outline-offset-1`) instead of the global 3 px, so the 3 px ring
  around the 36 px pill spans exactly the strip's 44 px and is neither cut off at the top of the
  page nor covered by the sticky header. Test id
  `announcement-bar`.
- **Search field** (FR-043): `HeaderSearch`, a plain `<form role="search" action="/{locale}/search"
method="get">` with its own `aria-label` (header: "חיפוש בחנות" / "Search the shop"; menu sheet:
  "חיפוש בתפריט" / "Search from the menu"; the search page's own form gets "חיפוש יצירות" /
  "Search pieces"), so the landmarks have distinct names. It holds a labelled
  `<input type="search" name="q" maxLength={MAX_QUERY_LENGTH}>` (80, from
  `src/server/catalog/search.ts`; visually hidden label "חיפוש" / "Search", placeholder the same)
  and a submit `IconButton` with the `search` icon; no JavaScript. Focus: the header's rule
  `#site-header :focus-visible { outline-color: currentColor }` would give the ink-coloured field
  an ink ring over the dark photo; `HeaderSearch` therefore draws its own ring, `forest` on the
  `paper` fill, visible in both header states (WCAG 2.4.7, 1.4.11). Mechanism (as built): that
  header rule is unlayered CSS, which beats every Tailwind utility, so the ring comes from
  unlayered rules in `globals.css` for every form carrying `data-header-search` (header and menu
  sheet): the inner controls draw no outline, and the round form gets a 2 px `forest` outline
  inset by 3 px while anything in it has keyboard focus (`:has(:focus-visible)`), so the ring
  follows the rounded corners; the focused submit button is marked in addition, so moving focus
  from the field to the button is visible; in browsers without `:has` the controls keep their
  default ring; under forced colours the form gets a real border. Look: 44 px tall (the WCAG
  target size used everywhere), `rounded-pill`, `paper` background (95 %) and 1 px `field` border
  in both header states, 16 px text (no zoom on iOS). Because the header sets `currentColor` to
  white over the photo, the input text, placeholder and button set their colours explicitly
  (`text-ink`, `placeholder:text-ink-2`, button `text-ink`) instead of inheriting. Test ids
  `header-search` (form) and `header-search-input`; in the menu sheet `menu-search` and
  `menu-search-input`.
- **Blended strip** (FR-042): the hero's top band (`.scrim-band-top`) no longer holds text (the
  tagline is removed, FR-010) and becomes only the strip behind the header. Its element gets a
  fixed block size `calc(var(--header-h) + 140px)` with no padding (the inner text container
  goes), its base `.scrim-band` background (0.42) is replaced, and the `.scrim-band-top::after`
  feather is removed, so the gradient alone ends at 0 at the element's bottom edge. One gradient
  from
  `rgb(0 0 0 / 0.62)` at the top, `--scrim-text` (0.55) at `var(--header-h)`, then easing to 0 at
  `calc(var(--header-h) + 140px)` through intermediate stops (0.40, 0.22, 0.08) so there is no
  visible edge. Header text sits entirely above `--header-h`, where the darkness is at least 0.55
  (4.76:1 for white on pure white behind it, D4); the token test keeps checking `--scrim-text`.
- **Hero line removed** (FR-010): `HomeHero` drops the `<p>`; `shop.catalog.intro` stays for the
  "All pieces" page.

**Rationale**: the owner's item list does not fit one row at 900 px (measured: about 28 px per
category); at 1024 px with reduced spacing it fits with ordinary 12-character names. Fixed widths
with `shrink-0` make overlap impossible by construction instead of relying on clipping, which
failed two review rounds (links squeezed under each other; focus hidden on clipped links). Only
the text inside a category link is clipped, never the link or its focus ring.

**Alternatives considered**: a two-row header from 900 px (offered; owner chose one row from
1024 px); clipping or scrolling the link strip (rejected after review: hidden focus, WCAG 2.4.7);
a shorter limit such as 10 characters so that even wide letters fit (rejected by the owner: 12
reads better and the "…" case is rare); a new database query for the header categories (not
needed, the layout already has both inputs).

## D21. Menu and cart drawers (owner answers 2026-11-17; FR-002, FR-008, FR-044–FR-048)

**Decision**: both drawers are native popovers (`popover="auto"`), as the menu sheet already is,
restyled as full-height side drawers with CSS transitions. No dialog JavaScript; the cart drawer's
contents are a client island (the cart already lives on the device), loaded on first open.

- **Shape**: `position: fixed; inset-block: var(--drawer-top, 0px) 0;` the menu drawer at
  `inset-inline-start: 0`, the cart drawer at `inset-inline-end: 0`; `inline-size: var(--drawer-w)`
  with `--drawer-w: min(24rem, calc(100vw - 3rem))` (a strip of page stays visible to tap). It
  starts at the header's top edge as it is on screen, never over the green strip (owner answer):
  the controller island (below) sets `--drawer-top` on `<html>` through the CSSOM
  (`style.setProperty`, allowed by the CSP, which blocks only `style` attributes in markup) from
  `#site-header.getBoundingClientRect().top` just before the drawer shows (on the invoker's click
  and before `showPopover()`), and the scroll lock keeps it valid while open. `::backdrop` uses
  the same `inset-block-start`, so the strip is not dimmed. Without JavaScript `--drawer-top` is
  0 (the drawer then covers the strip; acceptable, the cart needs JavaScript anyway). `paper` background, `ink` text. The drawer clips (`overflow: clip`) and is a flex column
  while open; the content scrolls in the inner `.drawer-scroll` (`overflow-y: auto`,
  `overscroll-behavior: contain`) below the head. Why: the close button counter-translates outside
  the drawer's box while it slides, and a scrolling drawer made WebKit scroll it sideways to the
  focused button. Wide screens: `html { scrollbar-gutter: stable }` so the scroll lock shifts
  nothing sideways; the gutter belongs to `<html>`, which the backdrop does not cover, so while a
  drawer is open `html` gets the backdrop's dim over `paper` as its background.
- **Motion**: `translate` from fully off-screen on its own side (the logical start or end: the
  sign flips with `:dir(rtl)`) to 0, 300 ms `cubic-bezier(0.32, 0.72, 0, 1)`; closing reverses it.
  Entry via `@starting-style`, exit via `transition-behavior: allow-discrete` on `display` and
  `overlay`. Browsers without `overlay` (Safari) close without the slide-out, which is fine.
  `::backdrop` fades from transparent to `rgb(0 0 0 / 0.4)` the same way. Reduced motion: the
  global `transition: none` rule makes both instant (FR-048).
- **Scroll lock**: `html:has(#site-menu:popover-open, #cart-drawer:popover-open) { overflow: hidden }`
  (CSS only). Light dismiss, `Esc`, and opening one drawer closes the other come from
  `popover="auto"`; focus return is handled by the controller (below), because the browser
  does not return focus after a light dismiss and would return it to an `inert` button.
- **Controller island `DrawerController`** (`src/components/shop/DrawerController.tsx`, rendered
  once in `src/app/[locale]/layout.tsx` after the header and the two drawers; it also owns the cart
  body's loading): (1) sets `--drawer-top` before a drawer opens (a capturing `click` listener on
  `[popovertarget]` invokers, and inside `openCartDrawer()`), and remembers the opener (the
  invoker, or the control that called `openCartDrawer(opener)`); (2) modal (owner answer): on the
  drawer's `beforetoggle` with `newState === 'open'` it sets `inert` on every top-level child
  of `<body>` other than the open drawer (generic, not a named list: the skip link,
  `ConsentSkipLink`, strip, header, `<main>`, footer, consent banner and anything added later; the
  other drawer is a child too, and a native popover that is not open is not focusable), and on `beforetoggle` with
  `newState === 'closed'` it removes `inert` (before the browser moves focus); on `toggle`
  (closed) it focuses the remembered opener if focus is on `<body>` or inside the closed drawer
  (covers light dismiss). Each drawer's first focus target has `autofocus`: the menu X, and in the
  cart drawer the close X (so "add to cart" moves focus into the drawer). Tab cannot reach the page
  behind (it is inert); as with a native modal dialog, Tab past the last control may leave to the
  browser's own UI, which is accepted. The menu drawer is a `<div role="dialog" aria-modal="true"
  aria-label={common.menuNav}>` wrapping the existing `<nav>` (a `dialog` role on `<nav>` is not
  allowed; the inner `<nav>` is unnamed so the name is not repeated); the cart drawer is a `<div role="dialog" aria-modal="true" aria-labelledby>` its
  heading; (3) closes any open drawer when the pathname changes (`usePathname`), and on a bubbling
  click on an `a[href]` inside an open drawer, whatever `defaultPrevented` says (Next's `Link`
  always prevents the default, and a link to the current page changes no pathname). Ignored for
  `button !== 0`, Meta/Ctrl/Shift/Alt held, a `target` other than `_self`, `download`, an `href`
  starting with `#` (the error summary's in-drawer links), and clicks a control marked with
  `keepDrawerOpen(event)` (`src/lib/cart/drawer.ts`, a `WeakSet<Event>`; the cart's blocked "to
  checkout" with flagged lines calls it next to `preventDefault()`). The pathname rule stays as the
  backstop for back/forward and `router.push`; (4) closes the menu drawer when
  the viewport reaches the `nav` breakpoint (`matchMedia('(min-width: 64rem)')`), so a rotated
  tablet is never left with a hidden menu, a scroll lock and an inert page; (5) loads the cart
  body (a plain dynamic `import('./CartDrawerBody')`, not `next/dynamic`, whose loader adds to every page's first load; rendered into the drawer through a
  portal or as the drawer shell's client child) on the first `beforetoggle` open of the cart
  drawer, and on mount when the cart drawer is already open (opened before hydration).
- **The green strip while a drawer is open**: visible and not dimmed, but inert like the rest of
  the page; a tap on it closes the drawer (light dismiss). Coordinator default, offered to the
  owner at the gate.
- **Hamburger to X (FR-045)**: the popover is in the top layer, so nothing in the header can sit
  above it. The X is therefore the drawer's own first element: a 44 × 44 button with
  `popovertarget="site-menu" popovertargetaction="hide"` and `autofocus` (focus moves into the
  drawer on open), positioned exactly where the menu button is: the drawer starts at the header's top
  edge, so the X uses the header's own inline padding (`px-4`) and is centred in the first
  `--header-h` of the drawer, landing on the same pixels at every scroll position. It draws
  three 2 px lines (spans, not the SVG icon) that start in the hamburger position and transition
  to an X (top and bottom lines move to the centre and turn ±45°, the middle line fades) when the
  drawer is `:popover-open`, via `@starting-style`. While the drawer slides, the button
  counter-translates by the same amount (`translate: calc(-1 * <drawer offset>)`, the same
  duration and easing), so it stays still on screen while its lines turn. The header's own menu
  button draws the same three lines, so the swap is invisible. Its name stays "תפריט"; the
  invoker's `aria-expanded` is native.
- **Cart drawer (FR-046)**: `#cart-drawer`, a server-rendered shell in the layout (heading "הסל
  שלי" / "My cart", the close X at the cart button's place, the same counter-translate trick, the
  X crossfading in) and a client island `CartDrawerBody` that wraps the existing cart logic. The
  old `CartView` is reworked into it (one column; lines with 72 × 72 photos; free-shipping note;
  subtotal; "to checkout" `LinkButton`; "continue shopping" closes the drawer; in the empty
  state the action button goes to `/{locale}/shop`, FR-038 amended). The close X sits at the
  cart button's place: the X uses the header row's own geometry (the row is centred in
  `max-w-[1240px]` with `px-4`), so in the drawer it sits `max(16px, (100vw - 1240px) / 2 + 16px)`
  from the reading-end edge; since the drawer is at most 24rem wide, above that width the X sits
  16 px from the drawer's reading-end edge inside the drawer, which is the viewport's edge (the
  cart button and the X then coincide only up to 1240 px; above it the X is at the drawer's corner,
  accepted). The island is
  loaded by `DrawerController` with a plain dynamic `import()` (not `next/dynamic`: its loader adds to every page's first load) on first open, so pages do not pay for it up front; the bundle-size limits
  stay as they are (budget: each page's first load stays under its existing limit with the drawer
  closed; the drawer chunk loaded on open is reported, and the product page's first load plus the
  drawer chunk stays under 157 KB; owner answer 2026-11-17, was 155 KB). The free-shipping amount: `src/app/[locale]/layout.tsx` reads
  the default zone (as the cart page did with `defaultZone()`; the strip already reads the zone)
  and passes `freeShippingOverMinor` to the drawer shell, which hands it to the body (one zone
  lookup per request, wrapped in `React.cache` and shared with `AnnouncementBar`, so no extra
  query); `priceCart`
  stays unchanged. Emptying the cart on `/checkout` with the drawer open: `CheckoutForm`'s
  empty-cart redirect waits until the cart drawer is closed (it checks
  `#cart-drawer:popover-open` and listens for the drawer's `toggle`), then goes to
  `/{locale}/shop`. `priceCart` moves from `src/app/[locale]/(shop)/cart/actions.ts` to
  `src/lib/cart/actions.ts` (`'use server'`), unchanged. The layout's client messages gain the
  `cart` namespace (HTML only, no JS).
- **Cart button**: `CartLink` becomes a button with `popovertarget="cart-drawer"` (name and badge
  unchanged, test id `cart-link` kept).
- **Opening from code (FR-047)**: one helper `openCartDrawer()` in `src/lib/cart/drawer.ts`
  (`document.getElementById('cart-drawer')?.showPopover()`, guarded). Used by `AddToCart` after a
  successful add, by the product page's "in your cart" control (now a button, test id
  `go-to-cart` kept), by checkout's "back to cart" (a button), and by `ReturnView`.
  `CheckoutForm`'s empty-cart redirect and `fake-pay/actions.ts`'s fallback go to
  `/{locale}/shop`.
- **Page removal (FR-048)**: delete `src/app/[locale]/(shop)/cart/page.tsx`; `/he/cart` then
  answers the normal not-found page. The analytics path parser keeps its `cart` kind for old data.
- **Test ids**: `site-menu` (drawer), `menu-close`, `cart-drawer`, `cart-close`,
  `cart-keep-shopping` ("continue shopping"); `cart-continue` stays on "to checkout" as today,
  and every existing cart line id stays inside the drawer. The menu's X is the drawer's first
  element; the search form is the first item after it (`storefront-layout.spec.ts:1007-1013`
  changes to "first item after the close button"). Locators that find the menu button by
  `popovertarget="site-menu"` now match two buttons and must target the header one
  (`#site-header [popovertarget="site-menu"]`), e.g. `design-review.spec.ts:331`.

**Alternatives considered**: `<dialog>` with `showModal()` (needs JavaScript to open; a popover
opens without it and gives light dismiss for free); keeping the header button above the drawer
(impossible over the top layer); CSS anchor positioning for the drawer's top (not in Firefox,
and a transformed drawer breaks it; the measured `--drawer-top` works everywhere; would need a non-top-layer drawer with z-index fights against the
sticky header); keeping `/cart` as a fallback page (owner chose to remove it).
