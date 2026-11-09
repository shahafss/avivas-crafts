# Storefront design: brief and design system

**Feature**: `001-online-crafts-shop` · **Status**: Approved by the user (2026-11-08); amended after plan-review rounds 1–2 the same day ·
**Visual authority**: the approved sample `design/sample-product-page.src.html` (user approval
2026-11-08: "Yes, go with it"). The 2 MB `sample-product-page.html` is the same page with photos
inlined; it adds nothing to read.

This document is binding for every public storefront screen (`src/app/[locale]/**`,
`src/components/shop/**`, `src/components/ui/**`). Where it and the sample differ, this document
wins; every deliberate difference is listed in [§13](#13-deviations-from-the-sample). It does not
design the admin area (see [§12](#12-admin-area)).

---

## 1. Brief

### Job and audience

- **Who arrives**: mostly Hebrew speakers in Israel, on a phone, from a link someone shared
  (WhatsApp, social, family), often buying a gift. A smaller group of English speakers (family
  abroad, tourists). Nobody signs in.
- **Mode**: storefront screens are **Persuade-lite + Operate**. Catalog and product pages let the
  photos persuade. Cart, checkout and the payment pages are Operate: plain, predictable,
  nothing between the visitor and "order placed". Content pages are **Read**.

### Outcome and proof

- Primary action: from a product link to a confirmed order in under 3 minutes on a phone (SC-002).
- The proof is Aviva's own photos of the work (one plain backdrop, 4:5 crop), real prices with
  VAT, the stated preparation time, real delivery terms and the seller's business details. There
  are no reviews, badges, counters, urgency or invented social proof (PRODUCT.md principle 5).

### Selected direction

- **The category standard, executed well**, in the spirit of the two user-named references
  (soliducosmetics.com, allbirds.com), made **warm and positive**: a warm light ground, warm
  espresso text, marigold for actions, a rose note for "made to order", a peach footer, Heebo.
- **Structure**: marigold announcement bar → sticky floating white pill header → breadcrumbs →
  content on rounded panels. Photos sit in rounded 4:5 wells. One soft shadow in the whole system,
  on floating surfaces only.
- **Focal moment on the product page**: the rose "made just for you" note inside the white buy
  panel. It is the only highlight colour besides marigold actions.
- **Authored motion moment**: the add-to-cart confirmation (button label swaps to "Added" with a
  drawn check, cart badge count pops). Everything else is quiet.

### Voice

- **Aviva speaks in the first person**, Hebrew feminine singular ("סרגתי", "אני שולחת",
  "אענה לכם"). Customers are addressed in the **plural** ("בחרו", "הוסיפו", "שלכם").
  English mirrors it: "I crocheted…", "I'll email you…", "Choose…".
- Plain words, short sentences, no exclamation-mark enthusiasm except the order thank-you.
- Controls name their action ("הוספה לסל", "המשך לקופה", "ביצוע הזמנה"). Errors name the problem
  and the way out.
- Copy states only facts that are true for this shop (made to order, preparation time, delivery
  terms from settings). Never fabricate: no "best seller", no "only 2 left", no story beyond what
  Aviva writes on the About page.

### Scope and anti-goals

- **In scope**: every public screen in [§8](#8-screens), their states, both directions.
- **Feels wrong** (user, 2026-11-07): a childish toy store; a cold luxury boutique. Also out:
  the rejected themed directions (knitting chart, ball band, wrapped gift, market stall). Do not
  revive them as decoration.
- No dark theme. No carousel of banners. No pop-ups. No sticky "buy" bar on mobile (the buy panel
  is reachable and the header cart is always there).

---

## 2. Implementation constraints (binding, from plan.md)

| Constraint | What it means for every component |
|---|---|
| Strict nonce CSP, `style-src 'self' 'nonce-…'` | **No `style` attribute and no `style` prop anywhere.** Dynamic visuals use classes, data attributes (`data-state`, `aria-*` selectors), `<progress>`/`<meter>`, or SVG presentation attributes. Lint bans the `style` prop (T002). |
| Images | Plain `<img>` with hand-written `srcset` (`-400.webp 400w, -800.webp 800w, -1600.webp 1600w`), a `sizes` value from [§6](#6-images), `width`/`height` (or an aspect-ratio box) so nothing shifts, `decoding="async"`. **Never `next/image`.** |
| Tailwind 4, logical properties only | `ms-* me-* ps-* pe-* start-* end-* text-start text-end rounded-s-* rounded-e-* border-s border-e`. Physical utilities (`ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right`, `rounded-l/r-`, `border-l/r`) are lint errors (T002), and physical CSS properties in `.css` files fail `pnpm check:css`. Direction-dependent icons flip with the `rtl:` variant. |
| Fonts | Heebo only, self-hosted with `next/font/google` at build time (no runtime request), subsets `hebrew` + `latin`, weights 400/500/700/800, `display: 'swap'`, exposed as `--font-heebo`. No other font. |
| Scripts | No third-party scripts, widgets, embeds, icon fonts or CDNs. Icons are authored inline SVG ([§5](#5-icons)). |
| JS budget | Storefront first-load JS ≤ 150 KB gzipped on every public page; the checkout page ≤ 155 KB (user decision 2026-11-09) (checked by `tests/e2e/bundle-size.spec.ts`, T087; extended in T131). Server Components by default; client islands only as listed in [§10](#10-performance-budget). |
| Accessibility | WCAG 2.1 AA (IS 5568) in RTL and LTR: contrast ([§3.1](#31-colour)), 44×44 px touch targets, visible focus, labelled controls, logical reading and focus order in both directions, `prefers-reduced-motion` respected. |
| Dependencies | **None added.** The design needs no new package, font or service (constitution V). Zoom, popovers and dialogs use native `<dialog>`, the `popover` attribute and CSS scroll-snap. |

---

## 3. Tokens

All tokens live in `src/app/globals.css` in a Tailwind 4 `@theme` block (T003), so each one
becomes a utility (`bg-ground`, `text-ink`, `rounded-card`, `shadow-float`…). Components never
use raw hex values.

### 3.1 Colour

| Token | Value | Use | Contrast (text on it / it on panel) |
|---|---|---|---|
| `ground` | `#FFF8F0` | page background (warm light) | ink 13.0, ink-2 6.5 |
| `panel` | `#FFFFFF` | buy panel, header pill, cards' text areas, form panels | ink 13.7, ink-2 6.9 |
| `photo` | `#F8ECDF` | photo wells and image placeholders | ink 11.8 |
| `ink` | `#3A2A21` | primary text, selected borders, focus ring | — |
| `ink-2` | `#6B5649` | secondary text, hints, breadcrumbs | 6.9 on panel, 6.5 on ground, 5.9 on photo |
| `line` | `#EADBCB` | dividers and decorative rules only | decorative only (1.4) |
| `field` | `#977E6E` | **borders of every control: text inputs, selects, checkboxes, chips, radio cards, the quantity stepper** (WCAG 1.4.11) | 3.8 on panel, 3.6 on ground |
| `sun` | `#F4B43C` | primary buttons, announcement bar, cart badge, active-thumb ring | ink on sun 7.5 |
| `sun-hover` | `#EAA322` | primary button hover/pressed | ink on it 6.4 |
| `sun-soft` | `#FDEBC4` | selected chip fill, text selection, offline payment instructions panel | ink 11.7 |
| `sun-ink` | `#C9821A` | decorative icons in the facts list only (always beside text) | decorative |
| `rose` | `#FCE3DB` | made-to-order note (the one highlight) | rose-ink 6.3 |
| `rose-ink` | `#8A3A2A` | text and icon in the rose note | — |
| `peach` | `#FCEADB` | footer | ink 11.7, ink-2 5.9 |
| `alert` | `#B3261E` | **errors and "not available" only** | 6.5 on panel, 6.2 on ground, 5.3 on rose |

Rules:
- Never put `ink-2` or `alert` text on `sun` (3.8 / 3.6). Text on marigold is always `ink`.
- `alert` is never decorative and never used for sale/urgency messaging.
- Text selection: `::selection { background: sun-soft; color: ink }`. Caret: `caret-color: ink`.

### 3.2 Typography (Heebo)

| Role | Size / line height (mobile → ≥ 900 px) | Weight | Tracking |
|---|---|---|---|
| Page title (h1: home, category, cart, checkout, content) | 28/1.15 → 34/1.15 | 800 | −0.02em |
| Product title (h1 in buy panel) | 28/1.15 → 30/1.15 | 800 | −0.02em |
| Section title (h2) | 20/1.25 → 22/1.25 | 800 | −0.01em |
| Price (product) | 24/1.2 | 700 | tabular-nums |
| Body | 16/1.6 | 400 | 0 |
| Prose body (content pages) | 17/1.75 | 400 | 0 |
| Label / legend / summary | 14–15/1.4 | 700 | 0 |
| Small (hints, crumbs, VAT note, badges) | 13/1.45 | 400–700 | 0 |
| Brand (header) | `clamp(16px, 4.6vw, 20px)` | 800 | −0.01em |

- Every price, quantity, order number and count uses `tabular-nums` (`.tnum` utility).
- Body measure ≤ 65ch (description, prose, notes). Headings use `text-wrap: balance`.
- Form inputs are 16 px so iOS does not zoom on focus.

### 3.3 Space, size, radius, shadow

- Spacing: Tailwind's 4 px scale. Page gutter 12 px below 900 px, 24 px from 900 px. Panels pad
  18–22 px on mobile, 30–32 px on desktop. Container max width 1240 px, centred with
  `margin-inline: auto`.
- Touch targets: every interactive element ≥ 44×44 px (icon buttons 44×44, chips min-height 44,
  primary buttons 54 px tall, inputs 52 px).
- Radius: `rounded-card` 20 px (panels, photo wells, cards), `rounded-chip` 14 px (chips, thumbs,
  inputs, notes 16 px), `rounded-pill` 999 px (buttons, header, language pill, quantity
  stepper, badges), footer top corners 28 px.
- Shadow: **one** token, `shadow-float` = `0 3px 14px rgb(150 95 50 / 0.10)`. Used only on
  floating surfaces: the sticky header pill, the menu popover, the consent banner, dialogs.
  Cards and panels are flat.

### 3.4 Breakpoints

Tailwind 4 `@theme`: `--breakpoint-sm: 40rem` (640 px), `--breakpoint-lg: 56.25rem` (900 px,
the sample's desktop switch), `--breakpoint-xl: 77.5rem` (1240 px). Design at 375 px first.

### 3.5 Motion

- Durations 150–200 ms, `ease-out`. Card image hover zoom 1.03 over 400 ms. Disclosure "+" icon
  rotates 45° when open. Primary button `:active` scales to 0.98.
- The authored moment: add-to-cart confirmation ([§7.12](#712-addtocart-island)).
- `@media (prefers-reduced-motion: reduce)`: no transforms, no smooth scrolling, the spinner
  becomes a static icon with text.

### 3.6 Layering

`z-header` 20 (sticky header), `z-popover` 30 (menu), `z-banner` 40 (consent), dialogs use the
top layer (native).

---

## 4. Global layout and direction (RTL/LTR)

- `<html lang="he" dir="rtl">` or `<html lang="en" dir="ltr">` from the locale segment. Nothing
  else sets direction except the bidi isolation rules below.
- Layout is written once with logical properties; English is **not** a mirrored Hebrew page: in
  English the gallery sits on the left and the buy panel on the right, the brand on the left,
  actions on the right, and text aligns left — because "start" is left in LTR.
- **Direction-dependent icons** (chevrons, arrows, breadcrumb separators, "next/previous" in the
  zoom dialog) point toward inline-end/inline-start and flip with `rtl:-scale-x-100`. Icons that
  are not directional (search, cart, plus, check) never flip.
- **Bidi isolation**: prices from `formatMoney`, order numbers, phone numbers, emails, postal
  codes and the search query are wrapped in `<bdi>` (phone/email/postal also `dir="ltr"`). Email
  and phone inputs are `dir="ltr"` with `text-align: end` in RTL so they sit on the right.
- **Hebrew fallback content on English pages** (FR-045): an owner-written field shown in Hebrew
  on an `/en` page is wrapped with `lang="he" dir="auto"` so it is read and aligned correctly.
  `pick()` (T058) returns `{text, lang}` so components can set this.
- Keyboard arrows that mean "next/previous" follow the visual direction: in RTL `ArrowLeft` is
  next, in LTR `ArrowRight` is next.
- Skip link "דילוג לתוכן" / "Skip to content" is the first focusable element and targets `<main>`.

### Page frame (every public page)

```
┌ AnnouncementBar (marigold, not sticky) ──────────────────────┐
├ header-wrap (sticky, ground background, 10px 12px padding) ──┤
│  ╭ HeaderPill (white, pill, shadow-float) ─────────────────╮ │
│  │ Brand · [desktop: category links] · EN · 🔍 · 🛒² · ☰    │ │
│  ╰─────────────────────────────────────────────────────────╯ │
├ Breadcrumbs (when the page has a parent) ────────────────────┤
├ <main id="main"> page content (max 1240px) ──────────────────┤
├ Footer (peach, rounded top corners) ─────────────────────────┤
└ ConsentBanner (only when consentRequired()) ─────────────────┘
```

---

## 5. Icons

`src/components/ui/Icon.tsx`: one Server Component rendering authored inline SVG from a fixed
set; `viewBox="0 0 24 24"`, 22 px default, `stroke="currentColor"`, `fill="none"`, stroke width
1.7, round caps and joins, `aria-hidden="true"` and `focusable="false"` (the control carries the
accessible name). Set: `search`, `cart`, `menu`, `close`, `zoom`, `chevron` (directional),
`arrow` (directional), `plus`, `minus`, `check`, `truck`, `pin`, `card`, `yarn` (the made-to-order
ball, as drawn in the sample), `alert`, `info`, `mail`, `phone`. No Unicode glyphs or emoji as
icons (the sample's `−`, `+` and `✓` become SVG).

---

## 6. Images

| Context | Variants | `sizes` | Loading |
|---|---|---|---|
| Product card (grid) | 400, 800 | `(min-width: 900px) 25vw, (min-width: 640px) 33vw, 50vw` | `lazy`, except the first 4 cards on home/category: `eager` |
| Gallery main | 400, 800, 1600 | `(min-width: 900px) 55vw, 100vw` | first image `eager` + `fetchpriority="high"`, others `lazy` |
| Gallery thumbnails | 400 | `72px` | `lazy` |
| Zoom dialog | 1600 | `100vw` | loaded when the dialog opens |
| Cart / checkout line | 400 | `72px` | `lazy` |
| Open Graph | 800 | — | meta tag only (WhatsApp drops preview images over about 300 KB) |

- Every photo sits in a `photo`-coloured 4:5 well (`aspect-ratio: 4/5`, `object-fit: cover`), so
  missing or slow images never collapse the layout.
- Alt text: card images `alt=""` (the product name is the link text right below). Gallery images
  use the owner's alt text for that photo in the current locale (Hebrew fallback), otherwise
  "{product name}, תמונה {n} מתוך {N}" / "{name}, photo {n} of {N}".
- A product without any public image cannot be published, so no "no image" art is needed;
  a broken image shows the empty `photo` well.

---

## 7. Components

Paths are under `src/components/`. "Server" = React Server Component; "island" = client
component. Components take every visible string as a prop or read it with next-intl in the
server parent; none contains literal display text (constitution I).

### 7.1 `ui/Button` and `ui/LinkButton` (server)

| Variant | Look | Use |
|---|---|---|
| `primary` | `sun` fill, `ink` text 17/800, pill, 54 px tall, hover `sun-hover`, active scale 0.98 | one per view: add to cart, continue to checkout, place order, send |
| `secondary` | transparent, 1.5 px `ink` border, `ink` text 16/700, pill, 48 px | alternatives of equal standing: "pay another way", consent accept/reject |
| `quiet` | text link style, underline offset 3 px | tertiary actions: remove, edit, "back to the shop" |

- Busy state: `aria-busy="true"`, label replaced by an inline spinner + "רגע…" / "One moment…",
  pointer events off. Busy is the only time a button is disabled.
- **Buttons are never disabled to signal a missing choice** (approved behaviour): pressing them
  explains what is missing inline and moves focus there.
- Focus: `outline: 3px solid ink; outline-offset: 3px` (global `:focus-visible`).

### 7.2 `ui/IconButton` (server)

44×44 circle, `ink` icon, hover `ground` fill; required `label` prop rendered as `aria-label`
(translated). Optional `badge` slot.

### 7.3 `ui/ChipLink` and `ui/ChipRow` (server)

- Pill-ish chips (`rounded-chip`, min-height 44, padding-inline 16, 15/500), white fill, 1.5 px
  `field` border (WCAG 1.4.11; `line` is only 1.4:1); current chip: `ink` border 1.5 px + inset 1 px ink ring + `sun-soft` fill and
  `aria-current="page"`.
- `ChipRow` scrolls horizontally on mobile (`overflow-x: auto`, scroll-snap, no visible
  scrollbar on touch, scrollbar thumb themed `line` on desktop) and wraps from 900 px.
- Used for category navigation and sort options.

### 7.4 `ui/Notice` (server)

Rounded 16 px box with icon + text. Tones: `made` (rose / rose-ink, `yarn` icon), `info`
(white panel, `line` border, `info` icon, ink text), `attention` (`sun-soft` fill, ink text —
offline payment instructions), `alert` (white panel, `alert` text and icon, 1.5 px `alert`
border). Alerts that appear in response to an action are in a live region (`role="alert"` for
errors, `role="status"` otherwise).

### 7.5 `ui/Price` (server)

`<bdi class="tnum">{formatMoney(minor, currency, locale)}</bdi>`. Props: `from` (prefix
"החל מ־" / "From") and `size` (`lg` 24/700 for product, `md` 15/500 for cards and lines).
Product price is followed by "כולל מע״מ" / "incl. VAT" in `ink-2` 13 px (ILS only).

### 7.6 `ui/Disclosure` (server)

Native `<details>`/`<summary>`; summary 700 weight, 14 px block padding, `plus` icon at inline-end
rotating 45° when open; top border `line`, last one also bottom border. No JS.

### 7.7 `ui/Breadcrumbs` (server)

`<nav aria-label="…">` with an ordered list; 13 px `ink-2`; links underline on hover; separator
is the directional `chevron` icon (points to inline-end, flips in RTL); last item is plain text
with `aria-current="page"`. Shown on category, product, search and content pages.

### 7.8 `ui/EmptyState` (server)

Centred block in a white panel: 56 px `sun-soft` circle with an icon, h2, one sentence in `ink-2`,
one primary or secondary action. Used for empty catalog/category/search/cart, expired order
link, not found.

### 7.9 `ui/Skeleton` (server)

`photo`-coloured rounded blocks matching the final layout (card, cart line, summary row) with a
slow opacity pulse (static with reduced motion). Marked `aria-hidden`; the container has
`aria-busy="true"` and a visually hidden "טוען…" / "Loading…" status.

### 7.10 Form controls: `ui/TextField`, `ui/TextArea`, `ui/SelectField`, `ui/Checkbox`, `ui/RadioCard`, `ui/ErrorSummary` (server markup; used inside islands)

- Label above the control (14/700), optional hint below the label (13, `ink-2`), control 52 px
  tall, white, 1.5 px `field` border, `rounded-chip`, 16 px text; focus = 2 px `ink` border + the
  global focus outline; error = `alert` border, `aria-invalid="true"`, message under the control
  (13, `alert`, `alert` icon), linked with `aria-describedby`.
- Correct `autocomplete`, `inputmode` and `type` per field (see checkout).
- `Checkbox`: 24 px box, `field` border, checked = `ink` fill with white check icon; the whole
  label row is the target (≥ 44 px).
- `RadioCard`: a full-width option card (white, 1.5 px `field` border, `rounded-chip`, padding 14–16);
  selected = `ink` border + inset ring + `sun-soft` fill; title 16/700 with the price at
  inline-end, description 14 `ink-2` below; native radio input visually hidden but focusable
  (focus ring drawn on the card).
- `ErrorSummary`: an `alert` Notice at the top of the form with heading "יש לתקן כמה פרטים" /
  "Please fix a few details" and a list of links to each invalid field; receives focus after a
  failed submit.
- `FormField` (T054, admin) wraps the same primitives so admin and storefront share one set.

### 7.11 `shop/QuantityStepper` (island part)

Pill with `field` border, 54 px tall (40 px in cart lines, still with 44 px hit areas): `minus`
button, `<output aria-live="polite">` value (700, tabular), `plus` button. Range 1–20; at the
limit the button stays focusable and announces the limit instead of disabling. Group label
"כמות" / "Quantity"; buttons "הפחתת יחידה" / "Remove one", "הוספת יחידה" / "Add one".

### 7.12 `shop/BuyBox` island (price, options, quantity, add to cart)

`shop/BuyBox.tsx` is one client island that owns buy-panel items 2–6 of [§8.4](#84-product-localepslug):
the live price, the option selector, the quantity stepper and add to cart. The made-to-order
note and Aviva's description (items 3–4) are server-rendered and passed in as `children`, so
they stay in the order of §8.4 without shipping their text as JS props. It is created in US1
with the price and options (so the price updates with the selection there) and gains the
stepper and add to cart with the cart store in US2.

- Row: quantity stepper + primary "הוספה לסל" / "Add to cart" filling the rest.
- Missing choice: pressing shows "יש לבחור {group} לפני ההוספה לסל" / "Choose a {group} before
  adding to the cart" under the button (`alert`, `aria-live="polite"`), marks the first
  unchosen fieldset `aria-invalid` (chip borders turn `alert`) and focuses its first radio. The
  message space is reserved (no layout jump).
- Success (the authored moment): the label morphs to `check` icon + "נוסף לסל" / "Added to cart"
  for 1.8 s; the header badge count updates with a short scale pop; a persistent row appears
  under the button: "{name} בסל · מעבר לסל" / "{name} is in your cart · Go to cart" (link to
  `/cart`); a polite live region announces "נוסף לסל. בסל יש עכשיו {count} פריטים".
- **Not orderable** (`orderable=false`): the options are shown **read-only** as plain text, one
  line per group ("צבע הכובע: ירוק, צהוב (+15 ₪), ורוד"), keeping FR-011; the stepper and button
  are replaced by an `alert` Notice "לא זמין להזמנה כרגע" / "Not available to order right now" and a quiet link
  "אפשר לכתוב לי" / "You can write to me" to Contact.

### 7.13 `shop/OptionSelector` (rendered by BuyBox)

- One `<fieldset>` per group; `<legend>` = group name (14/700) + "(בחרו אחד)" / "(choose one)"
  in `ink-2` 500.
- Values are radio chips: label + optional colour dot ([§7.13a](#713a-option-colour-dot-decided-2026-11-08-keep-fixed-palette))
  + price delta "+15 ₪" / "−10 ₪" in 13 `ink-2` (none when delta is 0). Selected chip as in 7.3.
- Rendered only when the product has groups (FR-008). The product price shows "החל מ־" with the
  lowest possible price until every group is chosen, then the exact unit price for the selection.

### 7.13a Option colour dot (decided 2026-11-08: keep, fixed palette)

- Data: nullable `option_value.swatch`, one of 12 named yarn colours (data-model.md ›
  option_value). Null = no dot. The label always names the colour, so the dot is decorative
  (`aria-hidden`) and needs no contrast ratio.
- Look: 16 px circle before the label, 1 px border `rgb(58 42 33 / 0.18)` so white shows.
- CSP: each colour is a plain CSS class `.swatch-<name>` in `globals.css` (not a Tailwind
  `@utility`: the class name is built at runtime, which Tailwind's scanner cannot see); no inline
  style.

| Name | Hex | Name | Hex | Name | Hex |
|---|---|---|---|---|---|
| `white` | `#FFFFFF` | `grey` | `#9E9A96` | `orange` | `#EE8A3A` |
| `cream` | `#F3E6C9` | `black` | `#2B2522` | `yellow` | `#F2C94C` |
| `beige` | `#D9C3A0` | `red` | `#C8442F` | `green` | `#9DB83F` |
| `brown` | `#8B5E3C` | `pink` | `#F2A7B5` | `blue` | `#6A9BD1` |

- Admin: the option-value row in the option editor has a "צבע (לא חובה)" picker: "ללא צבע"
  first, then 12 large (44 px) swatch buttons with Hebrew colour names as their labels
  (`admin.products.swatch.*`); a radio group, so it works with the keyboard.

### 7.14 `shop/Gallery` island (+ zoom dialog)

- **Main**: a horizontal scroll-snap track of all photos inside a 4:5 `photo` well with
  `rounded-card` (swipe works natively on touch, also without JS). Overlays: counter
  "1 / 4" (pill, white 94 %, 13/700, inline-start bottom) and a zoom `IconButton` (white 94 %,
  inline-end bottom, label "הגדלת התמונה" / "Enlarge photo").
- **Thumbnails** (when ≥ 2 photos): row of 72×90 buttons, `rounded-chip`, below the main image,
  horizontally scrollable; each labelled "תמונה {n} מתוך {N}"; the shown one has
  `aria-current="true"` and a 3 px `sun` ring **plus a 1.5 px `ink` inner ring** (WCAG 1.4.11;
  marigold alone is 1.8:1). Clicking scrolls the track to that photo. An `IntersectionObserver`
  keeps counter and current thumb in sync while swiping.
- **Zoom dialog**: native `<dialog>` opened with `showModal()` from the zoom button or by
  tapping the main image; full viewport, `photo` background (warm, not black); the 1600 variant
  centred with `object-fit: contain`; buttons: close (inline-end top), previous/next (directional
  chevrons, vertically centred at each side), counter. Double-tap / double-click toggles a 2×
  zoom inside a scrollable container (pan by scrolling/dragging); pinch-zoom is allowed
  (`touch-action: pinch-zoom`). `Esc` closes, arrows navigate per [§4](#4-global-layout-and-direction-rtlltr),
  focus returns to the control that opened it, page scroll locked with a class on `<html>`.
  Dialog label "תמונות {product}".
- One photo only: no thumbnails, no counter, no previous/next.

### 7.15 `shop/ProductCard` and `shop/ProductGrid` (server)

- Card = one link: 4:5 photo well (`rounded-card`, hover image zoom 1.03), name (16/700, max 2
  lines with ellipsis) and price (`Price md`, "החל מ־" when option prices vary), 10 px gap,
  4 px inline padding on the text.
- Not orderable: price stays, plus "לא זמין להזמנה כרגע" in `alert` 13/700 under it.
- Grid: 2 columns (gap 12) → 3 from 640 px → 4 from 900 px (gap 20). The grid is a `<ul>` of
  `<li>` cards with an `aria-label` on the list ("יצירות" / "Pieces").

### 7.16 `shop/SortLinks` (server)

A `ChipRow` of three links: "החדשים ביותר" / "Newest", "מחיר: מהנמוך" / "Price: low to high",
"מחיר: מהגבוה" / "Price: high to low", building `?sort=` URLs; current one `aria-current="page"`.
Zero JS (replaces the planned `SortSelect`). Price sorts order by the ₪ base price (research.md ›
R18), not the "from" price.

### 7.17 `shop/AnnouncementBar` (server)

Full-width `sun` bar, `ink` 13/700, centred, 8 px block padding. Text built from settings
(Israel zone): shipping enabled with a threshold → "משלוח חינם בהזמנה מעל {amount}"; pickup
enabled → "איסוף עצמי חינם"; both joined with " · ". Hidden when neither applies. Not
dismissible (nothing stored on the device), not sticky, not a link.

### 7.18 `shop/Header` (server shell + two islands)

- `header-wrap`: sticky top, `ground` background, padding 10/12 px (16/24 px from 900 px).
- `HeaderPill`: white, `rounded-pill`, `shadow-float`, padding-inline 16 (start) / 10 (end),
  8 px block; contents in DOM order: brand (home link, 800), desktop category links (from 900 px:
  up to 5 categories as 15/500 links, then "עוד" in the menu), actions at inline-end:
  `LanguageSwitch` island, search `IconButton` (link to `/{locale}/search`), `CartLink` island, menu
  `IconButton` (always below 900 px; from 900 px only when there are more than 5 categories).
- Brand: text wordmark of the shop name from settings (`shop_name_he/en`, English falling back to
  Hebrew through `pick()`, so a Hebrew fallback gets `lang="he"`; not the legal `business_name_*`) set in Heebo 800; no logo exists (PRODUCT.md) — never
  draw one.
- **Menu**: `<button popovertarget="site-menu">` + `<nav id="site-menu" popover>` (native
  popover: light dismiss, `Esc`, no JS). Sheet anchored under the header, white,
  `rounded-card`, `shadow-float`, max width 22rem at inline-end; lists categories, then About,
  Shipping & returns, Contact, then the language switch in full words.
- `CartLink` island: cart `IconButton` with label "סל קניות, {count, plural, …}" /
  "Cart, {count} items"; `sun` badge (min 18 px, 11/800, inline-end top) only when count > 0.
  Server-renders without a badge; the island reads `ac_cart_v1` after hydration.

### 7.19 `shop/LanguageSwitch` (island)

- A small client island, because the header lives in the locale layout, which neither receives
  the current path nor re-renders on client-side navigation. It reads `usePathname()` and
  `useSearchParams()` and builds `/api/locale?to=<other>&path=<same path in the other locale +
  query>` on every navigation (FR-042).
- Rendered as a plain `<a>`, **never** a Next/next-intl `<Link>`: a prefetch would call
  `/api/locale` and set `NEXT_LOCALE` without a click.
- Header variant: compact pill, 36 px tall bordered box (1.5 px `ink`), 13/700, text "EN" on Hebrew
  pages and "עב" on English pages, `lang` set to the target language, `aria-label` "English" /
  "עברית", hover `sun-soft`; the 44×44 hit area comes from a transparent `::before` that extends
  past the border (padding would grow the visible box). The menu and footer use the full-word
  variant ("English" / "עברית").

### 7.20 `shop/Footer` (server)

`peach` background, top corners 28 px, padding 32/20 px (48/24 from 900 px), 14 px text.
Columns (stacked on mobile, `2fr 1fr 1fr` from 900 px):
1. Business: shop name (`shop_name_*`) as h2 (16/800), then the legal business name
   (`business_name_*`), address (each owner-written value through `pick()`, `lang="he"` when it
   falls back to Hebrew on `/en`), "עוסק מורשה {number}", email (`mailto:`), phone (`tel:`,
   `<bdi dir="ltr">`) — FR-047, from `shop_settings`.
2. "מידע" / "Info": About, Shipping & returns, Contact.
3. "משפטי" / "Legal": Terms of use and sale, Privacy policy, Cookie policy, Accessibility
   statement; plus "הגדרות עוגיות" / "Cookie settings" only when `consentRequired()`.
Bottom row: language switch in full words and "© {year} {shop name}" (`shop_name_*`). Column headings are h2
styled small (no skipped levels).

### 7.21 `shop/ConsentBanner` + settings dialog (island, dormant at launch)

- Rendered only when `consentRequired()` (server decides, prop down) and loaded with
  `next/dynamic` so its JS is not in the bundle at launch.
- Bottom sheet: white, top corners 20 px, `shadow-float`, max width 40rem centred, padding 20;
  heading "עוגיות" / "Cookies", one or two sentences, link to the cookie policy; buttons
  **"אישור הכול" and "דחייה של הכול" are both `secondary`, same size, side by side** (equal
  prominence, FR-037a); "הגדרות" / "Settings" as a quiet link opening a native `<dialog>` with
  one switch per optional category (`role="switch"`, necessary shown as always on) and "שמירה".
- Not a modal: the page stays usable; focus is not trapped; it sits at the end of the tab order
  after a skip link "מעבר להגדרות העוגיות" at the start.

### 7.22 `shop/CartLine` (inside the cart island)

Row: 72×90 thumbnail (`rounded-chip`) · name (link to product, 16/700) · options "{group}:
{value}" (14 `ink-2`) · unit price · `QuantityStepper` (compact) · line total (700, tabular) ·
quiet "הסרה" / "Remove" with `close` icon. Mobile: thumbnail at inline-start, text stacked,
stepper and line total on one row. Flagged line: white panel with a 1.5 px `alert` border
and the flag message ([§8.5](#85-cart-cart)).

### 7.23 `shop/OrderSummary` (server markup)

White panel: lines (thumb, name × qty, line total; under the name "זמן הכנה: {prepTime}" / "Time to
make: {prepTime}" in 14 `ink-2`, the distance-selling disclosure before ordering), divider, subtotal, delivery ("חינם" when 0),
total (18/800). Used in checkout (collapsible on mobile) and the order page (no thumbnails).
Created by the checkout task (T082) at `src/components/shop/OrderSummary.tsx`; the order page (T084)
reuses it.

### 7.24 `ui/Prose` (server)

Wrapper for `Markdown` output on content pages: 17/1.75, measure 68ch, h2 22/800 with 32 px
above and 8 px below, lists with logical padding, links `ink` underlined (offset 3 px), tables
styled like `StorageTable`.

### 7.25 `shop/StorageTable` (server)

Table of the device-storage registry. From 640 px a normal table (header row `photo` fill,
`line` row dividers). Below 640 px each row becomes a stacked card using
`td::before { content: attr(data-label) }` (labels from translations).

---

## 8. Screens

Each screen lists its structure, states and acceptance checks. "Both directions" is implied for
every check: the same check passes on `/he` (RTL) and `/en` (LTR).

### 8.1 Home / catalog `/{locale}`

1. Intro band (no panel, on ground): h1 = shop name (`shop_name_*`); one sentence in Aviva's voice from
   translations, stating the facts: "כל בובה וכל חיה כאן אני סורגת ביד, אחרי שאתם מזמינים." /
   "I knit or crochet every piece here by hand, after you order." (Hebrew "סורגת" covers both). Max 40ch.
2. Category `ChipRow`: "הכול" / "All" (current) + every category with published products, linking
   to `/c/{slug}`.
3. `SortLinks`.
4. `ProductGrid` of all published products (no pagination at this scale; first 4 images eager).

States: empty catalog → `EmptyState` "עוד אין כאן יצירות" / "No pieces here yet" with "כתבו לי"
/ "Write to me" (Contact). Error → `error.tsx` ([§8.12](#812-not-found-not-available-and-error)).

Accept: card shows main photo, name, price, and the not-available label when `orderable=false`;
products with varying option prices show "החל מ־"; grid columns 2/3/4 at 375/640/900; no
horizontal page scroll at 320 px.

### 8.2 Category `/{locale}/c/{slug}`

Breadcrumbs (Home › Category) → h1 category name + count "{n} יצירות" in `ink-2` → category
`ChipRow` with this category current → `SortLinks` → `ProductGrid`.
States: empty category → `EmptyState` "בקטגוריה הזאת עוד אין יצירות" + link to all pieces;
unknown slug → 404 page.

### 8.3 Search `/{locale}/search?q=`

Breadcrumbs (Home › Search) → h1 "חיפוש" / "Search" → search form: `type="search"` field
(`enterkeyhint="search"`, autofocus only when `q` is empty), primary-sized secondary button
"חיפוש" → results line "{n} יצירות עבור ״{q}״" (`<bdi>` around `q`, `role="status"`) →
`ProductGrid`.
States: no `q` → form + category `ChipRow`; no results → `EmptyState` "לא מצאתי יצירות עבור
״{q}״" + category chips; `q` over 80 chars → field error "אפשר לחפש עד 80 תווים".

### 8.4 Product `/{locale}/p/{slug}`

Layout: one column below 900 px (gallery, then buy panel); from 900 px a grid
`minmax(0,1.25fr) minmax(0,1fr)`, gap 28, gallery at **inline-start**, buy panel at inline-end
and `position: sticky; top: 88px`.

Buy panel (white, `rounded-card`, padding 22/18 → 32/30), in order:
1. h1 product name.
2. `Price lg` + "כולל מע״מ" (updates with the selection; "החל מ־" until all groups chosen).
3. `Notice made`: **"נסרג במיוחד בשבילכם."** bold, then "זמן הכנה לפני משלוח או איסוף:
   {prepTime}" / "**Made just for you.** Time to make before shipping or pickup: {prepTime}".
   `prepTime` is the owner's text (admin hint suggests "כשבועיים").
4. Description (Aviva's text, owner-written, max 65ch; paragraphs preserved).
5. `OptionSelector` (only with groups; read-only text when not orderable).
6. Buy row (stepper + add to cart) or the not-orderable notice.
   Items 2–6 are one `BuyBox` island; items 3–4 are server-rendered children ([§7.12](#712-shopbuybox-island-price-options-quantity-add-to-cart)).
7. Facts list (top border `line`, 15 px, `sun-ink` icons): `truck` "משלוח בכל הארץ {fee}" + small
   "חינם בהזמנה מעל {threshold}" (when shipping is enabled); `pin` "איסוף עצמי חינם" + small
   "הכתובת והשעות מופיעות בקופה" (when pickup is enabled); `card` with the payment line: online only → "תשלום מאובטח בכרטיס
   אשראי"; online and offline → the same + small "או תשלום ישיר אליי — הפרטים בקופה"; offline
   only → "תשלום ישיר אליי — הפרטים בקופה" as the main line (the offline text never depends on
   the online line). Values come from settings; a disabled method's line is omitted.
8. Disclosures: "משלוח ואיסוף" (short generic text in Aviva's voice + link to the shipping &
   returns page) and "ביטולים והחזרות" (one sentence + link).

Below the grid: "עוד מ{category}" / "More {category}" — up to 4 other published products of the
same category (newest), `ProductGrid` 2 → 4 columns; omitted when there are none.

Head: `generateMetadata` (title "{name} · {shop}" with the shop name from `shop_name_*`; every public page's
`<title>` uses the same "{page} · {shop}" template, the home page the shop name alone), description starting with the formatted price (WhatsApp and Telegram ignore `product:price:*`), OG 800 image, price tags) per FR-049;
JSON-LD Product.

States: not orderable (7.12: options read-only, notice instead of the buy row); single photo (7.14); no options; Hebrew fallback text on `/en`
(`lang="he"`); hidden/draft/deleted → not-available page with 404 ([§8.12](#812-not-found-not-available-and-error)).

Accept: add without choosing → inline error + focus on the first unchosen group; add with
choice → badge count +qty, confirmation row with cart link, live announcement; price reflects
the chosen delta; zoom dialog opens, navigates with arrows in the correct direction, closes with
Esc and returns focus; gallery sits on the right in Hebrew and on the left in English at ≥ 900 px.

### 8.5 Cart `/{locale}/cart`

h1 "הסל שלכם" / "Your cart". From 900 px: lines column + summary panel at inline-end (sticky);
below 900 px: lines, then summary.

- Lines (`CartLine`), each priced by `priceCart` (current prices only).
- Summary panel (white, `rounded-card`): subtotal; "דמי משלוח יחושבו בקופה" / "Delivery is
  calculated at checkout"; when shipping has a threshold and the subtotal is below it, a plain
  line "משלוח חינם מעל {threshold}" (informational, no progress bar, no nudging copy);
  primary "המשך לקופה" / "Continue to checkout"; quiet "המשך בקניות" / "Keep shopping".
- **Flags** (from `priceCart`), shown on the line in `alert`:
  - `unavailable` / `not_orderable`: "המוצר הזה כבר לא זמין להזמנה." + "הסרה מהסל" button.
  - `choose_options_again`: "האפשרות שבחרתם כבר לא קיימת." + link "בחירה מחדש" to the product
    (the old line stays until removed).
  - `no_usd_price` (only with an international zone): "לא זמין למשלוח לחו״ל."
- "Continue to checkout" is **never disabled**: with flagged lines, pressing shows an
  `ErrorSummary` "יש בסל פריטים שלא אפשר להזמין" listing them (links to each line) and focuses it.
  Checkout itself also refuses flagged carts (server).

States: loading (cart read, pricing in flight) → `Skeleton` lines matching the stored item count;
empty → `EmptyState` "הסל ריק" / "Your cart is empty" + "לכל היצירות"; pricing error → `alert`
Notice "לא הצלחתי לטעון את הסל. נסו שוב." + secondary "נסו שוב"; storage unavailable (private
mode) → the cart works for the session and shows nothing extra.

### 8.6 Checkout `/{locale}/checkout`

One page, no steps or step numbers. Below 900 px: a collapsible summary at the top
(`<details>`: "סיכום הזמנה · {total}") and the full totals again just above the submit button;
from 900 px: form column + sticky `OrderSummary` at inline-end.

Form sections (white panels, h2 each):
1. **פרטים ליצירת קשר / Contact details**: full name (`autocomplete="name"`), phone
   (`type="tel"`, `autocomplete="tel"`, `dir="ltr"`), email (`type="email"`,
   `autocomplete="email"`, `dir="ltr"`), hint under email "לשם אשלח את אישור ההזמנה".
2. **משלוח או איסוף / Delivery**: `RadioCard`s for enabled methods only: "משלוח עד הבית" with fee
   or "חינם" at inline-end; "איסוף עצמי" with "חינם" and the owner's pickup instructions shown in
   the card (always visible, not only when selected). Address block appears only for shipping:
   country select listing the enabled zones' countries plus a last choice "מדינה אחרת" / "Other
   country" (at launch: ישראל + מדינה אחרת; default ישראל), city (`address-level2`), street and number
   (`address-line1`), apartment (`address-line2`, optional), postal code (`postal-code`,
   `inputmode="numeric"`, `dir="ltr"`). Choosing "Other country" (UI-only value `other`, never
   stored) → inline `info` Notice "כרגע אני שולחת רק בתוך ישראל. אפשר לבחור איסוף עצמי או לכתוב
   לי." with a Contact link, and the server answers `checkout.ships_israel_only` if submitted.
3. **תשלום / Payment**: `RadioCard`s for enabled methods: "תשלום מאובטח באתר" ("בכרטיס אשראי,
   בעמוד המאובטח של חברת הסליקה") and "תשלום ישיר אליי" ("אחרי ההזמנה תקבלו את פרטי התשלום:
   העברה, Bit, PayBox או מזומן באיסוף" — the examples come from translations; the real
   instructions appear after ordering).
4. **הערה / Note**: `Disclosure` "הוספת הערה (לא חובה)" containing a `TextArea` (≤ 1,000).
5. Consent: required checkbox "קראתי את <התקנון> והסכמתי לו" (gender-neutral; link opens the terms page in a new
   tab with a visually hidden "(נפתח בכרטיסייה חדשה)"); optional unticked checkbox "אשמח לקבל
   עדכונים במייל" with one line saying what it means.
6. Collection notice (13, `ink-2`) beside the submit button: why the details are needed, who
   receives them, link to the privacy policy. Seller identity line (business name, ע.מ.) under it.
7. Totals (mobile) + primary submit: label "מעבר לתשלום מאובטח" / "Continue to secure payment"
   for online, "ביצוע הזמנה" / "Place order" for offline.

Behaviour:
- Live totals update on delivery or country change (`quoteCheckout`); the totals area has
  `aria-live="polite"` and shows a small inline spinner while quoting (no layout shift).
- Client checks are light (required, email shape, terms). Phone validity is checked **on the
  server only** (libphonenumber stays out of the client bundle) and comes back as a field error.
- Failed submit: field errors inline + `ErrorSummary` focused. Server `formError` (rate limit,
  payment unavailable, flagged lines) → `alert` Notice at the top with the recovery ("נסו שוב
  או בחרו תשלום ישיר", or a link back to the cart listing the lines).
- Submitting: primary button busy; the rest of the form stays visible.
- Inputs mirror into `sessionStorage` `ac_checkout` (T082) and are restored whenever the page loads
  with a saved copy (e.g. the visitor comes back from the payment page with the browser's back
  button). There is no `?resume=` URL: retry and "pay directly instead" after a failed payment live
  on the payment return page (§8.7).
- Offline order placed → the cart (`ac_cart_v1`) and `ac_checkout` are cleared **before** the
  redirect to the order page (online orders clear them on the return page when confirmed).
- Empty cart (checked client-side after hydration, since the cart lives in `localStorage`) →
  redirect to `/cart`.

Accept: every FR-013 field present with the right `autocomplete`; no account or password prompt;
errors next to fields in the visitor's language; pickup instructions visible before ordering;
the submit label matches the payment choice; works with the keyboard alone.

### 8.7 Payment return `/{locale}/checkout/return`

A single centred white panel (max 32rem) on ground, `role="status"` region:
- **Checking**: spinner (static icon with reduced motion) + "בודקת את התשלום…" / "Checking your
  payment…".
- **Confirmed**: "התשלום אושר" then redirect to the order page.
- **Failed / cancelled**: `alert` icon, h1 "התשלום לא הושלם" / "The payment didn't go through",
  one sentence that the details are saved; primary "נסו שוב" / "Try again"; secondary "תשלום ישיר
  אליי במקום" / "Pay me directly instead". If prices changed since the order was started, either
  button first shows an `attention` Notice with the new total and "אישור והמשך" / "Confirm and
  continue" (same rule for retry and switch, contracts/server-actions.md).
- **Mismatch**: `info` icon, "הייתה בעיה בסכום התשלום. אצור איתכם קשר בהקדם."
- **Expired / unknown**: "הקישור הזה כבר לא פעיל" + link to the cart.
- **Timeout with `r=success`**: "התשלום עדיין בבדיקה. אישור יגיע אליכם במייל."

### 8.8 Order confirmation `/{locale}/order/{token}`

Centred column (max 40rem):
1. 56 px `sun-soft` circle with `check` icon; h1 "תודה! ההזמנה התקבלה" / "Thank you! Your order
   is in"; "מספר הזמנה" with the number large (24/800, `<bdi>`, tabular); "אישור נשלח גם
   במייל." (no email address, phone or street address shown, per routes contract).
2. Payment state chip: "שולם" (`sun-soft`) or "ממתין לתשלום" (white, `field` border).
3. Offline: `attention` Notice h2 "איך משלמים" with the owner's instructions (Markdown) and
   "בהעברה כתבו את מספר ההזמנה {number}".
4. Pickup: `info` Notice h2 "איסוף עצמי" with pickup instructions.
5. `Notice made`: "עכשיו אני מתחילה לסרוג." for paid orders, "אתחיל לסרוג כשהתשלום יתקבל." for
   awaiting payment; each item in the summary shows its own "זמן הכנה: {prepTime}" from the
   `order_line` snapshot (Clarifications 2026-11-08). The same per-item times are in the
   confirmation email.
6. `OrderSummary` with per-item preparation time (no thumbnails: order photos are private).
7. Quiet link "חזרה לחנות" / "Back to the shop".
8. `OrderCleanup` (tiny island, renders nothing): removes `ac_checkout`, and removes the cart
   (`ac_cart_v1`) when the server says the order was created less than an hour ago — so a cart
   is cleared even if the checkout or return page could not do it, while opening an old order link
   later never empties a newer cart.
States: expired/invalid token → `EmptyState` "הקישור כבר לא פעיל" + Contact link.

### 8.9 Content pages `/{locale}/pages/{slug}`

Read mode. Breadcrumbs (Home › Title) → h1 → `Prose` (68ch) in a single column on ground (no
panel, generous block spacing). `cookies` adds `StorageTable` after the prose. Drafts show their
"טיוטה" notice as the first paragraph (comes from the content). No sidebars, no images.

### 8.10 Contact `/{locale}/contact`

h1 "יצירת קשר" / "Contact" + intro from the `contact` content page. From 900 px: form panel
(white) + business details panel (white) at inline-end; stacked below 900 px with the form first.
- Form: name, email (`dir="ltr"`), message (`TextArea`, 6 rows, 10–5,000 chars with a counter
  only near the limit), honeypot, primary "שליחה" / "Send".
- Details panel: legal business name, email (`mailto:`), phone (`tel:`), address, "עוסק מורשה {n}" (FR-047).
- Success: the form is replaced by a `status` panel with `check` icon "ההודעה נשלחה. אענה לכם
  במייל בהקדם." and focus moves to it. Errors as in checkout; rate limit → `alert` Notice "שלחתם
  כמה הודעות ברצף. נסו שוב בעוד שעה."

### 8.11 Header, footer, language switch

As [§7.17](#717-shopannouncementbar-server)–[§7.20](#720-shopfooter-server). Accept: the switch
keeps the same page and query and the cart count; header order mirrors between directions; all
header controls are 44×44; the menu opens and closes with keyboard and `Esc`; footer shows all
FR-047 details and all content links in both languages.

### 8.12 Not found, not available and error

- **404** (`not-found.tsx`): h1 "העמוד לא נמצא" / "Page not found", one sentence, search form,
  primary "לכל היצירות". HTTP 404.
- **Product not available** (`p/[slug]/not-found.tsx`): h1 "המוצר הזה כבר לא זמין" / "This piece
  isn't available any more", "אולי תמצאו כאן משהו אחר שתאהבו:" and up to 4 newest products.
  HTTP 404.
- **Error** (`error.tsx`): h1 "משהו השתבש" / "Something went wrong", "נסו שוב" (reset) and a link
  home; no technical details. `global-error.tsx` uses the same look with inline-free markup.

### 8.13 Consent banner (dormant)

As [§7.21](#721-shopconsentbanner--settings-dialog-island-dormant-at-launch). At launch it never
renders and its code is not loaded. Accept (consent test project): both choices equal in size
and style; nothing optional loads before acceptance.

---

## 9. States matrix

| Screen | Empty | Loading | Error | Not orderable / flagged |
|---|---|---|---|---|
| Home / category | EmptyState + contact / all pieces | server-rendered (no skeleton) | error.tsx | card label in `alert` |
| Search | form + chips; no-results EmptyState | server-rendered | field error (> 80 chars) | card label |
| Product | — | server-rendered; images in `photo` wells | 404 not-available page | notice replaces buy row |
| Cart | EmptyState | Skeleton lines | alert Notice + retry | per-line flags + ErrorSummary on continue |
| Checkout | client-side redirect to cart when empty | inline quote spinner; busy submit | field errors, ErrorSummary, formError Notice | flagged lines → error with link to cart |
| Payment return | — | checking spinner | failed / mismatch / expired / timeout panels | — |
| Order | — | server-rendered | expired-link EmptyState | — |
| Contact | — | busy submit | field errors, rate-limit Notice | — |

---

## 10. Performance budget

- Server Components everywhere except these islands: `CartLink`, `LanguageSwitch`, `BuyBox`
  (price + options + stepper + add to cart), `Gallery` (scroll sync + zoom dialog), cart page body, checkout form, payment
  return poller, `OrderCleanup` (order page, no markup), contact form, `StatsBeacon`, and
  `ConsentBanner` (dynamic import, not loaded at launch).
- No client libraries beyond React/Next and next-intl. `libphonenumber-js` and `markdown-it`
  never reach the client. Shared Zod schemas used in a client island import only the light
  checks (or `zod/mini`), keeping the checkout page within budget.
- `NextIntlClientProvider` receives only the namespaces the islands on that page use.
- Heebo: two subsets × four weights, `woff2`, preloaded by `next/font`.
- LCP image (first gallery photo / first cards) gets `fetchpriority="high"`; everything else lazy.

---

## 11. Verification

| Check | Where |
|---|---|
| Axe WCAG 2.1 A/AA, zero violations, every screen in both locales | `tests/e2e/a11y.spec.ts` (T124) |
| Direction and layout: `dir`/`lang`; gallery at inline-start (right in he, left in en) at 1280 px; header order mirrored; no horizontal overflow at 320 and 375 px on every public page; no `style=` attribute in the server-rendered HTML, and none in the DOM apart from Next's own `next-route-announcer`; every product `<img>` has `srcset`, `sizes`, `width`, `height`; header, buy-box, cart and checkout controls ≥ 44×44 px; zoom dialog arrow keys follow direction | `tests/e2e/storefront-layout.spec.ts` (T125) |
| No `style` prop, no physical Tailwind utilities, no physical CSS properties | ESLint (T002) + `pnpm check:css` |
| First-load JS ≤ 150 KB gz on every storefront route (checkout ≤ 155 KB) | `tests/e2e/bundle-size.spec.ts` (T087): sums the gzipped size of the JS each route loads in Chromium; part of `pnpm test:e2e` (so in CI) |
| Visual review against this document and the sample at 375 / 768 / 1280 px, he and en | `tests/e2e/design-review.spec.ts` (T133, `DESIGN_REVIEW=1`) writing to `test-results/design-review/` (not committed), reviewed by the coordinator |

---

## 12. Admin area

Out of scope for this brief. The admin uses the same tokens, Heebo and the `ui/` primitives
(Button, Notice, form controls, ConfirmDialog, Toast) so the system stays one, but its layouts
are designed in Operate mode by the admin tasks (mobile-first, large targets, plain Hebrew).

---

## 13. Deviations from the sample

| Sample | This document | Why |
|---|---|---|
| Google Fonts `<link>` | `next/font` self-hosted Heebo | CSP and no third-party requests |
| `<style>` block and classes | Tailwind 4 utilities + `@theme` tokens; no `style` attributes | CSP and plan |
| Active thumbnail: marigold border only | marigold ring + 1.5 px ink inner ring | marigold is 1.8:1 against the photo well; WCAG 1.4.11 needs 3:1 |
| Input/stepper borders in `line` | new `field` token (#977E6E) | `line` is 1.4:1; inputs need 3:1 boundaries |
| `−`, `+`, `✓` glyphs | SVG `minus`, `plus`, `check` icons | one drawn icon system |
| Price = (base + delta) × quantity | unit price for the selection; totals live in the cart | FR-011 shows the product price; avoids a "price" that changes with quantity |
| Breadcrumb separator `›` in RTL | directional chevron that flips | it pointed the wrong way in RTL |
| "Sample photos" note, demo footer note | removed | sample-only |
| Options hidden when not orderable (first draft) | options shown read-only | FR-011 (user decision 2026-11-08) |
| Thumbnail swap only | swipeable scroll-snap track + thumbnails + zoom dialog | FR-011 zoom; native swipe on phones with no extra JS |
| "Added to cart ✓" label only | label morph + persistent "in your cart · go to cart" row + live announcement | faster path to checkout (SC-002) and screen-reader feedback |
| Facts text hard-coded | built from settings; a disabled method's line is omitted | honesty |
| Colour dots from ad-hoc classes | `option_value.swatch` with a fixed 12-colour palette ([§7.13a](#713a-option-colour-dot-decided-2026-11-08-keep-fixed-palette)) | the data model had no colour field; a fixed palette fits the CSP and is easy for Aviva |

---

## 14. Decisions and open points

1. **Option colour dot** (decided 2026-11-08): keep, with the fixed 12-colour palette (§7.13a).
2. **Shop name** (decided 2026-11-08): a separate setting `shop_name_he/_en`, different from the
   legal business name. It is still a working name; the header wordmark, home h1, `<title>`, ©
   line and email sender name read it from settings, so the final name needs no design change.
