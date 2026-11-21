---

description: "Task list for 008 post-launch fixes"
---

# Tasks: Post-launch fixes

**Input**: Design documents from `specs/008-post-launch-fixes/`

**Prerequisites**: plan.md, spec.md (approved 2026-11-20), research.md (R1–R12), data-model.md,
contracts/ (ui.md, brand-assets.md, metadata.md), quickstart.md

**Tests**: required (constitution VI: checkout and emails are critical paths; the new asset
script and helpers are new logic). Unit and integration tests for new logic are written first and must fail before their
implementation task; E2E checks for new UI follow the UI task in the same batch (they need the
built page); tests for changed behaviour are updated in the same task as the change.

**Rules for every batch**: no `style` attribute or prop (CSP); logical properties only
(`ms-/me-/ps-/pe-/start-/end-`, `inset-inline-*`, `pnpm check:css`); every visible string from
`src/i18n/messages/{he,en}.json` in both languages, owner's first-person voice (feminine singular,
customers in the plural); keep every existing `data-testid` and accessible name unless a task says
otherwise; no new npm dependency. Run commands with timeouts; never start watch mode or a dev
server that does not exit. Run E2E specs one file at a time (`pnpm build` once, then `pnpm exec
playwright test <file> --project=<project>`); the full E2E run is CI's. Design system:
`docs/design/storefront.md` (header §7.18, page frame §4, icons §5, images §6, buttons §7.1, form
controls §7.10, notices §7.4, contact §8.10, footer §7.20, admin product editor §12).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US9 = spec user stories 1–9

---

## Phase 1: Setup (brand assets)

**Purpose**: the logo, favicon, icons and preview image every later story uses (contracts/brand-assets.md, research R9, R11, R12).

- [X] T001 Create `src/lib/brand/config.ts`: source paths (`assets/logo/logo-original.jpg`, hero photo via `HOME_PHOTOS.hero` from `src/lib/home-photos/config.ts`), logo sizes `[176, 224, 264, 336]`, the yarn-crop square as fractions of the disc (`x`, `y`, `size`; measure on the original: the square around the two yarn balls and needles, about 0.30–0.70 horizontally and 0.17–0.48 vertically of the 2000 px image, converted to disc fractions), cream colour sampled from the disc (about `#faf8e9`), the hand-measured expected disc centre and radius in source pixels (the **disc edge** is the outer edge of the cream band, about x=170 on the middle row of the 2000 px original, outside the brown ring at about x=225–260; the cream band is kept), budgets: logo WebP ≤ 40 KB each, `favicon.ico` ≤ 20 KB, each PNG icon ≤ 60 KB, preview JPEG ≤ 300 KB
- [X] T002 Write `tests/unit/brand-assets.test.ts` (fails until T003–T004): `src/lib/brand/manifest.json` lists files that exist under `public/brand/`; each file's real dimensions match the manifest (sharp metadata); budgets of T001 hold; the 336 px logo has alpha 0 at its four corners and at 4 points 3 px outside the disc edge (the outer edge of the cream band), and alpha 255 at the centre; `public/favicon.ico` parses (reserved 0, type 1, count 3, entries 16/32/48, PNG payload signatures); `public/site.webmanifest` is valid JSON whose `icons[].src` files exist; the preview image is 1200×630 JPEG; `manifest.json`'s recorded `disc` is within 2 % of T001's expected centre and radius; no output carries EXIF or XMP (as `tests/unit/home-photos.test.ts` checks)
- [X] T003 Implement `scripts/build-brand-assets.ts` (`pnpm brand:assets`, add to `package.json` scripts as `tsx --conditions=react-server scripts/build-brand-assets.ts`), modelled on `scripts/build-home-photos.ts` (deterministic, `<name>.<8 hex of sha-256>.<ext>`, nothing written until every file is built and within budget, exit 1 with a reason otherwise): find the disc using colour, not brightness: the cream disc (about `#faf8e9`) is close to the checkerboard white, so classify a pixel as disc when its blue channel is clearly below its red/green (cream, brown, pastels) or it lies inside the brown ring; take centre and radius from the bounding box of the whole disc (the outer edge of the cream band, not the brown ring), and compare them with the expected centre/radius of T001; fail if they differ by more than 2 % or the box is not square within 2 %; record the detected centre and radius in `manifest.json` (`disc: { cx, cy, r }`); circular anti-aliased alpha mask with radius 2 px inside the disc edge (SVG circle composited with `dest-in`); trim to the disc; write header logos (WebP with alpha, sizes of T001), `icon-32` PNG and `favicon.ico` (16/32/48 PNG entries, ICO header written by hand) from the yarn crop circle-masked on the cream colour, `apple-touch-icon` 180 px and `icon-192`/`icon-512` (full badge on opaque cream, 10 % padding for 192/512), `og` 1200×630 JPEG q85 (hero photo cover-cropped around its `focusX`, logo composited centred at 420 px), `public/site.webmanifest` (`name` "היצירות של אביבה", `short_name` "אביבה", icons 192/512 `purpose: "any"`, `theme_color` and `background_color` `#ffffff`, `display` "browser", `start_url` "/he", `lang` "he", `dir` "rtl"), and `src/lib/brand/manifest.json` (shape in contracts/brand-assets.md, sorted keys); empty `public/brand/` before writing
- [X] T004 Create `src/lib/brand/index.ts` (typed accessors returning `/brand/<file>` URLs: `logoSrcSet()`, `logoSrc(size)`, `ogImage()`, `icon32()`, `appleTouchIcon()`); run `pnpm brand:assets`, keep the outputs (`public/brand/*`, `public/favicon.ico`, `public/site.webmanifest`, `src/lib/brand/manifest.json`) in the working tree; open `public/brand/logo-336.*.webp` and `og.*.jpg` and check by eye: no checkerboard, ring intact; T002 passes; running the script twice leaves no diff

