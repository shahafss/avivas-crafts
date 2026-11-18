# Feature Specification: Privacy, Consent, Legal and Content Pages

**Feature Branch**: `003-privacy-legal-pages`

**Created**: 2026-11-09

**Status**: Approved 2026-11-09; clarified 2026-11-09 (FR-011; plan review rounds 2–3: FR-003, FR-014, FR-016, FR-019, FR-022, SC-007)

**Input**: User description: "Privacy, consent, legal and content pages (roadmap item 003). Goal:
only strictly necessary storage and cookieless visit statistics at launch; a consent banner that
stays dormant until an optional cookie category is turned on; editable About, Contact, Privacy,
Terms, Cookies, Shipping & Returns and Accessibility pages in both languages; business details in
the footer; a contact form; owner tools to find, export, correct and anonymise a customer's data;
retention tasks; Data Security Regulations drafts. Legal texts are drafts that need review by a
qualified legal professional before launch. Source: spec 001 › User Story 5; tasks.md Phase 7
(T100–T118); contracts/device-storage.md."

## Context

Spec 001 (the MVP, frozen) settled this area's decisions in User Story 5, FR-036–FR-040,
FR-046–FR-048, SC-006, SC-008 and SC-010, its clarification on cookieless statistics
(2026-11-07), research R19 (legal approach) and contracts/device-storage.md. This feature builds
them; it reuses those decisions unchanged unless this spec says otherwise.

Spec 001 and feature 002 already built parts of it, which this feature uses and does not rebuild:

- **Data already stored**: each order records the customer's details, the Terms acceptance time,
  the version numbers of the Terms and the Privacy Policy the customer accepted, the marketing
  consent with its date, a field for the date consent was withdrawn, and a field marking the
  order as anonymised. The content pages, the cookie-choice record and the daily visit counters
  exist as empty storage. The seven content pages exist with a one-word placeholder text.
- **Checkout**: the Terms checkbox (required, linking to the Terms page), the separate unticked
  marketing checkbox, and the collection notice linking to the Privacy Policy are in place
  (001 FR-018, FR-038; R19).
- **Correction**: Aviva can already correct a customer's name, phone, email and delivery address
  on an order (002 FR-016). The admin order page already shows that an order's customer details
  were anonymised (002 edge case), and status changes keep working on such an order.
- **Settings**: Aviva already edits the shop's business details (legal name, address,
  registration number, email, phone) in the admin settings, and the admin home lists the ones that
  still hold placeholders (002).
- **Links already pointing to pages this feature adds**: the header (About, Shipping & Returns),
  the product page (Shipping & Returns), checkout (Terms, Privacy Policy) and the customer order
  page and product page (Contact, at `/{locale}/contact`). Today they all lead to "page not
  found".
- **Consent groundwork**: a test-only optional cookie category can be switched on by a server
  setting that production refuses, and the test setup already has a separate test run for it
  (001 T005). The admin menu already lists Customers, Content and Statistics; those screens do not
  exist yet.

Left out on purpose (other roadmap items): the language switch in the footer and the header, and
the automatic check that every page exists in both languages (item 005); the view of the admin
activity log (item 004); the professional legal review itself and the launch checklist (item 006).

## Clarifications

### Session 2026-11-09

- Q: Should the shop keep the full text of every past version of the Terms and the Privacy
  Policy, so the exact text a customer accepted can be shown later? (Spec 001 stores only the
  version number on each order, and every save raises it.) → A: Yes. Each version that becomes
  current is kept as a dated, unchangeable copy (FR-011). Other pages keep no history.
- Q: A customer asks to be erased while an online checkout of theirs is still waiting for its
  payment result, or holds an unresolved payment-amount mismatch. What happens to it? → A: It is
  left until it expires on its own (48 hours; 30 days for a mismatch) so a real payment is never
  lost, and Aviva is told so on screen (FR-019; plan review, 2026-11-09).
- Q: After the Cookie Policy changes, until the visitor chooses again, does their earlier
  "accept" still load optional items? → A: No. Nothing optional loads until they choose again
  (FR-022).
