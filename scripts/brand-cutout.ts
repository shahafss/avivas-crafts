/**
 * Pure helpers for `scripts/build-brand-assets.ts` (specs/009 contracts/brand-assets.md, research
 * D1, D2, D7): cut a drawing out of a checkerboard, find its box, find a connected region.
 * They take a raw 3-channel RGB buffer plus width and height, return plain data, read no files and
 * are deterministic.
 */

export interface CutoutSettings {
  readonly spreadFrom: number;
  readonly spreadTo: number;
  readonly lumFrom: number;
  readonly lumTo: number;
  readonly holeMeanLum: number;
}
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Content rows and columns need this many pixels of alpha >= 128 (ignores JPEG specks). */
const MIN_RUN = 5;

/** Linear 0..1 from `a` (0) to `b` (1); works for both directions. */
function ramp(value: number, a: number, b: number): number {
  const t = (value - a) / (b - a);
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/** Alpha (0-255) per pixel: drawing opaque, checkerboard transparent (research D1). */
export function cutOut(rgb: Uint8Array, w: number, h: number, cutout: CutoutSettings): Uint8Array {
  const n = w * h;
  const alpha = new Uint8Array(n);
  const lum = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const r = rgb[p * 3] ?? 0;
    const g = rgb[p * 3 + 1] ?? 0;
    const b = rgb[p * 3 + 2] ?? 0;
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    lum[p] = l;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);
    const a = Math.max(
      ramp(spread, cutout.spreadFrom, cutout.spreadTo),
      ramp(cutout.lumFrom - l, 0, cutout.lumFrom - cutout.lumTo),
    );
    alpha[p] = Math.round(a * 255);
  }

  // Holes: 4-connected regions of not-fully-opaque pixels that do not touch the border.
  const seen = new Uint8Array(n);
  const stack: number[] = [];
  for (let start = 0; start < n; start++) {
    if (seen[start] || alpha[start] === 255) continue;
    const region: number[] = [];
    let touchesBorder = false;
    let lumSum = 0;
    seen[start] = 1;
    stack.push(start);
    while (stack.length > 0) {
      const p = stack.pop() as number;
      region.push(p);
      lumSum += lum[p] ?? 0;
      const x = p % w;
      const y = (p - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touchesBorder = true;
      const next: number[] = [];
      if (x > 0) next.push(p - 1);
      if (x < w - 1) next.push(p + 1);
      if (y > 0) next.push(p - w);
      if (y < h - 1) next.push(p + w);
      for (const q of next) {
        if (!seen[q] && alpha[q] !== 255) {
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    if (!touchesBorder && lumSum / region.length < cutout.holeMeanLum) {
      for (const p of region) alpha[p] = 255;
    }
  }
  return alpha;
}

/** Inclusive box of rows/columns holding at least 5 pixels of alpha >= 128. */
export function contentBox(alpha: Uint8Array, w: number, h: number): Box {
  const rows = new Uint32Array(h);
  const cols = new Uint32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((alpha[y * w + x] ?? 0) >= 128) {
        rows[y] = (rows[y] ?? 0) + 1;
        cols[x] = (cols[x] ?? 0) + 1;
      }
    }
  }
  const extent = (counts: Uint32Array): [number, number] => {
    const first = counts.findIndex((c) => c >= MIN_RUN);
    let last = counts.length - 1;
    while (last >= 0 && (counts[last] ?? 0) < MIN_RUN) last--;
    if (first < 0 || last < first) throw new Error('no drawing found in the logo');
    return [first, last];
  };
  const [x0, x1] = extent(cols);
  const [y0, y1] = extent(rows);
  return { x0, y0, x1, y1 };
}

/** The 8-connected alpha >= 128 region holding `seed`: its mask (0/1) and inclusive box. */
export function regionFrom(
  alpha: Uint8Array,
  w: number,
  h: number,
  seed: { x: number; y: number },
): { mask: Uint8Array; box: Box } {
  const start = seed.y * w + seed.x;
  if (seed.x < 0 || seed.y < 0 || seed.x >= w || seed.y >= h || (alpha[start] ?? 0) < 128) {
    throw new Error(`the seed point (${String(seed.x)}, ${String(seed.y)}) is not on the drawing`);
  }
  const mask = new Uint8Array(w * h);
  const box: Box = { x0: seed.x, y0: seed.y, x1: seed.x, y1: seed.y };
  const stack = [start];
  mask[start] = 1;
  while (stack.length > 0) {
    const p = stack.pop() as number;
    const x = p % w;
    const y = (p - x) / w;
    if (x < box.x0) box.x0 = x;
    if (x > box.x1) box.x1 = x;
    if (y < box.y0) box.y0 = y;
    if (y > box.y1) box.y1 = y;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!mask[q] && (alpha[q] ?? 0) >= 128) {
          mask[q] = 1;
          stack.push(q);
        }
      }
    }
  }
  return { mask, box };
}
