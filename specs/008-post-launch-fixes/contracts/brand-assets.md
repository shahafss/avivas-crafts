# Contract: brand assets (`pnpm brand:assets`)

Script: `scripts/build-brand-assets.ts`, run as `pnpm brand:assets` (new `package.json` script,
same `tsx --conditions=react-server` form as `photos:home`). Research R9, R11, R12.

## Inputs

- `assets/logo/logo-original.jpg`: the owner's logo, square, at least 1000×1000. Not served.
- `assets/home-photos/hero-workshop.jpg` and its `focusX` from `src/lib/home-photos/config.ts`
  (for the preview image).
- `src/lib/brand/config.ts`: the yarn-crop square as fractions of the disc (`x`, `y`, `size`), the
  output sizes and the budgets.

## Outputs (all overwritten together, only after every file is built and within budget)

| Role | File | Size | Format | Budget |
|---|---|---|---|---|
| Header logo | `public/brand/logo-{176,224,264,336}.<hash8>.webp` | square | WebP, alpha | ≤ 40 KB each |
| Favicon | `public/favicon.ico` | 16, 32, 48 (yarn crop) | ICO with PNG entries | ≤ 20 KB |
| PNG favicon | `public/brand/icon-32.<hash8>.png` | 32 (yarn crop) | PNG, alpha | ≤ 60 KB |
| Apple touch icon | `public/brand/apple-touch-icon.<hash8>.png` | 180 (full badge) | PNG, opaque cream | ≤ 60 KB |
| Android icons | `public/brand/icon-{192,512}.<hash8>.png` | full badge, 10 % padding | PNG, opaque cream | ≤ 60 KB each |
| Web manifest | `public/site.webmanifest` | | JSON | |
| Link preview | `public/brand/og.<hash8>.jpg` | 1200×630 | JPEG q85 | ≤ 300 KB |
| Manifest | `src/lib/brand/manifest.json` | | JSON, sorted keys | |

`<hash8>`: first 8 hex characters of the file's SHA-256 (as for home photos). Every file except
`favicon.ico` and `site.webmanifest` (fixed names browsers ask for) is content-hashed, so it can be
cached for a year. The script empties `public/brand/` before writing.

`manifest.json` shape:

```json
{
  "appleTouchIcon": { "file": "apple-touch-icon.<h>.png", "width": 180, "height": 180 },
  "icon32": { "file": "icon-32.<h>.png", "width": 32, "height": 32 },
  "icons": [{ "file": "icon-192.<h>.png", "width": 192, "height": 192 }, { "...": "512" }],
  "logo": [{ "file": "logo-176.<h>.webp", "width": 176, "height": 176 }, "..."],
  "og": { "file": "og.<h>.jpg", "width": 1200, "height": 630 }
}
```

Read through `src/lib/brand/index.ts` (typed accessors that return `/brand/<file>` URLs).

## Behaviour

- Cut-out: finds the disc (its edge is the outer edge of the cream band, outside the brown ring; the
  cream band is kept) as the bounding box of non-checkerboard pixels, compares it with the expected
  centre and radius in `config.ts`, records it in `manifest.json` (`disc`), checks it is square within 2 %,
  applies an anti-aliased circular alpha mask with radius 2 px inside the disc edge, trims to the
  disc. No checkerboard pixel remains: every pixel outside the circle has alpha 0 (unit-tested on
  the built 336 px logo: the four corner pixels and points 3 px outside the disc edge have alpha 0).
- Deterministic: same inputs and same sharp version → same bytes and names.
- Exit 1 with a reason when an input is missing, too small, not square, or a budget is exceeded;
  nothing on disk is touched in that case.

## Tests

`tests/unit/brand-assets.test.ts`: the manifest lists existing files; each file's size and
dimensions match; budgets hold; logo corners are transparent; `favicon.ico` parses (header count 3,
sizes 16/32/48); `site.webmanifest` icons point at existing files.