- Q: What does the contact form's limit count? → A: Only messages actually sent, 5 per clock hour
  per visitor; the message says how many minutes to wait (FR-014, US2 #3).
- Q: The page editor also offers italic, line breaks, written-out web addresses as links, and
  links to the shop's own pages (the drafts need these). Is that allowed? → A: Yes; FR-003 is
  amended to say so.
- Q: Anonymising by one email or phone: what about orders the same person placed with another
  email or phone? → A: They are left alone. The search result shows the other emails and phone
  numbers used on the found orders so Aviva can search them too; SC-007 covers what the search
  found (FR-016, FR-019, SC-007).
- Q: An online checkout that was declined can still be retried or paid for up to 48 hours. Is it
  deleted when Aviva erases the customer? → A: No. Like checkouts waiting for a payment result or
  holding a mismatch, it is left to expire. In practice erasing never deletes an unfinished
  checkout: every one that still holds personal details deletes itself within 48 hours (30 days for
  a mismatch) (FR-019; plan review round 3).
- Q: A checkout left to expire is paid after the customer was erased, so a new order with their
  details appears. What then? → A: Aviva is warned when she erases: if a payment still in progress
  completes, a new order will appear, and she should search again in 3 days (FR-019).
- Q: Should downloading a customer's data and erasing a customer ask the admin to confirm with
  her passkey again, like security changes do? → A: Yes, for these two actions only: they ask for
  the passkey unless it was confirmed in the last 5 minutes (FR-019a; plan gate, 2026-11-09). This
  extends 001's rule, which covered only security changes.

### Session 2026-11-10 (implementation review)

- Q: Should the contact form work for a visitor whose browser runs no scripts? → A: No. The form
  needs JavaScript; without it nothing the visitor typed may reach the page address or logs (the
  form posts its body), and the email and phone in the details panel are the way to reach Aviva
  (edge case "A visitor blocks storage or scripts").
- Q: Aviva confirms an erase that changes nothing (nothing left to anonymise, or only unfinished
  checkouts). Is it logged? → A: Yes. `customer.anonymized` is always logged with its count,
  including 0, like search, export and withdrawal (FR-019a, US3 #7).
- Q: A customer search finds only unfinished checkouts, so there is nothing to erase. What does
  Aviva see? → A: The same notice as after an erase that left payments in progress (they are
  deleted automatically; search again in 3 days), and no erase button (FR-019).
- Q: Which way does time run on the statistics chart on the right-to-left admin screen? → A: Oldest
  day on the left, today on the right, as charts usually read.
- Q: The banner is not a modal; is the cookie settings dialog? → A: The settings dialog is a modal
  dialog; "not a modal" applies to the bottom banner only.
- Q: After the Cookie Policy changes, do optional cookies set under the old version stay until the
  visitor chooses again? → A: No. While a new choice is needed they are expired at once, so
  nothing optional survives a policy change (FR-022).
- Q: In which language are the Data Security Regulations documents (US8)? → A: Hebrew and English,
  like the legal pages: the main audience is Israel, and the shop supports both languages. Each
  document has a `.he.md` and an `.en.md` version with the same content.
- Q: Unfinished-checkout details are deleted after 48 hours, or up to 24 hours later if the
  payment provider cannot be reached for the final status check. Do the Privacy Policy and Aviva's
  "payments still in progress" notice say so? → A: Yes; neither may understate how long the data
  is kept.
- Q: Is the second admin (the family helper) written as a man or a woman in Hebrew? → A: A man
  ("עוזר מהמשפחה"); the admins together are written in the masculine plural.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A visitor reads the shop's information and legal pages (Priority: P1)

From any page, a visitor finds the footer with the seller's business details (shop name, legal
business name, address, VAT registration number, email and phone) and links to About, Shipping &
Returns, Contact, Terms of Use and Sale, Privacy Policy, Cookie Policy and Accessibility
Statement. Each page opens in Hebrew or English, in the language of the address. The legal pages
carry a visible notice that they are drafts awaiting legal review until that notice is removed.
The Cookie Policy includes a table of every item the shop stores on the visitor's device, with
its purpose and how long it lasts. At checkout, the Terms link opens the Terms page and the
checkbox next to it can be ticked by tapping the box, in both languages.

**Why this priority**: The shop must not launch without these pages (constitution VII, Consumer
Protection Law, FR-047), and links that already exist in the header, product page, checkout and
order page lead to "page not found" until they exist.

**Independent Test**: Open every footer link on `/he` and `/en`; check the business details in the
footer; compare the Cookie Policy table with what the browser actually stores after browsing and
checking out; on the English and Hebrew checkout, tap the centre of the Terms checkbox and confirm
it ticks without opening the Terms page.

**Acceptance Scenarios**:

1. **Given** any public page, **When** the visitor looks at the footer, **Then** it shows the shop
   name, legal business name, address, "עוסק מורשה" with the registration number, email (opens
   the mail app) and phone (starts a call), and links to all seven pages.
2. **Given** the footer, **When** the visitor follows each link on `/he` and on `/en`, **Then**
   each page opens in that language; where the English text is missing, the Hebrew text is shown
   instead (001 FR-045).
3. **Given** a legal page that is still a draft, **When** the visitor opens it, **Then** a
   "draft, requires legal review" notice is shown at the top of the text.
4. **Given** the Cookie Policy page, **When** the visitor opens it, **Then** a table lists every
   item the shop may store on their device, its purpose and its lifetime, and nothing the browser
   holds after browsing and checking out is missing from it.
5. **Given** the English checkout on a phone, **When** the visitor taps the centre of the Terms
   checkbox, **Then** the box is ticked and the Terms page does not open; tapping the words
   "terms of sale" opens the Terms page in a new tab and leaves the box unchanged. The same holds
   on the Hebrew checkout.
6. **Given** the existing links in the header, product page, checkout and customer order page,
   **When** the visitor follows them, **Then** none leads to "page not found".

---

### User Story 2 - A visitor contacts the shop (Priority: P1)

A visitor (often a customer asking about an order, or someone who wants to cancel one) opens
the Contact page at `/{locale}/contact`. They see a short introduction written by Aviva, the
shop's business details, and a form for their name, email and message. After sending, the form
is replaced by a confirmation that Aviva will reply by email. Aviva receives the message by
email and can reply to it directly.

**Why this priority**: The customer order page and product page already link to this exact
address; the contact form is also the online channel for cancellation notices (001 R19).

**Independent Test**: Open `/he/contact` and `/en/contact`, send a message, and check that the
owner's notification address receives an email whose reply goes to the visitor's address and
whose subject contains neither the visitor's name nor email.

**Acceptance Scenarios**:

1. **Given** the Contact page, **When** the visitor fills in name, email and a message and sends
   it, **Then** the form is replaced by "the message was sent; I'll reply by email soon", and the
   shop's notification addresses receive the message by email, with replies going to the
   visitor's email.
2. **Given** the form, **When** a field is missing or invalid (name under 2 characters, invalid
   email, message under 10 or over 5,000 characters), **Then** a clear message is shown next to
   that field and nothing is sent.
3. **Given** a visitor who has sent 5 messages in the current clock hour, **When** they send
   another, **Then** they are told they sent several messages in a row and how many minutes to
   wait (until the hour ends), and nothing is sent. Submissions refused for missing or invalid
   fields do not count.
4. **Given** an automated submission (a bot filling a hidden field, or a form older than
   allowed), **When** it is submitted, **Then** nothing is sent, without asking ordinary visitors
   to solve a puzzle.
5. **Given** the Contact page, **When** a visitor follows the link from their order page,
   **Then** it opens in the language of that order page.

---

### User Story 3 - Aviva handles a customer's request about their data (Priority: P1)

A customer asks Aviva what data the shop holds about them, to correct it, to stop marketing
emails, or to delete it. In the admin area, Aviva opens Customers and searches by the email or
phone the customer gave. She sees that person's orders. She can download a file with all the
data the shop holds about the person, open an order to correct details (the existing
correction from 002), record that the customer withdrew marketing consent, or anonymise the
person: their orders stay for tax records but lose every personal detail, and everything else
about them is deleted.

**Why this priority**: The constitution's individual-rights rule (VII) and SC-010 (a request
fulfilled in under 10 minutes); feature 002 left search, export and anonymisation for this
feature.

