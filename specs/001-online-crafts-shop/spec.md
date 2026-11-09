# Feature Specification: Aviva's Crafts Online Shop

> **Frozen 2026-11-09.** This feature is the record of the MVP: User Stories 1 and 2 (the owner
> manages products; visitors browse, cart, check out as guests and pay) were built and approved.
> The unbuilt work (User Stories 3–5, admin security management, launch readiness) moved to
> [`docs/roadmap.md`](../../docs/roadmap.md), where each item becomes its own Spec Kit feature.
> The storefront design system `design/` moved to [`docs/design/`](../../docs/design/); paths in
> this feature that point to `design/…` now mean `docs/design/…`. Do not edit this feature any more.

**Feature Branch**: `001-online-crafts-shop`

**Created**: 2026-10-31

**Status**: Approved (2026-11-07); clarified 2026-11-08 (storefront design; plan review rounds 2–4)

**Input**: User description: "An online shop in which my Mom (Aviva) would be able to sell her wool
dolls and other wool crafts she makes. She should be able to have an admin view in which she can
add items with images, prices, and description. Visitors should be able to buy and order items
from her shop without signing in. It should be in Hebrew by default, with an option to switch to
English."

## Clarifications

### Session 2026-10-31

- Q: How do customers pay? → A: Both. At checkout the customer chooses either to pay online
  (card, and Bit where the payment provider supports it) or to pay offline (Bit / PayBox / bank
  transfer / cash on pickup), in which case the owner confirms the payment manually.
- Q: Which delivery methods are offered and how is shipping priced? → A: Shipping (mail or
  courier) for a flat fee, free shipping above an order amount set by the owner, and free
  self-pickup.
- Q: Are items one-of-a-kind, small batches, or made to order? → A: Everything is made to order
  after purchase; stock quantities are not tracked.

### Session 2026-11-07

- Assumption corrected: customers are in Israel only at launch, but the shop MUST be prepared for
  worldwide shipping later.
- Assumption corrected: prices may be in ₪ (including VAT) or in USD.
- Assumption corrected: product variants exist but are rare.
- Q: How should ₪ and USD prices work? → A: By shipping destination. Orders shipping within Israel
  are priced and charged in ₪ including VAT; orders shipping abroad are priced and charged in USD
  using a USD price the owner sets per product (and per option adjustment). USD pricing stays
  inactive until an international shipping zone is enabled.
- Q: How should admins sign in to the admin area? → A: Sign in with Google (approved accounts
  only), then confirm with a passkey registered in the shop. The passkey is unlocked with the
  device's screen-lock PIN or passcode, so fingerprint or Face ID is never required. The shop
  stores no admin passwords.
- Q: Should the shop measure visitors, and how? → A: Yes, with privacy-friendly cookieless
  analytics only. At launch no optional cookies or third-party trackers are used, so no consent
  banner is shown. The consent mechanism is built and turns on automatically if any optional
  cookie category is ever enabled.

### Session 2026-11-07 (planning gate)

- Q: Must the seller's address be published? → A: Yes. The business address is shown with the
  other business details (distance-selling disclosure).
- Q: Is the business VAT-registered? → A: Yes (עוסק מורשה); ₪ prices include VAT.
- Q: What happens with photos larger than normal phone photos (e.g., a phone's 200 MP mode)? →
  A: Photos over 20 MB or 50 MP are rejected with a message asking for a normal photo. (Refined in
  plan review round 4: the limit is 51 million pixels, so 50 MP phone photos are accepted.)
- Q: The owner uses an Android phone. → Photos in the phone's high-efficiency format (HEIC/HEIF)
  MUST be accepted like JPEG.
- Q: Google sign-in plus a recovery code can be phished; how should recovery work? → A: Harden
  it. A passkey registered with a recovery code needs approval by another admin before it can be
  used; if there is no other admin, it works immediately but for 24 hours cannot change admins,
  passkeys, recovery codes, settings or customer data exports, and all admins are emailed.
  (Refined on 2026-11-08: the "no other admin" case is refused instead; see Session 2026-11-08 (plan
  review).)

### Session 2026-11-08 (storefront design)

- Decision: option values may carry an optional colour dot, chosen from a fixed palette of 12
  yarn colours (design/storefront.md §7.13a).
- Q: How is the preparation time shown after ordering, when an order has several items? → A: Each
  order line stores the product's preparation time as it was at order time, and the confirmation
  page and email list each item's own preparation time.
- Q: Does a product that is "not available to order right now" still show its options? → A: Yes,
  read-only (FR-011 unchanged); only the quantity and add-to-cart controls are replaced by the
  "not available" notice.
- Q: While only Israel ships, what does the checkout country choice offer? → A: Israel and
  "Other country"; choosing "Other country" shows the "ships within Israel only" message with the
  pickup and contact alternatives. Real countries appear once another zone is enabled.

### Session 2026-11-08 (plan review)

- Q: How does recovery work when there is no other admin to approve the new passkey? → A: Recovery
  always needs the other admin. The shop always has two admins (the maintainer and Aviva), both set
  up before launch. A passkey registered with Google and a recovery code can be used only after the
  other admin approves it. If only one admin exists, recovery with a code is refused with a message
  saying to contact the maintainer, who restores access with a server-side command. The 24-hour
  restricted mode is dropped.
- Q: Is the shop's name the same as the legal business name? → A: No. The shop name (header
  wordmark, home page title, browser tab title, © line, email sender name) is its own setting, in
  Hebrew and optional English. The legal business name stays with the other business details
  (FR-047).
