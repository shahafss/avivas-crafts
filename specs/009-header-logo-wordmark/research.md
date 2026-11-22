# Research: New header logo (009)

All numbers below were measured on the real original, `assets/logo/logo-wordmark-original.jpg`
(2000 × 2000, 3-channel JPEG, no alpha), with sharp on 2026-11-21. Decisions are numbered D1–D9;
tasks cite them as "009 D-n".

## D1. Separating the drawing from the checkerboard

**Measured**

- Checkerboard (every pixel outside the content box, about 3.4 M pixels): channel spread
  (max − min of R, G, B) at most **6**; luminance (0.299 R + 0.587 G + 0.114 B) between **193 and
  255**, in two bands: grey squares 196–230 (peak 205–206) and white squares 231–255 (peak 253). The
  lower part of the picture has faded, noisier squares (≈ 207–236), still neutral.
- Drawing: brown lines ≈ (88, 55, 38), spread ≥ 30; pastel fills: blue heart (165, 183, 195)
  spread 30, peach needles (239, 199, 147) spread 92, green and pink yarn spread ≥ 20. One kind of
  fill is nearly neutral: the grey-blue yarn stripes inside the first ball, mean ≈ (183, 185, 183),
  spread ≤ 6, luminance ≈ 180–186, i.e. 7–10 luminance steps darker than the darkest checker pixel.
- Holes: with the rule below, 575 enclosed regions remain that are not fully opaque. 556 have a mean
  luminance below 198 (grey yarn specks inside the yarn balls, 1–2 000 px each); the other 19 (mean
  210–234) are letter counters and gaps showing the checkerboard (e.g. inside the "A" at source
  x 284–356, y 1104–1185).

**Decision**: a soft "colour-to-alpha" rule per pixel, then a hole rule:

1. `alpha = max(ramp(spread; 6 → 16), ramp(194 − luminance; 0 → 8))`, where `ramp` goes linearly
   from 0 to 1 between the two values: neutral and lighter than 194 → transparent; any colour
   (spread ≥ 16) or darker than 186 → opaque; the anti-aliased rim in between gets partial alpha.
2. Every 4-connected region of not-fully-opaque pixels that does not touch the image border is a
   hole. A hole whose mean luminance is below **198** is part of the drawing (alpha 1); one at or
   above 198 is checkerboard and keeps the alpha from step 1 (0 inside, soft at its rim).
3. Colours are kept as in the original (no un-mixing). The rim pixels are brown mixed with white or
   light grey; on the light backdrops the logo is always placed on (white bar, white backing, cream
   icons, light preview card) they read as normal anti-aliasing. The logo is never placed on a dark
   or photographic background without a light backing (D5, D8); `storefront.md` §6 records this.

The thresholds live in `src/lib/brand/config.ts` (`CUTOUT`), next to the hole limit.

**Checked**: a prototype of exactly this rule, composited on a dark navy test background (the worst
case, harsher than any real use), showed whole pastel fills, unbroken thin lines and the yarn tail,
no checker squares and no visible grey fringe; the letter counters were transparent.

**Alternatives considered**

- 008's rule (blue at least 8 below red and green): fails here; the blue heart and the grey-blue yarn
  are blue-dominant or neutral and would vanish.
- Brightness only: the near-white and grey squares overlap the pastel fills' brightness.
- Flood-filling the background from the edges and keeping everything enclosed: the letter counters
  are enclosed by brown lines and would keep their checkerboard.
- Un-mixing rim colours against the local checker colour (true matting): more code, no visible gain
  on light backdrops; rejected (constitution V).

## D2. Content box, margin and validation

**Measured**: the bounding box of rows/columns holding at least 5 drawing pixels (alpha ≥ 0.5) is
**x 260–1794, y 416–1259** (1535 × 844 px). It is the same (± 1 px) for spread thresholds 10–20 and
luminance thresholds 170–190, so it is stable.