**Independent Test**: Place two test orders with the same email and different phone formats;
search by email in another letter case and by phone in another format; download the export and
find both orders in it; record a marketing withdrawal; anonymise; open the orders and confirm
they show no name, email, phone or address, while totals and items remain.

**Acceptance Scenarios**:

1. **Given** orders by the same person, **When** Aviva searches by their email in any letter case
   or by their phone in any common format (with or without the country code, spaces or dashes),
   **Then** she sees all of that person's orders, each with its number, date, status and total,
   and a link to open it.
2. **Given** a search with no match, **When** it runs, **Then** a plain message says no customer
   was found.
3. **Given** a found person, **When** Aviva downloads their data, **Then** she receives a file
   with every order (items, amounts, delivery details, payment and status, Terms acceptance time
   and the Terms and Privacy Policy versions accepted, marketing consent and its dates), any
   unfinished checkout still held for them, and the emails the shop sent or holds about them
   (type, recipient, date, status).
4. **Given** a person with marketing consent on any order, **When** Aviva records a withdrawal
   and confirms, **Then** all their orders show marketing consent as withdrawn with the date; the
   original consent date is kept; the export shows the withdrawal.
5. **Given** a found person, **When** Aviva chooses to anonymise and confirms (the confirmation
   explains the orders stay without personal details for tax records and this cannot be undone),
   **Then** each order shown loses name, email, phone, address (except the country), note,
   tracking number, pickup note and marketing consent; amounts, items, dates, status and payment
   stay; the stored emails the search found are deleted; unfinished checkouts the search found
   (payments still in progress, declined but retryable, or with an amount mismatch) are left to
   expire, and the result says how many and that a new order will appear if one of those payments
   completes, so she should search again in 3 days.
6. **Given** a person with an order that is not yet Completed or Cancelled, **When** Aviva starts
   anonymising, **Then** the confirmation warns that the order is still open and she will no
   longer be able to contact the customer about it.
7. **Given** searches, exports, withdrawals and anonymisations, **When** they happen, **Then** the
   admin activity log records who did what and when, without the customer's personal data, and
   no email address or phone number ever appears in a page address.

---

### User Story 4 - Aviva edits the shop's pages (Priority: P2)

