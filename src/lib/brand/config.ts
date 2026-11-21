// Brand asset settings (contracts/brand-assets.md, research R9, R11, R12). Code, not data: read by
// `scripts/build-brand-assets.ts` (pnpm brand:assets) and by tests/unit/brand-assets.test.ts.
// Measured on assets/logo/logo-original.jpg (2000x2000); a new original of the same design needs
// the numbers below checked again (the script refuses a disc that is more than 2 % off).

/** Source files, relative to the project root. */
export const BRAND_SOURCES = {
  /** The owner's logo (a checkerboard is drawn into the picture; there is no alpha channel). */
  logo: 'assets/logo/logo-original.jpg',
} as const;

/** Header logo widths (px), square. */
export const LOGO_SIZES = [176, 224, 264, 336] as const;

/** Cream colour of the badge (sampled inside the disc), used behind the opaque icons. */
export const CREAM = '#faf8e9';
export const CREAM_RGB = { r: 0xfa, g: 0xf8, b: 0xe9 } as const;

/**
 * The disc as measured by hand on the original, in source pixels: the outer edge of the cream band
 * (outside the brown ring; the band is kept).
 */
export const EXPECTED_DISC = { cx: 1000, cy: 994.5, r: 824 } as const;
/** How far the detected disc may differ from the expected one (fraction of the radius). */
export const DISC_TOLERANCE = 0.02;
/** The cut-out mask is this many source pixels smaller than the disc (drops a checker fringe). */
export const MASK_INSET_PX = 2;

/**
 * The yarn crop (two yarn balls and needles) as fractions of the disc's bounding square:
 * `x`, `y` = top-left corner, `size` = side. Used for the favicon sizes.
 */
export const YARN_CROP = { x: 0.34, y: 0.105, size: 0.38 } as const;
export const FAVICON_SIZES = [16, 32, 48] as const;

export const APPLE_TOUCH_SIZE = 180;
export const ANDROID_ICON_SIZES = [192, 512] as const;
/** Padding around the full badge on the 192 and 512 icons (fraction of the icon's side). */
export const ANDROID_ICON_PADDING = 0.1;

/** Link preview image. */
export const OG = { width: 1200, height: 630, logoSize: 420, quality: 85 } as const;

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
