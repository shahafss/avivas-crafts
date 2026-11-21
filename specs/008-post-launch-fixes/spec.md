# Feature Specification: Post-launch fixes

**Feature Branch**: `008-post-launch-fixes`

**Created**: 2026-11-20

**Status**: Approved by the owner (2026-11-20)

**Input**: User description: "Five fixes after the shop went live: (1) placing an order fails with
'the shop is not open for orders yet'; (2) the exempt-dealer number does not exist yet, so hide it
until the owner adds it in admin; (3) on the add/edit product page the images section comes first,
before the title; (4) pressing Publish with required fields missing scrolls to the missing field
and shows it in a red error state; (5) the contact page offers WhatsApp first, as a big button that
opens a new WhatsApp chat with the owner, above the existing form."

## Owner decisions (2026-11-20)

Agreed with the owner before this spec; binding for the plan.

1. **Ordering is never blocked by sample business details.** Today, in production, the shop
   refuses every order while any business detail in Settings (business name, business number,
   email, phone, address, notification emails) still has the sample value it was created with.
   That is why customers see "the shop is not open for orders yet". The block is removed for all
   of these details. The admin home keeps listing the details that still need attention.
2. **The business number becomes optional** in Settings, and it is **never shown on
   the website**: not in the footer, on the contact page, on the payment page or in any page. It
   appears only in the order emails sent privately to the one customer (confirmation, cancellation,
   refund), and only once the owner has entered a real number. Reason: as a sole trader,
   the owner's business number is normally her personal ID number; showing it on public pages is
   more exposure than she accepts. The owner accepts the small legal risk that Israeli
   distance-selling rules ask for the seller's ID number before the purchase (Consumer Protection
   Law §14ג(א)(1)); to be reviewed when a lawyer is engaged.
3. **The WhatsApp button uses the business phone** from Settings. No new setting.
4. **The "includes VAT" line is removed** from product prices. The owner will be an exempt dealer
   (עוסק פטור) and charges no VAT, so the line would be wrong.
5. **The header shows the shop's logo image instead of the shop name as text** (added
   2026-11-20). The logo is a round badge supplied by the owner (original in
   `assets/logo/logo-original.jpg`, 2000×2000). It hangs half out of the header: 50% of its height
   inside the white bar, 50% below it, over the page.
6. **The home page band sentence changes** (added 2026-11-20): the owner dislikes "slowly" and
   "only after you order". New text (owner's choice, option 2): see FR-030.
7. **Link previews and favicon** (added 2026-11-20): when the shop's address is shared (WhatsApp,
   Facebook, Telegram and so on), the preview shows an image, the shop name and a short
   description. The browser tab and home-screen bookmark show an icon made from the logo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Customers can place orders (Priority: P1)

A customer fills the cart, goes to the payment page and places an order. The order goes through,
even though the owner has not yet filled in every business detail in Settings.

**Why this priority**: the shop is live and cannot take a single order. Nothing else matters as
much.

**Independent Test**: on a production-mode shop whose Settings still hold some sample business
details, place an order with offline payment and see the order confirmation.

**Acceptance Scenarios**:

1. **Given** the shop runs in production and the business number is still the sample value,
   **When** a customer places a valid order, **Then** the order is created and the customer sees
   the confirmation page, not the "shop is not open" message.
2. **Given** any other business detail is still a sample value (name, email, phone, address,
   notification emails), **When** a customer places a valid order, **Then** the order is created.
3. **Given** some business details are still sample values, **When** the owner opens the admin
   home, **Then** it still lists those details as needing attention, as it does today.

---

### User Story 2 - The business number stays off the website (Priority: P1)

The owner's business number is (or will be) her personal ID number. It is never shown on the
website. Once she enters it in Settings, it appears only in the order confirmation emails. Until
then it appears nowhere. Product prices no longer say "includes VAT".

**Why this priority**: today the footer of every page shows a fake number (000000000) next to the
label "עוסק מורשה" (a VAT-registered dealer), which is wrong on both counts; the product page says
"includes VAT", which is wrong for an exempt dealer. It also ties into Story 1: the owner cannot
replace the sample number with a real one.