- Q: Should security changes ask for the passkey again? → A: Yes. Approving or rejecting a recovery
  passkey, adding or removing a passkey or an admin, creating a new setup link, getting new
  recovery codes, clearing another admin's sign-in block, and ending sessions ask the admin to
  confirm with their passkey again unless they did so in the last 5 minutes. (Refined after plan
  review round 4: ending sessions is exempt; see Session 2026-11-08 (plan review round 4).)

### Session 2026-11-08 (plan review round 4)

- Q: Should signing out of all devices, or ending one session, also ask for the passkey again? → A: No.
  Ending sessions only reduces access, and an admin who is temporarily blocked from passkey checks
  must still be able to end sessions.
- Q: An admin is removed whose email was the only notification address. What happens? → A: The
  removed admin's address is always taken off the notification list; if the list would become empty,
  the remaining admin's Google email takes its place, so notifications are never lost.
- Q: Does the 50-megapixel photo limit accept photos from a phone's 50 MP mode? → A: Yes. The limit is
  51 million pixels, so such photos (e.g., 8160×6144) are accepted.

### Session 2026-11-08 (implementation)

- Q: Decoding a 50 MP HEIC photo needs about 544 MB, more than the 512 MB server. What is the fallback? →
  A: A lower pixel limit for HEIC/HEIF only, covering the phone's normal resolution (about 12–16 MP; the
  exact figure is the largest that passes the whole-app memory measurement). Larger HEIC/HEIF photos are
  rejected with a Hebrew message asking for the camera's normal resolution or a JPEG. JPEG, PNG and WebP
  keep the 51-million-pixel limit.
- Q: The owner removes the last photo of a published product. What happens? → A: It is refused with a
  Hebrew message to add another photo first or move the product to draft; a published product always
  keeps at least one photo.
- Q: "New product" creates a draft named "מוצר חדש". Can it be published under that name? → A: No.
  Publishing is refused while the Hebrew name is still the placeholder, shown as a missing field.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Owner adds and manages products (Priority: P1)

Aviva signs in to a private admin area and adds a new product: she uploads one or more photos
(typically taken on her phone), writes a name and description in Hebrew (and optionally in
English), sets a price, picks a category, states how long it takes to make, and publishes it.
For the occasional product that comes in options (e.g., a doll in three hair colors) she adds
those options. Later she edits the price or description, reorders the photos, marks a product
as temporarily not available to order, hides it, or deletes it.

**Why this priority**: Without products there is nothing to sell. This is also the part only the
owner can do, so it must be easy enough for her to manage alone.

**Independent Test**: Sign in as the owner, create a product with three photos, publish it, and
confirm it appears in the public catalog; edit its price and confirm the new price is shown;
hide it and confirm it disappears from the public catalog.

**Acceptance Scenarios**:

1. **Given** the owner is signed in, **When** she fills in name, description, price, category,
   preparation time, uploads photos, and publishes, **Then** the product appears in the public
   catalog with its main photo, name, and price.
2. **Given** a published product, **When** the owner changes its price and saves, **Then**
   visitors see the new price, and orders already placed keep the price they were placed at.
3. **Given** a published product, **When** the owner marks it hidden, **Then** it no longer
   appears in the catalog or search, and its direct link shows a "not available" message.
4. **Given** a published product, **When** the owner marks it "not available to order right
   now", **Then** it stays visible in the catalog with that label and cannot be added to the
   cart.
