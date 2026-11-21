# Contract: UI changes (008)

Test ids and accessible names other suites rely on. Design details: research R6, R8, R10;
`docs/design/storefront.md` is updated to match.

## Header logo (Story 6)

- `#site-header [data-testid="header-brand"]`: `<a href="/{locale}">` with no `aria-label`. Its
  accessible name comes from its content: one `<img data-testid="header-logo">` with `alt` = shop
  name for the page language (the Hebrew fallback puts `lang="he"` on the img, so a screen reader
  reads the name in Hebrew) and a visually hidden `<span class="sr-only">` holding the message
  `common.homeLinkSuffix` (", דף הבית" / ", home page"). The name is therefore "{name}, דף הבית" /
  "{name}, home page" (spec Story 6 scenario 6); the computed name may carry a space before the
  comma ("{name} , דף הבית"), because the hidden span is a separate text node, and the tests match
  both. No visible text. The image is round
  (`rounded-full`) so only the badge takes clicks, and the focus ring is drawn on the image.
- Geometry (asserted in `tests/e2e/storefront-layout.spec.ts`, phone and desktop projects, after
  scrolling 200 px): `logo.top < header.bottom < logo.bottom` and `|(header.bottom - logo.top) -
  logo.height / 2| ≤ 1`. At scroll 0 on a non-home page, the first element of `<main>`'s content
  (breadcrumbs or `h1`) starts at or below `logo.bottom`.
- The logo never covers the menu button, cart button or search field (their boxes do not intersect
  the logo's box) at 320, 375, 1024 and 1280 px.
- CSS tokens: `--logo-size` (88 px; 112 px from 900 px), `--logo-overhang` (half of it).

## Product editor (Stories 3, 4)

- Sections in order: photos (`data-testid="section-photos"`), details, options, publish (each
  `<section>` gets a `data-testid="section-<name>"`).
- Every errorable control has `data-field="<field>"`: `nameHe`, `descriptionHe`, `priceIls`,
  `priceUsd`, `categories` (first checkbox), `prepTimeHe`, `photos` (the "add photos" control),
  `options` (the options section's first control).
- After a failed Publish: each missing control (or group) has `aria-invalid="true"` and an
  `aria-describedby` that includes `<id>-error`; `document.activeElement` is the first missing
  control in document order; `[data-testid="publish-errors"]` still lists every missing item.
- Filling a field removes its `aria-invalid` and error line without another Publish.

## Contact page (Story 5)

- `[data-testid="contact-whatsapp"]`: the WhatsApp section, rendered only when the business phone
  is real (not the seed value) and valid. It precedes the form section in DOM and visual order.
- Inside it, `[data-testid="contact-whatsapp-link"]`: `<a href="https://wa.me/<digits>"
  target="_blank" rel="noopener noreferrer">`, accessible name "לשליחת הודעה בוואטסאפ (נפתח
  בלשונית חדשה)" / "Message me on WhatsApp (opens in a new tab)", height ≥ 56 px.
- Business details block: no business number line (`footer.vat` no longer used).

## Footer, checkout, product page (Story 2)

- `[data-testid="footer-business-vat"]` is removed. No page contains the text "עוסק מורשה",
  "VAT registration", "ע.מ." or "000000000".
- Checkout seller line shows the business name only.
- The product page's price shows no "כולל מע״מ" / "incl. VAT".

## Messages (he / en)

Added: `common.homeLink`, `contact.whatsapp.{heading,text,button,newTab}`, `common.meta.description`,
`admin.settings.business.regNumberHint`, `admin.products.required.<field>` (8 keys).
Added also: `contact.formHeadingAlt` ("או כתבו לי כאן" / "Or write to me here", only with the WhatsApp block).
Changed: `admin.settings.errors.businessRegNumber` (reworded, see T008),
`shop.home.band.sentence` (spec FR-030), `checkout.seller` ("{name}"),
`emails.order.regNumber` ("מספר עוסק: {number}" / "Business no.: {number}"),
`admin.settings.business.regNumber` ("מספר עוסק (לא חובה)" / "Business number (optional)").
Removed: `common.footer.vat`, the product `vat` label, `checkout.shop_not_ready`.
