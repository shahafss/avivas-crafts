# Research: Post-launch fixes (008)

Each item: Decision, Rationale, Alternatives considered. Codes R1–R12 are cited by plan.md and
tasks.md.

## R1. Why orders fail in production, and the fix (Story 1)

**Decision**: delete the check in `placeOrder` (`src/server/checkout/place-order.ts`, the
`APP_ENV === 'production' && placeholderFields(settings).length > 0` block) and the
`checkout.shop_not_ready` message (he/en), which has no other use. `placeholderFields()` stays: the
admin home (`settingsNeedingAttention`) still uses it.

**Rationale**: the block was added in 003 so a shop with sample details could not sell. The owner
cannot replace the sample business number (no business exists yet), so the shop can never sell.
Owner decision 1 removes it for every detail.

**Alternatives**: exempt only the business number (rejected by the owner: "others too").

## R2. Business number becomes optional: storage (Story 2)

**Decision**: `shop_settings.business_reg_number` becomes nullable. Migration
`0007_optional_business_number.sql`: drop the check `shop_settings_business_reg_number`, drop
`NOT NULL`, add the check again as `business_reg_number IS NULL OR char_length(business_reg_number)
>= 1`. Validation uses `optionalText('businessRegNumber', 40)` (empty or spaces → `null`). Empty in
the database is always `NULL`, never `''`.

**Rationale**: matches how the other optional texts (`businessNameEn`, `businessAddressEn`) are
stored; the check keeps `''` out.

**Alternatives**: keep `NOT NULL` and store `''` (rejected: breaks the existing "never empty
string" rule of the settings table and needs the check dropped anyway).

## R3. Where the business number is shown (Story 2)

**Decision**: one pure helper `customerRegNumber(settings): string | null` in
`src/lib/business-number.ts` (pure, unit-tested; `SEED_PLACEHOLDERS` moves to the pure module
`src/lib/seed-placeholders.ts` and is re-exported from `src/server/db/seed.ts`): returns the trimmed
number, or `null` when it is null, blank or equal to `SEED_PLACEHOLDERS.businessRegNumber`. Used only by `sellerParts()` in
`src/server/email/templates/order-parts.ts`; when `null` the line is left out of both the HTML and
the text part. The label changes to "מספר עוסק: {number}" / "Business no.: {number}"
(`emails.order.regNumber`).

Removed from the website: the footer line (`Footer.tsx`, `data-testid="footer-business-vat"`,
message `common.footer.vat`), the contact page's details line (`contact/page.tsx`), the checkout
seller line's number (`checkout/page.tsx` `seller.regNumber`, `CheckoutForm.tsx`, message
`checkout.seller` becomes "{name}" only, keeping its place and style).

The emails that carry the seller block today are the customer's order confirmation, cancellation
and refund emails (`order-confirmation.ts`, `order-cancelled.ts`, `order-refunded.ts`). The
owner's new-order notification has no seller block today and gets none.

**Rationale**: owner decision 2 (no public exposure of what is normally a personal ID number).

**Alternatives**: keep the line hidden only while not set (the first draft; rejected by the owner).

## R4. Admin home reminder (FR-002, FR-008)

**Decision**: no change. `placeholderFields()` compares stored values with `SEED_PLACEHOLDERS`; a
`NULL` number is not equal to `000000000`, so a cleared number is not listed, a sample one is.
The settings screen gets a hint under the field (`admin.settings.business.regNumberHint`):
"לא חובה. מופיע רק במיילים של ההזמנות, לא באתר." / "Optional. Shown only in order emails, not
on the website."

## R5. "Includes VAT" (FR-008a)

**Decision**: remove `vatLabel={t('vat')}` from `BuyBox.tsx`, the `vatLabel` prop from
`ui/Price.tsx` (no other caller) and the message `shop.product.vat` (or wherever line 87 lives) in
he/en.

## R6. Publish errors on the product form (Story 3)