**Independent Test**: with any number in Settings, check the footer, contact page, payment page
and product page: no business number, no dealer label, no "includes VAT". Place an order: the
confirmation email shows the number only when a real one is set.

**Acceptance Scenarios**:

1. **Given** the Settings screen, **When** the owner leaves the business number empty and saves,
   **Then** the save succeeds (no "required" error).
2. **Given** any business number (empty, sample or real), **When** a customer views any page of
   the website (footer, contact page, payment page, every other page), **Then** no business number
   and no dealer label ("עוסק מורשה" / "VAT registration no.") is shown, and the other business
   details look as before.
3. **Given** a real business number is set, **When** an email with the seller details block is sent
   (order confirmation, cancellation, refund), **Then** its seller block shows the number with a neutral label ("מספר עוסק"
   / "Business no."), as today's line but without "עוסק מורשה".
4. **Given** the number is empty or still the sample value, **When** an order email is sent,
   **Then** its seller block has no business-number line.
5. **Given** a product page, **Then** the price shows no "includes VAT" line.

---

### User Story 3 - Publishing a product shows what is missing, where it is (Priority: P2)

The owner presses "Publish" on a product that is missing required details. The page scrolls to
the first missing field and puts the cursor there, and every missing field is marked in red with
a short message, so she sees at once what to fill in.

**Why this priority**: today the missing items are only listed in a box at the bottom of the page,
next to the Publish button, and the owner has to hunt for them. It slows down adding products,
which she does often.

**Independent Test**: on a new product with only a Hebrew name, press "Publish"; the page scrolls
to the first missing field, and every missing field shows a red error state with a message.

**Acceptance Scenarios**:

1. **Given** a product missing one or more required details, **When** the owner presses
   "Publish", **Then** the product is not published, the page scrolls so the first missing field
   (in on-screen order) is in view, and that field gets the keyboard focus.
2. **Given** the same press, **Then** every missing field shows the error state: a red border (or,
   for the photos and categories groups, a red outline on the group) and a short message under it
   saying what is needed.
3. **Given** a field is marked as missing, **When** the owner fills it in, **Then** its error state
   clears without waiting for another press of "Publish".
4. **Given** the owner fills in everything and presses "Publish" again, **Then** the product is
   published and no error states remain.
5. **Given** the missing item is "at least one photo", **Then** the photos section is the one
   scrolled to (it is the first section, see Story 4) and its upload control gets the focus.
6. **Given** the missing item is an option group with fewer than two values, **Then** the options
   section is marked and scrolled to in its on-screen order.

---

### User Story 4 - Photos come first on the product page (Priority: P2)

On the admin add/edit product page, the photos section is the first section of the form, above
the name and every other field.

**Why this priority**: the owner starts every product from its photo; having it at the bottom
means scrolling down and back up each time.

**Independent Test**: open any product in admin; the first section under the page heading is
the photos section.

**Acceptance Scenarios**:

1. **Given** the owner opens a new or existing product, **Then** the photos section is the first
   section of the form, before the name fields; the order of the other sections is unchanged.
2. **Given** the photos section moved, **Then** uploading, reordering, alt text and deleting
   photos work exactly as before.

---

### User Story 5 - Customers contact the owner on WhatsApp (Priority: P2)

On the contact page, the first and most visible option is a large WhatsApp button. Pressing it
opens WhatsApp (the app on a phone, WhatsApp Web on a computer) with a new chat to the owner's
number. The contact form stays below it as a second option.

**Why this priority**: the owner answers WhatsApp quickly and prefers it to email; customers in
Israel expect it.

**Independent Test**: open the contact page; the WhatsApp button is above the form; pressing it
opens a new tab to a WhatsApp chat with the business phone.

**Acceptance Scenarios**:

1. **Given** the business phone in Settings is a real number, **When** a customer opens the
   contact page, **Then** a large WhatsApp button is shown above the contact form, with a short
   line inviting them to message the owner on WhatsApp, and the form is presented as the
   alternative ("or write to me here").