**Decision**: trim to that box plus a **16 px** margin on every side → **1567 × 876** (the build measures 1569 × 878, box 1 px wider per side; heights 104/120/156/180) (ratio
**1.789 : 1**, not the 2.3 : 1 the spec's assumptions guessed; the spec's sizing logic still holds).
`config.ts` holds `EXPECTED_BOX = { x0: 260, y0: 416, x1: 1794, y1: 1259 }`; the script refuses a
detected box whose any edge is more than **2 % of the source side (40 px)** away from it, and
records the detected box in `manifest.json` (`box`), as 008 did with `disc`. Source must be at least
1000 × 1000 (kept); it no longer needs to be square (the check is dropped, the box is checked
instead).

## D3. Header logo size and files

The bar stays 64 px (phone) and 72 px (from 900 px), with a 1 px bottom border.

**Decision**: the logo is set by its **height**: `--logo-h` = **52 px** (phone) and **60 px**
(from 900 px). Width follows the ratio: **93 px** and **107 px**. That leaves 6 px above and below
inside the 63/71 px content height, room for the backing's padding and the focus ring (D6).

- Built widths (`LOGO_WIDTHS`): **186, 214, 279, 321** (2× and 3× of 93 and 107); heights are
  `round(width × 876 / 1567)` → 104, 120, 156, 179. WebP with alpha, quality 90, effort 6, as in 008.
- `sizes="(min-width: 900px) 107px, 93px"`; the `<img>` `width`/`height` attributes are the largest
  file's (321 × 179) so the browser reserves the right ratio; CSS sets `height: var(--logo-h)` and a fixed `width: var(--logo-w)` (93 / 107 px)
  with `object-fit: contain`, so the drawn size does not depend on which file's rounded height loads.
- Budget: **40 KB each** (008's budget, SC-005). Expected well under it (321 × 179 WebP).
- Readability: at 52 px the words "Aviva's Crafts" are about 14 px tall (they fill 26 % of the
  height); a 2× preview at that size reads clearly. The shop name is not repeated as text.
- Room at 320 px: inner width 288 px; the brand link is 93 + 2 × 8 padding = 109 px; each side
  column gets 89 px for a 44 px button. At 1024 px the brand takes 123 px of the 160 px cap in the
  width budget (`storefront.md` §7.18), so the category links keep their room.

**Alternatives**: a taller bar (out of scope per spec); keeping 008's square sizes (the image is
wide now); a `<picture>` per breakpoint (one `srcset` with `w` descriptors is enough).

## D4. Undoing the hanging badge

**Decision**: restore the pre-008 values exactly (from `git diff 2e1a8b1 f4374ec`):

- `globals.css`: delete `--logo-size` and `--logo-overhang`; add `--logo-h` (52 px / 60 px in the
  same `56.25rem` block); `scroll-padding-top: var(--header-h)`.
- `[locale]/layout.tsx` `<main>`: drop `pt-[calc(var(--logo-overhang)+8px)]` and
  `has-[>[data-full-bleed]]:pt-0` (back to no top padding).
- `p/[slug]/page.tsx` and `CheckoutForm.tsx`: `lg:top-[calc(var(--header-h)+16px)]`.
- `Header.tsx`: the link is no longer `relative`/`self-stretch`/`w-(--logo-size)`; the image is no
  longer `absolute`, `size-(--logo-size)` or `rounded-full`.

## D5. The soft backing over the home photo

**Decision** (amended 2026-11-22 by the owner after testing: the white rounded box looked bad; from
rendered examples A–E the owner chose **C, a soft white glow**, white because the scrolled bar is
white `#ffffff`): a **white glow that follows the drawing**, made with a CSS `filter` of stacked
`drop-shadow`s on the logo image. No box, no new image files.

