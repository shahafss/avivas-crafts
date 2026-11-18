# Feature Specification: English Version and Language Switch

**Feature Branch**: `005-english-language-switch`

**Created**: 2026-11-12

**Status**: Approved 2026-11-12

**Input**: User description: "English version and language switch (roadmap item 005). Source: spec
001 › User Story 4 and specs/001-online-crafts-shop/tasks.md Phase 6 (T095–T099); spec 001 is
frozen, reuse its decisions. Goal: a visible language switch on every public page shows the same
page in English with a real LTR layout, keeps the cart, remembers the choice, and shared links open
in their language; customer emails go out in the language of the order; empty English owner text
falls back to Hebrew. Owner decisions (2026-11-12): 1. URLs: keep /he/... and /en/..., always
prefixed; first visit to / goes to Hebrew, no browser-language detection; / goes to the remembered
language when there is one. 2. Remembering: the NEXT_LOCALE cookie (HttpOnly, SameSite=Lax, 1
year, Secure on https), written only when the visitor clicks the switch (GET /api/locale with
open-redirect and cross-site protection); opening a shared /en link never sets it. It is strictly
necessary storage already listed in the cookie policy registry (constitution VII). 3. The admin
area stays Hebrew only. 4. Customer emails (order confirmation, cancelled, refunded) follow the
order's language (already built; 005 adds tests). Emails to the owner stay Hebrew. 5. Hebrew
fallback for missing English owner text is silent (marked lang="he" dir="auto", no visible note).
Add a small 'no English' marker in the admin product list so the owner sees which products still
need English text. 6. hreflang alternates + canonical on every public page, sitemap.xml and
robots.txt (admin and api disallowed) are in this feature. 7. One English copy pass for voice and
naturalness (design/storefront.md §1 voice rules); owner approves at the final gate."

## Context

Spec 001 (frozen) promised an English version from the first release (User Story 4, FR-041 to
FR-045) and moved its remaining tasks (T095–T099) to this roadmap item. Much of the groundwork was
built along the way by 001–004:

- Every public page already exists at a Hebrew address (`/he/...`) and an English address
  (`/en/...`). Hebrew pages are right-to-left, English pages left-to-right. Opening `/` goes to
  Hebrew unless a remembered choice says English.
- All interface text, messages and customer emails already have English versions.
- The owner can already enter English text for products, options, categories, image descriptions,
  content pages and shop settings; where it is empty, the Hebrew text is shown and marked as Hebrew.
- Each order already records the language it was placed in, and the customer's order emails use it.
- The "remembered language" cookie is already listed as strictly necessary storage in the cookie
  policy (spec 003).

What is missing is the part the visitor sees and uses: the **switch itself**, the remembering, the
addresses search engines need to find both languages, a review of the English wording, the owner's
view of what is still untranslated, and the tests that prove it all works.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Switch to English on any page (Priority: P1)

A visitor who does not read Hebrew sees a clearly visible language control in the header of every
public page. One click shows the same page in English, laid out left to right, with the same cart
and the same search or sort. One click on the same control brings them back to Hebrew.

**Why this priority**: without the switch, English visitors cannot find the English shop at all.

**Independent Test**: open any public page in Hebrew with items in the cart, press the switch, and
confirm the same page appears in English, left to right, with the cart count unchanged; press it
again and confirm the Hebrew page returns.

**Acceptance Scenarios**:

1. **Given** a visitor on the Hebrew home page, **When** they press the switch, **Then** they land
   on the English home page, and pressing it there lands them back on the Hebrew home page.
2. **Given** a visitor on a Hebrew product page with two items in the cart, **When** they press the
   switch, **Then** they see the same product in English, laid out left to right, and the cart still
   shows two items.
3. **Given** a visitor on a Hebrew category page sorted by price, or on a Hebrew search results page
   for a query, **When** they press the switch, **Then** the English page keeps the same sort or
   the same query.
4. **Given** a visitor on any public page (including the cart, checkout, an order page, a content
   page, contact, and the "page not found" page), **When** they look at the header, **Then** the
   switch is there; it also appears in the site menu and the footer in full words ("English" /
   "עברית").
5. **Given** a visitor on any admin page, **When** they look for a language switch, **Then** there
   is none: the admin area is Hebrew only.

---

### User Story 2 - The choice is remembered, and shared links keep their language (Priority: P1)

A visitor who switched to English and comes back later on the same device sees the shop in English.
Someone who receives a link to an English page sees it in English. Nothing is remembered about a
visitor's language unless they pressed the switch themselves.

**Why this priority**: it is part of the original promise (spec 001 acceptance scenarios 3 and 4),
and it is where privacy rules apply.

