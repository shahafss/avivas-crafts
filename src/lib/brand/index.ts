// Typed accessors for the brand files built by `pnpm brand:assets` (contracts/brand-assets.md).
// They return the URLs under `/brand/`; the names carry a content hash, so never write one by hand.
import manifest from './manifest.json';

const BASE = '/brand/';

interface Entry {
  file: string;
  width: number;
  height: number;
}

const url = (entry: Entry): string => `${BASE}${entry.file}`;

/** URL of the header logo at one of the built widths (186, 214, 279, 321). */
export function logoSrc(size: number): string {
  const entry = manifest.logo.find((e) => e.width === size);
  if (!entry) throw new Error(`no logo of width ${String(size)} in the brand manifest`);
  return url(entry);
}

/** Size of the largest header logo file, for the `<img>` width and height attributes. */
export function logoSize(): { width: number; height: number } {
  const largest = manifest.logo.reduce((a, b) => (b.width > a.width ? b : a));
  return { width: largest.width, height: largest.height };
}

/** `srcset` value listing every header logo width. */
export function logoSrcSet(): string {
  return manifest.logo.map((e) => `${url(e)} ${String(e.width)}w`).join(', ');
}

/** The 1200x630 link-preview image. */
export function ogImage(): { url: string; width: number; height: number } {
  return { url: url(manifest.og), width: manifest.og.width, height: manifest.og.height };
}

/** The 32 px PNG favicon (yarn balls on cream). */
export function icon32(): string {
  return url(manifest.icon32);
}

/** The 180 px Apple touch icon (yarn balls on cream). */
export function appleTouchIcon(): string {
  return url(manifest.appleTouchIcon);
}
