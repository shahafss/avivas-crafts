# Research: New look for the product cards and the product page

Decisions for the plan. Each one names what was chosen, why, and what else was considered. Section
numbers (§) are `docs/design/storefront.md`.

## D1. "Show as New": a product column, saved like "not available to order"

- **Decision**: a new column `product.show_as_new boolean NOT NULL DEFAULT false` (Drizzle field
  `showAsNew`), added by a generated migration `0011_product_show_as_new`. It is set by a new
  record function `setProductShowAsNew(actor, id, value)` in `src/server/catalog/products.ts` and a
  new admin Server Action `setProductShowAsNew(productId, value)` in
  `src/app/admin/(protected)/products/[id]/actions.ts`. Both copy `setProductOrderable` exactly:
  `requireAdmin()`, the id checked with the existing `idSchema`, a `boolean` type check, a
  `SELECT … FOR UPDATE` inside a transaction, a no-op when the value is unchanged, and an activity
  row `product.updated` with `{ field: 'showAsNew', to: value }`. The editor shows the tick box in
  `PublishBar`, right under the "not available to order right now" box, and `ProductEditor.saveAll`
  calls the action after `updateProduct` when the box differs from the saved value (the same place
  and way as `setProductOrderable`). It works in every state (draft, published, hidden).
- **Rationale**: the owner chose a manual switch (clarification 2026-11-23). Copying the
  `orderable` switch reuses a pattern the owner already knows (same place, same Save button) and a
  server path that is already tested and admin-only. Existing pieces get `false`, so no card says
  "New" until the owner decides.
- **Alternatives**: adding the field to `updateProduct`'s input schema (rejected: it would mix a
  display switch into the details validation and its publish checks); a date-based rule (rejected
  by the owner).

## D2. Card data: `showAsNew` and the breadcrumb category on every card