**Independent Test**: with a fresh browser, open the shop, switch to English, close the tab, open
the shop's main address again and see English; with another fresh browser, open an English product
link and see English, with nothing stored.

**Acceptance Scenarios**:

1. **Given** a first-time visitor, **When** they open the shop's main address, **Then** it opens in
   Hebrew, right to left, whatever language their browser prefers.
2. **Given** a visitor who pressed the switch to English, **When** they later open the shop's main
   address on the same device, **Then** it opens in English.
3. **Given** a visitor who browses pages and moves the pointer over the switch without pressing it,
   **When** their stored data is inspected, **Then** no language choice is stored.
4. **Given** someone opens a link to an English page in a fresh browser, **When** the page loads,
   **Then** it is in English and no language choice is stored for them.
5. **Given** a visitor who chose English opens a link to a Hebrew page, **When** the page loads,
   **Then** it is in Hebrew (the address wins) and their remembered choice is unchanged.
6. **Given** another website links or redirects a visitor to the switch, **When** the visitor
   arrives, **Then** they are taken to the page but no language choice is stored.

---

### User Story 3 - Buy in English and get English emails (Priority: P1)

An English-speaking customer goes through the whole purchase in English: cart, checkout, payment
return page and order page. The confirmation email, and any later cancellation or refund email, is
in English. Dates and prices are written the English way.

**Why this priority**: an English shop that switches back to Hebrew at checkout or in the email
loses the sale and the customer's trust.

**Independent Test**: switch to English, add a product, check out, and confirm every screen and the
confirmation email are in English and left to right.

**Acceptance Scenarios**:

1. **Given** a visitor viewing the shop in English, **When** they complete checkout, **Then** every
   checkout screen, the payment return page and the order page are in English, left to right.
2. **Given** an order placed in English, **When** the confirmation email arrives, **Then** it is in
   English, and its links lead to the English order page and English policy page.
3. **Given** an order placed in English, **When** the owner cancels or refunds it, **Then** the
   email the customer receives is in English.
4. **Given** an order placed in Hebrew, **When** any customer email is sent for it, **Then** it is
   in Hebrew, even if the customer later browses in English.
5. **Given** any order, **When** the owner is notified about it, **Then** the owner's email is in
   Hebrew.
6. **Given** a page or email in English, **When** it shows a date or a price, **Then** the date is
   written in English and the price uses the English number format with the shekel sign.

---

### User Story 4 - Untranslated owner text, and the owner sees what is missing (Priority: P2)

Aviva writes products in Hebrew first and adds English when she can. English visitors see her
Hebrew text where no English exists yet, without a visible note. In the admin product list she sees
at a glance which products still lack English.

**Why this priority**: the shop must work in English before every product is translated, and Aviva
needs a simple way to know what to translate next.

**Independent Test**: create a product with no English text, view it on an English page (Hebrew
text shown, correctly aligned, rest of page English), then see the "no English" marker on it in the
admin product list; add English text and see the marker disappear.

**Acceptance Scenarios**:

1. **Given** a product with no English name or description, **When** it is shown on an English
   page, **Then** its Hebrew text appears, aligned and read as Hebrew, and everything around it
   stays English with no visible "not translated" note.
2. **Given** a category, an option, an image description, a content page or a shop setting (such
   as the shop name) with no English text, **When** it is shown on an English page, **Then** the
   Hebrew text appears the same way.
3. **Given** a product whose English name or English description is empty, **When** the owner opens
   the admin product list, **Then** that product carries a small "no English" marker.
4. **Given** a product whose English name and description are both filled in, **When** the owner
   opens the product list, **Then** it carries no marker.

---

### User Story 5 - Search engines find both languages (Priority: P2)

Search engines learn that every public page exists in Hebrew and English, which one is the main
address for each, and which pages to list. Admin and technical addresses are kept out.

**Why this priority**: English visitors mostly arrive from search or shared links; without this,
search engines may show the wrong language or treat the two versions as duplicates.

**Independent Test**: fetch any public page in both languages and confirm it names itself as the
main address and points to its other-language version; fetch the site map and the robots file and
confirm their contents.

**Acceptance Scenarios**:

1. **Given** any public page (home, category, product, search, cart, content pages, contact), **When**
   it is loaded in either language, **Then** it states its own main address and links to its Hebrew
   and English versions, with Hebrew as the default.
2. **Given** the site map, **When** it is fetched, **Then** it lists the home page, every category that has published products,
   every published and visible product, every content page and the contact page, each in both
   languages, and nothing else.
3. **Given** a product that is a draft or hidden, **When** the site map is fetched, **Then** the
   product is not listed.