Aviva opens Content in the admin area, sees the seven pages and which of them still hold the
draft text supplied with the shop, and edits a page's title and text in Hebrew and, optionally,
English, using simple formatting (headings, bold, lists, links) with a preview. Saved changes
appear on the public page.

**Why this priority**: 001 FR-046 requires owner-editable pages; the About page in particular is
Aviva's to write. Pages work with their supplied drafts before she edits them.

**Independent Test**: Edit the About page in Hebrew and English, save, and open `/he/pages/about`
and `/en/pages/about`.

**Acceptance Scenarios**:

1. **Given** the Content screen, **When** Aviva opens it, **Then** she sees the seven pages, each
   marked as "draft supplied with the shop" or "edited", with the date of the last change.
2. **Given** a page, **When** Aviva edits the Hebrew or English text using the formatting buttons
   and saves, **Then** a confirmation is shown and the public page shows the new text.
3. **Given** text with formatting that could run code or link to unsafe addresses, **When** it is
   saved and shown, **Then** only plain formatting and links to web, email and phone addresses
   appear; nothing runs.
4. **Given** Aviva clears the English text, **When** a visitor opens the English page, **Then** the
   Hebrew text is shown.
5. **Given** Aviva saves the Terms or the Privacy Policy, **When** a later order is placed,
   **Then** that order records the new version, and orders placed before keep the version that
   was current when they were placed.
6. **Given** an order placed before Aviva changed the Terms, **When** she opens the Terms or
   Privacy version that order's customer accepted (from the order or from the page's history on
   the Content screen), **Then** she reads exactly the text that was current when the order was
   placed, with its date.
7. **Given** a page Aviva has edited, **When** the shop is updated with new supplied drafts,
   **Then** her text is never overwritten; pages she has not edited receive the new draft.

---

### User Story 5 - Visitors are counted without being tracked (Priority: P2)

At launch, visiting and buying store nothing on the visitor's device beyond what the shop
needs to work (the cart, the checkout form while paying, the language choice, and the admin
session for admins), load nothing from third-party trackers, and show no cookie banner. Visits
are still counted without cookies or personal data. Aviva sees, in the admin area, visits per day
over the last 7, 30 or 90 days, the most-viewed products, and the sites that send visitors.

**Why this priority**: 001 FR-037, FR-037a and SC-008. It is the reason no banner is needed at
launch.

**Independent Test**: In a fresh browser, browse, add to the cart and check out; list everything
the browser stores and every address it contacted; then open Statistics and see the visit.

**Acceptance Scenarios**:

1. **Given** the launch setup, **When** a first-time visitor browses and checks out, **Then** no
   consent banner and no "cookie settings" link appear, every stored item is in the Cookie Policy
   table, and every request goes to the shop or its image address.
2. **Given** visits, **When** Aviva opens Statistics, **Then** she sees visits per day for the
   chosen period (as a chart with the same numbers in a table), the 10 most-viewed products by
   name, and the 10 sites that sent the most visitors ("direct" for none).
3. **Given** a visitor who moves between pages within the shop, **When** the visits are counted,
   **Then** each page view is counted once and the referring site only once per arrival.
