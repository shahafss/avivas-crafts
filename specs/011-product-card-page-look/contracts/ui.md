# Contract: storefront look (cards, product page card, gallery, cart and checkout photos)

What a visitor sees and what the tests measure. Values are CSS pixels; "phone" = below 900 px,
"wide" = 900 px and up. "Start"/"end" are the reading direction (start = right in Hebrew, left in
English). Tokens: research D3. No inline `style` attributes, logical properties only.

## Tokens (`src/app/globals.css`, `@theme`)

| Token | Value | Used by |
|---|---|---|
| `--shadow-card` | `0 1px 2px rgb(6 20 6 / 0.06), 0 4px 14px rgb(6 20 6 / 0.07)` | product card at rest; product page card |
| `--shadow-card-hover` | `0 2px 4px rgb(6 20 6 / 0.07), 0 10px 26px rgb(6 20 6 / 0.12)` | product card on hover / keyboard focus |
| `--radius-photo` | `8px` | card photo; gallery main photo (wide); thumbnails; cart line photo |
| `--radius-sheet` | `16px` | product page card |
| `--shadow-float` (unchanged) | `0 3px 14px rgb(6 20 6 / 0.12)` | menu drawers, consent sheet, dialogs |

## Product card (`shop/ProductCard`, used by `ProductGrid` and `HomeRow`)

| Part | Phone | Wide |
|---|---|---|
| Card box (the link) | `paper`, 1 px `line` border, 12 px corners (`rounded-card`), `shadow-card`, padding 8 px | padding 10 px |
| Where | home row, category, All pieces, search, "You may also like", and the product not-found page's grid | same |
| Photo box | square (±1 px), 8 px corners, `photo` background, `object-cover` centred, `alt=""` | same |
| Text block | 10 px above, 4 px at the sides, 6 px below | 12 / 6 / 6 px |
| Name | 16 px, weight 600, line height 1.25, `ink`, max 2 lines then ellipsis; Hebrew fallback marked `lang="he"` | 18 px |
| Price (`Price size="card"`) | amount 15 px, weight 400, `ink`, tabular figures; "החל מ־" / "From" prefix as today when option prices vary | 16 px |
| Not available | "לא זמין להזמנה כרגע" in `alert` 13/700 under the price (unchanged) | same |
| Pills (container) | over the photo, 8 px from the photo's top and start edges and ≥ 8 px from its end edge; a column with 4 px gap, items aligned to the start (pills keep their own width); `pointer-events: none` | same |
| "New" pill | only when `showAsNew`; on top; `sage` background, `ink` text, 12 px / 700, pill radius, padding 1 px 10 px, one line | same |
| Which pills (owner feedback 2026-11-23) | at most two, from `cardPills` (data-model.md): priority New → other category → featured; display order New, featured, other category. The featured pill never shows on the home row's cards | same |
| Featured pill | the home-row category's name; same look as the category pill; `data-testid="card-pill-featured"` | same |
| Category pill | the other category (`mainCategory` when it is not the home-row category); white at 94 %, `ink` text, 12 px / 600, inset 1 px `line` ring, one line cut with an ellipsis; Hebrew fallback marked `lang="he"` | same |
| Hover / keyboard focus | border stays `line` (owner feedback 2026-11-23; keyboard focus keeps the global focus ring), shadow `shadow-card-hover`, lift 2 px, photo scale 1.03 | same |
| Reduced motion | no lift, photo scale 1 (the shadow still changes) | same |
| Timing | shadow, lift 200 ms `ease-out` (the lift uses the CSS `translate` property, the zoom the `scale` property); photo zoom 400 ms `ease-out` | same |

- DOM order inside the link: photo box, name, price, not-available line, pills. The link's
  accessible name therefore starts with the product name.
- Messages: `shop.card.new` = "חדש" / "New" (new key). Category names come from the data.
- `data-testid`: the link keeps `product-card`; the pills get `card-pill-new`,
  `card-pill-featured` and `card-pill-category`; the photo box gets `card-photo`.