5. **Given** a product, **When** the owner chooses delete, **Then** she is asked to confirm, and
   after confirming it is removed from the catalog; past orders that contain it still show its
   name, photo, chosen options, and price.
6. **Given** the owner adds an option group "Hair color" with values "brown", "blonde" (+₪20),
   **When** a visitor opens the product, **Then** they must choose a hair color before adding it
   to the cart, and the price shown reflects the chosen value.
7. **Given** the owner is not signed in, **When** anyone opens an admin page, **Then** they are
   sent to the sign-in page and see no admin data.
8. **Given** the owner left the English fields empty, **When** a visitor views the product in
   English, **Then** the Hebrew name and description are shown.
9. **Given** the owner uploads a phone photo that contains location data, **When** the photo is
   published, **Then** the public image contains no location or camera metadata.

---

### User Story 2 - Visitor browses and places an order without an account (Priority: P1)

A visitor opens the shop (usually from a link on a phone), browses the catalog by category,
opens a product to see its photos, description, and how long it takes to make, adds items to a
cart, and checks out as a guest: they enter contact details, choose shipping or self-pickup,
accept the terms of sale, and choose to pay online or offline. They receive an order
confirmation on screen and by email.

**Why this priority**: This is how the shop makes sales. Together with Story 1 it forms the
minimum viable shop.

**Independent Test**: With at least one published product, as an anonymous visitor on a phone,
add two items to the cart, check out with shipping and online payment in the provider's test
mode, and confirm an order number is shown, a confirmation email arrives, and the order appears
in the admin area marked paid. Repeat with self-pickup and offline payment and confirm the order
is marked "awaiting payment" and the payment instructions are shown and emailed.

**Acceptance Scenarios**:

1. **Given** published products exist, **When** a visitor opens the shop, **Then** they see the
   catalog in Hebrew, laid out right-to-left, with product photos, names, and prices.
2. **Given** a visitor is viewing a product, **When** they add it to the cart, **Then** the cart
   shows the item, chosen options, quantity, and running total, and the cart is kept if they
   leave and return later on the same device.
3. **Given** a cart whose subtotal is below the free-shipping amount, **When** the visitor
   chooses shipping, **Then** the flat shipping fee is added to the total; **When** the subtotal
   reaches the free-shipping amount or they choose self-pickup, **Then** no delivery fee is added.
4. **Given** checkout, **When** the visitor chooses online payment and the payment provider
   confirms the payment, **Then** an order is created with a unique order number, marked paid,
   the visitor sees a confirmation page, and a confirmation email is sent to them.
5. **Given** checkout, **When** the visitor chooses online payment and the payment fails or is
   abandoned, **Then** no confirmed order is recorded, the owner is not notified, and the visitor
   can retry or switch to offline payment without re-entering their details.
6. **Given** checkout, **When** the visitor chooses offline payment, **Then** an order is created
   marked "awaiting payment", and the confirmation page and email show the owner's payment
   instructions (e.g., Bit number, bank details) and the order number to quote.
7. **Given** checkout, **When** a required field is missing or invalid (e.g., malformed email or
   phone), or the terms of sale were not accepted, **Then** the visitor sees a clear message next
   to that field and no order is created.
8. **Given** the visitor never signed in, **When** they complete an order, **Then** at no point
   were they asked to create an account or password.
9. **Given** the visitor reaches the confirmation page, **Then** it states the expected
   preparation time before shipping or pickup.

---

### User Story 3 - Owner handles incoming orders (Priority: P2)

When an order is placed, Aviva is notified. In the admin area she sees a list of orders, newest
first, opens one to see the items, chosen options, customer contact details, delivery choice,
and payment state. She marks offline payments as received, and moves the order through statuses
(new → in preparation → shipped / ready for pickup → completed, or cancelled). The customer is
emailed when the order ships or is ready for pickup.

**Why this priority**: Orders must be fulfilled, but in the earliest version the owner could
manage from notification emails alone; the order screen makes this reliable and organized.

**Independent Test**: Place a test order with offline payment, confirm the owner receives a
notification, mark the payment as received, change the status to "shipped" with a tracking
number, and confirm the customer receives the matching email.

**Acceptance Scenarios**:

1. **Given** a visitor places an order (paid online, or offline awaiting payment), **When** the
   order is created, **Then** the owner receives a notification containing the order number,
   items, total, payment method and state, and customer contact.
