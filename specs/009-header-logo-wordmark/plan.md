# Implementation Plan: New header logo

**Branch**: `009-header-logo-wordmark` | **Date**: 2026-11-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-header-logo-wordmark/spec.md`

## Summary

Replace 008's round badge with the owner's new wordmark logo ("Aviva's Crafts" with two yarn balls,
needles, hearts and flowers) everywhere. Technically:

1. **Asset step** (`pnpm brand:assets`): read the new original, cut the drawing out of the baked-in
   checkerboard with a colour/saturation rule plus a hole rule (research D1), trim to the measured
   content box with a 16 px margin (D2), and build wide header logos (D3), yarn-ball icons on cream
   from the yarn's connected region (D7) and a link preview with the full logo on a light card over the
   hero photo (D8). Deterministic, same budgets as 008.
2. **Header**: the logo sits inside the bar, centred where the brand is today, 52 px tall (60 px
   from 900 px); every 008 change made for the hanging half is reverted to the pre-008 values (D4).
3. **Backing**: on the home page's see-through header only, the brand link shows a white rounded box with a
   soft glow (D5); the focus ring is an ink outline on the backing (D6).
4. **Tests and docs**: rewrite the 008 brand unit test and the `logo:` E2E tests for the new
   geometry and backing; update `storefront.md`, `PRODUCT.md` and the owner guide.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 22 (as in the repo)

**Primary Dependencies**: Next.js 16 (App Router, React Server Components), next-intl, Tailwind CSS 4,
sharp (asset step, already a dependency). No new dependency.

**Storage**: none (no database, settings or admin change). Files: `public/brand/*`, `public/favicon.ico`,
`public/site.webmanifest`, `src/lib/brand/manifest.json` (all generated and committed).

**Testing**: Vitest (unit: `tests/unit/brand-assets.test.ts`, new cases for the cut-out functions),
Playwright E2E (`tests/e2e/storefront-layout.spec.ts`, `home.spec.ts`, `seo.spec.ts`), `pnpm verify`.

**Target Platform**: Render web service (production `main`), modern evergreen browsers; mobile-first.

**Project Type**: web application (single Next.js project).

**Performance Goals**: header logo files ≤ 40 KB each (SC-005, unchanged budget); icons and preview
within 008's budgets; no layout shift (the `<img>` carries width/height; the backing never changes size).

**Constraints**: strict CSP (no `style` attributes; all styling via classes and `globals.css`);
logical properties only; RTL/LTR; WCAG 2.1 AA (focus ring visible, contrast ≥ 3 : 1 for the logo's
lines on the backing, SC-003); header heights stay 64/72 px; E2E locally one spec file at a time.

**Scale/Scope**: about 10 source files, 3 test files, 3 docs, generated brand files.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design: still passes.*

| Principle | How this plan meets it |
|---|---|
| I. Hebrew-first, bilingual | No new visible text. The accessible name stays the image `alt` (shop name from settings, Hebrew fallback with `lang="he"` on the img) + the existing `common.homeLinkSuffix` in both languages (FR-005, FR-015). The backing box uses logical padding; the header order already follows reading direction. |
| II. Non-technical owner | No admin change. The owner guide gains a short Hebrew note on where the logo appears and that changing it is a developer task. |
| III. Frictionless guest shopping / mobile-first | Phone sizes chosen first (52 px logo at 320 px leaves 89 px per side column); sticky panels and anchor jumps go back to the bar's edge. |
| IV. Security by design | CSP unchanged: no inline styles, all new CSS in `globals.css`; images are served from `public/brand/` (static, non-executable); generated images carry no metadata (existing `check-image-metadata` test kept). No new route, input or secret. |
| V. Simplicity and low cost | Reuses 008's script, manifest and accessors; no new dependency or service. The cut-out is the smallest rule that works on the measured picture (D1 lists the simpler rules that fail). |
| VI. Tested critical paths | Checkout and product-page sticky offsets and the checkout error-link scroll are E2E-tested; brand files unit-tested; all existing suites must pass (SC-006). |
| VII. Privacy and legal | No personal data, cookies or third parties touched. |
| Product constraints | Images optimised (WebP, budgets); WCAG AA (contrast ≈ 8.5 : 1 worst case on the backing, focus ring, forced colours); preview image for sharing kept. |
| Development workflow | `storefront.md` §3.6, §4, §6, §7.18, §10 and §14 updated in this branch; `docs/roadmap.md` status updated at the end; frozen `specs/001` untouched; no git actions by tooling. |

No violations; Complexity Tracking is empty.

## Project Structure

### Documentation (this feature)

```text
specs/009-header-logo-wordmark/
├── spec.md
├── plan.md              # this file
├── research.md          # D1–D9, with the measured numbers
├── data-model.md        # brand config and manifest changes (no database)
├── quickstart.md        # how to check the feature by hand and by test
├── contracts/
│   ├── brand-assets.md  # pnpm brand:assets inputs, outputs, behaviour, tests (replaces 008's)
│   └── ui.md            # header logo, backing, focus, layout contract
├── checklists/
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
assets/logo/
├── logo-original.jpg            # 008 badge: kept, no longer read (FR-013)
└── logo-wordmark-original.jpg   # new original (input)

scripts/
├── build-brand-assets.ts        # adapted: new source, cut-out, wide logos, yarn icons, card preview
└── brand-cutout.ts              # NEW: pure cut-out / box / yarn-region functions (D1, D2, D7, D9)

src/lib/brand/
├── config.ts                    # new constants (CUTOUT, EXPECTED_BOX, MARGIN, LOGO_WIDTHS, YARN_SEED, …)
├── index.ts                     # accessors: logoSrc/logoSrcSet + logoSize(); others unchanged
└── manifest.json                # regenerated (box, yarnBox, wide logo entries)

public/brand/*, public/favicon.ico, public/site.webmanifest   # regenerated

src/app/globals.css                          # tokens, scroll padding, backing, focus, no-JS, forced colours
src/app/[locale]/layout.tsx                  # <main> top padding back to pre-008
src/app/[locale]/(shop)/p/[slug]/page.tsx    # sticky top back to header-h + 16
src/components/shop/CheckoutForm.tsx         # sticky top back to header-h + 16
src/components/shop/Header.tsx               # logo inside the bar

tests/unit/brand-assets.test.ts              # rewritten for the wordmark
tests/e2e/storefront-layout.spec.ts          # 008 logo tests → 009 logo tests; brand width limits
tests/e2e/home.spec.ts                       # backing at top / gone when scrolled / no-JS
tests/e2e/seo.spec.ts                        # unchanged patterns; re-run

docs/design/storefront.md, PRODUCT.md, docs/owner-guide-he.md, docs/roadmap.md
```

**Structure Decision**: single Next.js project as today; one new helper module
`scripts/brand-cutout.ts` (flat, like `scripts/check-image-metadata.ts`, which tests already import)
so the cut-out logic can be unit-tested without running the whole build.

## Design overview (details in research and contracts)

- **Cut-out** (D1): `alpha = max(ramp(spread 6→16), ramp(194 − lum, 0→8))`; enclosed not-opaque
  regions with mean luminance < 198 become opaque; colours kept.
- **Box** (D2): measured x 260–1794, y 416–1259; margin 16 → 1567 × 876 (1.789 : 1); refuse > 40 px drift.
- **Header** (D3, D4): `--logo-h` 52/60 px; files 186/214/279/321 px wide; link box 8/2 px padding;
  all 008 overhang code reverted.
- **Backing** (D5): home `data-at-top` only: `rgb(255 255 255 / 0.9)` + white glow shadow; 250 ms
  fade; off without JS and in forced colours.
- **Focus** (D6): ink 2 px outline on the backing, offset 0, every state.
- **Icons** (D7): yarn region from seed (930, 660), box x 730–1404, y 415–951, on cream; circle for
  favicon sizes, square for touch/Android.
- **Preview** (D8): hero crop + 760 × 460 white card (0.92, radius 32) + logo 680 px wide.

## Complexity Tracking

None.