- Only in `body:has([data-hero]) #site-header[data-at-top]`, on the image
  (`[data-testid="header-logo"]`): `filter: drop-shadow(0 0 1px #fff) drop-shadow(0 0 1px #fff)
  drop-shadow(0 0 3px rgb(255 255 255 / 0.8))` (example B, a tighter soft outline: the owner
  found C's `2px, 2px, 6px / 0.7` glow too big, 2026-11-22). Everywhere else: `filter: none`.
- The brand link keeps `inline-flex min-h-11 items-center rounded-card px-2 py-0.5` (room for the
  focus ring, no layout shift) but never gets a background or box-shadow; the 2026-11-21 box rules
  (`background-color`, `box-shadow`) are removed.
- Transition: `filter` 250 ms ease-out on the image (the header's own fade). Reduced motion: the
  existing global `transition: none !important` rule applies.
- No JavaScript: inside the existing `@media (scripting: none)` block, `filter: none` (the bar is the
  frosted white bar there). Forced colours: `filter: none` in the forced-colours block.
- Unlayered rules in `globals.css` (no `style` attributes; CSP).

**Contrast (SC-003)**: the two 1 px white shadows stacked make the pixels right next to every brown
line near-opaque white, so the line's edge reads as brown on white (≈ 8 : 1); the 3 px shadow at 0.8
softens the outer edge. Checked on rendered examples over the real hero strip (scratchpad sheet,
2026-11-22).

**Superseded (2026-11-21)**: a white rounded box (12 px corners) with a soft glow, painted on the link.
The owner rejected it after testing. Other options shown on 2026-11-22: no backing, thin white
outline (A), soft white outline (B), cream outline (D), outline plus a big halo (E).

## D6. Focus ring

**Decision** (amended 2026-11-22): the ring is drawn on the brand link: `outline: 2px solid`,
`outline-offset: 0`, following the link's rounded corners. Colour: **ink** (`var(--color-ink)`) on
the white bar (every page, and the home page once scrolled); at the top of the home page, where the
bar is see-through over the darkened photo and there is no longer a white box, the ring uses the
header's `currentColor` (`--color-on-photo`, white), which shows clearly against the dark strip. Size:
56 + 4 = 60 px tall on phones (fits the 63 px bar), never cut by the bar's edge. Forced colours: the
outline stays (system colour).

## D7. Icons

**Decision**: icons show **the yarn balls, needles and yarn tail only**, found as the connected
drawing region (8-connected, alpha ≥ 0.5) that contains a seed point inside the first yarn ball:
`YARN_SEED = { x: 930, y: 660 }`. The hearts and flowers are separate regions, so they are left out
without any hand crop.

- **Measured**: that region is 159 583 px, bounding box **x 730–1404, y 415–951** (675 × 537). The
  script refuses it when its box is more than 40 px away from `EXPECTED_YARN_BOX` in `config.ts`.
- Each icon: the region (other pixels transparent) fitted (`contain`) into a square and centred on
  cream `#faf8e9` (008's `CREAM`, kept).
  - `favicon.ico` 16/32/48 and `icon-32`: a cream **circle** (transparent corners, as in 008) with
    the yarn at 84 % of the side.
  - `apple-touch-icon` 180 and Android `icon-192`/`icon-512`: opaque cream square, yarn at 84 %
    (8 % padding each side; enough for Android's circular mask safe zone with `purpose: any`).
- Budgets unchanged (ICO ≤ 20 KB, PNG ≤ 60 KB).
- A 180 px prototype showed both balls, the needles and the tail clearly; at 16 px it is two
  coloured balls (recognisable, the best that size allows).

**Alternatives**: a fixed hand-measured square (008's `YARN_CROP`) catches heart fragments here; the
full wordmark (unreadable below 64 px).

## D8. Link-preview image

**Decision**: 1200 × 630 JPEG q85, the same hero cover crop as 008 (focus `focusX`), with a **light
card** centred on it: a rounded rectangle **760 × 460**, radius 32, `rgb(255 255 255 / 0.92)`
(drawn as an SVG composited by sharp), and the full cut-out logo fitted inside it at **680 px wide**
(≈ 380 px tall), centred. Budget 300 KB unchanged. Product pages keep their own image (no change in
`src/server/seo.ts`).

## D9. Determinism and module shape

- The cut-out (D1), box detection (D2) and yarn region (D7) are pure functions over the raw RGB
  buffer, moved into `scripts/brand-cutout.ts` so the unit test can run them on a small synthetic
  picture as well as checking the built files. The build script stays the only writer.
- Same input and same sharp version → same bytes (no randomness, no dates); file names keep the
  8-hex SHA-256; `public/brand/` is emptied and rewritten only after every file is built and within
  budget (unchanged from 008).
- `BRAND_SOURCES.logo` points at the new original. `assets/logo/logo-original.jpg` (the badge) stays
  in the repository and is no longer read by anything (FR-013).
- No new dependency (sharp is already used).