**Checkpoint**: assets exist and are tested.

---

## Phase 2: User Story 1 - Customers can place orders (Priority: P1) 🎯 MVP

**Goal**: production orders no longer fail on seed business details (R1).

**Independent Test**: quickstart §1.

- [X] T005 [US1] In `tests/integration/place-order.test.ts`, change the test "in production while a seed placeholder remains, but not once the details are filled in" to assert that a production-mode order **succeeds** with every seed placeholder in place (and still succeeds when filled in); run it, it fails
- [X] T006 [US1] In `src/server/checkout/place-order.ts`, delete the `getEnv().APP_ENV === 'production' && placeholderFields(settings).length > 0` block and the now-unused imports; remove the message `checkout.shop_not_ready` from `src/i18n/messages/he.json` and `en.json` (search `src/` and `tests/` for other uses first: none expected); keep `placeholderFields()` and `settingsNeedingAttention()` unchanged (admin home, FR-002); T005 passes

**Checkpoint**: the live blocker is gone.

---

## Phase 3: User Story 2 - The business number stays off the website (Priority: P1)

**Goal**: number optional, never on the website, only in order emails when set; no "includes VAT" (R2–R5, data-model.md).

**Independent Test**: quickstart §2.

- [X] T007 [US2] Schema and migration: in `src/server/db/schema/commerce.ts` make `businessRegNumber: text('business_reg_number')` nullable and change check `shop_settings_business_reg_number` to `business_reg_number IS NULL OR char_length(business_reg_number) >= 1`; run `pnpm db:generate --name optional_business_number` to create `src/server/db/migrations/0007_optional_business_number.sql` (never rename the file by hand: `meta/_journal.json` holds its tag; check by hand it only drops/re-adds the check and drops `NOT NULL`, no data rewrite); update `tests/integration/schema.test.ts` (and `tests/integration/seed.test.ts` if it asserts the column) for the nullable column, including a case that `''` is rejected and `NULL` accepted
- [X] T008 [US2] Validation and settings: in `src/lib/validation/settings.ts` use `optionalText('businessRegNumber', 40)` (data-model.md: "trimmed; empty → `null`; max 40"); update the `Settings` type users (`SettingsManager.tsx` initial value `settings.businessRegNumber ?? ''`, `src/app/admin/(protected)/settings/page.tsx`); in `SettingsManager.tsx` add a hint under the field from `admin.settings.business.regNumberHint` ("לא חובה. מופיע רק במיילים של ההזמנות, לא באתר." / "Optional. Shown only in order emails, not on the website."), relabel `admin.settings.business.regNumber` to "מספר עוסק (לא חובה)" / "Business number (optional)", reword `admin.settings.errors.businessRegNumber` to "מספר העוסק יכול להיות עד 40 תווים." / "The business number can be up to 40 characters."; in `tests/integration/settings.test.ts` remove `businessRegNumber` from the "requires the business details" list (lines ~222-231) and extend it: saving an empty or blank number stores `NULL` and `settingsNeedingAttention()` then does not list it; the seed value is still listed
- [X] T009 [US2] Write the pure helper `customerRegNumber(settings: { businessRegNumber: string | null }): string | null` in `src/lib/business-number.ts`. `src/server/db/seed.ts` is not pure (it imports drizzle and content modules), so first move `SEED_PLACEHOLDERS` to a new pure module `src/lib/seed-placeholders.ts` and re-export it from `seed.ts` (existing imports keep working; the contact page in T021 imports it from the new module). The helper returns the trimmed number, or `null` when null, blank or equal to `SEED_PLACEHOLDERS.businessRegNumber`; unit test `tests/unit/business-number.test.ts` first (null, '', '  ', '000000000', ' 123 ' → '123')
- [X] T010 [US2] Emails: in `src/server/email/templates/order-parts.ts` `sellerParts()` include the number line (HTML and text) only when `customerRegNumber(settings)` is not null; change `emails.order.regNumber` to "מספר עוסק: {number}" / "Business no.: {number}"; update `tests/integration/order-emails.test.ts`: with the seed value and with `NULL` no number line and no "000000000" in the confirmation, cancellation and refund emails; with `123456789` the line "מספר עוסק: 123456789" appears; also flip `tests/integration/place-order.test.ts` (~line 477), which expects `'000000000'` in the confirmation email, to expect it absent
- [X] T011 [US2] Website: remove the number line from `src/components/shop/Footer.tsx` (the `<p data-testid="footer-business-vat">` and message `common.footer.vat`) and from `src/app/[locale]/(shop)/contact/page.tsx` (the `footer.rich('vat', …)` paragraph); remove `regNumber` from the checkout seller config (`src/app/[locale]/(shop)/checkout/page.tsx`, the `seller` type and use in `src/components/shop/CheckoutForm.tsx`) and change `checkout.seller` to "{name}" in he/en (same place and style); update the tests that read these: `tests/e2e/storefront-layout.spec.ts`, `tests/e2e/privacy.spec.ts`, `tests/e2e/home.spec.ts`, `tests/e2e/contact.spec.ts` (~line 82 expects `'000000000'` in `contact-details`) (search for `footer-business-vat`, `עוסק מורשה`, `VAT registration`, `ע.מ.`) so they assert the line is **absent**
- [X] T012 [US2] Remove "includes VAT": drop `vatLabel={t('vat')}` in `src/components/shop/BuyBox.tsx`, the `vatLabel` prop and its `<span>` in `src/components/ui/Price.tsx` (no other caller; check), and the product `vat` message ("כולל מע״מ" / "incl. VAT", `src/i18n/messages/he.json` line ~87 and en); also drop ", כולל מע״מ" / ", including VAT" from `admin.products.fields.priceIls` (owner decision, FR-039); update any test asserting these
- [X] T039 [US2] Legal drafts (FR-038): in `docs/legal-drafts/terms.he.md` and `terms.en.md` (line ~7) remove "האתר מופעל על ידי עוסק מורשה" / "operated by a licensed dealer (an Israeli VAT-registered business)" and say instead that the business name, address and contact details are at the bottom of every page and on the contact page, and that the business number is given in the order emails; (line ~15) drop "וכוללים מע\"מ" / "and include VAT" (prices are final prices in shekels); in `privacy.he.md` and `privacy.en.md` (line ~7) the same for the controller's details ("מספר העוסק המורשה" / "VAT registration number"); in `docs/privacy/database-definition.he.md` (~11) and `.en.md` (~14) replace "עוסק מורשה" / "VAT-registered" and "shown in the site footer" accordingly; keep each file's `# Title` first line (parsed by `parseDraft`); run `tests/integration/content-pages.test.ts` and `seed.test.ts`
- [X] T040 [US2] One-time refresh of the live pages (FR-038): a data migration `pnpm db:generate --custom --name refresh_terms_privacy` → `src/server/db/migrations/0008_refresh_terms_privacy.sql` with `UPDATE content_page SET owner_edited = false WHERE slug IN ('terms', 'privacy');` (check the slugs in `src/server/content/slugs.ts`). The deploy runs `pnpm db:migrate && pnpm db:seed` (`render.yaml`), so the seed's `loadDrafts` then replaces those two pages with the T039 drafts, bumps their version and records `content_page_version` rows; the migration runs once, so later admin edits are kept. Integration test (`tests/integration/seed.test.ts` or a new `migration-0008-refresh-terms-privacy.test.ts`, like `migration-0004-product-categories.test.ts`): with `terms` marked `owner_edited` and custom text, after the migration + seed the page holds the new draft, its version went up by one and a version row exists; `about` (edited) is untouched
- [X] T013 [US2] Add an e2e check in `tests/e2e/storefront-layout.spec.ts` (desktop project) that the visible text (`innerText`, not HTML) of the home, product and contact pages contains none of the strings below, and in `tests/e2e/checkout-offline.spec.ts` (phone project, cart filled so the seller line renders) that the seller line shows the business name and none of "עוסק מורשה", "VAT registration", "ע.מ.", "000000000", "כולל מע״מ", "incl. VAT"; run that spec file