2. **Given** the customer presses the button, **Then** a new tab or the WhatsApp app opens a new
   chat with the business phone number; the shop page stays open.
3. **Given** the business phone is still the sample value, **Then** the WhatsApp button is not
   shown and the page looks as it does today (form first).
4. **Given** the page is viewed in English, **Then** the button and its line are in English and
   open the same number.
5. **Given** a phone-sized screen, **Then** the button is full width, at least the shop's minimum
   touch size, and is the first thing after the page intro.

---

### User Story 6 - The shop's logo in the header (Priority: P2)

Every page shows the shop's round logo in the header where the shop name is today. The badge is
larger than the header bar: its top half sits inside the white bar, and its bottom half hangs
below the bar, over the page. It stays like that while the visitor scrolls, so the page content
slides under the hanging half.

**Why this priority**: the logo is the shop's identity and looks far more finished than plain
text; it is the first thing every visitor sees.

**Independent Test**: open any page on a phone and a computer, scroll down: the logo is centred
in the header, half inside and half below the white bar, sharp, with no square or checkerboard
around the circle; pressing it leads to the home page.

**Acceptance Scenarios**:

1. **Given** any page, **When** it loads, **Then** the header shows the logo badge where the shop
   name was (centred), and the shop name is no longer shown as text in the header.
2. **Given** the visitor has scrolled down (the white bar is showing), **Then** exactly half of the
   logo's height is inside the bar and half hangs below it, over the page content.
3. **Given** the top of any page, at rest, **Then** the hanging half does not cover the page's first
   content (breadcrumbs, page title, search field); there is enough room above it.
4. **Given** the top of the home page, where the header is see-through over the top photo, **Then**
   the logo is shown at the same place and size, hanging over the photo.
5. **Given** the logo, **Then** only the round badge is visible: the area outside the circle is
   truly transparent on every background (white bar, photo, page), with no grey square or
   checkerboard.
6. **Given** a screen reader, **Then** the logo link is announced with the shop's name in the page
   language (e.g. "Aviva's Crafts, home page" / "היצירות של אביבה, דף הבית").
7. **Given** a phone-sized screen, **Then** the logo is smaller but keeps the same half-in,
   half-out position, and does not overlap the menu, search, language or cart buttons.
8. **Given** the logo link, **Then** pressing it leads to the home page, and its touch area meets
   the shop's minimum touch size.

---

### User Story 7 - A warmer band sentence on the home page (Priority: P3)

The peach band on the home page carries a new sentence without "slowly" and "only after you
order".

**Why this priority**: small wording change, but it is one of the most visible sentences in the
shop.

**Independent Test**: open the home page in Hebrew and in English and read the band.

**Acceptance Scenarios**:

1. **Given** the home page, **Then** the band shows the new sentence (FR-030) in the page language,
   with its "shop now" link unchanged.

---

### User Story 8 - Shared links show a preview (Priority: P2)

When someone shares the shop's address on WhatsApp (or Facebook, Telegram, iMessage), the chat
shows a preview card: an image with the shop's logo, the shop name and a short description.

**Why this priority**: most of the shop's visitors will come from links shared in WhatsApp chats;
a bare address looks untrustworthy and gets fewer clicks.

**Independent Test**: paste the home page address into a link-preview checker (or a WhatsApp chat
with yourself): the card shows the image, name and description.

**Acceptance Scenarios**:

1. **Given** the home page address is shared, **Then** the preview shows the shop preview image,
   the shop name and the shop description, in the language of the shared address.
2. **Given** a product page address is shared, **Then** the preview shows the product photo, name,
   and description, as today.
3. **Given** any other page (category, all pieces, about, contact, legal pages) is shared,
   **Then** the preview shows the page title, the shop description (or the page's own, when it has
   one) and the shop preview image.

---

### User Story 9 - The shop has its own icon (Priority: P3)

The browser tab, bookmarks and a phone's home screen show the shop's icon, not a blank page icon.

**Why this priority**: small, but a blank icon looks unfinished.