**Facts**: `publishFailure()` (`src/server/catalog/products.ts`) already returns `missingFields`
and a `fieldErrors` entry per missing key (`admin.products.missing.<key>`). `ProductEditor`
deliberately drops the missing keys from the per-field errors and shows them only in the
`PublishBar` notice at the bottom. `FormField` already turns `error` into `aria-invalid` (red
border via `CONTROL`'s `aria-invalid:border-alert`), `aria-describedby` and a `FieldError` line.

**Decision**:
- `showFailure` keeps every key, mapping missing keys through `FIELD_OF` plus two new entries:
  `images` → `photos`, `optionGroups` → `options`. Message: a new short key per field,
  `admin.products.required.<key>` (e.g. "צריך למלא שם בעברית", "צריך להוסיף לפחות תמונה אחת",
  "בכל קבוצת אפשרויות צריכים להיות לפחות שני ערכים"), so the notice keeps its list wording.
- Each errorable target carries `data-field="<form field>"` on its focusable control (inputs,
  the categories fieldset's first checkbox, the photo file input's visible button / label, the
  options section's first field or its "add value" button).
- After `setErrors` (in a `useEffect` keyed on a "publish attempt" counter, so it runs after the
  DOM shows the errors): find the first element in **document order** whose field is in the error
  set (`document.querySelectorAll('[data-field]')` filtered), call
  `scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })` then
  `focus({ preventScroll: true })`. `block: 'center'` keeps it clear of the admin's sticky top bar
  (if any) without measuring it.
- Group errors (photos, categories, options): the section/fieldset gets `aria-invalid`-equivalent
  styling: a 1.5 px `alert` outline on the group box plus a `FieldError` under the group's heading,
  tied with `aria-describedby` on the group (`fieldset` / `section` with `aria-labelledby`).
- Clearing (FR-012): each `onChange` setter also deletes its key from `errors` (a small
  `clearError(field)` helper); `PhotoManager` reports "photo added" through its existing
  `onFeedback`-style callback (new optional `onCountChange(count)` prop) so the photos error
  clears on the first upload; category checkboxes clear `categories`; options clear when the
  editor reports a change (new optional `onChange` prop on `OptionGroupsEditor`).
- `missing` (the PublishBar notice) is kept and cleared exactly as today (FR-013).
- Save (not Publish) on a draft: unchanged; no missing errors (edge case).

**Rationale**: smallest change; reuses the server's existing per-field errors and the form's
existing error look; document order means the photos section (now first) wins naturally.

**Alternatives**: client-side pre-validation before calling the server (rejected: duplicates the
publish rules, which live in one place on the server).

## R7. Photos section first (Story 4)

**Decision**: in `ProductEditor.tsx`, move the `<Section title={t('sections.photos')}>` block above
the details section. Nothing else changes. E2E specs that rely on positions are updated.

## R8. WhatsApp link (Story 5)

**Decision**: `whatsAppLink(phone): string | null` (pure, `src/lib/whatsapp.ts`): parses with
`libphonenumber-js` (already a dependency) using `IL` as the default country, returns
`https://wa.me/<E.164 digits without +>` for a valid number, else `null`. The contact page shows
the block only when the phone is not `SEED_PLACEHOLDERS.businessPhone` and the link is not `null`.
Link: `<a href target="_blank" rel="noopener noreferrer">`, no pre-filled text (keeps the link short
and the owner's first message natural), visible label plus a visually hidden "(נפתח בלשונית חדשה)" /
"(opens in a new tab)". No script, no embed, no request to WhatsApp before a click (FR-021); the
Privacy Policy needs no change (no data passes through the shop).

**Icon**: a new `whatsapp` glyph in `ui/Icon.tsx`, authored in the set's own outline style, like
`instagram`/`facebook` (storefront.md §5 forbids the platforms' logo files). WhatsApp's brand rules
allow a "message us on WhatsApp" button; using our own simple outline is the conservative choice.

**Look**: a full-width panel above the form: heading "הכי מהיר: וואטסאפ" / "Fastest: WhatsApp",
one line "אפשר לכתוב לי ישירות בוואטסאפ, ואני עונה מהר." / "Message me directly on WhatsApp, I
answer quickly.", then a large primary button (`forest` fill, `paper` text, 56 px tall, full width
below 900 px, auto width from 900 px, `whatsapp` icon 24 px) "לשליחת הודעה בוואטסאפ" / "Message me
on WhatsApp". The form panel's heading becomes "או כתבו לי כאן" / "Or write to me here" (new key
`contact.formHeadingAlt`) only while the WhatsApp block shows; otherwise it stays "שליחת הודעה". WhatsApp
green is not used: the shop's own primary colour keeps the design system and passes AA contrast.

**Alternatives**: `api.whatsapp.com/send?phone=` (same result, longer); WhatsApp green button
(rejected: off-palette; AA white-on-#25D366 fails).

## R9. Logo asset (Story 6)

**Facts**: `assets/logo/logo-original.jpg` is a 2000×2000 JPEG with a grey/white checkerboard drawn
into it (no alpha channel). The badge is a cream disc with a brown double ring, centred.

**Decision**: a new script `pnpm brand:assets` (`scripts/build-brand-assets.ts`, same style and
guarantees as `build-home-photos.ts`: deterministic, content-hash names, nothing written until
every file is built and within budget). Steps:
1. Find the disc: the disc edge is the outer edge of the cream band (outside the brown ring; the
   cream band is kept). Scan the original for non-checker pixels (pixels whose
   colour is not one of the two checker greys/white within a tolerance) and take the centre and
   radius from the bounding box of the disc; fail with a reason if the box is not square within
   2 %.
2. Cut it out: composite with an anti-aliased circular alpha mask (an SVG circle rendered by
   sharp at the source size) of that radius minus 2 px (drops any checker fringe); trim to the
   disc's square.
3. Write:
   - header logo, WebP with alpha, square: 176, 224, 264, 336 px (`public/brand/logo-<size>.<hash>.webp`);
   - favicon: `public/favicon.ico` holding 16, 32 and 48 px PNG images of the **yarn crop**
     (the square around the two yarn balls and needles, coordinates fixed in the script's config
     as fractions of the disc, so they survive a new original of the same design) on the cream
     disc colour, circle-masked; ICO written by hand (6-byte header + 16-byte entries + PNG
     payloads; no new dependency);
   - `public/brand/icon-32.<hash>.png` (yarn crop) for `<link rel="icon" type="image/png">`;
   - `public/brand/apple-touch-icon.<hash>.png`, 180 px, the **full badge** on an opaque cream
     background (Apple ignores alpha and adds its own rounding);
   - `public/brand/icon-192.<hash>.png` and `icon-512.<hash>.png` (full badge, opaque cream, with
     10 % safe padding so Android's mask does not cut the ring), plus `icon-512-maskable` is not
     needed (purpose `any` only);
   - the link preview image, see R11;
   - `src/lib/brand/manifest.json` mapping roles to file names, widths and heights (sorted keys).
4. Budgets (also asserted in a unit test, like `tests/unit/home-photos.test.ts`): each header logo
   WebP ≤ 40 KB, favicon.ico ≤ 20 KB, each PNG icon ≤ 60 KB, preview image ≤ 300 KB.

**Rationale**: mirrors the home-photo pipeline the team already trusts; no hand-edited binaries in
the repo except outputs of a reproducible script.

**Alternatives**: ask the owner for a transparent PNG (rejected: the circle is clean enough to cut
exactly; no extra round trip); Next.js file conventions `app/icon.png` (rejected: the app has two
root layouts, `[locale]` and `admin`, with no `app/layout`; explicit `metadata.icons` in both root
layouts is predictable and testable).

## R10. Logo in the header (Story 6)

**Decision**:
- `Header.tsx` brand link keeps `data-testid="header-brand"`, `href={base}` and the 3-column grid
  / `nav:mx-auto` placement. Its content becomes `<img>` (`src` the 176 px file, `srcSet` 176w,
  224w, 264w, 336w, `sizes="(min-width: 900px) 112px, 88px"`, `width`/`height` 112, `alt` = shop
  name from settings in the page language (the existing `brand.text`, with `lang` when it is the
  Hebrew fallback), `decoding="async"`, default fetch priority); the link's `aria-label` is "{name}, דף הבית" /
  "{name}, home page" (spec Story 6 scenario 6). A plain `<img>` (not `next/image`,
  `images.unoptimized` is on anyway) keeps it a server-rendered tag with no client code.
- Size and overhang: new tokens in `globals.css`: `--logo-size: 88px` (phone) and `112px` from
  900 px (the same breakpoint that makes the bar 72 px); `--logo-overhang: calc(var(--logo-size) /
  2)`. The link is `position: relative` inside the bar's centre column, `block-size: --header-h`;
  the image is `position: absolute`, `inset-block-start: calc(var(--header-h) - var(--logo-overhang))`
  (its centre sits on the bar's bottom edge), centred inline. The bar does not clip
  (`overflow: visible`). The link's own hit area stays 44 px tall inside the bar (`min-h-11`), and
  the image is also clickable (it is inside the link), so the touch area is at least 88×88.
- Paint order: the header is `z-header` (20); popovers (menu, cart drawers, dialogs) are in the top
  layer and the consent banner is `z-banner` (40), so all sit above the hanging logo (FR-028).
  Content scrolls under the logo (it is inside the sticky header).
- Room at the top (FR-025): `<main>` gets `padding-block-start: calc(var(--logo-overhang) + 8px)`
  except on full-bleed pages (the home page, whose hero is pulled under the header and is meant to
  carry the logo). Pages that start with breadcrumbs keep their own spacing below that.
- Home page at the top: the see-through state does not touch the logo (no colour filter); the
  cream badge reads on the darkened photo. Forced colours: the image stays (it is content), the
  link gets the system focus ring as today.
- Phone (≥ 320 px): the centre column is `minmax(0,auto)`; 88 px fits between the 44 px menu
  and cart buttons with room to spare (320 − 32 gutter − 88 − 88 = 112 px free), so nothing
  overlaps; no further shrink needed.
- `storefront.md` §4 page frame, §7.18 brand bullet ("no logo exists: never draw one" is replaced)
  and §6 images; `PRODUCT.md` "No logo or wordmark exists yet" is updated (the owner supplied one).

## R11. Link previews (Story 8)

**Facts**: only product pages set `openGraph`/`twitter`. The locale layout sets only `title`.
There is no `metadataBase` and no site description. Next.js replaces a nested `openGraph` object
wholesale (no deep merge).

**Decision**:
- Preview image: built by `pnpm brand:assets` from `assets/home-photos/hero-workshop.jpg` (cover
  crop to 1200×630 around the hero's configured `focusX`) with the cut-out logo composited in the
  centre at 420 px, JPEG quality 85 (≤ 300 KB), `public/brand/og.<hash>.jpg`. One image for both
  languages (the badge carries both).
- Description: `common.meta.description` in he/en (owner-approved text, spec FR-034).
- `src/server/seo.ts` gets `pageMetadata({ locale, path, title?, description? })` returning
  `{ alternates, description, openGraph: { type: 'website', siteName, locale: he_IL|en_US, url,
  title, description, images: [shop image 1200×630 with alt] }, twitter: { card:
  'summary_large_image', ... } }`, absolute URLs from `APP_ORIGIN`. The locale layout sets
  `metadataBase: new URL(APP_ORIGIN)`, the default `description` and the default `openGraph`
  (home values). Each public page's `generateMetadata` (home, all pieces, category, search, content
  pages, contact) uses the helper with its own title/path; content pages pass a description only
  if they have one (they do not today, so they use the shop description). Product pages keep their
  own `openGraph` and add `siteName`/`locale`. Checkout, order and payment-return pages are
  `noindex` already and only inherit the layout default (no change).
- No cookies and no consent are needed to fetch `/brand/og.*.jpg` (a static file; the proxy matcher
  already skips paths with an extension). Security headers (`Cross-Origin-Resource-Policy`, if
  set) are checked in tasks; preview crawlers are not browsers, so CORP does not apply to them.

**Alternatives**: a dynamic `opengraph-image.tsx` (rejected: a runtime route, fonts, more code; a
static file does the job); per-locale images (rejected: the badge is bilingual).

## R12. Favicon wiring (Story 9)

**Decision**: both root layouts (`src/app/[locale]/layout.tsx`, `src/app/admin/layout.tsx`) set
`metadata.icons`: `icon: [{ url: '/favicon.ico', sizes: '16x16 32x32 48x48' }, { url: <icon-32>, type:
'image/png', sizes: '32x32' }]`, `apple: [{ url: <apple-touch-icon>, sizes: '180x180' }]`, and
`manifest: '/site.webmanifest'`. A static `public/site.webmanifest` (written by the script, since it
references hashed names): `name` "היצירות של אביבה", `short_name` "אביבה", `icons` 192 and 512,
`theme_color` and `background_color` `#ffffff` (the header's `paper`), `display: browser`, `start_url:
/he`, `lang: he`, `dir: rtl`. `viewport.themeColor` `#ffffff` in the locale layout.

**Rationale**: explicit, testable, no dependence on file-convention behaviour with two root layouts.
