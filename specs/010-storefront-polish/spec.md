# Feature Specification: Storefront polish

**Feature Branch**: `010-storefront-polish`

**Created**: 2026-11-22

**Status**: Approved by the owner (2026-11-22, revised address item); plan approved 2026-11-22

**Input**: Four small changes agreed with the owner on 2026-11-22: a builder credit in the footer,
an animated underline on the menu links that also marks the current page, a sitemap that people
can read, and clear product addresses typed by the owner (new `/product/` and `/category/` paths).

## Owner decisions (2026-11-22)

Agreed with the owner before this spec; binding for the plan.

1. **Footer credit.** English: "Designed & built by Shahaf Shmuel". Hebrew: "נבנה ועוצב על ידי
   שחף שמואל" (the Hebrew does not need to follow the English word order). Only the name is a link,
   to `https://shahafs.com`, opening in a new tab. It sits in the footer's bottom row, in the same
   small muted text as the copyright line, on its own line directly under the copyright line
   (revised 2026-11-22 at the Phase D gate; it was beside it).
2. **Underline animation: "from the middle".** On hover or keyboard focus the underline grows from
   the middle of the link outward to both ends; when the pointer or focus leaves, it shrinks back
   to the middle. It applies to the header links and the phone menu links only. **Revised
   2026-11-22 at the Phase D gate:** footer links get no underline at all (no animation, no
   hover underline); only the credit link keeps its plain underline (FR-020).
3. **Current page stays underlined, in the header and the phone menu only.** The link for the page
   the visitor is on keeps its underline. The footer never does this. On the home page and on
   product pages no header link is underlined.
4. **Sitemap: remove the language lines (revised 2026-11-22).** The sitemap drops its per-address
   "other language" lines, so browsers show it as a tidy tree instead of one run-on line. Every
   page already names its other-language version in its own head (with a default language), which
   is enough for search engines. The first choice, a display style (XSLT), was dropped because
   Chrome removed XSLT support in version 155 (November 17, 2026).
5. **Product addresses (revised 2026-11-22).** This is an early testing launch, so addresses may
   change freely and old links need not keep working.
   - Product pages move from `/{locale}/p/{address}` to `/{locale}/product/{address}`, and category
     pages from `/{locale}/c/{address}` to `/{locale}/category/{address}`. Old `/p/…` and `/c/…`
     links show "page not found" (no forwarding).
   - A one-time update gives the live products clear English addresses (table below).
   - From now on the owner types each product's address herself in the product editor. It is
     required before publishing, can be changed freely whenever the product is a draft, and is
     locked while the product is in the shop (published or hidden). To fix it later, the owner
     moves the product back to draft, changes it, and publishes again (owner answer, 2026-11-22).
     There is no memory of old addresses.
     The shop no longer makes addresses from the English name or as random codes.

   | Hebrew name | Address today | New address |
   |---|---|---|
   | רעשן לתינוק | `p-35xmobci` | `baby-rattle` |
   | ארנב עם סטייל | `p-7ow5r4uj` | `stylish-bunny` |
   | קופיקו | `p-d6gehfh3` | `kofiko-monkey` |
   | פילון | `p-dcqsjfs2` | `little-elephant` |
   | ארנבון | `p-gif5m2wz` | `little-bunny` |
   | חתלתול | `p-hic726te` | `kitten` |
   | ארנב חיבוק | `p-ioidqaly` | `hug-bunny` |
   | דובי | `p-k2xzyog3` | `teddy-bear` |
   | בובת ילד | `p-kqjqza24` | `boy-doll` |
   | ג'ירף | `p-kxltwwpj` | `giraffe` |
   | בובת ילד (second) | `p-suzy3jpe` | `boy-doll-2` |
   | כבשה | `p-vjvwbxzx` | `sheep` |
   | ארנבון סטייליסט | `p-wuxbxcnn` | `stylist-bunny` |
   | דובוני | `p-zykmhn5l` | `little-teddy` |
   | Teddy Bear In A Dress | `teddy-bear-in-a-dress` | `teddy-girl` |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Clear product addresses chosen by the owner (Priority: P1)

Today most product pages have a random code as their address (for example `/he/p/p-35xmobci`). After
this feature every live product has a clear address (`/he/product/baby-rattle`), and category pages
use `/category/` (`/he/category/featured`). When Aviva creates a new product, she types its address
herself in the product editor; the shop will not publish a product without one. While the product is in
the shop, the address stays fixed; to change it, Aviva moves the product back to draft first.

