# Contract: storefront UI (US1, US2, FR-007–FR-023; the home row and "All pieces" page in [home-row.md](home-row.md))

The visible behaviour and the test hooks other code and tests rely on. Looks (sizes, colours) are
in `docs/design/storefront.md` once updated; decisions in [research.md](../research.md).

## Page frame (every public page)

```text
┌ free-shipping strip (forest, not sticky): text centred · language switch at reading end ┐
├ sticky header bar (id + data-testid "site-header"), 64 / 72 px ───────────────────────┤
│  < 1024 px:  menu button      shop name (centred)      cart                           │
│  ≥ 1024 px:  All pieces · cat 1 · cat 2 · home cat · About · Shipping & Returns ·      │
│              shop name · [search field] · cart        (one row, reading order)        │
├ <main id="main"> ─────────────────────────────────────────────────────────────────────┤
├ footer (mint) ────────────────────────────────────────────────────────────────────────┤
└ consent banner (only when consent is required) ───────────────────────────────────────┘
```

Amended at the Phase D gate (owner answers 2026-11-16, spec FR-008, FR-039–FR-043, research D20).

- `data-testid="header-brand"` on the brand link (home link, shop name from settings), at most
  160 px wide from 1024 px, truncated with an ellipsis.
- Existing test ids and accessible names stay: `cart-link`, `cart-badge`, the language switch
  (now inside the strip, `AnnouncementBar`), the header's menu button (`popovertarget="site-menu"`, targeted as
  `#site-header [popovertarget="site-menu"]` since the drawer's close button carries the same attribute).
- From 1024 px: `<nav aria-label>` = `common.menuNav` ("תפריט האתר" / "Site menu") with links in
  this order (labels `common.nav.allPieces`, `about` "אודות", `shippingReturns`; "All pieces",
  "About" and "Shipping & Returns" render even in an empty shop): "All pieces" (`/{locale}/shop`), header category
  1 and 2 (Settings), the home-row category, "About" (`/{locale}/pages/about`), "Shipping &
  Returns" (`/{locale}/pages/shipping-returns`); then the brand, the search form
  (`data-testid="header-search"`, input `header-search-input`, `role="search"`, `aria-label`
  "חיפוש בחנות" / "Search the shop", GET `/{locale}/search?q=`, input `maxLength` 80, 44 px tall),
  the cart. Each category name sits in an inner span at most 95 px wide with an ellipsis (computed
  `overflow: hidden`, `text-overflow: ellipsis`); the link itself and its focus ring are never
  clipped. No menu button from 1024 px.
- From 1024 px the brand is centred in the free space between the nav and the search form
  (`margin-inline: auto`; owner decision 2026-11-17). Below 1024 px it stays centred in the bar.
- Below 1024 px: menu button, brand, cart. The menu is a **drawer** (research D21, FR-044,
  FR-045): `<div id="site-menu" data-testid="site-menu" popover role="dialog" aria-modal="true"
  aria-label={common.menuNav}>` wrapping the `<nav>`, a native popover sliding in from the
  reading-start side (right in he, left in en) from the header's top edge on screen
  (`--drawer-top`; under the strip at scroll 0, 0 after the strip has scrolled away) to the
  viewport bottom, never covering the strip. Its first element is the close button
  (`data-testid="menu-close"`, name `common.menuClose` "סגירת התפריט" / "Close menu", 44 × 44,
  `popovertargetaction="hide"`, `autofocus`) on the same pixels as the header's menu button, whose
  three line spans turn into an X when open. Then the search form (`menu-search`, input
  `menu-search-input`, `aria-label` "חיפוש בתפריט" / "Search from the menu"), "All pieces", every
  category with published pieces, "About", "Shipping & Returns", "Contact" ("יצירת קשר") and the
  full-word language link. Modal: while open, the strip, header, `<main>`, footer and consent
  banner are `inert`; the page does not scroll; `Esc`, the close button, a tap outside and a link
  click close it and focus returns to the menu button; at 1024 px it closes. Reduced motion: same
  end states, no sliding or turning.
- The language switch in the strip (inline end, 44 × 44, `paper` focus ring on `forest`). The
  strip (`data-testid="announcement-bar"`) is always present on every page; with no text it holds
  only the switch.
- The search field's focus ring is a 2 px `forest` outline inset on the round form (`forest` on
  `paper`), shown while the field or its button has keyboard focus, so it shows over the photo
  too; the focused button is marked in addition. Set by unlayered rules for `[data-header-search]`
  (header and menu drawer; research D20), because the header's unlayered `currentColor` rule beats
  Tailwind utilities.
- The strip's switch has a 1 px focus-ring offset, so the ring fits inside the 44 px strip.
- No header control overlaps another control or the brand at any width from 320 px; no sideways
  scroll.
- No shadow, no pill shape, no account icon, no favourites icon, no language switch in the header
  bar (FR-004, FR-008).
- The search page's own form (`search-input`) gets the `aria-label` "חיפוש יצירות" / "Search
  pieces", so no two search landmarks share a name.

### Header states

Amended 2026-11-17 (owner visual fixes and clarification).

