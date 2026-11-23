# Feature Specification: New look for the product cards and the product page

**Feature Branch**: `011-product-card-page-look`

**Created**: 2026-11-22

**Status**: Approved by the owner (2026-11-23); plan approved 2026-11-23 (slimmed to two batches)

**Input**: The owner's choices of 2026-11-22, made on preview pages: product card design "C4 mounted
photo" (with changes) and product page design "P2 one card" (with a change for phones). The
previews are the reference for the look; the values below are the binding ones.

## Owner decisions (2026-11-22)

Agreed with the owner before this spec; binding for the plan. Colour names are the design tokens
of `docs/design/storefront.md` §3.1 (`paper` white, `ink` text, `line` light border, `field` darker
grey-green border, `sage` soft green, `forest` dark green, `photo` light photo background).

1. **Product card, "mounted photo".** Used everywhere a piece is shown as a card: the home page row,
   category pages, "All pieces", search results and "You may also like".
   - A white card with a 1 px `line` border and 12 px rounded corners. The square photo sits inside
     it with an 8 px margin (10 px from 900 px wide) and has its own 8 px rounded corners.
   - Below the photo: the piece's name (weight 600, 16 px; 18 px from 900 px; at most 2 lines, then
     an ellipsis), then the price in **regular weight** (400; the owner said "not bold"), `ink`,
     15 px (16 px from 900 px). The text has a little inner space: 10 px above, 4 px at the sides,
     6 px below (12 / 6 / 6 px from 900 px). "החל מ־" / "From" and the "not available to order
     right now" line stay as they are today.
   - Pills on the photo's top corner on the reading-start side (top right in Hebrew, top left in
     English), 8 px in from the photo's edges, stacked one under the other with 4 px between them:
     a `sage` "חדש" / "New" pill (12 px, weight 700, `ink` text) on top, and category pills under it
     (white at 94 % opacity, `ink` text, 12 px, weight 600, a thin `line` ring). At most two pills,
     chosen by the pill rule of FR-013 (amended after the Phase D gate, 2026-11-23). There is no
     category text above the name.
   - **Raised look** (confirmed 2026-11-23): a soft shadow at rest, a new design token
     `--shadow-card: 0 1px 2px rgb(6 20 6 / 0.06), 0 4px 14px rgb(6 20 6 / 0.07)`. On mouse-over or
     keyboard focus the card lifts 2 px (the border keeps its `line` colour, owner feedback
     2026-11-23), the shadow grows to
     `0 2px 4px rgb(6 20 6 / 0.07), 0 10px 26px rgb(6 20 6 / 0.12)` (a second token), and the photo
     zooms to 1.03 as today. The change takes 200 ms (the photo zoom keeps its 400 ms). With
     "reduce motion" switched on, nothing moves: no lift and no zoom.
   - Grid spacing as in the preview: on phones 24 px between rows and 12 px between columns; from
     900 px 36 px between rows and 20 px between columns. The number of columns is unchanged
     (2 → 3 from 640 px → 4 from 900 px).
2. **Product page, "one card".** One white card (16 px rounded corners, 1 px `line` border, the
   same `--shadow-card`) holds both the photo gallery and the details. What the details contain and
   their order are unchanged from `storefront.md` §8.4: name, price, the peach "made just for you"
   note, description, options, the buy row, the facts list and the two disclosures.
   - **Phones (below 900 px):** the main photo fills the top of the card with no space above or
     beside it. The card's rounded corners cut the photo's top corners; the photo's bottom corners
     are rounded 12 px. The thumbnails row has 8 px of space at its sides and 8 px above it. The
     details have 18 px of space above them and 16 px at the sides and below.
   - **From 900 px:** the card has 12 px of inner space; the main photo has 8 px rounded corners;
     the gallery and the details sit side by side with 36 px between them (gallery on the
     reading-start side, as today). The details have 20 px of space above them and at their
     reading-end side, and 16 px below.
   - **Thumbnails:** 8 px rounded corners. The thumbnail of the photo being shown has a 2 px white
     gap and then a 2 px `forest` ring around it.
