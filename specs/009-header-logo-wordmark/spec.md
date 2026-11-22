# Feature Specification: New header logo

**Feature Branch**: `009-header-logo-wordmark`

**Created**: 2026-11-21

**Status**: Approved by the owner (2026-11-21)

**Input**: User description: "Replace the logo asset with the new one (the 'Aviva's Crafts'
wordmark with yarn balls). It should not overflow from the header like the current one. It should
be centred in the header."

## Owner decisions (2026-11-21)

Agreed with the owner before this spec; binding for the plan.

1. **The new logo replaces the round badge everywhere.** The owner supplied a new logo
   (`assets/logo/logo-wordmark-original.jpg`, 2000×2000): the handwritten words "Aviva's Crafts"
   with two yarn balls and knitting needles above them, small hearts and a flower on each side.
   Brown line art with soft pastel colours, and no round frame or background of its own. As with
   the 008 badge, a light grey and white checkerboard is drawn into the picture and must be
   removed. The 008 round badge original stays in `assets/logo/` as a record; it is no longer
   used on the site.
2. **The logo sits inside the header bar, centred.** It no longer hangs below the bar. Everything
   008 added so pages would make room for the hanging half goes away.
3. **Over the home page photo the logo gets a soft white backing.** At the top of the home page the
   header is see-through over the photo; there the logo has a gentle light glow or pill behind it
   so the brown drawing stays readable. On the normal white bar it has no backing.
4. **The small icons use the yarn balls of the new logo.** The browser-tab icon, the phone
   home-screen icons and the app icon show the two yarn balls and needles from the new logo on a
   light background.
5. **The link-preview image uses the full new logo** on a light card over the home page photo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The shop's new logo in the header (Priority: P1)

A visitor opens any page of the shop and sees the shop's new logo in the middle of the header bar,
fully inside it. Tapping or clicking it takes them to the home page. Nothing hangs over the page
content.

**Why this priority**: the header is on every page; it is the owner's chosen face of the shop and
replaces the badge she no longer wants.

**Independent Test**: open the home, a category, a product, the contact and the checkout page on a
phone (375 px) and a computer (1280 px): the new logo is in the header's centre, wholly inside the
bar, and leads home.

**Acceptance Scenarios**:

1. **Given** any shop page, **When** it loads, **Then** the header shows the new logo (words and
   yarn balls), not the round badge and not the shop name as plain text.
2. **Given** any shop page at any width from 320 to 1280 px, **When** the header is shown, **Then**
   the whole logo lies inside the header bar, with some space above and below it, and its centre is
   at the bar's vertical middle.
3. **Given** a phone at 320 px or 375 px and a computer at 1024 px or 1280 px, **When** the header
   is shown, **Then** the logo does not touch or overlap the menu button, the search field or the
   cart button.
4. **Given** the top of any page that is not the home page, **When** it loads, **Then** the first
   content (breadcrumbs or heading) starts right under the header bar again, without the extra gap
   008 added for the hanging badge.
5. **Given** a screen reader user, **When** they reach the logo, **Then** it is announced as a link
   named "{shop name}, home page" (Hebrew: "{שם החנות}, דף הבית"), with the Hebrew shop name marked
   as Hebrew on English pages that fall back to it.
6. **Given** the menu drawer or the cart drawer is open, **When** the visitor looks at the header,
   **Then** the drawer and its dimmed backdrop cover the logo as they cover the rest of the page.
7. **Given** the visitor follows a link to a field or a heading on the page (for example an error
   link on the checkout), **When** the page scrolls, **Then** the target ends up just under the
   header bar, not hidden behind it.

---

### User Story 2 - Readable logo over the home page photo (Priority: P1)

At the top of the home page the header is see-through over the big photo. The visitor can still
read the logo clearly, because a soft white backing sits behind it there. Once the visitor scrolls
and the header turns white, the backing goes away.

**Why this priority**: the home page is where most visitors land; a logo that disappears into the
photo would undo the change.

**Independent Test**: open the home page at scroll 0 on a phone and a computer: the logo has the
light backing and reads clearly; scroll down: the bar turns white and the backing is gone.

**Acceptance Scenarios**:

1. **Given** the home page at the very top, **When** it loads, **Then** the logo shows a soft light
   backing behind it (a glow or a pill shape, not a hard white box over the whole header).
2. **Given** the home page, **When** the visitor scrolls down so the header turns white, **Then** the
   backing is no longer visible.
3. **Given** every other page, **When** it loads, **Then** the logo has no backing.
4. **Given** a visitor who prefers reduced motion, **When** the header changes state, **Then** the
   backing appears and disappears without animation, ending in the same states.
5. **Given** the browser runs with JavaScript turned off, **When** the home page loads, **Then** the
   logo is still readable (on the backing or on the white bar).

---

### User Story 3 - Icons and link previews match the new logo (Priority: P2)

The shop's small icons (the browser tab, a phone's home screen, the installed app) and the picture
shown when someone shares a link to the shop all use the new logo.

**Why this priority**: they are smaller touch points than the header, but showing the old badge
there would look inconsistent.

**Independent Test**: open the shop in a browser tab, add it to a phone's home screen, and share a
link in WhatsApp: the tab icon and home-screen icon show the new yarn balls; the preview shows the
new logo on a light card over the home photo.

**Acceptance Scenarios**:

1. **Given** the shop is open in a browser tab, **When** the visitor looks at the tab, **Then** the
   icon shows the two yarn balls and needles of the new logo on a light background, recognisable at
   16 and 32 px.