4. **Given** the order page, the checkout pages, the admin area and search engine bots, **When**
   they are visited, **Then** they are not counted, and no secret link part (such as an order
   page's private address) is ever stored.
5. **Given** any counted visit, **Then** no IP address, browser details or anything identifying the
   visitor is stored.

---

### User Story 6 - Optional cookies need consent if they are ever turned on (Priority: P2)

If an optional cookie category (for example an advertising pixel) is ever enabled, a banner
appears automatically on first visit with equally prominent "Accept all" and "Reject all" and a
"Settings" option for each category. Nothing optional loads until the visitor accepts. The choice
is remembered and recorded, and a "Cookie settings" link in the footer lets the visitor change it
at any time. At launch none of this appears, and its code is not even loaded.

**Why this priority**: Required by constitution VII and 001 FR-037a, but dormant at launch;
tested through the test-only optional category.

**Independent Test**: Run the shop with the test optional category on; check the banner, that
the test cookie is absent before a choice and after rejecting (also after browsing and checkout),
present after accepting, and that the footer link reopens the choice and changing it takes effect.

**Acceptance Scenarios**:

1. **Given** an optional category is enabled, **When** a first-time visitor opens the shop,
   **Then** a banner shows "Accept all" and "Reject all" with identical size and style and a
   "Settings" link, without blocking the page.
2. **Given** the banner, **When** the visitor has not chosen or has rejected, **Then** nothing
   optional is stored or loaded, also after browsing and checking out.
3. **Given** the visitor accepts, **Then** the optional item loads; the choice is recorded with
   its date and the Cookie Policy version.
4. **Given** a choice was made, **When** the visitor uses "Cookie settings" in the footer and
   changes it, **Then** a new choice is recorded and optional items are added or removed
   accordingly.
5. **Given** the Cookie Policy changes after a visitor chose, **When** they return, **Then** they
   are asked again.
6. **Given** the launch setup, **Then** neither the banner nor the "Cookie settings" link appears
   and the banner's code is not downloaded.

---

### User Story 7 - Old data is removed on schedule (Priority: P3)

Without anyone acting, the shop anonymises orders 7 years after their date, deletes admin
activity entries and cookie-choice records after 2 years, and deletes stored emails 30 days
after they were sent or finally failed. A contact message's text and the visitor's email are
erased from the shop as soon as the message has been sent to Aviva.

**Why this priority**: 001 FR-040 and the personal-data register; nothing reaches these ages
before launch, but the jobs must exist from the start.

**Independent Test**: Insert records just past and just short of each limit, run the daily
maintenance twice, and check exactly the old ones were removed or anonymised, the second run
changing nothing.

**Acceptance Scenarios**:

1. **Given** an order older than 7 years from its date, **When** the daily maintenance runs,
   **Then** it is anonymised the same way as on request; an order 6 years and 11 months old is
   untouched.
2. **Given** admin activity entries and cookie-choice records older than 2 years, **When** the
   daily maintenance runs, **Then** they are deleted.
3. **Given** stored emails sent or finally failed more than 30 days ago, **When** the daily
   maintenance runs, **Then** they are deleted.
4. **Given** a contact message, **When** it has been sent to Aviva, **Then** the shop no longer
   holds its text or the visitor's email.
5. **Given** any of these tasks, **When** it runs again the same day, **Then** it changes nothing
   more.

---

### User Story 8 - The maintainer has the Data Security Regulations documents (Priority: P3)

The maintainer has draft documents required by the Israeli Data Security Regulations for a small
database at the basic security level: the database definition, the security procedure, the list
of who may access what, a procedure for a severe security incident (contain, assess, notify the
Privacy Protection Authority and affected people when required, record), and a yearly review
checklist. Like the legal pages, they are marked as drafts for professional review.

**Why this priority**: Required before launch (001 R19), but internal documents with no shop
behaviour.

**Independent Test**: Read the documents and check each one against the shop's actual data,
access and services (the personal-data register, the admins, the third-party services).

**Acceptance Scenarios**:

1. **Given** the project documents, **When** the maintainer opens the privacy folder, **Then** the
   five documents exist, each marked as a draft requiring legal review, and they match the data
   the shop really stores and the services that really receive it.

---

### Edge Cases

- **English text missing on a page**: the Hebrew title and text are shown, marked as Hebrew so
  screen readers and the page direction handle it correctly (001 FR-045).
- **A page's text is very long, or empty**: text is limited to 50,000 characters per language;
  the Hebrew text cannot be saved empty, the English text can (then Hebrew is shown).
- **Aviva edits a page while a visitor checks out**: the order records the Terms and Privacy
  versions that were current when the order was placed; a page edit never changes past orders.
- **Business details still hold placeholders**: the footer shows them as they are; the admin
  home already lists them for completion (002).
- **Contact email cannot be sent right away**: it is retried like other emails; the visitor has
  already seen the confirmation.
- **Someone uses the contact form to send email to others**: impossible; messages go only to the
  shop's notification addresses, and the visitor's address is used only as the reply address.
- **Search finds orders under the same email but different phones (or the reverse)**: results show
  every order matching the searched email or phone, plus the other emails and phone numbers used
  on those orders; the export and anonymisation cover exactly the orders shown and what the
  searched email or phone finds. Aviva searches the other identifiers to reach the rest.
- **Erasing a person during a payment**: an unfinished checkout (waiting for its payment result,
  declined but still retryable, or holding an amount mismatch) is left until it expires (48 hours
  / 30 days); the result tells Aviva so. If its payment completes, a new order with the customer's
  details appears; the warning tells Aviva to search again in 3 days.
- **Anonymising a person whose order was already anonymised**: nothing changes on that order; the
  action completes for the rest.
- **An anonymised order**: no longer appears when searching the old email or phone; status
  changes still work (002); the export of another person never includes it.
- **A cookie-choice record when consent is not required**: none is created at launch; the
  consent cookie only exists once an optional category is enabled.
- **A visitor blocks storage or scripts**: the shop still works (as today); visits from such a
  visitor may simply not be counted. The contact form needs scripts (Clarifications 2026-11-10);
  without them nothing typed leaves the page, and the details panel's email and phone remain.
- **Bots and repeated statistics calls**: bot traffic is ignored, and repeated calls from one
  source beyond a normal browsing pace are silently dropped.
- **The legal reviewer changes the texts**: the maintainer replaces the supplied drafts, or Aviva
  pastes the reviewed text in the editor; either way the draft notice goes away with the draft.

## Requirements *(mandatory)*

### Functional Requirements

**Pages and footer**

- **FR-001**: The shop MUST serve the About, Shipping & Returns / Cancellation, Terms of Use and
  Sale, Privacy Policy, Cookie Policy and Accessibility Statement pages at
  `/{locale}/pages/{about|shipping-returns|terms|privacy|cookies|accessibility}` and the Contact
  page at `/{locale}/contact`, in Hebrew and English (001 FR-046, FR-041). These are the
  addresses the header, product page, checkout and order page already link to.
- **FR-002**: Every page MUST show its owner-written title and formatted text; where the English
  title or text is empty, the Hebrew one MUST be shown, marked as Hebrew (001 FR-045).
- **FR-003**: Formatted text MUST support headings, bold, italic, lists, line breaks and links
  only (written-out web addresses become links); links MUST be limited to web (`https`), email and
  phone addresses and the shop's own pages; nothing in the text may run as code or embed external
  content (no images, no raw HTML). (Amended 2026-11-09, Clarifications.)
- **FR-004**: The Cookie Policy page MUST include, after its text, a table generated from the
  shop's own list of device-storage items (name, purpose, lifetime), in the page's language. That
  list MUST contain exactly the items in 001 contracts/device-storage.md plus any item an enabled
  optional category adds, and the shop MUST NOT store anything on a visitor's device that is not
  in it (001 FR-037a).
- **FR-005**: Every public page MUST show a footer with the shop name, the legal business name,
  address, "עוסק מורשה" / VAT registration number, email (as an email link) and phone (as a phone
  link) from the shop settings (001 FR-047), links to About, Shipping & Returns and Contact
  ("Info") and to Terms, Privacy Policy, Cookie Policy and Accessibility Statement ("Legal"), a
  "Cookie settings" link only when consent is required (FR-020), and "© {year} {shop name}". The
  language switch in the footer is added by roadmap item 005.

**Supplied drafts**

- **FR-006**: The project MUST supply draft texts for all seven pages in Hebrew and English. The
  Privacy Policy, Terms, Cookie Policy, Shipping & Returns / Cancellation Policy and
  Accessibility Statement MUST each start with a visible notice "טיוטה — נדרשת בדיקה משפטית" /
  "Draft — requires legal review". About and Contact are short placeholders for Aviva to write.
- **FR-007**: The drafts MUST cover at least what 001 T112 and research R19 list: the Privacy
  Policy names the controller, the data collected and why (from the personal-data register), the
  legal-obligation statement, retention periods (including encrypted backups kept up to 12 months),
  every service that receives personal data with its location (Render, Cloudflare, PayPlus, Resend;
  Google for admins only), transfers abroad, the rights and how to use them, the right to complain
  to the Privacy Protection Authority, and a section for future EU customers; the Terms cover the
  seller's identity, made-to-order goods and preparation times, prices including VAT, payment
  methods, delivery and acceptance; the Cookie Policy covers the generated table, the cookieless
  statistics and how consent works if optional cookies are ever enabled; the Shipping & Returns /
  Cancellation Policy covers the statutory cancellation rights, the exception for goods made
  specially for the customer, the cancellation fee cap, how to cancel (contact form or email) and
  refund timing; the Accessibility Statement covers the standard (IS 5568 / WCAG 2.1 AA), the
  accessibility contact and its date.
- **FR-008**: When the shop is installed or updated, supplied drafts MUST be loaded into pages
  Aviva has never edited (a changed draft replaces the text and counts as a new version), and MUST
  never overwrite a page Aviva has edited.

**Content editing (admin)**

- **FR-009**: Aviva MUST be able to list the seven pages, each marked "supplied draft" or
  "edited" with its last change date, and edit each page's title and text in Hebrew (required)
  and English (optional), with buttons for heading, bold, list and link and a preview that looks
  like the public page.
- **FR-010**: Each saved change MUST increase the page's version and be recorded in the admin
  activity log (without the text). New orders MUST record the Terms and Privacy Policy versions
  current when the order was placed (already stored per order).
- **FR-011**: Every version of the Terms and of the Privacy Policy that becomes current (a save by
  Aviva or a supplied draft loaded under FR-008) MUST be kept as a dated copy of its title and text
  in both languages, and never changed or deleted afterwards. Aviva MUST be able to read any
  past version from the Content screen, and from an order the exact versions its customer
  accepted. (Clarifications 2026-11-09; adds to 001, which stored only the version number.)

**Contact**

- **FR-012**: The Contact page MUST show Aviva's introduction (the `contact` page text), the
  business details (legal name, email, phone, address, registration number) and a form with
  name (2–100 characters), email and message (10–5,000 characters) (001 FR-048).
- **FR-013**: A valid message MUST be emailed to the shop's notification addresses with the
  visitor's email as the reply address and a subject without the visitor's name or email; the
  visitor MUST see a confirmation that replaces the form and receives focus.
- **FR-014**: The contact form MUST reject bot submissions (hidden field, expired or missing form
  token) and limit each visitor to 5 sent messages per clock hour (submissions refused for invalid
  fields do not count), telling them how many minutes to wait, without puzzles (001 FR-036).
- **FR-015**: The shop MUST erase a contact message's text and the visitor's email from its
  storage once the message has been sent.

**Customer data (admin)**

- **FR-016**: Aviva MUST be able to search customers by email (any letter case) or phone (any
  common format, matched in its international form); results MUST list every order matching the
  searched email or phone with number, date, status and total, linked to the order page where
  details are corrected (002 FR-016), and MUST show the other emails and phone numbers used on
  those orders so Aviva can search them too. Search terms MUST NOT appear in page addresses.
- **FR-017**: Aviva MUST be able to download, for a found person, one file with everything the
  shop holds about them: each order (items, amounts, currency, delivery and address, payment
  method and state, status, Terms acceptance time, Terms and Privacy versions, marketing consent,
  its date and any withdrawal date), unfinished checkouts, and the emails the shop sent or holds
  about them (type, recipient, reply address, date, status) (001 FR-039).
- **FR-018**: Aviva MUST be able to record, after confirming, that a person withdrew marketing
  consent: every order of theirs that had consent shows it as withdrawn with the date, keeping the
  original consent date. (The shop sends no marketing emails; 001 FR-038.)
- **FR-019**: Aviva MUST be able to anonymise a found person after a confirmation that explains
  the orders stay without personal details for tax records, warns about any order that is not yet
  Completed or Cancelled, and says it cannot be undone. Anonymisation MUST apply exactly the rules
  in 001 data-model.md › order (name replaced by "נמחק"; phone, email, address except country,
  note, tracking number, pickup note and marketing consent removed; amounts, lines, dates, status
  and payment kept) to the orders shown, MUST leave the unfinished checkouts the search found to
  expire on their own (48 hours / 30 days for a mismatch, so a payment in progress is never lost)
  and tell Aviva how many, that a new order will appear if one of those payments completes, and to
  search again in 3 days, MUST delete every stored email belonging to one of those orders or, for
  an email search, sent to or replying to that email, and MUST record the event on each
  order and in the activity log without personal data.
- **FR-019a**: Searches, exports, marketing withdrawals and anonymisations MUST be recorded in the
  admin activity log without the customer's personal data, and only signed-in admins (both sign-in
  steps) may use them (001 SC-007). Downloading a person's data and anonymising MUST also ask the
  admin to confirm with her passkey again unless she did so in the last 5 minutes (the same
  re-check 001 uses for security changes).

