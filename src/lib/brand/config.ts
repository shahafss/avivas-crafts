// Brand asset settings (specs/009-header-logo-wordmark: contracts/brand-assets.md, research D1-D3,
// D7, D8). Code, not data: read by `scripts/build-brand-assets.ts` (pnpm brand:assets) and by
// tests/unit/brand-assets.test.ts. Measured on assets/logo/logo-wordmark-original.jpg (2000x2000,
// a checkerboard drawn into the picture, no alpha); a new original needs the numbers below checked
// again (the script refuses a content box or yarn region that is more than BOX_TOLERANCE_PX off).

/** Source files, relative to the project root. */
export const BRAND_SOURCES = {
  /** The owner's wordmark logo (a checkerboard is drawn into the picture; there is no alpha). */
  logo: 'assets/logo/logo-wordmark-original.jpg',
} as const;

/**
 * Cut-out thresholds (research D1). Alpha per pixel is the larger of two ramps: colour spread
 * (max - min of R, G, B) from `spreadFrom` to `spreadTo`, and darkness (`lumFrom` - luminance) from
 * 0 to `lumFrom - lumTo`. Enclosed not-opaque regions with a mean luminance below `holeMeanLum`
 * belong to the drawing (grey yarn specks); lighter ones are checkerboard (letter counters).
 */
export const CUTOUT = {
  spreadFrom: 6,
  spreadTo: 16,
  lumFrom: 194,
  lumTo: 186,
  holeMeanLum: 198,
} as const;

/** The drawing's content box in source pixels (inclusive), as measured (research D2). */
export const EXPECTED_BOX = { x0: 260, y0: 416, x1: 1794, y1: 1259 } as const;
/** How far a detected edge may be from the expected one (2 % of the 2000 px side). */
export const BOX_TOLERANCE_PX = 40;
/** Transparent margin kept around the trimmed logo. */
export const LOGO_MARGIN_PX = 16;

/** Header logo widths (px): 2x and 3x of the 93 and 107 px drawn sizes (research D3). */
export const LOGO_WIDTHS = [186, 214, 279, 321] as const;

/** A point inside the first yarn ball, and the yarn region's box (research D7). */
export const YARN_SEED = { x: 930, y: 660 } as const;
export const EXPECTED_YARN_BOX = { x0: 730, y0: 415, x1: 1404, y1: 951 } as const;
/** The yarn art's share of an icon's side. */
export const ICON_ART_SHARE = 0.84;

/** Cream colour behind the icons. */
export const CREAM = '#faf8e9';
export const CREAM_RGB = { r: 0xfa, g: 0xf8, b: 0xe9 } as const;

export const FAVICON_SIZES = [16, 32, 48] as const;
export const APPLE_TOUCH_SIZE = 180;
export const ANDROID_ICON_SIZES = [192, 512] as const;

/** Link preview image: hero crop, a light card, the full logo on the card (research D8). */
export const OG = {
  width: 1200,
  height: 630,
  quality: 85,
  card: { width: 760, height: 460, radius: 32, opacity: 0.92 },
  logoWidth: 680,
} as const;

/** Budgets in bytes (contracts/brand-assets.md). */
export const BUDGETS = {
  logo: 40 * 1024,
  favicon: 20 * 1024,
  png: 60 * 1024,
  og: 300 * 1024,
} as const;

/** Web manifest values (R12). */
export const WEB_MANIFEST = {
  name: 'היצירות של אביבה',
  shortName: 'אביבה',
  themeColor: '#ffffff',
  startUrl: '/he',
} as const;