2. **Given** a phone, **When** the visitor adds the shop to the home screen, **Then** the icon shows
   the same yarn balls on a light background, with no checkerboard and no cut-off parts.
3. **Given** a link to the home page, a content page or the contact page, **When** it is shared,
   **Then** the preview picture shows the full new logo on a light card over the home page photo,
   readable at a glance.
4. **Given** a link to a product page, **When** it is shared, **Then** the preview still shows the
   product's own photo (unchanged from 008).

---

### Edge Cases

- A very long shop name (up to 60 characters, set in admin): the logo picture does not change size;
  the name is used only in the logo's alternative text and the link's accessible name.
- The English site with no English shop name: the accessible name uses the Hebrew name, marked as
  Hebrew (as in 008).
- High-contrast / forced-colours mode: the logo stays visible and the link keeps a visible focus
  ring.
- Keyboard focus on the logo link: a visible focus ring around the logo, inside the header (not
  cut off by the bar's edge), also over the home photo.
- Zoom to 200 %: the header still fits the logo and the controls without overlap.
- The source picture's checkerboard is light grey and near-white, close to the logo's soft pastel
  colours: the cut-out must keep the pastel fills and the thin lines whole and leave no
  checkerboard squares, light halos or grey fringes around the drawing.

## Requirements *(mandatory)*

### Functional Requirements

**Header logo (Stories 1 and 2)**

- **FR-001**: Every shop page MUST show the new logo in the header in place of the round badge.
- **FR-002**: The logo MUST lie entirely inside the header bar, at every width from 320 to 1280 px,
  with space above and below it, and its vertical centre MUST be at the bar's vertical middle.
- **FR-003**: The logo MUST stay in the header's centre position (where the brand sits today) and
  MUST NOT touch or overlap the menu button, the search field or the cart button at 320, 375, 1024
  and 1280 px.
- **FR-004**: The extra room 008 made for the hanging badge MUST be removed: pages start right under
  the header bar again, and sticky panels (the product's buy panel, the checkout summary) and
  "scroll to" targets line up with the bar's bottom edge as they did before 008.
- **FR-005**: The logo MUST stay a link to the home page in the current language, with the accessible
  name "{shop name}, home page" / "{שם החנות}, דף הבית" and the Hebrew name marked as Hebrew when the
  English site falls back to it (unchanged from 008).
- **FR-006**: The logo MUST be sharp on ordinary and high-density screens and MUST have a real
  transparent background (no checkerboard, no halo, no grey fringe).
- **FR-007**: While the home page header is see-through over the photo, the logo MUST have a soft
  light backing behind it that keeps the brown drawing readable; in every other header state and on
  every other page it MUST have none.
- **FR-008**: The drawers (menu, cart), their backdrops, dialogs and the cookie banner MUST stay
  above the logo.
- **FR-009**: The logo link MUST have a visible keyboard focus ring that is not clipped by the bar
  and is visible over the home photo.

**Icons and link previews (Story 3)**

- **FR-010**: The browser-tab icon, the Apple and Android home-screen icons and the app manifest
  icons MUST show the two yarn balls and needles of the new logo on a light background, replacing
  the 008 icons. The admin area uses the same icons.
- **FR-011**: The site-wide link-preview picture MUST show the full new logo on a light card over the
  home page photo, at the size link-preview services expect (wide format). Product pages keep their
  own picture.
- **FR-012**: All icons, the preview picture and the header logo MUST be produced from the owner's
  original by the shop's existing repeatable asset step, so running it again gives the same files.

**General**

- **FR-013**: The old round-badge original MUST stay in `assets/logo/` but MUST no longer be served
  or used by the site.
- **FR-014**: The design system document, the product notes and the owner's guide MUST describe the
  new logo (where it sits, its backing over the photo, the icons) and drop the hanging-badge rules.
- **FR-015**: Any new visible text MUST exist in Hebrew and English. (None is expected: the accessible
  name and alternative text from 008 are kept.)

### Key Entities

- **Logo original**: the owner's picture file, kept unchanged in the repository and never served.
- **Served brand files**: the header logo in a few sizes, the small icons, the preview picture and
  the app manifest, all made from the original.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On 100 % of shop pages, on phone and computer widths from 320 to 1280 px, the whole
  logo is inside the header bar and overlaps none of the header's controls.
- **SC-002**: No page shows the round badge or any part of the checkerboard, in the header, the
  browser tab, the home-screen icon or a link preview.
- **SC-003**: At the top of the home page, the logo's brown lines reach at least 3:1 contrast against
  what is directly behind them (the backing), on both phone and computer.
- **SC-004**: Sharing the home page, the contact page and a product page in WhatsApp shows the new
  logo on the first two and the product photo on the third.
- **SC-005**: The header logo files add no more weight to a page than the 008 badge did (each size
  within the same budget).
- **SC-006**: Every existing check still passes (types, lint, unit, integration, PostgreSQL, and the
  browser tests in CI).

## Assumptions

- The header bar keeps its current heights (64 px on phones, 72 px from 900 px). The logo is sized
  to fit inside it; making the bar taller is out of scope.
- The logo is wider than it is tall (about 2.3 : 1). At the bar's height the handwritten words are
  small but readable; the shop name is not repeated as text beside it.
- "Centred" means where the brand sits today: in the middle of the header on both phone and computer.
- The 008 asset step (`pnpm brand:assets`) is adapted rather than replaced; the planning phase
  decides how it finds the drawing on the checkerboard and how large the margins are.
- The soft backing over the home photo is a visual treatment only; it carries no text.
- No database, settings or admin screen changes; no new setting for the logo.