**Consent**

- **FR-020**: Whether consent is required MUST follow from the shop's own configuration, never
  from anything the visitor's browser sends: it is required only when at least one optional
  cookie category is enabled. At launch none is, so no banner, no
  "Cookie settings" link and no consent cookie exist, and the banner's code is not downloaded
  (001 FR-037a; contracts/device-storage.md).
- **FR-021**: When consent is required, a first-time visitor MUST see a non-blocking banner with
  "Accept all" and "Reject all" of identical size and style, and "Settings" with one switch per
  optional category (necessary shown as always on). Nothing in an optional category may load or
  be stored before the visitor accepts it.
- **FR-022**: The choice MUST be remembered for 12 months and recorded (choices, Cookie Policy
  version, date; no IP address or browser details). "Cookie settings" in the footer MUST reopen
  the choice on every page; a change MUST be recorded as a new record and take effect at once.
  When the Cookie Policy version changes, the visitor MUST be asked again, nothing optional
  may load until they choose again, and optional cookies set under the earlier version MUST be
  expired at once (Clarifications 2026-11-10).
- **FR-023**: The test-only optional category (set by a server setting that production refuses)
  MUST let automated tests prove the consent behaviour; it MUST NOT exist in production.

**Statistics**

- **FR-024**: Each public page view MUST be counted per day and page, and each arrival per day and
  referring site (or "direct"), without storing anything on the device and without storing any IP
  address, browser details or other identifying data (001 FR-037). Page views after in-shop
  navigation count as views but not as new arrivals. Admin, checkout, order-page and unknown
  addresses, query strings and bot visits MUST NOT be counted; excessive calls from one source
  MUST be dropped silently.