3. **Cart and checkout photos** (added 2026-11-23): the small square photos in the cart drawer
   lines (72 × 72 px) and in the checkout order summary (48 × 48 px) also get rounded corners:
   8 px on the cart lines (the same as the gallery thumbnails) and 6 px on the smaller checkout
   photos, so they look the same at their size. They stay square, and nothing else about those
   lines changes.
4. **The design guide changes.** These choices replace binding rules in `docs/design/storefront.md`:
   §1 "Selected direction" (square photos with sharp corners; no shadow except floating surfaces),
   §3.3 (photos have 0 radius; cards and panels are flat), §6 "Square display" (`rounded-none`),
   §7.14 (sharp corners; thumbnails without radius; 3 px ring), §7.15 (the old card), §7.22 and
   §7.23 (the cart line and order summary photos) and §8.4
   ("No panel", 007 FR-017). The feature updates the guide and the tests that check those rules.

## Clarifications

### Session 2026-11-23

- Q: When should a piece show the "חדש / New" label on its card? → A: Only when the owner ticks a
  "Show as New" box in the piece editor; she turns it on and off herself. It never turns off by
  itself and is never worked out from dates.
- Q: A piece can be in several categories; which one does its card's category label show? → A: The
  same rule as the product page's breadcrumb, on every card and every page: the first category in
  the shop's order that is not the home-row category, else the home-row category, else no label
  (007 FR-037). On a category page this may be the page's own category.
- Q: Raised (a soft shadow at all times) or flat (a shadow only on mouse-over)? → A: Raised, for the
  product cards and the product page card, as in owner decision 1.
- Q: Do the small photos in the cart and at checkout keep sharp corners? → A: No, they get rounded
  corners too (owner decision 3).

### Owner feedback after the Phase D gate (2026-11-23)

- The card's border no longer darkens on mouse-over or keyboard focus; the shadow still grows and
  the card still lifts. Keyboard users keep the site's usual focus ring.
- A thumbnail's keyboard focus ring must not be cut off by the thumbnail row (a fix).
- The home-row ("featured", "מומלצות") category is not shown as a pill on the cards of the home
  page's row; other category pills may show there.
