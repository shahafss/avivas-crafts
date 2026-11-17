# Feature Specification: Storefront redesign

**Feature Branch**: `007-storefront-redesign`

**Created**: 2026-11-16

**Status**: Approved by the owner (2026-11-16), after reviewing the home page example; amended
the same day with the owner's answers at the plan gate

**Input**: User description: "Restyle the customer-facing shop so it looks very similar to the owner's
own Shopify shop (https://q2viqj-df.myshopify.com/, Shopify's free "Horizon" theme, "Balance"
style), while keeping every current function and Aviva's warm, personal first-person wording.
Design only: no function is removed." The full description, with the owner's eleven binding
decisions of 2026-11-16, is summarised under [Owner decisions](#owner-decisions-2026-11-16).

## Owner decisions (2026-11-16)

Agreed with the owner in a design discussion before this spec; binding for the plan.

1. **Colours**: the Shopify palette: white page, near-black dark green text, soft sage buttons
   with dark text, a dark green main action button, a peach band, a mint green footer. Shades may
   change only where needed to pass WCAG 2.1 AA contrast. Replaces the cream / marigold / rose /
   peach palette approved 2026-11-08.
2. **Font**: Assistant for all text in Hebrew and English, replacing Heebo. Headings use its
   bold weight, except the shop name on the top photo and the peach band sentence, which are thin
   as in the Shopify shop (owner answer 2026-11-16).
3. **Header** (superseded by the Phase D gate answers below and FR-008): a plain full-width white bar. Desktop: menu links at the reading-start side, shop
   name centred, icons at the reading-end side. Phone: menu and search | shop name | language and
   cart. On the home page it sits over the top photo, see-through while the page is scrolled all
   the way to the top, and becomes the white bar as soon as the visitor scrolls down; the same for
   every visitor (owner answer 2026-11-16). The free-shipping strip stays above it.
4. **Home page**: a full-width top photo with the shop name large over it and a short line in
   Aviva's voice; a swipeable row of the pieces in the "Featured" category with a "view all"
   link; then, as in the Shopify shop, the child photo banner, the peach band with one large sentence and a "shop now" text link
   with an arrow, and the shelf photo banner (each banner with heading, short line and a rounded
   button); the footer (order, band link and row: owner answers 2026-11-16). The category and sort
   buttons and the full list of pieces move to a new "All pieces" page (decision 12).
   The three owner-supplied photos are AI-generated images the owner owns, based on Aviva's real
   products and her real look; the owner approves using them, including the one with a child. They
   are built into the shop and changed by the maintainer, not in the admin area.
5. **Product photos**: square with sharp corners and no frame everywhere (cards, gallery, "You may
   also like", cart and order lines); existing photos are shown as a centred square.
6. **Product page**: large square photo(s) at the reading-start side, details at the reading-end
   side; outlined rounded quantity box and dark green add-to-cart button; everything on the page
   today stays; a "You may also like" row below.
7. **Every other public page** keeps its function and takes the new look.
8. **Footer**: mint green; keeps business details, legal links and the language switch; adds
   social links that Aviva fills in herself in Settings.
9. **Admin area**: same screens and layout, new colours and font only.
10. **Texts**: all current texts and Aviva's voice stay (first person, feminine singular;
    customers in the plural). The made-to-order note, the shipping / pickup / payment list, the
    free-shipping strip and the category and sort buttons stay (the latter on the "All pieces"
    page).
11. **Honesty rule**: amended to allow these owner-supplied AI-generated lifestyle photos. All
    other honesty rules stay (no fake reviews, counters, urgency or invented social proof).
12. **Home row from a category, several categories per piece, and the "All pieces" page** (owner
    answers 2026-11-16): the home page row shows the pieces of one category, "Featured" ("מומלצות"),
    instead of a separate "collection" list. A piece can now be in several categories (the piece
    screen gets checkboxes instead of the single dropdown), so a piece can be in "Featured" and in
    its own category at the same time. At release a "Featured" category is created and every
    existing piece is added to it, keeping its current category; it is chosen for the home row.
    "Featured" is an ordinary category (header links, category buttons, its own page), which Aviva
    can rename like any other. Which category the home row shows is a setting, so more rows like it
    can be added later, each showing one category. A new "All pieces" page holds the category
    buttons, the sort buttons and every piece; the row's "view all" link, the banner buttons, the
    band's "shop now" link and the cart's and payment page's "continue shopping" links lead there.

### Owner answers at the plan gate (2026-11-16)

Binding; they refine decisions 2–4 above (already folded into the text) and settle the plan's
open questions:

- **Lower home page**: stick to the Shopify shop: child banner, peach band (sentence plus a
  "shop now" text link with an arrow), shelf banner.
- **Shop name on the hero and band sentence**: thin, as in the Shopify shop.
- **Older browsers** that cannot switch the header without a script: the plain white bar there is
  accepted for now.
- **Header**: see-through at the very top of the home page, white as soon as the visitor scrolls
  down; the same for every visitor, including those whose device asks for reduced motion (the
  switch is instant, with no animation).
- **Darker strip behind the header** on the top photo (for readable menu text): accepted; to be
  judged on the finished page.
- **AI photos**: no marking.
- **Home page texts**: the drafts below are fine for now; final wording is reviewed when the
  implementation is done.
- **Pieces on the home page**: a swipeable row, as in the Shopify shop: about 2 pieces show at a
  time on a phone and 4 on a computer; the rest are reached by swiping or with arrow buttons.
  The pieces come from the "Featured" category (decision 12).
- **Home row source** (third round): no separate collections; categories are used, a piece may be
  in several, "Featured" is created at release with every existing piece in it, and it is an
  ordinary category.
- **"Continue shopping" links** in the cart, on the payment-result page and on the order status
  page lead to the "All pieces" page.
- **Home row size at release**: showing only the 12 newest pieces is fine.
- **Full list**: a new "All pieces" page; the category and sort buttons move there from the home
  page ("there is no point for these filters on the homepage anymore").
- **Reduced motion**: respected. When a visitor's device asks for reduced motion, real movement is
  turned off (the photo zoom on cards, smooth sliding of the row); the header's instant colour
  switch is not movement and stays the same for everyone.

### Owner answers at the Phase D gate (2026-11-16)

Binding; they replace decision 3 and the header parts of FR-008–FR-010 where they differ
(the FRs below are amended; FR-039–FR-043 are new). Given after seeing the finished home page.

- **Header items** (computer, from 1024 px), in reading order: "All pieces", two categories chosen
  in the admin, the home-row category (today "מומלצות"), "About", "Shipping & Returns", the shop
  name (the logo place; text for now), a search box (a real text field, not an icon), the cart
  icon. No language switch in the header. A sign-in icon and a favourites (heart) icon will come
  in a later feature; not now (FR-004 still holds).
- **Below 1024 px**: the hamburger menu, as today on phones: menu button, shop name, cart. The
  search box is inside the menu sheet; the sheet also keeps "Contact" and the full-word language
  link, as today (plan-review answer).
- **Language switch**: moves into the green free-shipping strip, on every screen size. The
  footer keeps its own language link.
- **Spacing**: paddings and gaps in the header are reduced so the one-row header fits from 1024
  px.
- **Category names**: limited in length so the header always fits. The coordinator calculated
  the limit from the header items (research D20): **12 characters**, Hebrew and English names.
  Plan-review answers: keep 12; ordinary 12-character names show in full, and a rare name made of
  unusually wide letters may be cut with "…" in the header, which is fine. No existing category
  has a longer name, so the limit applies plainly on create and rename, with no special handling
  for older long names.
- **The two header categories**: chosen by Aviva in Settings; the third link is always the
  home-row category, and it is not shown when the home row is set to none.
- **Darker strip behind the header**: kept, but it blends: darkest at the top, lighter towards the
  bottom in a smooth gradient, with no hard edge.
- **Hero line**: removed from the top photo for now; only the shop name stays on it. The owner
  will write a new line later. (The same sentence stays as the intro of the "All pieces" page,
  FR-003; the owner can change that later too.)
- **Home page texts** (banners, band, row, alt texts): final as they are.
- **The green strip is always shown** (plan-review answer: no separate fallback place for the
  switch). The second plan review found the strip today also hides when delivery is on without a
  free-shipping amount and pickup is off, with the shop open. Simplest fit with this answer: the
  strip is always rendered, and when it has no text it holds only the language switch
  (coordinator's default, shown to the owner at the plan gate).

### Owner answers: menu and cart drawers (2026-11-17)

Binding; they amend FR-002 (the cart page goes away), FR-008 (the menu sheet becomes a drawer) and
the cart parts of FR-017–FR-022 where they differ. FR-044–FR-048 are new.

- **Menu drawer**: the hamburger menu slides in from the side (the reading-start side, where the
  menu button is: right in Hebrew, left in English) like a drawer, with a transition. It starts at
  the top of the header (the bottom of the green strip, or the top of the screen once the strip
  has scrolled away), so it covers part of the header but never the green strip (owner answer at
  the plan review). The menu button
  turns into a close button with a transition: the three lines become two lines that form an X.
- **Cart drawer**: the cart button opens a cart drawer the same way (from the cart's side, the
  reading end; from the top of the header, not over the green strip; with a transition). It makes the cart page redundant.
- **In 007**: both drawers are part of this feature (owner choice), not a later one.
- **The cart page is removed completely**: `/{locale}/cart` shows "page not found". Every link that
  led to it (checkout's "back to cart", the product page's "in your cart" link, the payment return
  page) opens the cart drawer instead; places that sent the visitor there automatically go to the
  "All pieces" page instead.
- **Add to cart opens the drawer**: after a successful "add to cart" on a product page, the cart
  drawer opens by itself, showing what was just added, with checkout and "continue shopping".
- **Plan-review answers**: while a drawer is open, keyboard and screen-reader users stay inside it
  (modal) until it is closed. If the last piece is removed in the cart drawer while on the
  checkout page, the drawer shows the empty cart, and the shop goes to "All pieces" only when the
  drawer is closed. Following a link inside a drawer closes it.

### Owner visual fixes after testing (2026-11-17)

Binding; they amend FR-008–FR-010 and the header states in contracts/ui.md where they differ.

- **Brand centred on computers**: from 1024 px the shop name sits in the middle of the free space
  between the links and the search field (`margin-inline: auto`), not pushed to one side. Phones
  keep today's centred brand.
- **Hero shop name centred**: the h1 on the top photo is centred, on phones and computers.
- **Header fades**: on the home page the header stays fully see-through (with the blended dark
  strip) only while the page is scrolled all the way to the top. As soon as it is scrolled even 1
  px, it changes to the frosted white bar, and that change is a short fade in time (about 250 ms),
  not tied to how far the visitor scrolls; scrolling back to the very top fades it back. The fade
  is a brief moving state, never a resting one, so the header is readable whenever the page is
  still. (Owner clarification 2026-11-17; replaces the earlier "the switch is instant" answer and
  the scroll-linked fade built first.) The same for everyone.
- **Frosted white bar**: wherever the header is the white bar (every page, and the home page once
  scrolled), it is slightly see-through with a backdrop blur, so blurred shapes of what is behind
  show through. Browsers without `backdrop-filter` keep the solid white bar.
- **No dark layer on the two banners**: the child and shelf banners lose their dark band
  entirely; their text sits straight on the photo with only the soft text shadow. The owner chose
  this knowing the white text may not reach the WCAG AA contrast on light parts of the photos (an
  accepted exception, reported with measurements at the gate). The hero keeps its blended strip
  behind the header and its bottom band for the shop name.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A visitor lands on the new home page (Priority: P1)

A Hebrew-speaking visitor opens the shop on a phone from a WhatsApp link. She sees a large,
warm photo of crocheted dolls with the shop name over it, the free-shipping strip above, and a
plain white top bar. Scrolling, she finds a row of pieces as square photos with names and prices,
which she swipes sideways to see more, and a "view all" link; then a large photo banner with a
short line in Aviva's voice and a button to all the pieces, a peach band with one large sentence and a "shop now" link, a second
photo banner, and the mint footer.

**Why this priority**: the home page is the first impression and the place where the Shopify look
is most visible. On its own it already delivers the new look the owner asked for.

**Independent Test**: open `/he` and `/en` on a phone-sized and a desktop-sized screen; compare
section order and look with the owner's Shopify shop; check that the row swipes, its arrows work
on a computer, and every link leads to the "All pieces" page or the piece.

**Acceptance Scenarios**:

1. **Given** a visitor on a phone at `/he`, **When** the page loads, **Then** she sees, in order:
   the free-shipping strip (with the language switch), the header over a full-width top photo
   with the shop name readable on it (no tagline line, Phase D gate answer), the row of "Featured" pieces with square photos and a
   "view all" link, the child photo banner, the peach band with its "shop now" link, the shelf photo banner and
   the mint footer.
2. **Given** the same page in English at `/en`, **When** it loads, **Then** the layout reads left
   to right (menu links on the left, icons on the right, text aligned left), not a mirrored
   Hebrew page.
3. **Given** a banner, the band's "shop now" link or the row's "view all" link, **When** the
   visitor taps it, **Then** she reaches the "All pieces" page.
4. **Given** the row holds more pieces than fit the screen, **When** the visitor swipes it on a
   phone or presses its arrow buttons on a computer, **Then** the next pieces come into view; the
   page itself never scrolls sideways.
5. **Given** the "All pieces" page, **When** the visitor opens it, **Then** she sees every
   published piece in a grid of square photos, with the category and sort buttons working as they
   do on the home page today.
6. **Given** a slow phone connection, **When** the home page loads, **Then** the top photo is
   delivered in a size suited to the screen and the page is usable within the existing 3-second
   target.

---

### User Story 2 - A visitor views and buys a piece (Priority: P1)

The visitor opens a product. She sees a large square photo at the reading-start side (right in
Hebrew, left in English on wide screens; first on phones) and the details beside or below it:
name, price with VAT, the "made just for you" note with the time to make, description, options,
an outlined quantity box and a dark green add-to-cart button, the shipping / pickup / payment
list and the shipping and returns sections. Below is a "You may also like" row. She adds the piece
and goes through cart and checkout, which look new but work exactly as before.

**Why this priority**: buying is the shop's purpose; the redesign must not lose any part of the
current product, cart and checkout flow.

**Independent Test**: run the existing order path (product → cart → checkout → confirmation) in
both languages and both screen sizes; every step works as before and shows the new look.

**Acceptance Scenarios**:

1. **Given** a product with options, **When** the visitor adds it without choosing, **Then** the
   same inline error and focus behaviour as today happens, in the new style.
2. **Given** any product page, **When** it loads, **Then** the made-to-order note, the shipping /
   pickup / payment list, the shipping and returns sections, the photo zoom and the "You may also
   like" row are all present (the row only when other pieces exist).
3. **Given** a product that is not available for order, **When** it is shown on a card or its
   page, **Then** the "not available for order" label shows as today; there is never a "sold out"
   label.
4. **Given** the cart, checkout, payment return and order status pages, **When** the visitor uses
   them, **Then** every field, choice, message and step is the same as before; only colours,
   font, header, footer, photo shape and spacing changed.

---

### User Story 3 - Aviva adds her social links (Priority: P2)

In the admin Settings screen, Aviva types the addresses of her Facebook, Instagram and TikTok
pages (any of them, or none). The shop footer then shows an icon link for each one she filled in.

**Why this priority**: the only new function in this feature; the rest of the redesign does not
depend on it.

**Independent Test**: fill in one address in Settings, save, and check the footer shows exactly
that one icon link; clear it and check it disappears.

**Acceptance Scenarios**:

1. **Given** no social addresses are saved, **When** a page loads, **Then** the footer shows no
   social links and no empty space for them.
2. **Given** Aviva saves an Instagram address, **When** a page loads, **Then** the footer shows an
   Instagram icon link with an accessible name (for example "האינסטגרם שלי" / "My Instagram"),
   opening her page.
3. **Given** Aviva types an address that is not a valid web address of that platform, **When**
   she saves, **Then** she sees a plain Hebrew error naming the field and how to fix it, and
   nothing is saved for that field.

---

### User Story 4 - Aviva's admin area matches the new look (Priority: P3)

Aviva signs in and manages products, orders and settings. The screens, wording and steps are
exactly as before; colours and font match the new shop.

**Why this priority**: consistency only; the owner asked for little change in the admin area
(apart from several categories per piece and the home-row choice, User Story 5, and the social
links, User Story 3).

**Independent Test**: open each admin screen; layout, texts and actions are unchanged; colours
and font are the new ones; contrast passes.

**Acceptance Scenarios**:

1. **Given** any admin screen, **When** it loads, **Then** it uses the new font and colours and
   its layout, texts and controls are unchanged.

---

### User Story 5 - Aviva chooses the pieces for the home page row (Priority: P2)

On a piece's edit screen Aviva ticks the categories it belongs to, for example "Featured" and
"Dolls". The home page row shows the published pieces of "Featured". In Settings she can pick a
different category for the row, or none. At release every existing piece is already in "Featured"
and keeps its current category.

**Why this priority**: the home row needs pieces to show; the release step fills it, and Aviva
only adjusts it.

**Independent Test**: tick "Featured" on three published pieces only, and check the row shows
exactly those three while their category pages still list them; untick one and check it leaves
the row and stays on its category page.

**Acceptance Scenarios**:

1. **Given** the shop right after release, **When** the home page loads, **Then** the row shows
   the newest published pieces (up to 12), and each piece still appears on its own category page.
2. **Given** a piece ticked in "Featured" and "Dolls", **When** a visitor opens either category
   page, **Then** the piece is listed on both.
3. **Given** a piece in "Featured" that is a draft or hidden, **When** the home page loads,
   **Then** it is not shown.
4. **Given** no category is chosen for the row in Settings, or the chosen one has no published
   pieces, **When** the home page loads, **Then** the row is left out and nothing else changes.
5. **Given** a piece with no category ticked, **When** Aviva tries to publish it, **Then** she sees
   the same "missing category" message as today.
6. **Given** Aviva chooses "Dolls" and "Bears" as header categories 1 and 2 in Settings (FR-039),
   both with published pieces, **When** a visitor opens any page on a computer (1024 px or wider),
   **Then** the header shows "All pieces", "Dolls", "Bears", the home-row category, "About" and
   "Shipping & Returns" in that order; when she sets both back to "none", only "All pieces", the
   home-row category, "About" and "Shipping & Returns" remain.

---

### Edge Cases

- **Text over photos**: the shop name, the header over the top photo and the banner texts stay
  readable (AA contrast) over every part of the photo, on every screen width, in both languages.
- **Wide photos on phones**: the 2000×848 photos are much wider than a phone screen; on phones
  each is shown cropped so its main subject (the dolls, the child with the toy, the shelf) stays
  in view.
- **Long shop name or long Hebrew lines** over the hero: wrap without overflowing the photo or
  causing horizontal page scroll down to 320 px width.
- **Header over the hero**: on the home page the header sits over the photo while the page is at
  the very top; as soon as the visitor scrolls down it becomes the plain white bar so icons and
  links stay readable. On other pages it is always the white bar.
- **Product photos that are not square** (all current photos are 4:5): shown as a centred square;
  nothing stretches and the layout does not shift while photos load.
- **Few products**: "You may also like" shows fewer cards, or is omitted when there is no other
  published product.
- **Empty catalog / empty category / no search results**: the existing empty states show, in the
  new style.
- **English page with Hebrew-only owner text**: shown in Hebrew with correct direction, as today.
- **Reduced motion**: respected (owner answer). Any movement (the photo hover zoom, the row
  sliding when an arrow is pressed) is turned off when the visitor's device asks for reduced
  motion: the row then jumps straight to the next pieces. The row never moves by itself. The
  header's switch to white is instant (not an animation), so it behaves the same for every visitor.
- **Home row fits the screen**: when all its pieces fit, the arrow buttons are not shown (or are
  disabled); at the first and last piece the matching arrow is disabled.
- **Home category with many pieces**: the row shows at most 12 (newest first); the "view all" link
  leads to the rest.
- **Piece in several categories**: it is listed once on each of its category pages and once on
  "All pieces" and in search; its breadcrumb shows one of them (FR-037).
- **Consent banner** (dormant at launch): if turned on, it still appears and works in the new
  style.
- **Social link to a different site**: an address whose site is not the named platform is
  rejected, so the footer never links somewhere unexpected.

## Requirements *(mandatory)*

### Functional Requirements

**Whole storefront**

- **FR-001**: Every public page MUST use the new palette (owner decision 1) and the Assistant font
  (decision 2) in both Hebrew and English, with all text and controls meeting WCAG 2.1 AA
  contrast.
- **FR-002**: Every function the storefront has today MUST keep working unchanged: browsing,
  categories, sort, search, product options, gallery zoom, cart, checkout (shipping or pickup,
  online or offline payment), payment return, order status page, content and legal pages, contact
  form, language switch, consent mechanism, not-found and error pages, and the existing states
  (empty, not available, errors). The full list with category and sort buttons moves from the home
  page to the "All pieces" page (FR-033), where it works as it does today. Amended 2026-11-17: the cart page `/{locale}/cart` is removed and replaced by the cart
  drawer (FR-046–FR-048).
- **FR-003**: All current customer-facing texts MUST stay as they are, in Aviva's voice, in both
  languages; new texts (banner and band texts, social link names) MUST follow the same voice and
  exist in Hebrew and English.
- **FR-004**: The design MUST NOT add "sold out" labels, an account icon or sign-in for buyers,
  PayPal or other express-payment buttons, a newsletter sign-up, quick-add buttons on cards, or
  catalog filters.
- **FR-005**: No Shopify theme code, files, sample photos or sample texts may be used; the look is
  rebuilt by the project.
- **FR-006**: Hebrew pages MUST read right to left and English pages left to right as real layouts
  (decision 3, constitution I), including header, hero, banners, product page and footer.

**Header and top strip**

- **FR-007** (amended at the Phase D gate): The free-shipping strip MUST stay at the top of every
  page with its current text, in the new colours; it is always shown, holding the language switch
  (FR-041).
- **FR-008** (amended at the Phase D gate): The header MUST be a plain full-width white bar with
  no floating pill and no shadow. From 1024 px wide it is one row, in reading order: "All pieces"
  ("כל היצירות", leading to the "All pieces" page), the two header categories (FR-039), the
  home-row category, "About" and "Shipping & Returns" (the existing content pages), the shop name,
  a search text field, the cart icon. Below 1024 px: menu button, shop name, cart; the menu sheet
  holds the search field, "All pieces", every category with pieces (as today), "About",
  "Shipping & Returns", "Contact" and the full-word language link (as today). No language switch,
  account icon or favourites icon in the header bar itself. No
  header control ever overlaps another or the shop name, and the page never scrolls sideways.
- **FR-009**: On the home page the header MUST sit over the top photo with readable text and icons,
  and MUST become the plain white bar as soon as the visitor scrolls down; on other pages it
  is always the plain white bar. The cart badge, menu and search behave as today (the search
  field sends the visitor to the search page with the typed words).

**Home page**

- **FR-010**: The home page MUST show, in order: the top photo (hero) with the shop name as the
  page's main heading (no tagline line on the photo, Phase D gate answer); the row of pieces
  from the home category (FR-034), with the category's name as its heading and a "view all"
  link; the child photo banner; a peach band with one large sentence and a "shop now" text link
  with an arrow; the shelf photo banner; the footer. Each banner has a heading, one short line and
  a rounded button. The banner buttons, the band link and the "view all" link lead to the "All
  pieces" page. The home page has no category or sort buttons.
- **FR-011**: The hero MUST use the owner's workshop photo; the two banners MUST use the child
  photo and the shelf photo. Each photo MUST have alt text in Hebrew and English describing what it
  shows.
- **FR-012**: The banner and band texts MUST be approved by the owner before the feature is
  finished; [Home page texts](#home-page-texts-drafts-for-owner-approval) holds the drafts.
- **FR-013**: The three photos and their texts MUST be part of the shop's code and settings files,
  changeable by the maintainer; they are not editable in the admin area.
- **FR-014**: Each photo MUST be delivered in several sizes so phones download a phone-sized
  version, and the page MUST keep the existing performance targets (usable within 3 seconds on
  mobile 4G; first-load JavaScript at most 150 KB gzipped; product page 152 KB, see SC-004).

**Product cards and photos**

- **FR-015**: Product photos MUST be shown as squares with sharp corners and no frame on cards, in
  the product gallery, in "You may also like" and in cart, checkout and order lines; non-square
  photos are shown as a centred square. The zoom view shows the whole photo.
- **FR-016**: Product cards MUST show the photo, a larger product name and a smaller price
  ("from" price when option prices vary), and the "not available for order" label when it applies.

**Product page**

- **FR-017**: On wide screens the photo gallery MUST sit at the reading-start side and the details
  at the reading-end side; on phones the gallery comes first.
- **FR-018**: The details MUST keep everything shown today, in the same order: name, price with
  VAT note, the made-to-order note with the time to make, description, options, quantity and
  add-to-cart (or the not-available notice), the shipping / pickup / payment list, the shipping
  and returns sections. The quantity box MUST be an outlined rounded box and the add-to-cart
  button dark green.
- **FR-019**: Below the product, a "You may also like" / "אולי תאהבו גם" row MUST show up to 4
  other published products: first those sharing one of its categories other than the home-row
  category (newest first), then, if fewer than 4, the newest of the rest. It is omitted when there
  are none.
- **FR-020**: The made-to-order note MUST stay the page's one highlight, in a colour from the new
  palette.

**Other public pages**

- **FR-021**: Category, search, cart, checkout, payment return, order status, content, contact,
  not-found and error pages MUST take the new colours, font, header, footer, square photos, large
  page titles and the Shopify-like spacing, with no change to their content or steps.
- **FR-022**: Buttons MUST follow one scheme: the main action on each screen (add to cart, go to
  checkout, place order, send) dark green with light text; other buttons sage with dark text or
  outlined; all rounded, all at least 44 px tall.

**Footer and social links**

- **FR-023**: The footer MUST be mint green and keep the business details, the information and
  legal links, the cookie settings button (when consent is required), the language switch and the
  copyright line.
- **FR-024**: Aviva MUST be able to enter, change and clear up to three social page addresses
  (Facebook, Instagram, TikTok) in admin Settings, with plain Hebrew labels and errors.
- **FR-025**: An address MUST be accepted only if it is a secure web address (`https`) on that
  platform's own site; otherwise the field shows an error and is not saved.
- **FR-026**: The footer MUST show one icon link for each saved address and nothing for empty
  ones. Each link has an accessible name in the page's language. Icons are drawn by the shop; no
  outside scripts, fonts, widgets or embeds are loaded, and nothing is sent to the platforms until
  the visitor clicks.

**Admin area**

- **FR-027**: The admin area MUST use the new font and colours, with the same screens, layout,
  texts and steps, and AA contrast.

**Categories, the home row and the "All pieces" page**

- **FR-031**: At release, a category "Featured" ("מומלצות", address `featured`) MUST be created
  (or reused, if one with that address exists) as the last category, every existing piece MUST be
  added to it while keeping its current category, and it MUST be chosen for the home row. It is an
  ordinary category: Aviva can rename it, reorder it, and it shows in the header, the category
  buttons, the sitemap and its own page.
- **FR-032**: A piece MUST be able to belong to several categories, chosen with checkboxes on the
  piece's edit screen; publishing still needs at least one. Category pages, the category buttons
  that list categories with pieces, the admin product list's category filter, the sitemap and
  "You may also like" work with several categories per piece. A category that has pieces still
  cannot be deleted, as today.
- **FR-033**: A public "All pieces" page MUST show every published piece in the square-photo grid
  with the category buttons and the sort buttons (newest, price low to high, high to low), the
  empty state when there are no pieces, and the same title, search-engine and language-switch
  behaviour as other catalog pages. The category buttons' "All" button leads to this page.
- **FR-034**: Aviva MUST be able to choose in admin Settings which category the home page row
  shows, or none (default "Featured", FR-031). The row shows that category's published pieces,
  newest first, at most 12; it is left out when none is chosen or it has no published pieces. The
  design keeps rows reusable, so a later feature can add more rows, each showing one category.
- **FR-035**: The row MUST be swipeable sideways with about 2 pieces visible on a phone and 4 on a
  computer, with the next piece partly visible on a phone when more follow; it snaps to whole pieces. From
  900 px it has previous / next arrow buttons with accessible names in the page's language, which
  move by one screen of pieces and are disabled at the ends. It works with a keyboard (tabbing
  through the pieces brings each into view), reads right to left in Hebrew and left to right in
  English, never moves by itself, and never makes the page scroll sideways.
- **FR-036**: Under reduced motion (device setting) the row's arrows move it instantly, without
  sliding.

- **FR-037**: Where a page names one category for a piece (the product page breadcrumb, its
  structured data), it MUST use the piece's first category in the shop's category order that is
  not the home-row category, or the home-row category when it has no other.
- **FR-038**: The cart's "continue shopping" links, the payment-result page's links back to the
  shop and the order status page's "back to the shop" link MUST lead to the "All pieces" page.
  Amended 2026-11-17 (FR-046): in the cart drawer, "continue shopping" closes the drawer, and the
  empty cart's button leads to "All pieces".

**Header changes from the Phase D gate (owner answers 2026-11-16)**

- **FR-039**: Aviva MUST be able to choose in admin Settings two header categories ("קטגוריה
  בתפריט 1" and "2"), each a category or none. The header shows them in that order after "All
  pieces", then the home-row category (FR-034). A chosen category is shown only when it has at
  least one published piece; the same category is never shown twice; when the home row is set to
  none, its link is not shown. At release both header choices are empty.
- **FR-040**: A category's Hebrew and English names MUST be at most 12 characters when Aviva
  creates or renames a category (research D20), with a plain-Hebrew error message shown under the
  name field. Ordinary 12-character names show in full in the header; a rare name made of
  unusually wide letters may end with "…" there (owner answer), and a header link never overlaps
  anything.
- **FR-041**: The language switch MUST be in the free-shipping strip on every page and screen
  size, at the strip's reading-end side, with the same accessible name and target as today; the
  strip's text stays centred and readable at 320 px. The strip is always shown; when it has no
  text (no free-shipping amount and no pickup), it holds only the switch.
- **FR-042**: The darker strip behind the see-through header on the top photo MUST blend: strongest
  at the top, fading smoothly to nothing towards the bottom with no visible edge, while the header
  text and icons keep WCAG 2.1 AA contrast (at least 4.5:1 for text) everywhere they sit.
- **FR-043**: The header search field MUST be a labelled text field (both languages) that sends the
  visitor to `/{locale}/search?q=<words>` on Enter or with its search button, works without
  JavaScript, is at least 44 px tall, and is readable in both header states (over the photo and
  on the white bar).

**Drawers (owner answers 2026-11-17)**

- **FR-044**: Below 1024 px the menu MUST open as a drawer that slides in from the reading-start
  side, from the header's top edge as it is on screen (under the green strip, or the top of the
  screen once the strip has scrolled away) to the bottom of the viewport, covering the header but
  never the strip, and slides back out when closed. While it is open the page behind (below the
  strip) is dimmed and does not scroll, and the drawer is modal: keyboard focus and the
  screen-reader cursor stay inside it. A tap outside it, `Esc` or the close button closes it, and
  focus returns to the menu button; following a link inside it closes it. It is labelled ("תפריט
  האתר" / "Site menu") and holds what the menu sheet held (FR-008).
- **FR-045**: The menu button's three lines MUST turn into an X (two crossed lines) with a
  transition as the drawer opens, at the same place on screen, and back into three lines as it
  closes. The X is the drawer's close button, named "סגירת התפריט" / "Close menu"; the menu button
  keeps its name and reports whether the menu is open.
- **FR-046**: The cart button MUST open a cart drawer that slides in from the reading-end side
  (the cart's side), from the header's top edge like FR-044, with the same dimming, modal focus,
  closing and focus-return rules, at every screen width. It shows the cart's lines (photo, name, options, unit price,
  quantity, remove), the free-shipping note, the subtotal, a "to checkout" button and a "continue
  shopping" button that closes it, and the empty state when the cart is empty; prices and flags
  come from the server exactly as on the old cart page. It has a heading ("הסל שלי" / "My cart")
  and a close button with an X at the cart button's place, named "סגירת הסל" / "Close cart"; the
  drawer is labelled by its heading. Removing the last piece while on the checkout page shows the
  empty state; the shop goes to `/{locale}/shop` only when the drawer is closed.
- **FR-047**: A successful "add to cart" on a product page MUST open the cart drawer. Every link
  to the cart page MUST become a control that opens the cart drawer (product page "in your cart",
  checkout "back to cart", payment return page); automatic redirects to the cart page MUST go to
  `/{locale}/shop` instead.
- **FR-048**: The page `/{locale}/cart` MUST no longer exist (it answers "page not found"). The
  cart itself (kept on the device), its pricing on the server and the checkout are unchanged. With
  reduced motion the drawers and the X appear and disappear without sliding or turning.

**Documents**

- **FR-028**: The design system (`docs/design/storefront.md`) MUST be updated to describe the new
  look (colours, font, header, home page, cards, product page, footer, admin colours) and the
  amended honesty rule, and stay binding.
- **FR-029**: `PRODUCT.md` MUST be updated: Brand Commitments (the approved look, now the
  Shopify-like direction of 2026-11-16), Evidence on Hand and principle 5 (the owner-supplied
  AI-generated lifestyle photos are allowed; other "never fabricate" rules stay).
- **FR-030**: `docs/roadmap.md` MUST list this feature with its status.

### Key Entities

- **Shop settings › social links**: up to three optional addresses (Facebook, Instagram, TikTok),
  each empty or a valid `https` address on that platform's site. Not personal data of customers.
- **Piece ↔ category**: a piece belongs to one or more categories (zero while a draft); replaces
  today's single category field.
- **Shop settings › home category**: the category the home page row shows, or none.
- **Home page content** (in code, not in the database): for the hero and each banner, a photo in
  several sizes, alt text, heading, short line and button text in Hebrew and English; the peach
  band sentence in both languages.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner, comparing the new shop side by side with her Shopify shop on a phone and
  a computer, says it looks very similar (header, home page sections, product grid, product page,
  colours, font, footer).
- **SC-002**: 100% of the existing automated checks of storefront and admin functions pass after
  the redesign (no function lost), in both languages and on phone and desktop sizes.
- **SC-003**: Automated accessibility checks report zero WCAG 2.1 AA violations on every public
  page and every admin screen, in Hebrew and English.
- **SC-004**: Every public page keeps first-load JavaScript at or under 150 KB gzipped (checkout
  155 KB; product page 152 KB, 157 KB with the cart drawer open: owner answer 2026-11-17), and product and catalog pages are usable within 3 seconds on a simulated mobile 4G
  connection.
- **SC-005**: On a phone, the home page's top photo download is under 200 KB.
- **SC-006**: No page has horizontal scrolling at 320 px width, in either language.
- **SC-007**: A visitor still gets from a product link to a confirmed order in under 3 minutes on a
  phone.
- **SC-008**: Aviva adds or removes a social link in Settings in under 1 minute without help.
- **SC-009**: Aviva takes a piece out of the home row and puts another in (ticking "Featured") in
  under 2 minutes without help.

## Home page texts (drafts for owner approval)

Written in Aviva's voice (first person, feminine singular; customers in the plural). They state
only what is true for this shop. The owner may rewrite any of them.

| Place | Hebrew | English |
|---|---|---|
| Hero heading | the shop name (from settings) | the shop name |
| Hero line | כל בובה וכל חיה כאן אני סורגת ביד, אחרי שאתם מזמינים. | I knit or crochet every piece here by hand, after you order. |
| Banner 1 (child) heading | נסרגו כדי שישחקו בהן | Made to be played with |
| Banner 1 line | רכות ונעימות לחיבוק, וכל אחת נסרגת במיוחד בשבילכם. | Soft and cuddly, and each one is made just for you. |
| Banner 1 button | לכל היצירות | See all pieces |
| Banner 2 (shelf) heading | לכל אחת אופי משלה | Each one has its own character |
| Banner 2 line | דובים, ארנבים, קופים ועוד. בחרו, ואני אסרוג בשבילכם. | Bears, bunnies, monkeys and more. You choose, and I'll crochet it for you. |
| Banner 2 button | לכל היצירות | See all pieces |
| Peach band sentence | אני סורגת כל יצירה בעצמי, לאט ובאהבה, רק אחרי שאתם מזמינים. | I crochet every piece myself, slowly and with love, only after you order. |
| Peach band link (with an arrow) | לקנייה | Shop now |
| Home row heading | the home category's name (from the admin area) | its English name, or the Hebrew one |
| Default home category name (Aviva can rename it) | מומלצות | Featured |
| Home row link (with an arrow) | לכל היצירות | View all |
| Row arrow buttons (accessible names) | הקודמות / הבאות | Previous / Next |
| "All pieces" page title and menu link | כל היצירות | All pieces |

## Assumptions

- The photo order follows the Shopify shop: workshop photo as hero, child photo as the first
  banner, shelf photo as the second. The owner supplied the original files (2000×848 JPEG);
  copies are kept outside the repository until the plan places them in the project.
- "Built into the shop" means the photos live in the project and the texts in the translation
  files; changing them is a code change by the maintainer.
- The banners' buttons, the band link and the row's "view all" link lead to the new "All pieces"
  page; the plan decides its address.
- Pieces in the home row are ordered newest first; Aviva does not order them by hand in this
  feature.
- The current "More {category}" row becomes "You may also like", with the fill rule in FR-019.
- Photo shape changes are display only: Aviva's stored photos are not re-cut or re-uploaded.
- Customer emails keep their current look; restyling emails is out of scope.
- The made-to-order note's highlight colour, the exact shades and the header-over-photo treatment
  are set in the plan within the palette and contrast rules.
- Admin "colours and font only" means no layout, wording or flow changes in admin, apart from the
  three new social link fields and the home-row category choice in Settings, and the category
  checkboxes on a piece (replacing the single dropdown).
- The Assistant font is free to use (SIL Open Font License) and is self-hosted like Heebo today;
  no new paid service is needed.
- The launch stays paused until this feature is merged to `dev` and released.
