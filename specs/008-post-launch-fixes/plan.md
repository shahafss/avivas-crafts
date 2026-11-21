# Implementation Plan: Post-launch fixes

**Branch**: `008-post-launch-fixes` | **Date**: 2026-11-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/008-post-launch-fixes/spec.md` (approved 2026-11-20)

## Summary

Nine small, mostly independent changes to the live shop:

1. Remove the production-only check that refuses orders while business details hold seed values
   (the cause of "the shop is not open for orders yet"), R1.
2. Business number: optional and nullable (migration 0007), never shown on the website, shown in
   order emails only when set; drop "includes VAT" from product prices, R2–R5.
3. Product editor: photos section first; Publish errors mark every missing field, scroll to and
   focus the first one, R6–R7.
4. Contact page: WhatsApp block first (wa.me link to the business phone), form second, R8.
5. Header: the owner's round logo replaces the text brand and hangs half below the bar; built by a
   new deterministic asset script that also cuts out the checkerboard, R9–R10.
6. New band sentence; link previews (site-wide `og:`/`twitter:` tags with a 1200×630 image and a
   description); favicon, touch icons and web manifest, R11–R12.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 24

**Primary Dependencies**: Next.js 16 (App Router), React 19, next-intl 4, Drizzle ORM (PostgreSQL),
sharp 0.35 (image builds), libphonenumber-js (phone parsing), Tailwind CSS 4. No new dependency.

**Storage**: PostgreSQL; one column change (data-model.md). Static assets in `public/`.

**Testing**: Vitest (`unit`, `integration`, `pg` projects), Playwright (desktop, phone, WebKit
projects, axe checks).

**Target Platform**: Render (Node web service), browsers per the constitution; link-preview
crawlers (WhatsApp, Facebook, Telegram).

**Project Type**: single Next.js web app (storefront + admin).

**Performance Goals**: no regression of the existing budgets (`bundle-size.spec.ts`); header logo
≤ 40 KB per variant with a responsive `srcset` and default fetch priority (does not compete with the product page's main photo); no new
client JavaScript except the product editor's scroll/focus logic (already a client island).

**Constraints**: CSP unchanged (all assets same-origin); WCAG 2.1 AA; RTL/LTR logical CSS
(`pnpm check:css`); Hebrew/English message parity (`tests/unit/i18n-parity.test.ts`).

**Scale/Scope**: ~25 source files touched, 1 migration, 1 new script, ~10 test files updated or
added.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Hebrew-first, bilingual | Every new text in he and en, owner's first-person voice; parity test | Pass |
| II. Non-technical owner | Settings hint explains where the number appears; product errors point at the field | Pass |
| III. Frictionless guest shopping | Removes a blocker to ordering; WhatsApp gives a faster contact route | Pass |
| IV. Security by design | No new endpoint; WhatsApp is a plain outbound link with `noopener noreferrer`; CSP untouched; migration is additive-safe | Pass |
| V. Simplicity, low cost | No dependency; static files instead of a dynamic OG route; reuses the home-photo build pattern | Pass |
| VI. Tested critical paths | Checkout (place-order integration test flipped), emails, settings, product publish e2e, header geometry e2e, metadata tests | Pass |
| VII. Privacy and legal | Constitution amended to 2.1.0 (owner decision 2026-11-20): VII now carries a scoped "Exception (business number)" until a lawyer reviews it; this plan follows it (number only in order emails). Other identifying details stay published. Legal drafts (Terms, Privacy) are corrected and the live pages refreshed once (T039–T040). Sample details: owner confirmed the live Settings are already filled. WhatsApp: no data passes through the shop, no tracker | Pass (under the 2.1.0 exception) |
| Product constraints: WCAG AA | Error states tied with `aria-describedby`/`aria-invalid`; WhatsApp button contrast via `forest`; logo alt text; axe in e2e | Pass |

Re-check after Phase 1: unchanged; the design adds no new data processor and no new client bundle
beyond the editor island.

## Project Structure

### Documentation (this feature)

```text
specs/008-post-launch-fixes/
├── spec.md
├── plan.md               # this file
├── research.md           # R1–R12
├── data-model.md         # business_reg_number nullable
├── quickstart.md
├── contracts/
│   ├── brand-assets.md   # pnpm brand:assets outputs and budgets
│   ├── metadata.md       # og/twitter/icon tags per page
│   └── ui.md             # test ids, geometry, messages
├── checklists/requirements.md
└── tasks.md              # /speckit-tasks
```

### Source Code (repository root)

```text
assets/logo/logo-original.jpg                 # owner's original (added at spec time, not served)
scripts/build-brand-assets.ts                 # new: pnpm brand:assets (R9, R11, R12)
public/brand/*, public/favicon.ico, public/site.webmanifest   # build outputs, committed
src/lib/brand/{config.ts,index.ts,manifest.json}              # new
src/lib/whatsapp.ts                           # new: whatsAppLink()
src/server/db/schema/commerce.ts              # business_reg_number nullable
src/server/db/migrations/0007_optional_business_number.sql   # new
src/lib/validation/settings.ts                # optionalText for the number
src/lib/business-number.ts, src/lib/seed-placeholders.ts   # new: customerRegNumber(); SEED_PLACEHOLDERS moved (re-exported by seed.ts)
src/server/checkout/place-order.ts            # remove the placeholder block
src/server/email/templates/order-parts.ts     # conditional number line
src/server/seo.ts                             # pageMetadata()
src/app/[locale]/layout.tsx                   # metadataBase, description, openGraph, icons, themeColor, main top padding
src/app/admin/layout.tsx                      # icons, manifest
src/app/[locale]/(shop)/{page,shop/page,c/[slug]/page,search/page,pages/[slug]/page,contact/page,p/[slug]/page}.tsx  # metadata helper
src/app/[locale]/(shop)/contact/page.tsx      # WhatsApp block, no number line
src/app/[locale]/(shop)/checkout/page.tsx     # seller without number
src/components/shop/{Header,Footer,CheckoutForm,BuyBox}.tsx
src/components/ui/{Price,Icon,icon-core?}.tsx # drop vatLabel; whatsapp glyph
src/components/admin/{ProductEditor,PhotoManager,OptionGroupsEditor,SettingsManager}.tsx
src/app/globals.css                           # --logo-size, --logo-overhang, header overflow
src/i18n/messages/{he,en}.json
docs/design/storefront.md, PRODUCT.md, docs/owner-guide-he.md, docs/launch-checklist.md, docs/roadmap.md
tests/unit/{brand-assets,whatsapp,seo}.test.ts
tests/integration/{place-order,order-emails,settings,schema,seed}.test.ts
tests/e2e/{storefront-layout,home,privacy,contact,admin-products,admin-settings,seo}.spec.ts
```

**Structure Decision**: the existing single-app layout; no new top-level directories except
`assets/logo/` and `public/brand/`.

## Implementation phases (for /speckit-tasks)

1. **Setup**: brand asset script + config + manifest + unit test; run it and commit outputs.
2. **US1 + US2 (P1)**: migration, validation, helper, place-order, emails, footer/contact/checkout,
   VAT label, settings hint, messages, tests.
3. **US4 + US3 (P2)**: section order, then error marking, scroll and focus, clearing; e2e.
4. **US5 (P2)**: `whatsAppLink`, icon glyph, contact page block, messages, unit + e2e.
5. **US6 (P2)**: header logo, tokens, main padding, design doc; e2e geometry.
6. **US8 + US9 + US7**: `pageMetadata`, layouts and pages, icons/manifest wiring, band sentence;
   unit + e2e.
7. **Polish**: storefront.md, PRODUCT.md, owner guide (Hebrew: number optional, WhatsApp uses the
   business phone, check legal pages for VAT / "עוסק מורשה" wording), launch checklist (lawyer
   review of the business-number decision), roadmap status, `pnpm verify`.

## Risks

- **Existing e2e specs** assert the footer number, the text brand and product section order; they
  are updated in the same tasks that change the behaviour (listed per task).
- **The owner-edited legal pages** may still say "עוסק מורשה" or "כולל מע״מ": content, not code;
  flagged in the owner guide and the final report.
- **Preview caches**: WhatsApp keeps old previews; noted in quickstart.

## Complexity Tracking

No violations. The business-number deviation is covered by the constitution 2.1.0 exception
(VII), approved by the owner on 2026-11-20 and due for lawyer review (T037).