- **FR-025**: Aviva MUST be able to see, for the last 7, 30 or 90 days, visits per day (a chart with
  the same numbers available as a table), the 10 most-viewed products by name, and the 10 sites
  sending the most visitors.

**Retention**

- **FR-026**: A daily task MUST anonymise orders 7 years after their order date, with the same
  rules as FR-019 (001 FR-040).
- **FR-027**: Daily tasks MUST delete admin activity entries and cookie-choice records older than
  2 years and stored emails 30 days after they were sent or finally failed. Each task MUST be safe
  to run more than once.

**Checkout fix**

- **FR-028**: On the checkout, in both languages and at every screen width, tapping or clicking
  the Terms checkbox itself MUST tick or untick it; only the "terms of sale" link text opens the
  Terms page. (Fixes the known overlap on the English checkout, where the link covered the centre
  of the checkbox's tap area.)

**Data Security Regulations drafts**

- **FR-029**: The project MUST supply, marked as drafts for legal review, the database
  definition document, the security procedure, the access-authorisation list, the severe security
  incident procedure and the yearly review checklist, consistent with the personal-data register
  and the services the shop uses (001 R19).

**Language**

- **FR-030**: Every new visitor-facing string (pages, footer, contact form and messages, banner,
  Cookie Policy table, contact email) MUST exist in Hebrew and English; admin screens are Hebrew
  with English entries kept in step (constitution I, 001 FR-044).

### Key Entities

- **Content page** (exists): one of seven pages (about, contact, privacy, terms, cookies,
  shipping-returns, accessibility) with Hebrew title and text, optional English title and text, a
  version that grows with each change, and whether Aviva has edited it.
- **Page version** (new): an unchangeable copy of one version of the Terms or the Privacy Policy:
  page, version number, Hebrew and English title and text, and when it became current. Contains
  no personal data; kept without a time limit, since orders refer to it for up to 7 years and the
  texts are public.
- **Device-storage item** (new, not stored in the database): one thing the shop may keep on a
  visitor's device: name, kind (cookie or browser storage), category (necessary or an optional
  one), purpose, lifetime, and whether it is used on public pages or the admin area. The Cookie
  Policy table and the automated storage checks both come from this list.