4. **Given** the robots file, **When** it is fetched, **Then** it points to the site map and asks
   crawlers to stay out of the admin area and the technical (API) addresses.

---

### User Story 6 - The English reads naturally (Priority: P3)

The English text reads as if Aviva wrote it in English: first person, warm, addressing the customer
directly, not a word-for-word translation of the Hebrew.

**Why this priority**: the text is already complete; this is a polish pass, but first impressions
matter for gift buyers and visitors from abroad.

**Independent Test**: the owner reads the English home, product, cart, checkout, order and email
text and approves it.

**Acceptance Scenarios**:

1. **Given** the English interface and email text, **When** it is reviewed against the shop's voice
   rules, **Then** it uses Aviva's first person, addresses customers directly and has no literal
   translations, and the owner approves it at the final review.
2. **Given** any English public page, **When** its visible text is checked, **Then** it contains no
   Hebrew except the "עברית" switch label and owner text that has no English version.

### Edge Cases

- **Switching on the "page not found" page**: the visitor lands on the "page not found" page in the
  other language (the same address under the other language).
- **Switching on a page that disappears**: if a product was unpublished between loading the page
  and pressing the switch, the visitor sees the English "piece not available" page with the newest
  pieces.
- **Switching during checkout**: the cart is kept; details typed into the checkout form but not yet
  submitted may need to be typed again (the switch is a full page change).
- **Switching on an order page or payment return page**: the same order opens in the other
  language; the order's email language does not change, because it was fixed when the order was
  placed.
- **Tampered switch addresses**: a switch request that points anywhere other than a page of this
  shop (another website, the admin area, a made-up language, disguised addresses) is refused, and
  nothing is stored.
- **A stored choice with an unknown value**: the main address opens in Hebrew.
- **Switch without scripts**: the switch is an ordinary link, so it works with scripts turned off
  or before the page has fully loaded.
- **Owner text partly translated**: a product with an English name but no English description
  shows the English name and the Hebrew description; the admin marker still shows (US4 scenario 3).