| Page                                  | Hero under the header? | Header look                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home, scrolled all the way to the top | yes                    | transparent, `on-photo` text and icons, no border, no blur, focus ring `currentColor` (white); the photo behind it is darkened by the blended strip: at least `--scrim-text` behind the header, fading smoothly below it (research D4, D20); the search field keeps its own `paper` fill and `ink` text (set explicitly, not inherited) |
| Home, scrolled by 1 px or more        | -                      | the white bar: `color-mix(paper 85%, transparent)` with `backdrop-filter: blur(12px) saturate(1.4)` under `@supports`, solid `paper` otherwise; `ink` text, 1 px `line` bottom border; reached by a 250 ms CSS transition (and back at the top)                                                                                         |
| Home, reduce motion on                | -                      | the same end states, no fade                                                                                                                                                                                                                                                                                                            |
| Home, forced colours                  | -                      | no transparency, no blur, no transition                                                                                                                                                                                                                                                                                                 |
| Every other page                      | -                      | the white bar (frosted)                                                                                                                                                                                                                                                                                                                 |

The state comes from `data-at-top` on `#site-header` (server-rendered; the `HeaderScrollState`
island removes it while `window.scrollY > 0`). One tiny island, no other JavaScript;
[research D5](../research.md#d5-header-over-the-hero-with-no-javascript-owner-decision-3-fr-008-fr-009), amended.

## Home page `/{locale}`

Root element `data-full-bleed`. Sections in order, each with its test id:

1. `home-hero` (`<section data-hero aria-labelledby>`): `HomePhoto` (hero), the blended strip
   behind the header (no text in it; the tagline line was removed at the Phase D gate, FR-010) and
   `<h1>` = shop name from settings (`lang="he"` when it falls
   back on `/en`), centred (owner decision 2026-11-17). The only h1 on the page.
2. `home-row` (only when the home-row category has published pieces): the swipeable row with the
   category name as h2, the "view all" link and, from 900 px, arrow buttons
   ([home-row.md](home-row.md#home-row-public)). No category or sort buttons on the home
   page (owner answer). With no published pieces in the home-row category (or none chosen, or an
   empty shop) the home page shows the hero, banners and band only; the empty state "עוד אין כאן
   יצירות" lives on the "All pieces" page.
3. `home-banner-child`, `home-band`, `home-banner-shelf`, as in the Shopify shop (FR-010, owner
   answer 2026-11-16).
   - Banner: `<section aria-labelledby>` with `HomePhoto` (lazy), h2, one line, and a
     `soft` (sage) `LinkButton` to `/{locale}/shop` (`data-testid="home-banner-button"`). No dark
     layer behind the text, only the soft text shadow (owner's accepted contrast exception,
     2026-11-17).
   - Band: `peach` full-width block with one `<p>` (the sentence, thin weight 300) and under it a
     text link `shop.home.band.link` with the directional `arrow` icon (points to the reading end,
     flips in RTL) to `/{locale}/shop` (`data-testid="home-band-link"`, at least 44 px tall). No
     heading.

The "All pieces" page `/{locale}/shop` holds the category and sort buttons and the full grid
([home-row.md](home-row.md#all-pieces-page-localeshop-fr-033)).

### Texts for owner approval

Hebrew first; the spec's table plus the new rows marked ★. The owner accepted them for now
(2026-11-16); the final wording is reviewed on the finished page before the Phase D gate (FR-012).

| Key (`shop.home.*`)                                                                                        | Hebrew                                                                      | English                                                                                                                |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| (hero line: removed from the hero at the Phase D gate; still the "All pieces" intro, `shop.catalog.intro`) | כל בובה וכל חיה כאן אני סורגת ביד, אחרי שאתם מזמינים.                       | I knit or crochet every piece here by hand, after you order.                                                           |
| ★ `row.viewAll`                                                                                            | לכל היצירות                                                                 | View all                                                                                                               |
| ★ `row.previous` / `row.next` (button names)                                                               | הקודמות / הבאות                                                             | Previous / Next                                                                                                        |
| ★ `shop.allPieces.title`, `common.nav.allPieces`                                                           | כל היצירות                                                                  | All pieces                                                                                                             |
| `bannerChild.heading`                                                                                      | נסרגו כדי שישחקו בהן                                                        | Made to be played with                                                                                                 |
| `bannerChild.line`                                                                                         | רכות ונעימות לחיבוק, וכל אחת נסרגת במיוחד בשבילכם.                          | Soft and cuddly, and each one is made just for you.                                                                    |
| `bannerChild.button`                                                                                       | לכל היצירות                                                                 | See all pieces                                                                                                         |
| `bannerShelf.heading`                                                                                      | לכל אחת אופי משלה                                                           | Each one has its own character                                                                                         |
| `bannerShelf.line`                                                                                         | דובים, ארנבים, קופים ועוד. בחרו, ואני אסרוג בשבילכם.                        | Bears, bunnies, monkeys and more. You choose, and I'll crochet it for you.                                             |
| `bannerShelf.button`                                                                                       | לכל היצירות                                                                 | See all pieces                                                                                                         |
| `band.sentence`                                                                                            | אני סורגת כל יצירה בעצמי, לאט ובאהבה, רק אחרי שאתם מזמינים.                 | I crochet every piece myself, slowly and with love, only after you order.                                              |
| ★ `band.link`                                                                                              | לקנייה                                                                      | Shop now                                                                                                               |
| ★ `hero.alt`                                                                                               | בובות וחיות סרוגות, כדורי צמר ומסרגות על שולחן עבודה, ואישה סורגת ליד החלון | Crocheted dolls and animals, balls of wool and needles on a work table, and a woman knitting by the window             |
| ★ `bannerChild.alt`                                                                                        | פעוט משחק בכבשה סרוגה צהובה, ועוד חיות סרוגות על השטיח                      | A toddler playing with a yellow crocheted sheep, with more crocheted animals on the rug                                |
| ★ `bannerShelf.alt`                                                                                        | מדף כוורת מלא בובות וחיות סרוגות: דובים, ארנב, קופים, פיל, שועל, אריה וכבשה | A honeycomb shelf full of crocheted dolls and animals: bears, a bunny, monkeys, an elephant, a fox, a lion and a sheep |

## Product photos (FR-015)

(The order status page shows no product photos, because order photos are private, so FR-015's
"order lines" needs no change there.) Square, sharp corners, no frame, centred crop, everywhere a product photo appears in the
storefront: `product-card` photo, `gallery-track` photos, gallery thumbnails (72×72), cart lines
(72×72), checkout order-summary lines (48×48). The zoom dialog shows the whole photo. Test:
`storefront-layout.spec.ts` asserts `|width − height| ≤ 1 px` for each of these boxes.

## Product page `/{locale}/p/{slug}` (FR-017–FR-020)

- Breadcrumbs, then the two columns as today (gallery at the reading start from 900 px; first on
  phones), details without a panel, items in today's order.
- "You may also like": `<section data-testid="also-like" aria-labelledby="also-like-title">`, h2
  `shop.product.alsoLike` ("אולי תאהבו גם" / "You may also like"), `ProductGrid` (label
  `shop.product.relatedLabel`) of up to 4 cards chosen by
  `listAlsoLike(productId, categoryIds, 4)` (its categories without the home-row category):
  pieces sharing one of them newest first, then the newest of the rest, never the product itself,
  never twice; the section is absent when the list is empty.
- `shop.product.related` ("עוד מ{category}") is removed from both message files.

## Footer (FR-023, FR-026)

Mint, `ink` text. Business column (shop name h2, legal name, address, VAT number, email, phone,
then the social list from [social-links.md](social-links.md#footer-output)), "Info" nav, "Legal"
nav (with the cookie-settings button when consent is required), bottom row with the full-word
language switch and the copyright line. All existing test ids stay (`footer-business-name`,
`footer-business-address`, `footer-business-vat`, `footer-email`, `footer-phone`,
`footer-cookie-settings`).

## Cart drawer (FR-044, FR-046–FR-048; replaces the cart page)

- `<div id="cart-drawer" data-testid="cart-drawer" popover role="dialog" aria-modal="true"
  aria-labelledby>` in the locale layout, named by its heading (`cart.drawer.title`, "הסל שלי" / "My
  cart"). Opened by `cart-link` (a `popovertarget` button; name, badge and test id unchanged), by
  `openCartDrawer()` and by a successful "add to cart". Slides in from the reading-end side (left
  in he, right in en) from the header's top edge (`--drawer-top`, never over the strip) to the
  viewport bottom, at every width; same dimming, scroll lock, `inert` page, `Esc` / close button /
  tap outside, focus return and reduced-motion rules as the menu drawer.
- Close button `cart-close` (name `cart.drawer.close`, "סגירת הסל" / "Close cart"), `autofocus`, at
  the cart button's place. Body (`CartDrawerBody`, loaded on first open): the old cart's lines
  with all their test ids, quantity, remove, flags, `ErrorSummary`, free-shipping note, subtotal,
  "to checkout" (`cart-continue`, link to `/{locale}/checkout`), "continue shopping"
  (`cart-keep-shopping`, closes the drawer), the empty state (action to `/{locale}/shop`).
  Flagged lines: "to checkout" keeps the drawer open and focuses the error summary, whose links
  move focus to the line in the drawer.
- Following a link in the drawer closes it (not the blocked "to checkout", not `#` links); a
  navigation leaves no drawer open and no scroll lock.
- Every former link to `/{locale}/cart` is a control that opens the drawer (`go-to-cart` on the
  product page, checkout's "back to cart", the payment return page's cart links); the redirects
  that went there go to `/{locale}/shop` (the checkout's empty-cart redirect waits until the drawer
  is closed). `/{locale}/cart` answers 404.

## Unchanged behaviour (FR-002)

Amended 2026-11-17 (FR-048): the cart page is the one removed route; the cart is the cart drawer
above. Every other existing route, form field, message, island, test id and step of cart, checkout, payment
return, order status, contact, content pages, consent, search and not-found stays. Only classes
(colours, font, radius, spacing, photo shape) and the header/footer markup described above change.