2. **Given** orders exist, **When** the owner opens the orders list, **Then** she sees each
   order's number, date, customer name, total, payment state, and status, newest first, and can
   filter by status and by payment state.
3. **Given** an order awaiting offline payment, **When** the owner marks it paid, **Then** the
   payment state changes to paid and the date is recorded.
4. **Given** an order, **When** the owner changes its status to shipped or ready for pickup,
   **Then** the customer receives an email in the language they used while ordering, including
   any tracking number or pickup instructions she entered.
5. **Given** an order, **When** the owner cancels it, **Then** she is asked to confirm and the
   order is marked cancelled; if it was paid online, she is reminded to issue the refund and can
   mark it refunded.

---

### User Story 4 - Visitor switches language to English (Priority: P2)

A visitor who does not read Hebrew uses a clearly visible language switch to view the shop in
English. The whole interface (navigation, buttons, checkout, messages, emails) switches to
English with a left-to-right layout, and their choice is remembered.

**Why this priority**: Hebrew covers the main audience; English widens it (tourists, family
abroad, gift buyers) but the shop is viable without it.

**Independent Test**: Open the shop, switch to English, browse a product, add to cart, check out,
and confirm every screen and the confirmation email are in English and laid out left-to-right.

**Acceptance Scenarios**:

1. **Given** a first-time visitor, **When** they open any page, **Then** it is shown in Hebrew,
   right-to-left.
2. **Given** a visitor on any page, **When** they select English, **Then** the same page is
   shown in English, left-to-right, without losing their cart.
3. **Given** a visitor chose English, **When** they return later on the same device, **Then** the
   shop opens in English.
4. **Given** a visitor shares a product link while viewing in English, **When** someone opens it,
   **Then** it opens in English.

---

### User Story 5 - Privacy, consent, and legal pages (Priority: P2, required before public launch)

The shop uses only strictly necessary storage (cart, language choice, admin session) and
cookieless, privacy-friendly visit statistics, so at launch visitors are not interrupted by a
cookie banner. If optional cookies (e.g., an advertising pixel) are ever turned on, a consent
banner appears automatically, and those cookies load only after the visitor opts in. The footer links to the Privacy Policy, Terms of Use and Sale, Cookie Policy,
Shipping & Returns / Cancellation Policy, Accessibility Statement, About, and Contact pages, and
shows the seller's business details. The owner can edit the text of these pages in both
languages. When a customer asks to see or delete their data, the owner can find, export, and
delete or anonymize it from the admin area.

**Why this priority**: The shop can take test orders without these pages, but it MUST NOT launch
publicly without them (constitution principle VII).

**Independent Test**: In a fresh browser, browse and check out, and confirm that only strictly
necessary storage is used and no third-party trackers load. In a test setup with an optional
cookie category enabled, confirm the banner appears, nothing optional loads before acceptance,
and nothing optional loads after rejecting. Open every legal page in both languages; in the admin area, search for a test
customer's email, export their data, and delete it.

**Acceptance Scenarios**:

1. **Given** no optional cookie category is enabled (the launch setup), **When** a first-time
   visitor browses and checks out, **Then** no consent banner is shown, only strictly necessary
   storage is used, no third-party trackers load, and the visit is still counted in the
   cookieless statistics.
2. **Given** an optional cookie category has been enabled, **When** a first-time visitor opens
   the shop, **Then** a consent banner offers equally prominent "accept" and "reject" choices,
   and nothing optional loads until they accept.
3. **Given** an optional cookie category has been enabled and the visitor rejected it, **When**
   they browse and check out, **Then** the shop works fully and nothing optional ever loads. They
   can change their choice at any time from a "cookie settings" link in the footer.
4. **Given** the shop footer, **When** a visitor follows the legal links, **Then** each page is
   available in Hebrew and English.
5. **Given** checkout, **When** the visitor ticks the marketing-email box (unticked by default),
   **Then** their consent is recorded with the date; **When** they leave it unticked, **Then**
   they never receive marketing emails.
6. **Given** a customer request, **When** the owner searches by email or phone in the admin area,
   **Then** she sees all orders and data for that person and can export it or delete it; orders
   that must be kept for tax purposes are anonymized instead of deleted.
7. **Given** the owner edits the About page and saves, **When** a visitor opens it, **Then** the
   updated text is shown.

### Edge Cases

- The owner hides, deletes, or marks unavailable a product that is in a visitor's cart: at
  checkout it is flagged as unavailable and cannot be ordered; the visitor can remove it and
  continue.