**Why this priority**: it is the only item that changes data and every product link; clear addresses
look trustworthy when shared and help search a little.

**Independent Test**: after the update, open the live products at their new `/product/` addresses in
both languages and a category at `/category/`; check old `/p/…` and `/c/…` addresses show "page not
found"; in the admin, create a product, try to publish without an address (refused), set one, publish,
and check the field is locked.

**Acceptance Scenarios**:

1. **Given** the shop after this feature, **When** a visitor opens any product, **Then** its address is
   `/{he|en}/product/{address}`, and every link to it in the shop (cards, cart, search, related
   products, breadcrumbs, link previews, sitemap, language switch) uses that form.
2. **Given** a category, **When** a visitor opens it, **Then** its address is
   `/{he|en}/category/{address}` and every link to it uses that form.
3. **Given** an old address such as `/he/p/p-35xmobci` or `/he/c/featured`, **When** it is opened,
   **Then** the shop shows its normal "page not found" page.
4. **Given** the one-time update has run, **When** the owner looks at the live products, **Then** each
   product in the table above has its new address; products not in the table (drafts or hidden ones)
   keep their address until the owner moves them to draft and changes it.
5. **Given** the owner creates a new product, **When** the editor opens, **Then** it shows a required
   "Product address" field, empty, with a hint explaining the allowed letters and showing the full
   address it will make.
6. **Given** a draft product, **When** the owner types an address and saves, **Then** it is saved; she
   can change it again as often as she likes while the product is a draft.
7. **Given** a draft without an address, **When** the owner tries to publish, **Then** publishing is
   refused and the address field is marked as missing, like the other required fields.
8. **Given** an address that has characters other than lowercase English letters, digits and single
   dashes, is longer than 60 characters, or is already used by another product, **When** the owner
   saves, **Then** the save is refused with a clear message next to the field, in the admin's
   language.
9. **Given** a published or hidden product, **When** the owner opens it in the editor, **Then** the
   address is shown but cannot be changed, with a note that she can move the product to draft to
   change it.
10. **Given** a published product moved back to draft, **When** the owner changes its address and
   publishes again, **Then** the product lives at the new address and the old one shows "page not
   found".

---

### User Story 2 - Menu links with a gentle underline that shows where you are (Priority: P2)

A visitor moves the mouse over "About" in the header: a thin line grows from the middle of the word
out to both ends, and shrinks back when the mouse leaves. On the About page itself, "About" stays
underlined, so the visitor sees where they are. The same happens in the phone menu. Footer links
have no underline at all (owner decision 2, revised).

**Why this priority**: it is seen on every page and makes the shop feel finished, but nothing breaks
without it.

**Independent Test**: on a computer, hover and tab through the header links (and check the footer
links show no underline); on a
phone, open the menu; open the About, Shipping & returns, All pieces and a category page and check
which header link stays underlined; open the home page and a product page and check none is.

**Acceptance Scenarios**:

1. **Given** a header or phone menu link, **When** the pointer moves over it or it gets
   keyboard focus, **Then** an underline grows from the middle of the link to its full width in a
   short, smooth motion (well under half a second).
2. **Given** an underlined link (not the current page), **When** the pointer or focus leaves,
   **Then** the underline shrinks back to the middle and disappears.
3. **Given** the visitor's device asks for reduced motion, **When** they hover or focus a link,
   **Then** the underline appears and disappears at once, without the growing motion.
4. **Given** the visitor is on a page that has a link in the header or phone menu (All pieces, a
   category shown there, About, Shipping & returns, Contact), **When** the page loads, **Then** that
   link shows the underline without hovering, and screen readers announce it as the current page.
5. **Given** the visitor is on the home page, a product page, the search page, the cart, the
   checkout, an order page or a page without a menu link, **When** the page loads, **Then** no
   header or phone menu link is underlined or marked as current.
6. **Given** the visitor is on any page, **When** they look at, hover or tap the footer links,
   **Then** no footer link is underlined, even the link for the current page.
7. **Given** a right-to-left Hebrew page and a left-to-right English page, **When** the underline
   grows, **Then** it looks the same in both: centred on the link, reaching both ends.
8. **Given** a link whose text is cut short with an ellipsis (a long category name), **When** it is
   underlined, **Then** the underline spans the visible link and does not stick out past it.

---

### User Story 3 - A sitemap people can read (Priority: P3)

The owner (or anyone curious) opens `avivascrafts.com/sitemap.xml` in a browser and sees the
browser's tidy view of the file: one entry per page with its address and last-updated date, not one
run-on line of text. Search engines still find every page in both languages, and still learn which
Hebrew and English pages belong together from the pages themselves.

