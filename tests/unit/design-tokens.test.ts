import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const REMOVED = 'ground|panel|sun|sun-hover|sun-soft|sun-ink|rose|rose-ink';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(path);
  }
  return out;
}

const globals = readFileSync(join(ROOT, 'src/app/globals.css'), 'utf8');

function themeColours(): Record<string, string> {
  const block = /@theme\s*\{([\s\S]*?)\n\}/.exec(globals)?.[1] ?? '';
  const colours: Record<string, string> = {};
  for (const m of block.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    if (m[1] !== undefined && m[2] !== undefined) colours[m[1]] = m[2];
  }
  return colours;
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r = 0, g = 0, b = 0] = channels.map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi = 0, lo = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe('removed colour names', () => {
  const utility = new RegExp(
    `\\b(bg|text|border|border-[setbx]|ring|outline|fill|stroke|from|via|to|decoration|caret|accent|divide|placeholder)-(${REMOVED})(?![\\w-])`,
  );
  const variable = new RegExp(`var\\(--color-(${REMOVED})\\)|\\(--color-(${REMOVED})\\)`);

  it('are not used anywhere in src', () => {
    const offenders: string[] = [];
    for (const file of walk(join(ROOT, 'src'))) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (utility.test(line) || variable.test(line)) {
          offenders.push(`${file.slice(ROOT.length + 1)}:${String(i + 1)}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('colour contrast of the tokens in globals.css', () => {
  const c = themeColours();
  const pairs: [string, string, number][] = [
    ['ink', 'paper', 4.5],
    ['ink-2', 'paper', 4.5],
    ['ink-2', 'photo', 4.5],
    ['ink-2', 'peach', 4.5],
    ['ink-2', 'mint', 4.5],
    ['ink-2', 'sage', 4.5],
    ['ink', 'sage', 4.5],
    ['ink', 'sage-hover', 4.5],
    ['ink', 'mint', 4.5],
    ['ink', 'peach', 4.5],
    ['paper', 'forest', 4.5],
    ['paper', 'forest-hover', 4.5],
    ['alert', 'paper', 4.5],
    ['alert', 'photo', 4.5],
    ['alert', 'peach', 4.5],
    ['alert', 'sage', 4.5],
    ['field', 'paper', 3],
    ['field', 'photo', 3],
    ['forest', 'photo', 3],
    ['forest', 'paper', 3],
  ];

  it.each(pairs)('%s on %s is at least %s:1', (fg, bg, min) => {
    const fgHex = c[fg];
    const bgHex = c[bg];
    if (fgHex === undefined || bgHex === undefined)
      throw new Error(`--color-${fg} or --color-${bg} missing`);
    expect(contrast(fgHex, bgHex)).toBeGreaterThanOrEqual(min);
  });
});

describe('scrims over photos (research D4)', () => {
  function scrim(name: string): number {
    const value = new RegExp(`--${name}:\\s*([0-9.]+)\\s*;`).exec(globals)?.[1];
    if (value === undefined) throw new Error(`--${name} missing`);
    return Number(value);
  }
  // Worst case: pure white photo pixel darkened by black at alpha a; on-photo text is white.
  function worst(alpha: number): number {
    const v = Math.round(255 * (1 - alpha));
    const hex = `#${v.toString(16).padStart(2, '0').repeat(3)}`;
    return contrast('#FFFFFF', hex);
  }

  it('--scrim-large gives large text and icons at least 3:1', () => {
    expect(worst(scrim('scrim-large'))).toBeGreaterThanOrEqual(3.0);
  });

  it('--scrim-text gives normal text at least 4.5:1', () => {
    expect(worst(scrim('scrim-text'))).toBeGreaterThanOrEqual(4.5);
  });

  // 007 research D20: the hero's top band must be dark enough behind the see-through header
  // (small text), then end at 0 (nothing but the large-text band below the header).
  describe('.scrim-band-top gradient', () => {
    const rule = /\.scrim-band-top\s*\{([\s\S]*?)\}/.exec(globals)?.[1] ?? '';
    const stopPattern =
      /(?:rgb\(\s*0\s+0\s+0\s*\/\s*(var\(--[a-z-]+\)|[0-9.]+)\s*\)|(transparent))\s*(var\(--[a-z-]+\)|[0-9.]+(?:px|%|rem)?)?/g;
    const stops = [...rule.matchAll(stopPattern)].map((m) => ({
      alpha: m[2] === undefined ? (m[1] ?? '') : '0',
      at: m[3] ?? '',
    }));
    const resolve = (alpha: string) =>
      alpha.startsWith('var(') ? scrim(alpha.slice(6, -1)) : Number(alpha);

    it('has a gradient with colour stops', () => {
      expect(stops.length).toBeGreaterThanOrEqual(2);
    });

    it('starts at or above --scrim-text', () => {
      expect(resolve(stops[0]?.alpha ?? 'NaN')).toBeGreaterThanOrEqual(scrim('scrim-text'));
    });

    it('is --scrim-text at var(--header-h)', () => {
      const atHeader = stops.filter((s) => s.at === 'var(--header-h)');
      expect(atHeader.length).toBeGreaterThan(0);
      expect(atHeader.map((s) => resolve(s.alpha))).toContain(scrim('scrim-text'));
    });

    it('ends at 0', () => {
      const last = stops[stops.length - 1];
      expect(resolve(last?.alpha ?? 'NaN')).toBe(0);
    });
  });
});