**Checkpoint**: P1 done; the shop can sell and shows no business number.

---

## Phase 4: User Story 4 - Photos come first (Priority: P2)

**Goal**: photos section first in the product editor (R7). Before US3: same file.

**Independent Test**: open any product in admin; the photos section is first.

- [X] T014 [US4] In `src/components/admin/ProductEditor.tsx` move the photos `<Section>` above the details section; give each `Section` a `data-testid` (`section-photos`, `section-details`, `section-options`, `section-publish`; add a `testId` prop to `Section`); update `tests/e2e/admin-products.spec.ts` where it depends on order and add an assertion that `section-photos` precedes `section-details` in the DOM

---

## Phase 5: User Story 3 - Publish shows what is missing, where it is (Priority: P2)

**Goal**: every missing field red with a message; scroll to and focus the first one; errors clear on input (R6, contracts/ui.md "Product editor").

**Independent Test**: quickstart §3.

- [X] T015 [US3] Messages: add `admin.products.required.{nameHe,descriptionHe,priceIlsMinor,priceUsdMinor,categoryId,prepTimeHe,images,optionGroups}` in he/en, short and imperative in the admin's voice (e.g. "צריך למלא שם בעברית" / "Enter the Hebrew name"; "צריך להוסיף לפחות תמונה אחת" / "Add at least one photo"; "צריך לבחור לפחות קטגוריה אחת" / "Choose at least one category"; "בכל קבוצת אפשרויות צריכים להיות לפחות שני ערכים" / "Each option group needs at least two values"); keep `admin.products.missing.*` for the PublishBar list
- [X] T016 [US3] In `ProductEditor.tsx`: `showFailure` no longer skips missing keys: each missing key maps through `FIELD_OF` (add `images: 'photos'`, `optionGroups: 'options'`) to `t('required.<key>')`; keep `setMissing` (FR-013); add `data-field="<field>"` to every errorable control (`nameHe`, `descriptionHe`, `priceIls`, `priceUsd`, the categories fieldset's first checkbox `categories` (if no category exists, put it on the `fieldset` with `tabIndex={-1}`), `prepTimeHe`) and pass `error` to the photos and options groups; after any failure that carries `missingFields` (a counter state bumped inside `showFailure` whenever `result.missingFields` is set, so it also fires when `saveAll()`'s `updateProduct` returns the publish failure for a published or hidden product, from Publish, Unhide or Save alike), in a `useEffect` find the first `[data-field]` in document order whose field has an error, `scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })`, then `focus({ preventScroll: true })`; add a `clearError(field)` helper called from every field's `onChange` and from the categories checkboxes
- [X] T017 [US3] Group error states: `src/components/admin/PhotoManager.tsx` takes optional `error?: string` and `onCountChange?(count: number)`; with an error its box gets a 1.5 px `alert` outline, a `FieldError` (from `ui/Field`) under the heading, `aria-describedby` on the group and `data-field="photos"` + `aria-invalid="true"` on the focusable `<input type="file" data-testid="photo-input">` itself (the visible `<label>` cannot take focus; the input is `sr-only`, the label already shows a focus ring through `has-focus-visible:outline-3`; keep it); `ProductEditor` clears `photos` when the count becomes ≥ 1. `src/components/admin/OptionGroupsEditor.tsx` takes optional `error?: string` and `onChange?()`; with an error the section shows the same outline + `FieldError`, `data-field="options"` on its first control; `ProductEditor` clears `options` on change. The categories `fieldset` gets the same outline and `aria-invalid` when `errors.categories` is set (it already renders `FieldError`)
- [X] T018 [US3] E2E in `tests/e2e/admin-products.spec.ts` (phone project, as the admin specs run): new product with only a Hebrew name → press Publish → `document.activeElement` carries `data-field="photos"`; every missing control has `aria-invalid="true"` and its error text; `[data-testid="publish-errors"]` still lists every item; typing a description removes that field's `aria-invalid`; with all fields filled Publish succeeds and no `aria-invalid` remains; Save on an incomplete draft shows no errors; run the spec file