**Independent Test**: open the shop in a browser tab and add it to a phone's home screen.

**Acceptance Scenarios**:

1. **Given** any page, **Then** the browser tab shows the shop's icon, clear at small size.
2. **Given** a phone, **When** the visitor adds the shop to the home screen, **Then** the icon is
   the shop's logo, not a screenshot or a letter.

---

### Edge Cases

- Preview services cache what they saw: after release, links already shared before the change
  may keep their old (empty) preview for a while. New shares show the new one.

- A browser with images turned off or a failed logo load: the link still shows the shop's name
  as text (the image's alternative text), so the header never ends up empty.
- The menu drawer or cart drawer is open: the logo does not sit above the drawer or its dimmed
  background.
- A very narrow phone (320 px wide): the logo shrinks so the header's buttons keep their size and
  nothing overlaps.

- The business phone is saved in a local format (e.g. `050-1234567`) rather than international:
  the WhatsApp link still opens a chat with the right Israeli number (digits only, with the
  country code).
- The business number is saved as spaces only: treated as empty (not in emails).
- The business number is the sample value `000000000`: treated as empty for emails; the admin home
  still lists it as needing attention.
- The owner-written legal pages (terms, about, shipping) mention VAT or "עוסק מורשה" in their own
  text: those are the owner's content, edited in admin, not changed by this feature; the owner is
  told at the end of the feature to check them.
- A product is missing several fields across sections: all are marked; the scroll goes to the
  first one on screen (photos before name, name before description, and so on).
- The owner presses "Save" (not "Publish") on an incomplete product: saving a draft still works
  with missing fields and shows no missing-field errors, as today.
- A missing field is in a section the owner has not reached yet on a small screen: the scroll
  brings it into view below the sticky header, not hidden under it.
- WhatsApp is not installed on a computer: the link opens WhatsApp's own web page, which offers
  WhatsApp Web; nothing in the shop breaks.
- Other business details (name, email, phone, address) are still sample values while orders are
  open: they are still shown to customers as they are today; filling them in is the owner's job,
  and the admin home reminds her.

## Requirements *(mandatory)*

### Functional Requirements

**Ordering (Story 1)**

- **FR-001**: The shop MUST accept orders in production regardless of whether any business detail
  in Settings still holds its sample value. All other checks on placing an order are unchanged.
- **FR-002**: The admin home MUST keep listing the business details that still hold sample values
  (and the other items it lists today), as a reminder.
- **FR-003**: The "the shop is not open for orders yet" message MUST no longer be shown to
  customers for this reason. (If the message has no other use, it is removed.)

**Registration number (Story 2)**

- **FR-004**: The business number in Settings MUST be optional: saving with it empty succeeds.
  When filled, it keeps today's length limit. The Settings screen tells the owner, in a short
  hint, that the number is shown only in order emails, never on the website.
- **FR-005**: A business number counts as "not set" when it is empty, only whitespace, or the
  sample value.
- **FR-006**: The website MUST NOT show the business number or a dealer label on any page, whatever
  is stored: the footer, the contact page's details block and the payment page's seller line
  drop it. The other business details shown there are unchanged.
- **FR-007**: Every email that carries the seller details block (the customer's order
  confirmation, cancellation and refund emails) MUST show the business number
  with a neutral label ("מספר עוסק" / "Business no.") when it is set, and no business-number line
  when it is not set.
- **FR-008**: The admin home MUST keep listing the business number as needing attention while it
  is the sample value. An empty number (cleared on purpose by the owner) is not listed.
- **FR-008a**: Product prices MUST NOT show an "includes VAT" line anywhere on the website.

**Product page (Stories 3 and 4)**

- **FR-009**: On the admin product page (new and existing products), the photos section MUST be the
  first section of the form, before the name fields. The other sections keep their order.
- **FR-010**: When "Publish" fails because required details are missing, the page MUST: mark every
  missing item in an error state (red border or group outline plus a short message naming what is
  needed); scroll the first missing item (in on-screen order) into view, clear of the sticky
  header; and move keyboard focus to it.
- **FR-011**: The error message of each missing item MUST be tied to its field for screen readers,
  and the field MUST be announced as invalid.
- **FR-012**: A missing item's error state MUST clear as soon as the owner fills it in (or adds a
  photo, or ticks a category).
