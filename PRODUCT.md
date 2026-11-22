# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Visitors / buyers (primary):** mostly Hebrew speakers in Israel who arrive on a phone through a shared link (WhatsApp, social media, family). They browse, pick a piece (often as a gift), and check out as guests. They never create an account. English-speaking visitors (tourists, family abroad, gift buyers) are a smaller audience.
- **Aviva, the owner and maker:** not technical. She runs the shop on her own from her phone: photographs pieces, writes Hebrew descriptions, sets prices, and handles orders. A family helper with the same permissions sometimes helps her.
- **The maintainer (a family member):** sets up the first admin, the domain, and the services, but does not use the shop day to day.

## Product Purpose

An online shop where Aviva sells the wool dolls and other wool crafts she knits and crochets by hand. Visitors can browse, order, and pay without signing in. Aviva manages products and orders herself in a Hebrew admin area.

Success means:

- Aviva publishes a product with 3 photos from her phone in under 5 minutes, without help.
- A first-time visitor on a phone gets from a product link to a confirmed order in under 3 minutes.
- Every confirmed order reaches Aviva within a minute.
- The shop runs cheaply (under ₪100/month) and quietly for years.

## Positioning

- **Hand-knitted and crocheted wool pieces by one maker.** Every doll and craft is knitted or crocheted by Aviva herself, not mass-produced.
- **Made to order.** Each piece is made after it is bought, so every product page states how long it takes to make. Stock is never tracked.
- **A local Israeli maker.** The shop is Hebrew-first, a small family business, and offers free self-pickup alongside shipping within Israel.

## Operating Context

- **Shopping:** phone-first, Hebrew RTL by default, with an English LTR version and a language switch on every page. Each language has its own shareable link.
- **Checkout:** collects only the fields an order needs. The visitor chooses shipping (flat fee, free above an amount Aviva sets) or free self-pickup, then pays online (Israeli cards, plus Bit where the provider supports it, on the provider's hosted page) or offline (Bit, PayBox, bank transfer, or cash on pickup, which Aviva confirms by hand).
- **Running the shop:** Aviva takes photos on her phone and uploads them. The admin area is Hebrew-only and mobile-first. She moves each order through New → In preparation → Shipped / Ready for pickup → Completed, or Cancelled. Customers get emails in the language they ordered in.
- **Admin sign-in:** a Google account whose role in the shop is `admin` (set with `pnpm admin:role`), protected by that account's own Google 2-step verification. One step, no passkey, no passwords stored in the shop.
- **Product range:** a few hundred products at most, grouped in categories Aviva manages (e.g. wool dolls, animals, accessories). A few products come in options such as hair color, sometimes at a different price.

## Capabilities and Constraints

- **Stack (already decided in `specs/001-online-crafts-shop/plan.md`):** Next.js 16 / TypeScript, Tailwind CSS 4, next-intl, PostgreSQL, Cloudflare R2 for images, PayPlus, and Resend, hosted on Render.
- **Bilingual:** every user-facing string comes from Hebrew and English translation files. English must be a real LTR layout, not a mirrored Hebrew one. When Aviva leaves the English text empty, the Hebrew text is shown.
- **Currency:** prices are in ₪ including VAT. USD pricing exists only for future international shipping zones, which are inactive at launch.
- **Shipping:** within Israel only at launch. Addresses, zones, and legal texts are structured for worldwide shipping later.
- **Out of scope (first version):** customer accounts, reviews, wish lists, discount codes, gift cards, marketing campaigns, WhatsApp/SMS notifications, and custom-order requests through checkout (customers contact Aviva instead).
- **Privacy and legal:** only strictly necessary storage and cookieless analytics at launch, so no consent banner appears. The consent banner is built and stays dormant until an optional cookie category is turned on. Legal pages are required in both languages before public launch, and the seller's business details appear in the footer.
- **Performance:** product and catalog pages are usable within 3 seconds on mobile 4G. Storefront first-load JavaScript is at most 150 KB gzipped. Fonts are self-hosted and no third-party scripts are loaded.
- **Security:** a strict CSP with nonces, and no inline third-party embeds. This rules out externally hosted fonts, widgets, and trackers in any design.
- **Undecided:** the shop's final name in Hebrew and English. "Aviva's Crafts" is a working name.

## Brand Commitments

- **Name:** "Aviva's Crafts" is a working name, not final. The logo exists now: the owner's wordmark ("Aviva's Crafts" with yarn balls), supplied 2026-11-21 (original in `assets/logo/`); the header shows it, inside the bar, in place of the shop name. The round badge of 2026-11-20 is retired (its original stays in `assets/logo/`). Never redraw or edit the logo.
- **Voice (decided 2026-11-07):** the shop speaks as Aviva in the first person (Hebrew feminine singular: "סרגתי", "אני שולחת"); customers are addressed in the plural ("בחרו", "הוסיפו"). English mirrors it ("I crocheted…").
- **Storefront look (approved 2026-11-16):** the Shopify-like direction of the owner's own Shopify shop: a white page, near-black green text, soft sage and dark green buttons, a peach band, a mint footer, Assistant for all text, full-width photos on the home page and square product photos. It must not feel like a childish toy store or a cold luxury boutique. The binding reference is `docs/design/storefront.md`. (This replaces the warm cream and marigold look approved 2026-11-08.)
- **Admin wording:** plain Hebrew with no jargon, and clear feedback on success and on errors. This is binding (constitution principle II).

## Evidence on Hand

- **Exists:** Aviva's own photos of finished pieces, taken on her phone. They are uploaded through the admin area, where they are re-encoded and stripped of metadata. Also three lifestyle images supplied by the owner for the home page (AI-generated from Aviva's real pieces and her real look; approved 2026-11-16).
- **Does not exist, so never fabricate:** any other brand mark (the owner's wordmark logo is the only one), any other photos of Aviva or her workspace, customer testimonials or reviews, press mentions, sales figures, or an "about" story beyond what Aviva writes herself on the editable About page.
- **Copy:** product names and descriptions are written by Aviva in Hebrew, with optional English. Legal page texts are drafts and must be reviewed by a qualified legal professional before launch.

## Product Principles

1. **The pieces are the product.** Aviva's own photos of the work carry the shop, and nothing gets in their way on a phone screen.
2. **Aviva runs it alone.** Every admin flow must work on her phone, in plain Hebrew, without help. If she has to ask the family for help, the design failed.
3. **Guest checkout with as few steps as possible.** No accounts, only the fields an order needs, and the made-to-order wait is stated up front.
4. **Hebrew first, English done properly.** RTL is the default. English is a correct LTR layout, not an afterthought.
5. **Trust through honesty.** Show real prices, preparation times, business details, and privacy behavior. Never use invented social proof or dark patterns. The owner-supplied lifestyle images on the home page are the one allowed exception to "never invent"; no other invented photos.

## Accessibility & Inclusion

- WCAG 2.1 AA in line with Israeli standard IS 5568, in both RTL and LTR. An Accessibility Statement page is required.
- The admin area must be comfortable for a non-technical user on a phone. Touch targets must be large, and photos are reordered with up/down buttons rather than drag gestures that need precision.