- A card shows at most two pills: "New", the featured (home-row) category, and one other category
  are the candidates. Allowed sets: Featured; New; Category; New + Featured; New + Category;
  Featured + Category. Priority when all three apply: New, then the other category, then
  Featured ("Featured as a last choice"). Elsewhere (All pieces, category pages, search, "You may
  also like") the featured pill may show as that last choice.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browsing pieces as mounted cards (Priority: P1)

A visitor, usually on a phone, scrolls the home page row, a category, "All pieces", search results
or "You may also like". Each piece shows as a white card with a small border, soft rounded corners
and the photo set inside it like a mounted print, with the name and price below. The visitor can
tell at a glance which pieces are new and what kind of piece each one is from the small labels on
the photo.

**Why this priority**: cards are on every catalog screen and are the first thing a visitor sees;
it is the main change the owner asked for.

**Independent Test**: open each of the five card places at 375 px and 1280 px in Hebrew and
English and compare with the chosen preview: border, corners, photo margin and corners, name and
price sizes and weights, pills, spacing.

**Acceptance Scenarios**:

1. **Given** any page that lists pieces, **When** it loads on a phone, **Then** each piece is a
   white card with a 1 px light border and 12 px corners, its square photo sits 8 px inside the
   card with 8 px corners, and the name (bold-ish, 16 px, at most 2 lines) and the regular-weight
   price (15 px) are under the photo.
2. **Given** the same page at 900 px wide or more, **When** it loads, **Then** the photo margin is
   10 px, the name 18 px and the price 16 px.
3. **Given** a piece whose option prices vary, **When** its card shows, **Then** the price reads
   "החל מ־ …" / "From …" as today; **given** a piece that cannot be ordered, **Then** the "not
   available to order right now" line shows under the price as today.
4. **Given** a desktop visitor, **When** the pointer rests on a card or the card gets keyboard
   focus, **Then** it lifts 2 px, its shadow grows and its photo zooms slightly, and its border
   keeps its light `line` colour; **When** "reduce motion" is on, **Then** the shadow still
   changes but nothing moves or zooms.
5. **Given** the Hebrew site, **When** a card shows its pills, **Then** they are on the photo's top
   right corner; on the English site, top left.
6. **Given** cards in the home page's sideways-scrolling row, **When** a card lifts on mouse-over,
   **Then** its shadow and its lifted top edge are fully visible, not cut off by the row.
7. **Given** pieces in the cart, **When** the visitor opens the cart drawer or the checkout page,
   **Then** each small square photo has rounded corners: 8 px in the cart drawer, 6 px in the
   checkout summary.

---

### User Story 2 - The product page as one card (Priority: P1)

A visitor opens a piece. The photos and everything about the piece (name, price, the "made just for
you" note, description, options, quantity and add to cart, delivery facts, the two disclosures) sit
together in one white rounded card. On a phone the photo runs edge to edge across the top of the
card; on a computer the photos and details sit side by side inside the card.

**Why this priority**: the owner chose it together with the cards so the two look like one family;
it is the page where people decide to buy.

**Independent Test**: open a piece with several photos and options at 375 px and 1280 px in both
languages and compare with the "P2 one card" preview; then add it to the cart, open the zoom view
and switch photos with the thumbnails to see that everything still works.

**Acceptance Scenarios**:

1. **Given** a phone, **When** a product page loads, **Then** one white card with 16 px corners,
   a light border and the soft shadow holds the gallery and the details; the main photo touches
   the card's top and sides, its top corners follow the card's corners and its bottom corners are
   rounded 12 px; the thumbnails row is 8 px from the card's sides and 8 px under the photo; the
   details have 18 px of padding above them and 16 px at the sides and bottom.
2. **Given** a screen 900 px wide or more, **When** the page loads, **Then** the card has 12 px of
   inner space, the main photo has 8 px corners, the gallery is on the right in Hebrew and on the
   left in English, 36 px from the details, and the details have 20 px of padding above them and at
   their reading-end side, inside the card's 12 px inner space.
3. **Given** a piece with several photos, **When** the visitor taps a thumbnail or swipes the main
   photo, **Then** the thumbnail of the shown photo has a white 2 px gap and a 2 px dark green ring;
   every thumbnail has 8 px corners.
4. **Given** the page from 900 px, **When** the visitor scrolls a long description, **Then** the
   details keep their current "stay in view" behaviour under the header.
5. **Given** the page, **When** the visitor reads the details, **Then** their order and wording are
   exactly as before this feature, and the peach "made just for you" note is still the page's one
   highlight.
6. **Given** the page, **When** the visitor opens the zoom view, uses the photo counter, or moves
   through the gallery with the keyboard, **Then** everything works as before, and the counter,
   zoom button and keyboard focus ring sit fully inside the photo's rounded corners.

---

### User Story 3 - "New" and category labels that tell the truth (Priority: P2)

A visitor sees a small "חדש" / "New" label on the pieces Aviva has marked as new, and a label with
the piece's category on every piece that has one. Aviva decides which pieces are "new" with one
tick box in the piece editor.

**Why this priority**: it adds information to the cards and a small admin change; the cards still
work without it.

**Independent Test**: with sample pieces that are new and not new and in one, several or no
categories, check that each card shows exactly the labels the rules give, in both languages.

**Acceptance Scenarios**:

1. **Given** a piece whose "Show as New" box the owner ticked, **When** its card shows, **Then** a
   sage "חדש" / "New" pill is on top and the category pill is under it.
2. **Given** the owner unticks the box and saves, **When** the card shows again, **Then** the "New"
   pill is gone.
3. **Given** a piece that is not marked new, **When** its card shows, **Then** no "New" pill
   shows and the category pills move up to the top position.
4. **Given** a piece in the home-row category and two others, **When** its card shows on a page
   other than the home row, **Then** it shows the featured (home-row) pill and, under it, a pill
   naming the first of the two others in the shop's category order (the category its breadcrumb
   names); **given** it is also marked new, **Then** it shows "New" and that other category only
   (at most two pills; the featured pill is the last choice); **given** a piece only in the
   home-row category, **Then** the pill names the home-row category (with "New" above it when
   marked new).
4a. **Given** the home page's row, **When** its cards show, **Then** none shows the home-row
   category's pill; a piece also in another category shows that category's pill.
5. **Given** a piece in no category, **When** its card shows, **Then** there is no category pill.
6. **Given** the English site and a category with no English name, **When** its pill shows,
   **Then** it shows the Hebrew name, marked as Hebrew for screen readers (as other Hebrew
   fallback text is).

---

### User Story 4 - The design guide matches the shop (Priority: P3)

Whoever works on the shop next reads `storefront.md` and finds the new card, the product page card,
rounded photos and the soft card shadow described as the rules, with the old rules replaced and the
reason recorded; the automated checks test the new rules.

**Why this priority**: keeps later features from undoing this look; no visitor sees it directly.

**Independent Test**: read the changed sections of `storefront.md` and run the storefront layout
checks.

**Acceptance Scenarios**:

1. **Given** the updated guide, **When** someone reads §1, §3.3, §6, §7.14, §7.15 and §8.4, **Then**
   none of them still says that photos have sharp corners, that cards are flat, that the product
   page has no panel, or that thumbnails have no radius; the decision and its date are recorded in
   the decisions list.
2. **Given** the automated layout checks, **When** they run, **Then** they check the new look
   (photos still square; card and product-page card corners; pills on the reading-start side) and
   none of them asserts an old rule this feature replaced.

---

### Edge Cases

- **Long names**: a name longer than two lines ends with an ellipsis; cards in the same grid row
  stay the same height, so borders line up.
- **Long category names**: a category pill never grows past the photo's width minus its 8 px insets;
  a longer name is cut with an ellipsis on one line.
- **Narrowest phone (320 px)**: two cards per row still fit with their borders, margins and pills;
  nothing scrolls sideways.
- **Single photo**: no thumbnails and no counter (as today). On a phone the details then start
  18 px under the photo.
- **Photo still loading or broken**: the photo box keeps its square `photo`-coloured shape with its
  rounded corners, so nothing shifts.
- **Keyboard focus on a card**: the focus ring stays clearly visible around the whole card and is
  not hidden by the shadow or cut off by the home row.
- **Touch screens**: no "stuck" lifted look after a tap; the lift is a mouse-over and keyboard-focus
  effect.
- **Not orderable piece on the product page**: the read-only options and the "not available"
  notice sit inside the card where the buy row was, as today.
- **Hebrew text on the English site** (product name, description, category name with no English
  version): shown in Hebrew, marked as Hebrew, as today.
- **A piece marked new but in no category**: only the "New" pill shows.

## Requirements *(mandatory)*

### Functional Requirements

**Product card**

- **FR-001**: Every product card (home row, category pages, "All pieces", search results, "You may
  also like", and the grid on the "piece not found" page) MUST use the mounted-photo design of owner decision 1: white card, 1 px `line`
  border, 12 px corners; square photo inset 8 px (10 px from 900 px) with 8 px corners.
- **FR-002**: The card MUST show the name at weight 600, 16 px (18 px from 900 px), at most 2 lines
  with an ellipsis, and under it the price at weight 400, `ink`, 15 px (16 px from 900 px). The
  "from" wording and the "not available to order right now" line MUST stay as today.
- **FR-003**: The card MUST NOT show category text above the name.
- **FR-004**: The card MUST show pills on the photo's top reading-start corner, 8 px from the
  photo's edges, stacked with 4 px between them, at most two pills chosen by the pill rule of
  FR-013: the "חדש" / "New" pill (sage, `ink`, 12 px / 700, only when the piece is new by the rule
  in FR-012) on top, then the featured (home-row) category pill, then the other category pill
  (both white at 94 %, `ink`, 12 px / 600, thin `line` ring). Each pill is one line and is cut with
  an ellipsis if it is wider than the space.
- **FR-005**: The card MUST have the resting shadow `--shadow-card` (raised look, confirmed by the
  owner). On
  mouse-over or keyboard focus its border MUST keep its `line` colour (owner feedback 2026-11-23),
  it MUST lift 2 px, its shadow MUST
  grow to the hover value of owner decision 1, and its photo MUST zoom to 1.03. Shadow and lift
  change over 200 ms; the photo zoom keeps 400 ms.
- **FR-006**: When the visitor's device asks for reduced motion, the card MUST NOT lift and the
  photo MUST NOT zoom; the shadow may still change.
- **FR-007**: The whole card MUST remain one link to the product page. Its accessible name MUST
  start with the product name; the pill texts, if read at all, come after the name and the price.
  The photo stays decorative (empty alt text) as today.
- **FR-008**: Card grids MUST keep their column counts and use 24 px row / 12 px column gaps on
  phones and 36 px / 20 px from 900 px. Cards in one grid row MUST be the same height.
- **FR-009**: In the home page's scrolling row, a card's resting shadow, its lifted position, its
  hover shadow and its keyboard focus ring MUST NOT be cut off.

**Product page**

- **FR-010**: The product page MUST put the gallery and the details in one white card with 16 px
  corners, a 1 px `line` border and the same resting shadow as the product cards, with the phone
  and 900 px+ spacing, photo corners and side-by-side gap of owner decision 2. The details' content,
  order and wording MUST NOT change, and the details MUST keep staying in view under the header
  from 900 px as today.
- **FR-011**: Thumbnails MUST have 8 px corners, stay 72 × 72 px and square, and the thumbnail of
  the shown photo MUST show a 2 px white gap and then a 2 px `forest` ring. The gallery's counter,
  zoom button and keyboard focus ring MUST sit fully inside the main photo's rounded corners, and
  a thumbnail's keyboard focus ring MUST NOT be cut off by the thumbnail row. The
  zoom view, swiping, the counter and the thumbnail behaviour MUST work as today.

**Labels**

- **FR-012**: A piece MUST be shown as "new" only when the owner has ticked its "Show as New" box
  in the piece editor (`/admin/products/[id]`, `storefront.md` §12.11). The box is off for every
  existing piece and for new pieces until the owner ticks it; it stays as she leaves it (no
  automatic expiry). The box has a label and a short hint in the editor's plain style (for example
  "מציג תווית 'חדש' על כרטיס היצירה בחנות"), with Hebrew and English entries like every string, and the change is saved with the rest of the
  piece. The storefront label MUST read "חדש" in Hebrew and "New" in English. This is the owner's
  own statement about her piece, so it meets the honesty rule of `storefront.md` §1.
- **FR-013**: **The pill rule** (amended after the Phase D gate, 2026-11-23). A card shows at most
  two pills, taken in this priority order from these candidates:
  1. "New", when the piece is new by FR-012;
  2. the **other category**: the piece's category chosen by the breadcrumb rule of
     `storefront.md` §8.4 (007 FR-037), when that is not the home-row category (so the first of
     its categories in the shop's category order that is not the home-row category);
  3. the **featured** pill: the home-row category, when the piece is in it, **except on the cards
     of the home page's row**, where it is never shown.

  The chosen pills are stacked in the order New, featured, other category. So the possible sets
  are: Featured; New; Category; New + Featured; New + Category; Featured + Category. The rule is
  the same on every page that shows cards (category pages included, where the other category may
  be the page's own), apart from the home row's exception. A category name is shown in the page's
  language, with the Hebrew name (marked as Hebrew) when the category has no English name. A piece
  with no candidate shows no pill.

**Design rules and checks**

- **FR-014**: `docs/design/storefront.md` MUST be updated in this feature: the new card and product
  page card described in §7.15, §7.14 and §8.4; §1, §3.3 and §6 changed so that product photos and
  thumbnails (including the cart line and checkout summary photos, §7.22 and §7.23) have the
  rounded corners above, and cards and the product page card carry `--shadow-card` (floating surfaces keep `shadow-float`); the new shadow tokens listed in §3.3; and
  the owner decisions of 2026-11-22 and 2026-11-23 recorded in the decisions list.
- **FR-015**: Automated tests that assert a replaced rule (for example sharp photo corners, no radius
  on thumbnails, a 3 px thumbnail ring, no panel on the product page, the old card's name and price
  sizes) MUST be updated to the new rules, and the existing checks (photos square within 1 px, no
  sideways scroll, add to cart, checkout) MUST keep passing. New automated tests cover the "Show as
  New" tick box and the pills' position; exact sizes and corners are checked by the owner with
  screenshots (slimmed 2026-11-23, owner request).
- **FR-016**: Everything else stays as it is: the rest of the cart drawer and checkout, the zoom
  view, the admin area (except the "Show as New" box of FR-012), the order of the product details
  and every text. All new styling MUST respect the project's existing rules: no inline style attributes, logical (direction-aware)
  layout only, every visible string in both languages, touch targets of at least 44 × 44 px.
- **FR-017**: The photos in the cart drawer lines (72 × 72 px) MUST have 8 px rounded corners and
  the photos in the checkout order summary (48 × 48 px) 6 px rounded corners; both stay square
  within 1 px and keep their `photo` background while loading.

### Key Entities *(include if feature involves data)*

- **Piece (product)**: already has its names, price, photos and categories. New: a "Show as New"
  yes/no choice the owner sets in the piece editor, off by default (FR-012).
- **Category**: already has Hebrew and English names and a shop order; one of them may be the
  home-row category (set in Settings). The pill uses the existing names.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In all five card places, at 320, 375, 900 and 1280 px and in both languages, every
  card has the mounted look (border, corners, photo inset and corners, name and price sizes and
  weights) of owner decision 1, checked by the owner with screenshots at the Phase D gate.
- **SC-002**: Every product photo box (cards, main gallery photo, thumbnails, cart lines, checkout
  summary) stays square within 1 px and has the rounded corners this spec gives it, and no page scrolls sideways at 320 or 375 px.
- **SC-003**: With reduced motion on, a card moved over or focused changes position by 0 px and its
  photo scale stays 1.
- **SC-004**: The automated accessibility checks of the storefront pages report no new problems, and
  every pill's text meets normal-text contrast (4.5:1) against its own background.
- **SC-005**: The product page keeps its current behaviour: add to cart, option errors, zoom view,
  thumbnails and the details that stay in view all pass their existing automated checks.
- **SC-006**: Page weight and loading stay within the performance budget of `storefront.md` §10: no
  new photos, fonts or scripts, and no content shift while the page loads.
- **SC-007**: At the Phase D gate the owner, looking at the real shop on a phone and a computer,
  agrees that the cards and the product page match the chosen previews.

## Assumptions

- The zoom view keeps its whole, uncropped photo with no rounded corners, and the admin area keeps
  its look (apart from the new tick box), including the photos on the admin order page.
- The product page shows no "New" or category pill; the labels are for cards only.
- The photo sizes the browser chooses for cards and the gallery stay as today; the cards are only a
  few pixels narrower, so no new photo sizes are needed.
- The gallery and details keep their current column shares from 900 px; only the gap changes
  (40 px → 36 px).
- The hover lift is for mouse and keyboard; on touch screens the card simply opens the piece.
- The previews (private pages shared with the owner; local copies in the design session's notes)
  are the visual reference. Where a preview and this spec differ, this spec wins.
- `specs/001-online-crafts-shop/` stays frozen; 007 FR-017 ("no panel") is replaced through the
  design guide, not by editing the 007 spec.