- **FR-013**: The summary box of missing items next to the Publish button stays, so the owner who
  is looking at the button still sees the list.
- **FR-014**: The required items are unchanged: Hebrew name, Hebrew description, price in shekels,
  price in dollars (when a dollar shipping zone is on), at least one category, preparation time,
  at least one photo, and at least two values in every option group.

**Contact page (Story 5)**

- **FR-015**: When the business phone is not the sample value, the contact page MUST show a
  WhatsApp block first, before the contact form: a short heading or line inviting the customer to
  message on WhatsApp, and a large button with the WhatsApp icon and a label such as "Message me
  on WhatsApp". (Using the WhatsApp icon is fine under WhatsApp's brand rules for "contact us on
  WhatsApp" buttons; the plan checks the details.)
- **FR-016**: The button MUST open a new WhatsApp chat with the business phone number, in a new tab
  (or the WhatsApp app on a phone), using WhatsApp's public link format with the number in
  international digits-only form. No message text is pre-filled unless the plan finds a short
  greeting useful (then it is in the page language).
- **FR-017**: The contact form MUST stay on the page, below the WhatsApp block, introduced as the
  second option. The business details block stays as today, minus the business number (FR-006).
- **FR-018**: When the business phone is the sample value, the WhatsApp block MUST be hidden and the
  page MUST look as it does today.
- **FR-019**: All new texts MUST exist in Hebrew and English, in the owner's first-person voice.
- **FR-020**: The WhatsApp button MUST meet the shop's accessibility rules: AA contrast, minimum
  touch size, visible focus, an accessible name that says it opens WhatsApp in a new tab.
- **FR-021**: Opening the WhatsApp link MUST NOT load any WhatsApp script, cookie or tracker on the
  shop page: it is a plain link.

**Header logo (Story 6)**

- **FR-023**: The header MUST show the shop's logo badge in place of the shop name text, on every
  public page, in both languages, linking to the home page.
- **FR-024**: Half of the logo's height MUST be inside the header bar and half MUST hang below it,
  at every scroll position and on every page, phone and computer.
- **FR-025**: At rest at the top of a page, the hanging half MUST NOT cover the page's first
  content; the page leaves enough room for it.
- **FR-026**: The served logo MUST have a real transparent background outside the circle (the
  supplied file has a checkerboard drawn into the picture, which is removed), be sharp on
  high-density screens, and be small enough not to slow the page (in line with the image rules of
  the design system, §6). The original stays unserved in `assets/logo/`.
- **FR-027**: The logo MUST have alternative text with the shop's name in the page language, so
  the header link keeps its name for screen readers and when the image does not load.
- **FR-028**: The logo MUST NOT cover or block the header's buttons, the menu drawer, the cart
  drawer, the cookie banner or any dialog.
- **FR-029**: Places that use the shop name as text other than the header (page titles, emails,
  footer, home page top photo) are unchanged.

**Band sentence (Story 7)**

- **FR-030**: The home page band sentence MUST become, in Hebrew: "אני סורגת כל יצירה בעצמי,
  בסבלנות ובאהבה, במיוחד בשבילכם." and in English: "I crochet every piece myself, with patience
  and love, especially for you."

**Link previews (Story 8)**

- **FR-031**: Every public page MUST give link-preview services a title, a short description in
  the page language, the shop name as site name, the page address and a preview image.