- **Optional cookie category** (new, configuration): analytics or marketing, enabled or not
  (none enabled at launch), and what it loads after consent.
- **Consent record** (exists): a visitor's choices per category, the Cookie Policy version and the
  date; no identifying data. Created only when consent is required.
- **Daily visit counters** (exist): views per day and page; arrivals per day and referring site.
- **Order** (exists): gains nothing new; its customer details, marketing consent and withdrawal,
  Terms and Privacy versions and anonymisation date are used by the customer tools.
- **Customer** (not stored as such): everything found by one email or phone across orders,
  unfinished checkouts and stored emails.
- **Contact message** (not stored beyond sending): name, email and text, held only in the email
  queue until sent.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Aviva fulfils a customer's "show me my data" request and, separately, a "delete my
  data" request in under 10 minutes each from the admin area, without help (001 SC-010).
- **SC-002**: In the launch setup, before and after a full browse-and-checkout, the shop stores
  zero items on the device that are not in the Cookie Policy table, sets zero optional cookies
  and contacts zero third-party trackers (001 SC-008).
- **SC-003**: With an optional category enabled, zero optional items load before acceptance or
  after rejection, and "Accept all" and "Reject all" have identical size and style.
- **SC-004**: All seven pages open on `/he` and `/en`, with no visitor-facing text in the
  wrong language (Hebrew fallback text excepted) (001 SC-006), and no existing link to them
  returns "page not found".
- **SC-005**: 100% of valid contact messages reach the shop's notification addresses within 1
  minute in normal operation, and a reply from Aviva's mail app goes to the visitor.
- **SC-006**: An edit Aviva saves to a page is visible to visitors on the next page load.
- **SC-007**: After anonymisation, searching the anonymised email or phone finds no orders and no
  stored emails, and the anonymised orders and the deleted emails no longer hold the person's
  name, email, phone or street address. The only exception is unfinished checkouts left to expire
  under FR-019: they may still be found, and still hold those details, until they expire (at most
  48 hours, or 30 days for a mismatch).
- **SC-008**: Every visit counted on a test day appears in Statistics for that day, and the shop's
  stored statistics contain no IP address, browser details or private link parts.
- **SC-009**: On the English and Hebrew checkout, on phone and desktop widths, a tap at the centre
  of the Terms checkbox ticks it in 100% of attempts.

## Assumptions

- The legal texts and Data Security Regulations documents are drafts written from the facts in
  this project; a qualified legal professional reviews them before launch (roadmap item 006's
  launch checklist). The project does not give legal advice. Items the reviewer must confirm (for
  example the exception for made-to-order goods and the cancellation fee cap) are flagged in the
  drafts.
- Business details shown in the footer and on the Contact page are the ones Aviva enters in the
  admin settings; until then they show the placeholders already listed on the admin home.
- The export is one structured, human-readable file (as planned in 001); Aviva sends it to the
  customer herself. The shop does not email it.
- The contact form sends no copy to the visitor, so it cannot be used to send email to other
  people.
- Aggregated daily visit counters hold no personal data and are kept without a time limit.
- Anonymisation applies to all of the person's orders, including cancelled unpaid ones, rather
  than deleting some of them, so order numbers and totals stay complete for tax records.
- Abandoned checkouts are already deleted after 48 hours (001); this feature does not change that.
- The footer and header language switch, and the automated check that every public page is fully
  presented in both languages, belong to roadmap item 005. This feature still supplies all its
  text in both languages.
- The view of the admin activity log is roadmap item 004; this feature only writes entries and
  deletes old ones.
- No new paid service is needed: statistics are counted by the shop itself, and contact messages
  use the existing email service.