- The owner changes a price or option price while an item is in a visitor's cart: the cart and
  checkout show the current price before the order is confirmed.
- The owner removes an option value that a cart item uses: the item is flagged and the visitor is
  asked to choose again.
- Online payment succeeds at the provider but the visitor closes the browser before returning:
  the order is still recorded as paid (from the provider's confirmation) and the emails are sent.
- The payment provider sends the same confirmation twice: the order is recorded once.
- An offline-payment order is never paid: it stays "awaiting payment" and the owner can cancel
  it; it does not block anything else.
- The owner uploads a very large photo or an unsupported file type: normal phone photos (JPEG,
  PNG, WebP up to 20 MB and 51 million pixels, which covers 50 MP phone photos; HEIC/HEIF up to 20 MB and the
  phone's normal resolution, see Clarifications › 2026-11-08 (implementation)) are accepted and reduced automatically;
  larger photos are rejected with a message asking for a normal photo; unsupported or disguised
  files are rejected with a clear message.
- The owner tries to publish a product without a photo, name, price, or preparation time:
  publishing is blocked with a message naming the missing field (a draft can still be saved).
- The confirmation email bounces or the customer typed a wrong email: the order still exists and
  the owner has the customer's phone number to make contact.
- Someone signs in with a Google account that is not on the approved list: access is refused
  and no admin data is shown.
- Someone signs in with an approved Google account but cannot complete the passkey step (e.g.,
  a stolen Google account): access is refused, repeated attempts are temporarily blocked, and
  the owner is notified by email.
- The owner loses or replaces the device holding her passkey: she signs in with Google and a
  one-time recovery code, then registers a passkey on the new device; it works once the other
  admin approves it. Another admin can also remove her old passkey. If no other admin exists,
  recovery with a code is refused and the maintainer restores access.
- The owner loses access to her Google account: she recovers it through Google. Until then,
  another approved admin can still manage the shop.
- (Once international shipping is enabled) a visitor switches the destination between Israel
  and abroad during checkout: all amounts are recalculated in the zone's currency before the
  order is placed, and items without a USD price are flagged as unavailable for that destination.
- A visitor enters an address outside Israel: they are told the shop currently ships within
  Israel only and can choose self-pickup or contact the owner.
- Bots submit the checkout or contact form repeatedly: submissions are rate-limited and filtered
  without forcing ordinary visitors through difficult puzzles.
- The catalog is empty, or a category has no published products: a friendly message is shown
  instead of an empty page.

## Requirements *(mandatory)*

### Functional Requirements

**Catalog and products**

- **FR-001**: The owner MUST be able to create, edit, hide/unhide, and delete products from an
  admin area.
- **FR-002**: Each product MUST have: a Hebrew name, a Hebrew description, a price, at least one
  photo, a category, and a preparation time (e.g., "about 2 weeks"). English name and
  description are optional.
- **FR-003**: The owner MUST be able to upload multiple photos per product (at least 8), choose
  the main photo, reorder photos, and remove photos.
- **FR-004**: The system MUST automatically resize/compress uploaded photos so product pages load
  quickly on mobile, while keeping them sharp enough to zoom in on details (the largest stored
  version is 1600 px wide, or the original width if smaller), and MUST remove all
  embedded metadata (including GPS location) from every published image.
- **FR-005**: The owner MUST be able to create, rename (in both languages), reorder, and remove
  categories (e.g., "wool dolls", "animals", "accessories"). A category that still contains
  products cannot be removed until the products are moved.
- **FR-006**: Products MUST support a draft state so the owner can save incomplete work without
  publishing it.
- **FR-007**: All products are made to order; the system MUST NOT track stock quantities. The
  owner MUST be able to mark any product "not available to order right now", which keeps it
  visible with that label but prevents adding it to the cart.
- **FR-008**: A product MAY have option groups (e.g., "Hair color", "Size"), each with two or
  more values in Hebrew and optional English. Each value MAY add to or subtract from the base
  price. Visitors MUST choose a value for every option group before adding the product to the
  cart, and the chosen values MUST be recorded on the order. Products without options MUST NOT
  show any option controls.

**Storefront and shopping**

- **FR-009**: Visitors MUST be able to browse all published products, filter by category, and
  sort by newest and by price.
- **FR-010**: Visitors MUST be able to search products by name and description text in either
  language.
- **FR-011**: Each product page MUST show all photos (with enlarge/zoom), name, description,
  price, options (if any), preparation time, and whether it is available to order.
- **FR-012**: Visitors MUST be able to add products to a cart, change quantities, and remove
  items, without signing in. The cart MUST persist on the same device for at least 30 days using
  only strictly necessary storage.
- **FR-013**: Checkout MUST collect only: full name, phone number, email, delivery method,
  delivery address (country, city, street and number, apartment, postal code) when shipping is
  chosen, payment method, acceptance of the Terms of Sale, an optional note to the seller, and an
  optional, unticked marketing-email consent.
- **FR-014**: The system MUST validate checkout fields and show clear, field-specific messages in
  the visitor's current language.
- **FR-015**: Each shipping zone has one currency. The Israel zone uses ₪, and its prices include
  VAT. Zones outside Israel use USD. Every product (and every option price adjustment) has a
  required ₪ price and an optional USD price. The USD price becomes required before an
  international zone can be enabled. Visitors see prices in ₪ by default. Once a destination
  outside Israel is chosen at checkout, the cart, delivery fee, and total are shown and charged in
  USD. A product without a USD price cannot be ordered for an international destination. Each
  order records its currency, and all of its amounts are in that single currency.
- **FR-016**: Prices shown at checkout and recorded on the order MUST be the prices (including
  option adjustments and delivery fee) at the moment the order is placed; later price changes
  MUST NOT alter existing orders.

**Payment**

- **FR-017**: At checkout the visitor MUST choose one of two payment methods: **pay online** or
  **pay offline**. The owner MUST be able to enable or disable each method.
- **FR-018**: Pay online MUST take payment through an established third-party payment provider
  supporting Israeli credit cards (and Bit where the provider offers it). Card details are
  entered only on the provider's own secure page or fields and never pass through or are stored
  by the shop.
- **FR-019**: An online-payment order MUST be marked paid only after the shop receives the
  provider's verified confirmation; a confirmation received more than once MUST NOT create
  duplicate orders or emails. Failed or abandoned payments MUST NOT create confirmed orders or
  owner notifications.
- **FR-020**: Pay offline MUST create an order marked "awaiting payment" and show and email the
  payment instructions the owner configured (e.g., Bit/PayBox number, bank account details, cash
  on pickup), together with the order number.
- **FR-021**: The owner MUST be able to mark an offline order as paid, and mark any paid order as
  refunded. Refunds themselves are issued through the payment provider or the original offline
  method, outside the shop.

**Delivery**

- **FR-022**: The shop MUST offer two delivery methods: **shipping** (by mail or courier) and
  **self-pickup**. The owner MUST be able to enable or disable each.
- **FR-023**: Shipping MUST charge a flat fee set by the owner, and MUST be free when the order
  subtotal (after option adjustments) reaches a free-shipping amount set by the owner. Self-pickup
  MUST be free and show the pickup location/instructions the owner configured.
- **FR-024**: Delivery settings MUST be organized by shipping destination (zone). At launch only
  Israel is enabled; the owner (or a maintainer) MUST be able to add a zone for other countries,
  with its own currency, fee, and free-shipping amount, without changing the checkout flow.
- **FR-025**: Addresses MUST be captured in a format that works for international addresses
  (country plus free-form address lines and postal code), even though only Israel is accepted at
  launch.

**Orders (admin)**

- **FR-026**: The owner MUST be notified by email of every new confirmed order (paid online, or
  offline awaiting payment), with the order number, items and options, total, payment method and
  state, and customer contact details.
- **FR-027**: The owner MUST be able to view all orders, newest first, filter by status and
  payment state, and open any order to see its items, options, customer details, delivery method,
  note, payment method, and payment state.
- **FR-028**: The owner MUST be able to move an order through the statuses: New, In preparation,
  Shipped / Ready for pickup, Completed, and Cancelled.
- **FR-029**: Changing an order to Shipped / Ready for pickup MUST email the customer in the
  language they ordered in. The owner MAY add a tracking number or pickup instructions that are
  included in the email.
- **FR-030**: Cancelling an order MUST require confirmation; cancelling a paid order MUST remind
  the owner to issue the refund.

**Admin access and security**

- **FR-031**: Admin sign-in MUST take two steps. First, Sign in with Google, accepted only for
  Google accounts on the shop's approved-admin list. Second, a passkey registered in the shop for
  that admin. The passkey is unlocked by the device's screen lock: a PIN or passcode MUST be
  enough, and fingerprint or Face ID MUST NOT be required. The shop MUST NOT store admin
  passwords. Until both steps are done, the admin area MUST NOT reveal any product drafts,
  orders, settings, or customer data.
- **FR-032**: Repeated failed passkey attempts, and sign-ins from accounts that are not approved,
  MUST be temporarily blocked and the owner notified by email. Admin sessions MUST expire after
  a period of inactivity, and an admin MUST be able to sign out of all devices. Changes to admins,
  passkeys and recovery codes MUST ask the admin to confirm with their passkey again if they have
  not done so in the last 5 minutes; ending sessions (one session, or all devices) MUST NOT ask.
- **FR-033**: Each admin MUST receive one-time recovery codes when registering their first
  passkey. A recovery code, together with Google sign-in, allows registering a new passkey, which
  can be used only after another admin approves it (Clarifications 2026-11-08). Each
  admin MAY register more than one passkey (e.g., phone and computer). Admins MUST be able to
  view and remove the passkeys registered for any admin.
- **FR-034**: The system MUST support at least two admin users (the owner and a family helper)
  with identical permissions, each with their own Google account and passkeys. An admin MUST be
  able to add or remove approved admin Google accounts. The first admin is set up by the
  maintainer.
- **FR-035**: The system MUST record an activity log of admin sign-ins and admin changes
  (products, prices, orders, settings) that the owner can view.
- **FR-036**: Public forms (checkout, contact) MUST be protected against automated abuse without
  requiring visitors to solve difficult puzzles.

**Privacy and consent**

- **FR-037**: Visit statistics MUST be collected only with a cookieless, privacy-friendly method
  that stores nothing on the visitor's device and keeps no personal data. The owner MUST be able
  to see basic statistics: visits over time, most-viewed products, and the sites that send
  visitors.
- **FR-037a**: At launch the shop MUST use only strictly necessary storage and load no
  third-party trackers, so no consent banner is shown. The shop MUST include a consent mechanism
  that turns on automatically when any optional cookie category is enabled. That mechanism MUST
  offer accept and reject with equal prominence, block optional cookies and scripts until the
  visitor accepts, record the choice, and let visitors change it from a "cookie settings" link on
  every page. The Cookie Policy MUST list every item stored on the visitor's device and its
  purpose.
- **FR-038**: Marketing emails MUST only be sent to customers who ticked the marketing consent box;
  the consent and its date MUST be stored, and every marketing email MUST include one-click
  unsubscribe. (Sending marketing emails is not itself part of this feature; only capturing
  consent is.)
- **FR-039**: The owner MUST be able to search customer data by email or phone, export all of a
  person's data in a readable file, correct it, and delete it; order records that must be kept
  for tax purposes MUST be anonymized instead of deleted.
- **FR-040**: Customer personal data on orders MUST be retained only as long as required for tax
  and accounting purposes (7 years from the order date), after which it MUST be anonymized
  automatically.

**Language and localization**

- **FR-041**: All public pages, messages, and emails MUST be available in Hebrew and English.
  Hebrew is the default; Hebrew pages are laid out right-to-left and English pages left-to-right.
- **FR-042**: A language switch MUST be visible on every public page; switching MUST keep the
  visitor on the same page with the same cart, and the choice MUST be remembered on the device.
- **FR-043**: Each language version of a page MUST have its own shareable address so links open
  in the language they were shared in.
- **FR-044**: The admin area MUST be in Hebrew (an English admin interface is not required).
- **FR-045**: Where the owner has not provided English text for a product, option, category, or
  page, the Hebrew text MUST be shown in its place.

**Content and legal pages**

- **FR-046**: The shop MUST include About, Contact, Privacy Policy, Terms of Use and Sale, Cookie
  Policy, Shipping & Returns / Cancellation Policy, and Accessibility Statement pages, whose text
  the owner can edit in both languages. The project MUST supply initial drafts of the legal pages
  for professional legal review.
- **FR-047**: Every public page MUST show the seller's identifying business details (business
  name, business address, contact email and phone, and business registration number) in the
  footer or a linked page.
- **FR-048**: Visitors MUST be able to send a message through a contact form (name, email,
  message), delivered to the owner by email.
- **FR-049**: Product pages MUST provide a share preview (photo, name, price) when their link is
  shared in messaging apps or social networks.

### Key Entities

- **Product**: An item for sale. Names and descriptions in Hebrew and optional English, base
  price in ₪ and optional base price in USD, photos (ordered, one marked main), category, preparation time, option groups (optional),
  state (draft, published, hidden), "available to order" flag, creation date.
- **Option group / option value**: A product's choice dimension (e.g., "Hair color") and its
  values (e.g., "brown"), each in Hebrew and optional English, with an optional price adjustment
  (in ₪, plus USD when the product has a USD price) and an optional colour dot chosen from a fixed
  palette (see Clarifications, 2026-11-08).
- **Category**: A grouping of products with Hebrew and optional English names and a display
  order.
- **Cart**: A visitor's selected products, chosen options, and quantities, kept on their device;
  not tied to an account.
- **Order**: A confirmed purchase. Unique order number, date, customer name, phone, email,
  delivery method and address, note, language used, status, payment method, payment state (paid,
  awaiting payment, refunded), line items, delivery fee, currency, total, terms-accepted
  timestamp, marketing consent (and date).
- **Order line item**: A snapshot of a product at order time: product reference, name, main photo,
  chosen option values, unit price, quantity, preparation time.
- **Shipping zone**: A set of destination countries with its currency (₪ or USD), delivery
  methods, flat fee, and free-shipping amount. Only the Israel zone is active at launch.
- **Shop settings**: Shop name (Hebrew, optional English), enabled payment and delivery methods,
  offline payment instructions, pickup location, business details (legal name, address,
  registration number, contact email and phone), notification email.
- **Admin user**: A person allowed into the admin area: name, approved Google account email,
  registered passkeys (each with a device label and date added), recovery codes (stored only in
  a form that cannot be read back).
- **Admin activity entry**: Who did what and when in the admin area.
- **Content page**: An editable information or legal page with Hebrew and optional English text.
- **Consent record**: A visitor's cookie choice and when it was made, used only once an optional
  cookie category is enabled. A customer's marketing
  consent is stored on their order.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can publish a new product with 3 photos from her phone in under 5 minutes,
  without help, after a single walkthrough.
- **SC-002**: A first-time visitor on a phone can go from opening a product link to a confirmed
  order in under 3 minutes.
- **SC-003**: 100% of confirmed orders appear in the admin area and trigger an owner notification
  within 1 minute.
- **SC-004**: 100% of online-payment orders are marked paid only after the provider confirms
  payment, and no failed payment ever produces a confirmed order.
- **SC-005**: Product and catalog pages load and become usable within 3 seconds on a typical
  mobile 4G connection.
- **SC-006**: Every public page, message, and email is fully presented in the selected language,
  with no untranslated text in the interface.
- **SC-007**: No customer, order, or draft data is accessible without completing both admin
  sign-in steps (Google and passkey) (verified by trying every admin page and data address while signed out).
- **SC-008**: Before any consent choice, and after rejecting, the shop sets zero optional cookies
  and loads zero third-party trackers.
- **SC-009**: Before launch, an automated security scan of the live site reports no High or
  Critical findings, and published images contain no location metadata.
- **SC-010**: The owner can fulfil a customer's "show me / delete my data" request in under 10
  minutes from the admin area.
- **SC-011**: Running costs stay within a small-business budget (target: under ₪100/month at
  expected volume, excluding per-transaction payment fees).

## Assumptions

- The shop ships within Israel at launch. Worldwide shipping is prepared for (zones, address
  format, per-zone currency with USD for abroad, GDPR-ready privacy design) but not enabled in the first version.
- Tax invoices/receipts are issued by the owner outside the shop (e.g., her existing invoicing
  service or the payment provider's invoicing) in the first version.
- Product variants are rare and are handled as option groups on a product; variants have no
  separate stock (everything is made to order) and no separate photos in the first version.
- Custom-order requests (a design not in the catalog) are handled by contacting the owner, not
  through checkout.
- Discount codes, gift cards, customer reviews, wish lists, customer accounts, and sending
  marketing campaigns are out of scope for the first version.
- Customer notifications are by email; WhatsApp/SMS notifications are out of scope for the first
  version.
- The shop always has two admins (the maintainer and the owner), both set up before launch, so a
  lost passkey can always be recovered with the other admin's approval.
- Each admin has a Google account with Google's 2-Step Verification turned on; turning it on is
  part of admin setup. Each admin has a phone or computer with a screen-lock PIN or passcode for
  their passkey. The owner has an email address for order notifications.
- The admin area is in Hebrew only; the owner writes English text herself or with family help
  (no automatic translation).
- Legal page texts are supplied as drafts and MUST be reviewed by a qualified legal professional
  before public launch; the project does not provide legal advice.
- Expected scale: up to a few hundred products and up to a few hundred orders per month.
- The shop will have its own domain name, provided by the family.