- **FR-032**: The home page and every page without a better image of its own MUST use one shop
  preview image: 1200×630, showing the logo badge (owner-approved composition:
  the logo centred on the home page's top photo). It is built into the shop like the logo.
- **FR-033**: Product pages MUST keep their own preview (product photo, name, price and
  description), as today.
- **FR-034**: The shop description MUST be a fixed text in both languages, used for link previews
  and for search engines on pages that have no description of their own. Owner-approved
  text: Hebrew "יצירות סרוגות בעבודת יד, בסבלנות ובאהבה. משלוחים לכל הארץ.";
  English "Handmade crochet pieces, made with patience and love. Shipping across Israel."
- **FR-035**: The preview image MUST be reachable by the preview services without cookies or
  consent (a plain public image) and MUST NOT add any tracker.

**Favicon (Story 9)**

- **FR-036**: The shop MUST have a browser-tab icon, a home-screen icon for phones (Apple and
  Android) and a matching theme colour, all made from the logo. At the smallest sizes (16 and 32
  px) the icon MAY show only the yarn-ball drawing from the badge, because the badge's text cannot
  be read there.
- **FR-037**: The admin area MUST use the same icons.

**Legal texts (owner decision 2026-11-20)**

- **FR-038**: The Terms of Sale and Privacy Policy drafts (Hebrew and English) MUST stop saying
  that the business number is shown on the site, that the shop is a "licensed dealer" (עוסק
  מורשה), and that prices include VAT. The business number is described as given in the order
  emails. The live Terms and Privacy pages MUST be replaced with these drafts once, at the next
  deploy, even if they were edited in the admin area, with a new version recorded as for any
  Terms or Privacy change. Other pages are not touched.
- **FR-039**: The admin product form's price label MUST NOT say "including VAT".

**Design system**

- **FR-022**: The contact page's new WhatsApp block, the product form's error state and the header
  logo MUST follow the design system (`docs/design/storefront.md`); the feature updates the
  header (§7.18), the contact screen (§8.10), the band text and any component it adds or changes.

### Key Entities

- **Shop logo**: a fixed image built into the shop (like the home photos), changed by the
  maintainer, not in the admin area.
- **Shop settings**: the business number becomes optional (may be empty). No new fields. The
  business phone doubles as the WhatsApp number.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A customer can complete an order on the live shop with today's Settings (sample
  business number) on the first try.
- **SC-002**: 0 website pages show the business number, a dealer label or "includes VAT", whatever
  is stored; order emails show the number only when a real one is set.
- **SC-003**: After pressing "Publish" on an incomplete product, the owner sees the first missing
  field on screen with no manual scrolling, and every missing field is marked, on both phone and
  computer.
- **SC-004**: On the contact page, the WhatsApp button is the first contact option a visitor sees,
  on phone and computer, and opens a chat with the right number in one tap.
- **SC-006**: On every page, phone and computer, the logo sits half inside and half below the
  header with no visible square around it, and covers no content at rest.
- **SC-007**: Sharing the home page, a product page and the contact page in WhatsApp shows a
  preview card with an image in all three cases.
- **SC-008**: The shop shows its own icon in the browser tab and on a phone's home screen.
- **SC-005**: Every existing check still passes (types, lint, unit, integration, PostgreSQL, and
  the end-to-end flows for checkout, admin products and contact).

## Assumptions

- The business phone in Settings is the owner's WhatsApp number (owner decision 3).
- Sample business details other than the business number stay visible to customers until the
  owner fills them in; the owner is expected to fill them in now that orders are open. The admin
  home reminder is the safeguard.
- The WhatsApp link uses WhatsApp's public "click to chat" address; WhatsApp is not a data
  processor of the shop (the customer starts the chat in their own app), so the privacy policy
  needs at most a short sentence about it; the plan decides whether one is needed.
- "Publish" in the description means every state change that publishes a product (publish, and
  showing a hidden product again if it runs the same checks); the new error behaviour applies on
  both new and existing products, since they share one form.
- The owner confirmed (2026-11-20) that the live Settings already hold real business and
  notification emails, so new-order alerts reach her once orders open.
- The Terms of Sale and Privacy Policy texts say the business number is in the footer, that the
  shop is a "licensed dealer" and that prices include VAT. The drafts are corrected and, by owner
  decision (2026-11-20), the live Terms and Privacy pages are refreshed from them once at the next
  deploy, replacing any edits made there in the admin area (FR-038).
- Production runs with offline payment only (`PAYMENT_PROVIDER=none`); nothing here changes
  payment.