**Checkpoint**: admin form stories done.

---

## Phase 6: User Story 5 - Contact on WhatsApp (Priority: P2)

**Goal**: WhatsApp block first on the contact page (R8, contracts/ui.md "Contact page").

**Independent Test**: quickstart §4.

- [X] T019 [P] [US5] Unit test first `tests/unit/whatsapp.test.ts`, then `src/lib/whatsapp.ts` `whatsAppLink(phone: string): string | null` with `libphonenumber-js` default country `IL`: `'050-1234567'` → `https://wa.me/972501234567`; `'+972 50 123 4567'` → same; `'+1 415 555 2671'` → `https://wa.me/14155552671`; `''`, `'abc'`, `'123'` → `null`
- [X] T020 [P] [US5] Add a `whatsapp` glyph to the icon set (`src/components/ui/Icon.tsx` / `icon-core.tsx` per storefront.md §5): an authored simple outline in the set's style (speech bubble with a handset, 24×24 viewBox, stroke 1.7, `currentColor`), not WhatsApp's logo file
- [X] T021 [US5] In `src/app/[locale]/(shop)/contact/page.tsx` render, before the form/details grid and only when `settings.businessPhone !== SEED_PLACEHOLDERS.businessPhone` and `whatsAppLink(settings.businessPhone)` is not null, a `<section data-testid="contact-whatsapp" aria-labelledby>` panel (`paper`, 1 px `line` outline, `rounded-card`, p-[18px], like the other panels): heading `contact.whatsapp.heading` ("הכי מהיר: וואטסאפ" / "Fastest: WhatsApp"), text `contact.whatsapp.text` ("אפשר לכתוב לי ישירות בוואטסאפ, ואני עונה מהר." / "Message me directly on WhatsApp, I answer quickly."), and `<a data-testid="contact-whatsapp-link" href target="_blank" rel="noopener noreferrer">` styled as the primary button (`forest` fill, `paper` text, min-height 56 px, full width below 900 px, auto width from 900 px, 24 px `whatsapp` icon, visible focus ring) with text `contact.whatsapp.button` ("לשליחת הודעה בוואטסאפ" / "Message me on WhatsApp") and a visually hidden `contact.whatsapp.newTab` (" (נפתח בלשונית חדשה)" / " (opens in a new tab)"); add `contact.formHeadingAlt` ("או כתבו לי כאן" / "Or write to me here") used as the form panel's heading only when the WhatsApp block renders; otherwise keep `contact.formHeading` ("שליחת הודעה") so the page is exactly as before (FR-018)
- [X] T022 [US5] E2E in `tests/e2e/contact.spec.ts`: with the seed phone, no `contact-whatsapp` and the form heading is still "שליחת הודעה"; after setting the business phone in the test database to `050-1234567` (use the spec's existing DB/settings helper), `contact-whatsapp` precedes the form in DOM order, the link has `href="https://wa.me/972501234567"`, `target="_blank"`, `rel` containing `noopener`, an accessible name containing the new-tab text, height ≥ 56 px; axe passes in both locales; restore the phone after the test; run the spec file

---

## Phase 7: User Story 6 - The shop's logo in the header (Priority: P2)

**Goal**: logo replaces the text brand and hangs half below the bar (R10, contracts/ui.md "Header logo").

**Independent Test**: quickstart §5.

- [X] T023 [US6] `src/app/globals.css`: tokens `--logo-size: 88px` and, from 900 px (the same media query that sets `--header-h: 72px`), `112px`; `--logo-overhang: calc(var(--logo-size) / 2)`; make sure `#site-header` and its inner grid do not clip (`overflow: visible`); `<main>` (non-full-bleed) top padding `calc(var(--logo-overhang) + 8px)`: change the `className` in `src/app/[locale]/layout.tsx` (`pt-[calc(var(--logo-overhang)+8px)]` with the full-bleed variant `has-[>[data-full-bleed]]:pt-0`); check pages that today rely on `<main>` having no top padding (breadcrumb pages, checkout) still look right; everything that lines up with the bar's bottom edge must clear the hanging half too: `scroll-padding-top` (`globals.css` ~58) becomes `calc(var(--header-h) + var(--logo-overhang))`, and so do the sticky tops of the product buy panel (`p/[slug]/page.tsx` ~213, `lg:top-[calc(var(--header-h)+16px)]` → add `var(--logo-overhang)`) and the checkout summary (`CheckoutForm.tsx` ~672); grep for other `--header-h` sticky offsets
- [X] T024 [US6] `src/components/shop/Header.tsx`: the brand link keeps `data-testid="header-brand"`, `href={base}`, its grid/`nav:mx-auto` placement and `min-h-11`; it becomes `relative` with inline size `var(--logo-size)` and `block-size: var(--header-h)` (`h-full`, `self-stretch`), so the image offset is measured from the bar's top edge. (a) The link has no `aria-label`: its name comes from content, the `<img>` `alt` plus a visually hidden `<span class="sr-only">` with the new message `common.homeLinkSuffix` (", דף הבית" / ", home page"), so the name is "{name}, דף הבית" / "{name}, home page" (spec Story 6 scenario 6) (the computed name may carry a space before the comma; tests match both); `lang` for the Hebrew-fallback name moves from the link to the `<img>`; the `<img>` is `rounded-full` and the link's focus ring is drawn on it. (b) The link holds `<img data-testid="header-logo" src={logoSrc(176)} srcSet={logoSrcSet()} sizes="(min-width: 900px) 112px, 88px" width={112} height={112} alt={brand.text} decoding="async">` (no `fetchPriority`, so it does not compete with the product page's main photo). (c) The image is positioned `absolute`, `inset-block-start: calc(var(--header-h) - var(--logo-overhang))` relative to the bar (so its centre sits on the bar's bottom edge), centred inline, size `var(--logo-size)`; remove the text `<span>`; the logo is not affected by the home page's see-through/`on-photo` colours or forced-colours rules; drawers (top layer) and the consent banner (`z-banner`) stay above it
- [X] T025 [US6] E2E in `tests/e2e/storefront-layout.spec.ts` (desktop and phone projects): on a content page after scrolling 200 px, `logo.top < header.bottom < logo.bottom` and `|(header.bottom − logo.top) − logo.height/2| ≤ 1`; at scroll 0 the first content element of `<main>` starts at or below `logo.bottom`; at 320, 375, 1024 and 1280 px the logo's box does not intersect the menu button, cart button or search field; `header-logo` `alt` equals the shop name and the link's accessible name is "{shop name}, דף הבית" / "{name}, home page"; after following a checkout error link on the phone project the focused field is not under the logo; opening the menu drawer and, separately, the cart drawer covers the logo (`elementFromPoint` at the logo centre is inside the drawer or its backdrop); on the home page at scroll 0 (see-through header over the photo) the same half-in/half-out geometry holds; update any assertion that read the brand's text content; run the spec file in both projects
- [X] T026 [US6] Update the home-page and header assertions that may break in `tests/e2e/home.spec.ts`, `tests/e2e/language.spec.ts`, `tests/e2e/design-review.spec.ts`, `tests/e2e/a11y.spec.ts` (search for `header-brand`); run each changed spec file

---

## Phase 8: User Story 8 - Shared links show a preview (Priority: P2)

**Goal**: site-wide link previews (R11, contracts/metadata.md).

**Independent Test**: quickstart §6.

- [X] T027 [US8] Message `common.meta.description` in he/en: "יצירות סרוגות בעבודת יד, בסבלנות ובאהבה. משלוחים לכל הארץ." / "Handmade crochet pieces, made with patience and love. Shipping across Israel."; extend `tests/unit/seo.test.ts` first for the helper of T028 (home, a content page, contact; both locales; absolute `og:url`/image URLs; `og:locale` `he_IL`/`en_US`; `twitter.card` `summary_large_image`)
- [X] T028 [US8] Move `shopNameFor()` from `src/app/[locale]/layout.tsx` to a shared server module (e.g. `src/server/settings/shop-name.ts`) and import it in the layout and the pages of T029. `src/server/seo.ts`: `pageMetadata({ locale, path, title, description, siteName })` returning `alternates` (existing `alternates()`), `description`, `openGraph` (`type: 'website'`, `siteName`, `locale`, `url`, `title`, `description`, `images: [{ url: absolute og image from src/lib/brand, width: 1200, height: 630, alt: siteName }]`) and `twitter` (`summary_large_image`, title, description, images); in `src/app/[locale]/layout.tsx` add `metadataBase: new URL(getEnv().APP_ORIGIN)`, the default `description` and a default `openGraph`/`twitter` with siteName, locale, description and image but **no `url`** (so checkout, order and not-found pages do not claim the home address)
- [X] T029 [US8] Use `pageMetadata` in `generateMetadata` of `src/app/[locale]/(shop)/page.tsx` (no page `title`, so the layout default stays and is not doubled by the template; only `openGraph.title`/`twitter.title` get the shop name), `shop/page.tsx`, `c/[slug]/page.tsx`, `search/page.tsx`, `pages/[slug]/page.tsx`, `contact/page.tsx` (each with its existing title and path); in `p/[slug]/page.tsx` keep the product image/description and add `siteName` and `locale` to its `openGraph`; leave checkout, order and return pages as they are
- [X] T030 [US8] New `tests/e2e/seo.spec.ts` (desktop project only, `test.skip` for others): `/he` and `/en/contact` have `og:title`, `og:description`, `og:image` (absolute; fetching it returns 200 `image/jpeg`), `twitter:card`; a product page keeps its product image; run the spec file

---

## Phase 9: User Story 9 - The shop has its own icon (Priority: P3)

**Goal**: favicon, touch icons, manifest, theme colour (R12).

**Independent Test**: quickstart §6.

- [X] T031 [US9] In `src/app/[locale]/layout.tsx` and `src/app/admin/layout.tsx` metadata: `icons: { icon: [{ url: '/favicon.ico', sizes: '16x16 32x32 48x48' }, { url: icon32(), type: 'image/png', sizes: '32x32' }], apple: [{ url: appleTouchIcon(), sizes: '180x180' }] }`, `manifest: '/site.webmanifest'`; `viewport` export with `themeColor: '#ffffff'` in the locale layout; check `src/proxy.ts`'s matcher serves `/favicon.ico`, `/site.webmanifest` and `/brand/*` without locale redirects (it skips paths with an extension) and that `src/server/security/headers.ts` does not block them; add a `/brand/:path*` `Cache-Control: public, max-age=31536000, immutable` rule in `next.config.ts` next to the `/site-photos/:path*` one
- [X] T032 [US9] Extend `tests/e2e/seo.spec.ts`: `/favicon.ico` 200; the `<link rel="icon">`, `rel="apple-touch-icon"` and `rel="manifest"` targets return 200 on a storefront page and on `/admin/sign-in`; `/site.webmanifest` parses and its icons return 200; `<meta name="theme-color" content="#ffffff">` is present; run the spec file

---

## Phase 10: User Story 7 - Band sentence (Priority: P3)

- [X] T033 [US7] Change `shop.home.band.sentence` to "אני סורגת כל יצירה בעצמי, בסבלנות ובאהבה, במיוחד בשבילכם." / "I crochet every piece myself, with patience and love, especially for you."; update any test that asserts the old sentence and add a positive check for the new one in both languages (`tests/e2e/home.spec.ts`)

---

## Phase 11: Polish & Cross-Cutting

- [X] T034 [P] `docs/design/storefront.md`: §4 page frame (logo, `--logo-size`, `--logo-overhang`, `<main>` top padding), §5 (`whatsapp` glyph), §6 (brand assets and `pnpm brand:assets`), §7.18 brand bullet (replace "no logo exists … never draw one" with the logo rules), §7.20 footer (no business number), §7.5 Price (no VAT label), §8.10 contact (WhatsApp block first; details without "עוסק מורשה"), §8.4 product page, §12.11 product editor (photos first, error states, scroll/focus), §12.10 settings (business number optional, hint), §3.6 layering (the hanging logo lives in the `z-header` context, below drawers and the banner); add a changelog line for 008
- [X] T035 [P] `PRODUCT.md`: the logo now exists (supplied by the owner 2026-11-20, `assets/logo/`); keep the "never fabricate" rule for everything else
- [X] T036 [P] `docs/owner-guide-he.md`: section order now photos first (lines ~31-32), drop the quoted VAT label; business number optional and shown only in order emails; WhatsApp button uses the business phone (and is hidden while it is the sample number); product errors now point at the field; tell the owner that the Terms and Privacy pages were updated by the release (no business number on the site, no "עוסק מורשה", no "כולל מע״מ") and that any earlier edits she made to those two pages were replaced; the About and Shipping pages were not touched
- [X] T037 [P] `docs/launch-checklist.md`: update the quoted field label at ~236 to "מספר עוסק (לא חובה)"; add "lawyer review: business number not shown on the website (constitution 2.1.0 exception, 008 owner decision 2); afterwards remove or confirm the exception"; `docs/roadmap.md`: add/mark 008 done
- [X] T038 Run `pnpm verify` (types, lint, CSS, unit + integration, audit, and `test:pg` when `DATABASE_URL_TEST` is set) and the changed e2e spec files one by one; fix what fails

---

## Dependencies & Execution Order

- Phase 1 (assets) before US6, US8, US9 (they read `src/lib/brand`).
- US1 → US2 (both touch `place-order`/settings tests and messages; run in order).
- US4 → US3 (same file `ProductEditor.tsx`).
- US5, US6, US8, US9, US7 are independent of each other except that all edit `src/i18n/messages/{he,en}.json` and US6 (T023 `<main>` padding), US8 (T028 moves `shopNameFor()` out, metadata) and US9 (T031 icons) all edit `src/app/[locale]/layout.tsx`; the batches run in order, so they do not collide.
- Polish last.

### Suggested batches (one at a time, as the coordinator workflow requires)

1. T001–T004 (assets) 2. T005–T013, T039–T040 (US1, US2) 3. T014–T018 (US4, US3) 4. T019–T022 (US5)
5. T023–T026 (US6) 6. T027–T033 (US8, US9, US7) 7. T034–T038 (polish)

### Parallel opportunities

T019 and T020 (different files); T034–T037 (different docs). Batches themselves run sequentially.

## Implementation Strategy

MVP = Phase 2 (US1): it unblocks sales on its own and could ship alone. Then US2 (removes the fake
number and the VAT line), then the rest in batch order; each batch ends with its stories testable
as in quickstart.md.