**Why this priority**: only people who open the file directly see it; search engines are already
served well.

**Independent Test**: open `/sitemap.xml` in Chrome and check it shows as a tidy tree; compare the
list of addresses and dates with the current sitemap; open a few pages and check each still names
its other-language version and a default language in its head.

**Acceptance Scenarios**:

1. **Given** a person opens `/sitemap.xml` in a current desktop browser, **When** it loads, **Then**
   the browser shows its structured view of the file (entries one under another), not run-on text.
2. **Given** a search engine fetches `/sitemap.xml`, **When** it reads the file, **Then** it gets a
   valid standard sitemap with the same addresses and last-updated dates as before this feature
   (apart from changes from User Story 1), without per-address language lines.
3. **Given** any page listed in the sitemap, **When** a search engine reads that page, **Then** the
   page still names its Hebrew and English versions and a default version, as today.

---

### User Story 4 - Builder credit in the footer (Priority: P3)

At the bottom of every page, on the line under the copyright line, a visitor sees "Designed & built by
Shahaf Shmuel" (Hebrew pages: "נבנה ועוצב על ידי שחף שמואל"). Clicking the name opens
shahafs.com in a new tab.

**Why this priority**: personal credit for the builder; no effect on shopping.

**Independent Test**: open a Hebrew and an English page, find the credit in the footer's bottom
row, check the wording, and click the name.

**Acceptance Scenarios**:

1. **Given** any public page with the footer, **When** it loads in English, **Then** the bottom row
   shows "Designed & built by Shahaf Shmuel" in the same small muted style as the copyright line.
2. **Given** the same page in Hebrew, **Then** it shows "נבנה ועוצב על ידי שחף שמואל".
3. **Given** the credit, **When** the visitor activates the name, **Then** `https://shahafs.com`
   opens in a new tab and the shop stays open in the original tab; only the name is a link.
4. **Given** a screen reader user, **When** they reach the link, **Then** it is announced with the
   name and an indication that it opens in a new tab, in the page's language.
5. **Given** a phone at 320 px, **When** the footer's bottom row is shown, **Then** the language
   switch, the copyright line and the credit wrap neatly without overlapping or sideways scrolling,
   and the link is easy to tap.

---

### Edge Cases

- A product shared earlier with its old `/p/` address: "page not found" (owner decision 5).
- An address typed with capital letters or spaces (including at the ends) in the admin: the field
  explains the allowed format rather than silently changing the text.
- A hidden or published product that still has a random code (one not in the table) keeps working:
  it can be saved, hidden and shown again as today. Only publishing from draft requires a typed
  address, so the owner can fix it by moving it to draft.
- Products that are drafts with a random code: publishing requires typing an address first.
- The one-time update finds a new address already used by a different product: that one rename is
  skipped (the deploy goes on), and the owner fixes it through the draft route.
- A category name in the header is long and truncated; a category that is not shown in the header:
  its page underlines nothing in the header, but the phone menu's category list still marks it.
- Pages with extra parts in the address (sorting, filters, page number on All pieces or a category)
  still mark the right link as current.
- The footer credit on English pages that fall back to Hebrew content: the credit itself is always
  in the page's language.

## Requirements *(mandatory)*

### Functional Requirements

**Product addresses**

- **FR-001**: Product pages MUST live at `/{locale}/product/{address}` and category pages at
  `/{locale}/category/{address}`. Every link, preferred address, language alternate, link preview,
  structured data and sitemap entry the shop produces MUST use these forms. Old `/{locale}/p/…` and
  `/{locale}/c/…` addresses MUST answer "page not found".
- **FR-002**: A one-time update MUST set the addresses of the live products to the owner's table in
  decision 5, matching each product by its current address; a product whose current address is not
  in the table is left unchanged, and a rename whose new address is already used by a different
  product is skipped rather than stopping the update. Running the update on a database without those products (for
  example a fresh or test database) MUST change nothing.
- **FR-003**: The product editor MUST have a "Product address" field. It is editable whenever the
  product is a draft and read-only while the product is published or hidden.
- **FR-004**: An address MUST be 1 to 60 characters of lowercase English letters (a–z), digits and
  single dashes, not starting or ending with a dash, and MUST NOT be another product's address. A
  refused address MUST show a clear message next to the field in the admin's language.
- **FR-005**: A product MUST NOT be published from draft without an owner-typed address: publishing is
  refused, with the field marked missing, while the address is empty or still a random code. Saving,
  hiding or showing again a product that is already in the shop is not blocked by a random code.