- **Decision**: `PublicProductCard` gains `showAsNew: boolean` and
  `mainCategory: PublicCategory | null`. The FR-037 rule now lives in one exported function,
  `pickMainCategory(categories, homeCategoryId)` (categories already in the shop's order), used by
  both `getPublishedProductBySlug` (replacing its inline code) and `toCards`. `toCards` runs one
  more batched query (categories sorted by `sort_order`, then `id` as a tie-break, the same as the
  breadcrumb query): `product_category` joined to `category` for all the listed product ids,
  ordered by `category.sort_order`, then groups by product. It takes `homeCategoryId` from the caller
  when the caller already has it (`listAlsoLikeFor`, `getHomeRow`), and otherwise reads it with
  `getSettings()` once per list. `CARD_COLUMNS` / `CardRow` gain `showAsNew`.
- **Rationale**: one rule in one place means the card label and the breadcrumb can never disagree
  (clarification 2026-11-23). One extra small query per list (at most a few dozen ids at this
  shop's scale) is cheaper and simpler than a JSON aggregate inside every card query.
- **Alternatives**: a correlated subquery per card row (harder to read, and the "else home-row"
  fallback needs the setting anyway); caching the settings row (not needed; it is one primary-key
  read).

## D3. Tokens: two shadows and two radii

- **Decision**: in the `@theme` block of `src/app/globals.css`, beside `--shadow-float`:
  - `--shadow-card: 0 1px 2px rgb(6 20 6 / 0.06), 0 4px 14px rgb(6 20 6 / 0.07);`
  - `--shadow-card-hover: 0 2px 4px rgb(6 20 6 / 0.07), 0 10px 26px rgb(6 20 6 / 0.12);`
  - `--radius-photo: 8px;` (photos inside cards, the gallery from 900 px, thumbnails, cart lines)
  - `--radius-sheet: 16px;` (the product page card)
  This gives the utilities `shadow-card`, `shadow-card-hover`, `rounded-photo` and `rounded-sheet`.
  The phone-only gallery corners (15 px top, 12 px bottom) and the 6 px checkout photo use
  arbitrary values with a comment, because each is used once.
- **Rationale**: named tokens keep the design guide and the code in step (§3.3 lists the tokens),
  and `rounded-chip` (8 px) stays reserved for inputs so changing one never changes the other.
- **Alternatives**: arbitrary values everywhere (rejected: four places share 8 px photo corners).

## D4. Card markup, motion and accessibility

- **Decision** (`src/components/shop/ProductCard.tsx`, contract [ui.md](./contracts/ui.md) "Product
  card"):
  - The `Link` stays the only interactive element. It becomes the card box: `relative flex h-full
    flex-col`, `rounded-card`, 1 px `border-line`, `bg-paper`, `p-2 lg:p-2.5`, `shadow-card`, a
    200 ms `ease-out` transition of border colour, shadow and `translate` (Tailwind 4's
    `-translate-y-*` sets the CSS `translate` property and `scale-*` the `scale` property, not
    `transform`; tests assert on those or on measured boxes).
  - Hover and keyboard focus (`hover:` and `focus-visible:`): `border-field`, `shadow-card-hover`,
    and, inside `motion-safe:`, a 2 px lift (`-translate-y-0.5`). The photo keeps its 1.03 zoom,
    now on `group-hover` and `group-focus-visible`, inside `motion-safe:`.
  - DOM order: photo box (decorative, `alt=""`), then the text (name, price, not-available line),
    then the pills. The pills are absolutely positioned over the photo's top reading-start corner
    (`inset-inline-start` / `inset-inline-end` both 8 px inside the photo, so a long pill is cut
    with an ellipsis), so the link's accessible name starts with the product name (FR-007).
  - Equal heights: the `li` already stretches in the grid; the link fills it with `h-full`.
  - The photo box gets `isolate`, so Safari clips the zooming photo to its rounded corners.
  - The pill column uses `items-start`, so each pill keeps its own width.
  - The global focus ring (3 px `ink`, offset 3 px, §3.5) follows the rounded corners.
- **Rationale**: Tailwind 4's `hover:` only applies on devices that can hover, so a tap never leaves
  a card "stuck" lifted (spec edge case). Putting the pills after the text in the DOM keeps the
  spoken name first without hiding the pills from screen readers.
- **Alternatives**: `aria-hidden` pills (rejected: "New" is useful information); pills before the
  name in the DOM (rejected by FR-007).

## D5. Price on the card

- **Decision**: `ui/Price` gains a `size="card"`: the amount at 15 px (16 px from 900 px), weight
  400, `ink`; the "from" prefix keeps today's small `ink-2` style. The card switches from `sm` to
  `card`; `sm` stays if anything else uses it, otherwise it is removed (the implementer checks).
- **Rationale**: the owner asked for a regular-weight price in `ink`; the size table belongs in
  `Price`, not in each caller.

## D6. Home row: room for the shadow, the lift and the focus ring

- **Decision**: the track in `HomeRow.tsx` gets more padding with matching negative margins, so
  its content box (and so the `auto-cols` width maths and the visual alignment with the heading)
  does not change: inline `-mx-4 px-4 scroll-px-4` on every width (16 px: the page gutter on
  phones, and from 900 px the same as the 16 px gap, so exactly four whole cards show, as §7.32
  requires; 24 px would show an 8 px sliver of a fifth card), block start `-mt-4 pt-4` (16 px: the 2 px
  lift + 6 px focus ring, plus most of the hover shadow's top edge; it still fits inside the
  heading row's 20 px bottom margin) and block end `-mb-10 pb-10` (40 px: the hover shadow reaches about 36 px below a
  card). `RowArrows` scrolls by the client width minus the start padding (four cards and four gaps), so
  one press still moves one page. Trade-off: at the row's two ends the hover shadow's faintest
  outer edge (about 1–2 % darkness, beyond 16 px) is cut off; more side room would show a sliver of
  a fifth card from 900 px. Not visible in practice (owner asked at the Phase B gate).
- **Rationale**: a scrolling track clips everything outside its padding box (FR-009). Using the
  page gutter for the inline room never makes the page wider than the screen (the section already
  has that padding), so nothing scrolls sideways at 320 px.
- **Alternatives**: `overflow: clip` with `overflow-clip-margin` (only clips one axis cleanly and
  is not supported for scroll containers); smaller shadows in the row (rejected: the cards must
  look the same everywhere).

## D7. Product page card without clipping

- **Decision** (contract [ui.md](./contracts/ui.md) "Product page card"): in
  `src/app/[locale]/(shop)/product/[slug]/page.tsx` the existing gallery-and-details grid becomes
  the card: `rounded-sheet`, 1 px `border-line`, `bg-paper`, `shadow-card`, no padding below
  900 px, `lg:p-3`, gap `lg:gap-9` (36 px), the column shares unchanged. The details column gets
  `px-4 pt-[18px] pb-4` below 900 px and `lg:ps-0 lg:pe-5 lg:pt-5 lg:pb-4` from 900 px, and keeps
  `lg:sticky lg:top-[calc(var(--header-h)+16px)]`. The card does **not** use `overflow: hidden`;
  instead the gallery's main photo box draws its own corners: below 900 px 15 px at the top (the
  card's 16 px minus its 1 px border, so the photo follows the card's curve exactly) and 12 px at
  the bottom; from 900 px `rounded-photo` (8 px).
- **Rationale**: `overflow: hidden` on an ancestor makes it the scroll container for
  `position: sticky`, which would stop the details from staying in view (FR-010). Giving the photo
  matching corners has the same look with no side effects.
- **Alternatives**: `overflow: clip` (works with sticky in current browsers, but older iOS Safari
  versions treat it as `hidden`; not worth the risk for no visual gain).

## D8. Gallery details

- **Decision** (`src/components/shop/Gallery.tsx`):
  - The main box gets the corners of D7 using logical corner utilities (`rounded-ss`, `rounded-se`,
    `rounded-es`, `rounded-ee`), keeps `overflow-hidden` (it clips the photos to its own corners) and adds `isolate` (Safari
    otherwise may not clip the scrolling track to rounded corners),
    and the focus-ring overlay gets `rounded-[inherit]` so the inset ring follows the corners.
  - The counter and zoom button stay at 12 px from the bottom corners (inside a 12 px or 8 px
    curve).
  - Thumbnails: `rounded-photo`; the current one gets `ring-2 ring-forest ring-offset-2
    ring-offset-paper` (2 px white gap, 2 px `forest` ring) instead of `ring-[3px]`. The row keeps
    4 px of room around the buttons for the ring (it clips outside its padding box). Below 900 px
    the buttons are 8 px under the photo and 8 px from the card's inner edge, and the ring room
    overlaps the details' padding (negative block-end margin), so the details text starts 18 px
    under the thumbnails. From 900 px the buttons are 12 px under the photo (as in the chosen
    preview) and line up with the photo's edges. Exact classes: tasks T016.
- **Rationale**: matches owner decision 2. `forest` against `paper` is 10.8:1, so the current
  thumbnail is still marked well enough for WCAG 1.4.11 without relying on the photo.

## D9. Cart and checkout photos

- **Decision**: the 72 × 72 photo span in `CartLine.tsx` gets `rounded-photo`; the 48 × 48 span in
  `OrderSummary.tsx` gets `rounded-[6px]`. Both already have `overflow-hidden` and `bg-photo`.
- **Rationale**: owner decision 3 (2026-11-23).

## D10. Design guide and tests

- **Decision**: update `storefront.md` §1 (Selected direction), §3.3 (radius and shadow lists,
  new tokens), §3.5 (card hover motion), §6 (square display: rounded, not `rounded-none`), §7.14,
  §7.15, §7.22, §7.23, §8.4 ("one card" replaces "No panel"), §11 (what the checks cover), §12.11
  (the new tick box), §13/§14 (owner decisions of 2026-11-22 and 2026-11-23; 007 FR-017 replaced).
  Update `docs/owner-guide-he.md` with one sentence about "הצגה כ'חדש'". Tests are listed in the
  plan's Technical Context and in [contracts/ui.md](./contracts/ui.md) "Checks".
- **Rationale**: the guide is binding (CLAUDE.md); the owner guide keeps principle II.
