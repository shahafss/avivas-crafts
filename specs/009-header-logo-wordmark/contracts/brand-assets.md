# Contract: brand assets (`pnpm brand:assets`), 009

Replaces `specs/008-post-launch-fixes/contracts/brand-assets.md` for the wordmark logo. Same script
(`scripts/build-brand-assets.ts`), same command, same output folder and hashing. Research D1–D9.

## Inputs

- `assets/logo/logo-wordmark-original.jpg`: the owner's wordmark logo, at least 1000 × 1000, with a
  light grey/white checkerboard drawn into it and no alpha. Not served.
- `assets/home-photos/hero-workshop.jpg` and its `focusX` (`src/lib/home-photos/config.ts`) for the
  preview image (unchanged).
- `src/lib/brand/config.ts` (data-model.md): cut-out thresholds, expected boxes, seed, sizes,
  budgets.
- `assets/logo/logo-original.jpg` (008 badge) is **not** read any more (FR-013).

## Pure functions (`scripts/brand-cutout.ts`)

All take a raw 3-channel RGB buffer plus width and height and return plain data; no file access.

| Function | Returns | Rule |
|---|---|---|
| `cutOut(rgb, w, h, cutout)` | `Uint8Array` alpha (0–255), one per pixel | D1 steps 1–2 |
| `contentBox(alpha, w, h)` | `{ x0, y0, x1, y1 }` | rows/columns with ≥ 5 pixels of alpha ≥ 128 (D2) |
| `regionFrom(alpha, w, h, seed)` | `{ mask: Uint8Array, box }` | 8-connected alpha ≥ 128 region holding `seed` (D7) |

Errors are thrown as the script's `BuildError` (exit 1 with a plain reason).

## Outputs (all written together, only after every file is built and within budget)

| Role | File | Size | Format | Budget |
|---|---|---|---|---|
| Header logo | `public/brand/logo-{186,214,279,321}.<hash8>.webp` | width as named, height `round(w × H/W)` of the trimmed logo | WebP, alpha | ≤ 40 KB each |
| Favicon | `public/favicon.ico` | 16, 32, 48 (yarn on a cream circle) | ICO with PNG entries | ≤ 20 KB |
| PNG favicon | `public/brand/icon-32.<hash8>.png` | 32 (yarn on a cream circle) | PNG, alpha | ≤ 60 KB |
| Apple touch icon | `public/brand/apple-touch-icon.<hash8>.png` | 180 (yarn on cream, 84 %) | PNG, opaque | ≤ 60 KB |
| Android icons | `public/brand/icon-{192,512}.<hash8>.png` | yarn on cream, 84 % | PNG, opaque | ≤ 60 KB each |
| Web manifest | `public/site.webmanifest` | | JSON (unchanged shape) | |
| Link preview | `public/brand/og.<hash8>.jpg` | 1200 × 630: hero crop + light card + full logo | JPEG q85 | ≤ 300 KB |
| Manifest | `src/lib/brand/manifest.json` | | JSON, sorted keys (data-model.md) | |

## Behaviour

1. Check inputs exist; the logo is at least 1000 × 1000 (no squareness check); the hero is at least
   1200 × 630.
2. `cutOut` → alpha. `contentBox` → box; refuse when any edge differs from `EXPECTED_BOX` by more
   than `BOX_TOLERANCE_PX` (message names the detected and expected boxes).
3. Trim the RGBA image to the box plus `LOGO_MARGIN_PX` on each side (clamped to the image). Every
   pixel in the margin is near-transparent (a few stray specks below the 5-pixel row/column rule
   reach alpha ~50 in the source; invisible). Measured trimmed size: 1569 × 878.
4. Header logos: resize the trimmed RGBA to each `LOGO_WIDTHS` width (height by ratio), WebP q90,
   effort 6, `alphaQuality` 100.
5. Yarn: `regionFrom(alpha, …, YARN_SEED)`; refuse when its box edges differ from
   `EXPECTED_YARN_BOX` by more than `BOX_TOLERANCE_PX`. Icon art = the original RGB with alpha =
   region mask × cut-out alpha, cropped to the region's box.
6. Icons: art fitted (`contain`, transparent padding) into `round(size × ICON_ART_SHARE)` and
   centred on cream; favicon sizes and `icon-32` are then circle-masked (anti-aliased, radius
   `size / 2`); touch and Android icons stay opaque squares.
7. Preview: 008's hero cover crop around `focusX`; composite an SVG rounded rectangle (`OG.card`,
   white at `OG.card.opacity`) centred, then the trimmed logo resized to `OG.logoWidth` wide, centred
   on the card; flatten; JPEG q85.
8. Budgets checked; then empty `public/brand/`, write all files, `favicon.ico`, `site.webmanifest`
   and `manifest.json`; print each file with size, and the two boxes.
9. Deterministic: same inputs and sharp version → same bytes and names. No timestamps.

## Tests (`tests/unit/brand-assets.test.ts`)

Kept from 008: manifest lists existing files with real dimensions and hashed names; budgets; ICO
structure (16/32/48 PNG entries); `site.webmanifest` icons exist; preview is a 1200 × 630 JPEG; no
EXIF/XMP in any output.

Changed / new:

- Logo entries: widths `[186, 214, 279, 321]`; each `height / width` equals the trimmed ratio within
  one pixel of rounding; all WebP with an alpha channel.
- Recorded `box` and `yarnBox` are within `BOX_TOLERANCE_PX` of the expected ones (replaces the disc
  test).
- Built 321 px logo: the whole outer frame (first and last row and column) has alpha ≤ 8 (resize
  ringing; leftover checker would read ~255); a point inside the "A" counter (source ≈ (320, 1145),
  mapped to output coordinates) has alpha ≤ 8; a point in
  the first yarn ball (source (930, 660)) and a point in the grey-blue yarn (source ≈ (1000, 646))
  have alpha 255.
- No checkerboard left: in the built 321 px logo, fewer than 0.5 % of pixels with alpha ≥ 128 are
  light neutral (spread ≤ 6 and luminance ≥ 200).
- `cutOut` on a small synthetic picture (80 × 40, 8 px checker squares 206/253, a brown ring
  enclosing a neutral 190 grey fill, a brown ring enclosing checker squares): checker → 0, brown →
  255, enclosed 190 fill → 255 (only the hole rule makes it opaque), enclosed checker → 0.
- Icons: corner pixel of `apple-touch-icon` and `icon-512` is cream (`#faf8e9` ± 2); corner of
  `icon-32` has alpha 0, centre alpha 255.
- Preview: a point on the card away from the logo (250, 100) is light (luminance ≥ 200), the image
  centre (on the logo's brown outline) is dark (luminance < 100, the logo is there), and the image is
  not flat (a channel's standard deviation > 20: the hero photo is there).