- **FR-006**: The shop MUST NOT create addresses by itself any more (no English-name addresses, no
  random codes for new products). A new product starts with no address of its own until the owner
  types one.
- **FR-007**: The server MUST refuse an address change for a product that is published or hidden, even
  if the request does not come from the editor.

(FR-008 and FR-009 were retired with the first version of the address item.)

**Link underline**

- **FR-010**: Header links and phone menu links MUST show an underline that grows from
  the middle outward on hover and keyboard focus and shrinks back to the middle when they end, in a
  short smooth motion.
- **FR-011**: When the visitor's device asks for reduced motion, the underline MUST appear and
  disappear without the growing motion.
- **FR-012**: In the header and the phone menu, the link for the page being viewed MUST stay
  underlined and MUST be marked as the current page for assistive technology. This covers All
  pieces (including its sorted, filtered or later pages), each category link (including those
  pages' variants), About, Shipping & returns and Contact.
- **FR-013**: On the home page, product pages and every page without its own header or phone menu
  link, no header or phone menu link MUST be underlined or marked current.
- **FR-014**: Footer links (the Info and Legal lists and the "Cookie settings" button) MUST NOT show
  an underline: not on hover, not on focus and not for the current page. Keyboard focus keeps the
  normal visible focus ring. (Revised 2026-11-22, Phase D gate.)
- **FR-015**: The underline MUST look the same, centred, on Hebrew (right-to-left) and English
  (left-to-right) pages, and stay within truncated links. The existing visible keyboard focus
  indicator MUST remain.

**Sitemap**

- **FR-016**: The sitemap MUST list every public page once per language, with the last-updated date
  where known today, and MUST NOT contain per-address language-alternate lines.
- **FR-017**: Every public page MUST keep naming its Hebrew and English versions and a default
  version in its own head, as today; this is now the only place search engines learn the pairs.
- **FR-018**: The sitemap MUST remain a valid standard sitemap.


**Footer credit**

- **FR-019**: Every public page with the footer MUST show the credit in its bottom row, in the
  page's language: English "Designed & built by Shahaf Shmuel", Hebrew "נבנה ועוצב על ידי שחף
  שמואל".
- **FR-020**: Only the name MUST be a link, to `https://shahafs.com`, opening in a new tab without
  giving the new page control of the shop's tab, and announced to screen readers as opening in a
  new tab.
- **FR-021**: The credit MUST use the same small muted style as the copyright line and wrap cleanly
  at 320 px with a comfortable tap target.

**General**

- **FR-022**: The design system document MUST be updated in this feature for the new underline
  behaviour, the current-page marking and the footer credit.

### Key Entities

- **Product address**: the readable last part of a product page's web address (for example
  `baby-rattle` in `/en/product/baby-rattle`). Exactly one per product, unique across products, typed
  by the owner while the product is a draft, fixed while it is in the shop.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After the update, 100% of the products in the owner's table open at their new
  `/product/` address in both languages, and no page of the shop links to a `/p/` or `/c/` address.
- **SC-002**: The owner can give a new product its address and publish it without help; a product
  without a typed address cannot be published (0 exceptions).
- **SC-003**: The sitemap lists the same number of addresses as before, all in the new forms.

- **SC-004**: On every page that has a header link, exactly one header link is marked current; on
  the home page and product pages, none is.
- **SC-005**: The underline motion finishes in under 0.3 seconds and does not move or resize any
  text or neighbouring element.
- **SC-006**: Opening the sitemap in current Chrome shows the structured tree view, and it still
  passes a standard sitemap check.
- **SC-007**: The credit appears on 100% of public pages with a footer, in the right language, and
  its link opens shahafs.com in a new tab.
- **SC-008**: The shop's accessibility and layout checks still pass at 320, 375, 768, 1024 and
  1280 px.

## Assumptions

- Search engines accept language pairs declared in the page head alone; the sitemap's
  per-address language lines were a second, redundant declaration.
- "Contact" counts as a menu link for the current-page marking wherever it appears in the header or
  phone menu.
- Category addresses themselves (`featured` and so on) stay as they are; only the `/c/` part of the
  path becomes `/category/`. How category addresses are created in the admin does not change.
- Hebrew-letter addresses are out of scope: addresses stay in English letters, which survive being
  copied into messages.
- The owner typing addresses is enough; the shop does not suggest one from the English name.
- The credit link is an ordinary link (search engines may follow it).
- The motion length follows the shop's existing motion values in the design system.