- **Mixed-direction text**: phone numbers, email addresses, order numbers, tracking numbers and
  search queries read correctly in both directions (spec 001's existing rules).

## Requirements _(mandatory)_

### Functional Requirements

**The switch**

- **FR-001**: Every public page MUST show a language switch in the header: a compact control that
  reads "EN" on Hebrew pages and "עב" on English pages, named "EN – English" / "עב – עברית" for
  assistive technology (the name starts with the visible text, WCAG 2.5.3; owner decision
  2026-11-13) and marked with the target language. The site menu and the footer MUST show the same
  switch in full words ("English" / "עברית"). Its look follows design/storefront.md §7.19.
- **FR-002**: Pressing the switch MUST show the same page in the other language, keeping the rest
  of the address (product, category, order, content page) and its query (sort, search, page
  number, payment return details).
- **FR-003**: Switching MUST NOT change the cart.
- **FR-004**: The switch MUST be an ordinary link that works without scripts and MUST NOT be fetched
  ahead of time by the browser or the site (so nothing is stored without a click).
- **FR-005**: The admin area MUST NOT show a language switch and MUST stay Hebrew only (spec 001
  FR-044).

**Remembering the choice**

- **FR-006**: Pressing the switch MUST store the chosen language on the device for one year, in the
  single strictly necessary language cookie already declared in the cookie policy. Nothing else may
  store or change it.
- **FR-007**: The language choice MUST NOT be stored when a page is merely viewed, when an
  other-language link is opened, or when the pointer moves over the switch.
- **FR-008**: The shop's main address MUST open in the stored language when there is one, and in
  Hebrew otherwise. The visitor's browser language MUST NOT be used.
- **FR-009**: A page address that names a language MUST always open in that language, whatever is
  stored.
- **FR-010**: The switch MUST only send visitors to pages of this shop under `/he` or `/en`;
  anything else (other sites, the admin area, unknown languages, disguised addresses) MUST be
  refused with an error and nothing stored.
- **FR-011**: When the switch is reached from another website, the visitor MUST be taken to the
  page without the choice being stored.

**English pages and emails**

- **FR-012**: Every public page MUST be fully usable in English, laid out left to right, with no
  Hebrew visible except the "עברית" switch label and owner text that has no English version.
- **FR-013**: Dates, prices and numbers on English pages and in English emails MUST use English
  formatting (prices in shekels).
- **FR-014**: The customer's order confirmation, cancellation and refund emails MUST be in the
  language the order was placed in, and their links MUST lead to pages in that language. Emails to
  the owner MUST stay Hebrew.
- **FR-015**: The English interface and email text MUST follow the shop's voice rules
  (design/storefront.md §1: Aviva in the first person, customers addressed directly, natural
  English), and the owner MUST approve it before the feature is done.

**Untranslated owner text**

- **FR-016**: Where the owner has no English text for a product, option, category, image
  description, content page or shop setting, English pages MUST show the Hebrew text, marked as
  Hebrew so it is aligned and read correctly, with no visible note (spec 001 FR-045).
- **FR-017**: The admin product list MUST show a small "no English" marker on every product whose
  English name is empty, or whose English description is empty while a Hebrew description exists
  (a product with no Hebrew description is not asked for an English one), and none on other
  products. (Owner decision 2026-11-12.)

**Search engines**

- **FR-018**: Every public page in either language MUST state its main address and its Hebrew and
  English versions, with Hebrew as the default version.
- **FR-019**: The shop MUST publish a site map listing, in both languages, the home page, every
  category that has published products, every published and visible product, every content page and the contact page, always
  reflecting the current catalog.
- **FR-020**: The shop MUST publish a robots file that points to the site map and asks crawlers to
  stay out of the admin area and the API addresses.
- **FR-021**: Pages that show one customer's own order, checkout or payment return MUST NOT be
  listed in the site map and MUST NOT be indexed.

**Tests (constitution VI: language switching is a critical path)**

- **FR-022**: Automated tests MUST cover: the switch on the home page and back; switching on a
  product reached through a sorted category, keeping the cart; switching on search keeping the
  query; no stored choice before a click; the main address following the stored choice; a fresh
  visitor opening an English link; a full English checkout with an English confirmation email;
  the search-engine addresses on every public page in both languages; no stray Hebrew on English
  pages; the switch refusing every tampered address and not storing from other sites.

### Key Entities

- **Language choice**: the visitor's remembered language (Hebrew or English) on one device, set only
  by the switch, kept for one year. Already declared in the cookie policy; no personal data.
- **Order language**: the language an order was placed in, already recorded on every order; it
  decides the language of the customer's emails for that order.
- **Owner text in two languages**: Hebrew (required) and English (optional) versions of product,
  option, category, image, content page and settings text; already stored. A product is
  "missing English" when its English name or English description is empty.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: From any public page, a visitor reaches the same page in the other language with one
  click, and the cart count is the same before and after on 100% of tested pages.
- **SC-002**: A visitor can complete a full purchase in English, from home page to confirmation
  email, without seeing a Hebrew interface word.
- **SC-003**: 100% of English public pages pass the "no stray Hebrew" check (only the switch label
  and untranslated owner text are Hebrew).
- **SC-004**: Before the switch is pressed, a visitor's device holds no language choice, in 100% of
  tested flows (browsing, hovering the switch, opening shared English links, arriving from another
  site).
- **SC-005**: 100% of tampered switch requests are refused and redirect nowhere outside the shop.
- **SC-006**: Every public page in both languages names its main address and both language versions,
  and the site map lists every published product in both languages within one page load of it being
  published.
- **SC-007**: The owner can tell which products still need English from the product list alone,
  without opening any product.
- **SC-008**: The owner approves the English wording at the final review.

## Assumptions

- The address scheme (`/he/...`, `/en/...`, always with a language prefix), the left-to-right
  layout, the English interface text, the owner's English fields, the Hebrew fallback and the order
  language are already built by 001–004 and are reused, not rebuilt.
- The language cookie's settings (strictly necessary, one year, readable only by the server, sent
  only within the site, secure on https) and the switch's address rules come from spec 001's
  contracts (`contracts/http-endpoints.md` › `/api/locale`, `contracts/device-storage.md`) and the
  owner's decisions of 2026-11-12. The cookie is already listed in the cookie policy, so no consent
  banner is needed (constitution VII).
- Only Hebrew and English are supported; no third language is planned.
- The "no English" marker looks at the product's name and description only; options and image
  descriptions are not counted, to keep the marker simple.
- No English admin interface, no automatic translation, and no "this text is in Hebrew" note for
  visitors.
- Order emails already sent are not resent; the order language set at checkout is final.
- Content pages and the contact page built by 003 are included in every check (switch,
  search-engine addresses, site map, stray-Hebrew check).
- English legal drafts contain no Hebrew words (owner decision 2026-11-12): the one Hebrew term in
  the English Terms draft is reworded, because legal pages cannot mark inline Hebrew.
- The English copy pass changes wording only, not keys or structure; the Hebrew text is not changed
  by this feature.
- At the end of the feature, `docs/roadmap.md` item 005 is marked done; design/storefront.md gets
  the admin "no English" badge and the built footer switch, and otherwise changes only if the
  switch's design changes.
