# Data model: New header logo (009)

No database, settings or admin change. The only "data" is the brand configuration (code) and the
generated brand manifest (a committed JSON file). The Drizzle schema is untouched.

## Brand configuration (`src/lib/brand/config.ts`)

| Name | Value | Change | Source |
|---|---|---|---|
| `BRAND_SOURCES.logo` | `'assets/logo/logo-wordmark-original.jpg'` | changed | FR-012, FR-013 |
| `CUTOUT` | `{ spreadFrom: 6, spreadTo: 16, lumFrom: 194, lumTo: 186, holeMeanLum: 198 }` | new | D1 |
| `EXPECTED_BOX` | `{ x0: 260, y0: 416, x1: 1794, y1: 1259 }` | new (replaces `EXPECTED_DISC`) | D2 |
| `BOX_TOLERANCE_PX` | `40` (2 % of the 2000 px side) | new (replaces `DISC_TOLERANCE`) | D2 |
| `LOGO_MARGIN_PX` | `16` | new | D2 |
| `LOGO_WIDTHS` | `[186, 214, 279, 321]` | new (replaces `LOGO_SIZES`) | D3 |
| `YARN_SEED` | `{ x: 930, y: 660 }` | new | D7 |
| `EXPECTED_YARN_BOX` | `{ x0: 730, y0: 415, x1: 1404, y1: 951 }` | new (replaces `YARN_CROP`) | D7 |
| `ICON_ART_SHARE` | `0.84` (yarn art's share of an icon's side) | new (replaces `ANDROID_ICON_PADDING`) | D7 |
| `CREAM`, `CREAM_RGB` | `#faf8e9` | kept | D7 |
| `FAVICON_SIZES`, `APPLE_TOUCH_SIZE`, `ANDROID_ICON_SIZES` | 16/32/48, 180, 192/512 | kept | FR-010 |
| `OG` | `{ width: 1200, height: 630, quality: 85, card: { width: 760, height: 460, radius: 32, opacity: 0.92 }, logoWidth: 680 }` | changed | D8 |
| `BUDGETS` | logo 40 KB, favicon 20 KB, png 60 KB, og 300 KB | kept | SC-005 |
| `WEB_MANIFEST` | unchanged | kept | |
| `MASK_INSET_PX` | — | removed (no disc) | |

Removed constants must have no remaining importers (`EXPECTED_DISC`, `DISC_TOLERANCE`,
`MASK_INSET_PX`, `YARN_CROP`, `LOGO_SIZES`, `ANDROID_ICON_PADDING`).

## Brand manifest (`src/lib/brand/manifest.json`, generated)

```json
{
  "appleTouchIcon": { "file": "apple-touch-icon.<h>.png", "width": 180, "height": 180 },
  "box": { "x0": 260, "y0": 416, "x1": 1794, "y1": 1259 },
  "icon32": { "file": "icon-32.<h>.png", "width": 32, "height": 32 },
  "icons": [{ "file": "icon-192.<h>.png", "width": 192, "height": 192 }, { "...": "512" }],
  "logo": [
    { "file": "logo-186.<h>.webp", "width": 186, "height": 104 },
    { "file": "logo-214.<h>.webp", "width": 214, "height": 120 },
    { "file": "logo-279.<h>.webp", "width": 279, "height": 156 },
    { "file": "logo-321.<h>.webp", "width": 321, "height": 180 }
  ],
  "og": { "file": "og.<h>.jpg", "width": 1200, "height": 630 },
  "yarnBox": { "x0": 730, "y0": 415, "x1": 1404, "y1": 951 }
}
```

- `disc` is removed; `box` and `yarnBox` are the detected boxes (inclusive pixel coordinates in the
  source), recorded for the test and for review.
- Logo heights are `round(width × 878 / 1569)` where 1569 × 878 is the measured trimmed size (box + margin; the build detects the box 1 px wider per side than research D2);
  the real values come from the detected box, so they are whatever the script computes, and the test
  checks the ratio, not fixed numbers.
- Keys sorted, as in 008.

## Accessors (`src/lib/brand/index.ts`)

| Function | Change |
|---|---|
| `logoSrc(width)` | now takes one of `LOGO_WIDTHS` (186, 214, 279, 321) |
| `logoSrcSet()` | unchanged behaviour (lists every logo entry with `w`) |
| `logoSize()` | **new**: `{ width, height }` of the largest logo entry, for the `<img>` attributes |
| `ogImage()`, `icon32()`, `appleTouchIcon()` | unchanged (doc comments updated: yarn on cream) |