- Grids (`ProductGrid`): columns unchanged (2 → 3 from 640 px → 4 wide); gaps 24 px rows / 12 px
  columns on phones, 36 px / 20 px wide. Cards in a row are the same height.
- Home row (`HomeRow`): research D6. The track's padding box leaves at least 16 px above, 40 px
  below and 16 px at each side of every card (the hover shadow's faintest outer edge may be cut at
  the row's two ends; research D6) (exactly four whole cards from 900 px; the arrows
  still move one page), so the resting and hover shadows, the 2 px
  lift and the 3 px focus ring (offset 3 px) are never clipped. The card widths and their alignment
  with the heading do not change. No sideways page scroll at 320 px.

## Product page card (`/[locale]/product/[slug]`)

| Part | Phone | Wide |
|---|---|---|
| Card | `paper`, 1 px `line` border, 16 px corners (`rounded-sheet`), `shadow-card`, padding 0, no `overflow: hidden` | padding 12 px |
| Layout | gallery, then details | grid `minmax(0,1.25fr) minmax(0,1fr)` (unchanged), gap 36 px, gallery at start |
| Main photo box | full card width, touching the card's top and sides (inside the 1 px border); corners 15 px top, 12 px bottom | 8 px corners |
| Thumbnails row (≥ 2 photos) | button edges 8 px from the card's inner edge and 8 px under the photo; the 6 px ring room (owner feedback 2026-11-23: room for the 3 px focus ring at its 3 px offset) overlaps the details' padding | button edges in line with the photo's edges, 12 px under the photo |
| Details | padding 18 px top (the text starts 18 px under the thumbnails or the photo), 16 px sides and bottom | 20 px top, 20 px end, 16 px bottom, 0 start; sticky at `--header-h` + 16 px (unchanged) |
| Content | unchanged: h1, `BuyBox` (price, peach note, description, options, buy row), facts, disclosures | same |

- Breadcrumbs stay above the card; "You may also like" stays below it, using the new cards.
- The product page shows no "New" or category pill.

## Gallery (`shop/Gallery`)

- Main box: corners as above; keeps `overflow-hidden`, `bg-photo`, the scroll-snap track and the
  square slides. The focus-ring overlay follows the corners (`rounded-[inherit]`). Counter and zoom
  button stay 12 px from the bottom corners.
- Thumbnails: 72 × 72 px, square, 8 px corners, `bg-photo`. The current one (`aria-current="true"`)
  has a 2 px `paper` gap then a 2 px `forest` ring; the ring is never clipped by the row. The
  row keeps 6 px of room on every side of the buttons, so the keyboard focus ring (3 px at a 3 px
  offset) is never clipped either (owner feedback 2026-11-23); the visible spacing above stays.
- Zoom dialog: unchanged (whole photo, no rounded corners).

## Cart and checkout photos

| Place | Size | Corners |
|---|---|---|
| Cart drawer line (`shop/CartLine`) | 72 × 72, square | 8 px (`rounded-photo`) |
| Checkout order summary (`shop/OrderSummary`) | 48 × 48, square | 6 px |

Nothing else in the cart drawer or checkout changes.

## Checks (tests)

Slimmed on 2026-11-23 (owner request): exact sizes and corners are checked by the owner with
screenshots at the Phase D gate. Automated:

| Check | Where |
|---|---|
| Existing checks keep passing: photo boxes square (±1 px), no sideways scroll at 320/375 px, no `style` attributes, 44 × 44 px controls, the buy panel sticks at header + 16 px, add to cart, zoom dialog, checkout | existing E2E suites (tests asserting a replaced rule are updated) |
| The four tokens exist with their exact values | `tests/unit/design-tokens.test.ts` |
| Card data: `showAsNew`, `mainCategory` (breadcrumb rule, same as the product page) and `featuredCategory` | `tests/integration/public-queries.test.ts` |
| The pill rule: every allowed set, the all-three case (New + Category), no featured pill in the home row, never more than two | `tests/unit/card-pills.test.ts` |
| Pills: "New" above the category pill on the photo's reading-start side; no "New" pill without the flag; no featured pill in the home row | `tests/e2e/storefront-layout.spec.ts` (`chromium-desktop`) |
