import { describe, expect, it } from 'vitest';
import en from '@/i18n/messages/en.json';
import he from '@/i18n/messages/he.json';
import { globalErrorMessages } from '@/i18n/global-error-messages';

const NAMESPACES = [
  'common',
  'shop',
  'cart',
  'checkout',
  'order',
  'admin',
  'emails',
  'errors',
  'consent',
  'legal',
  'contact',
];

function flatten(value: unknown, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  if (typeof value === 'string') {
    result.set(prefix, value);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      for (const [path, text] of flatten(child, prefix === '' ? key : `${prefix}.${key}`)) {
        result.set(path, text);
      }
    }
  }
  return result;
}

/** Index of the `}` that closes the `{` at `open`. */
function closingBrace(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return text.length;
}

function collectArguments(text: string, names: Set<string>): void {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{') continue;
    const end = closingBrace(text, i);
    const body = text.slice(i + 1, end);
    const head = /^\s*([A-Za-z_]\w*)\s*(?:,\s*(\w+)\s*(?:,|$))?/.exec(body);
    if (head?.[1] !== undefined) names.add(head[1]);
    if (head?.[2] !== undefined && /^(plural|select|selectordinal)$/.test(head[2])) {
      // `selector {branch}` pairs: read the branches, not the selectors.
      const branches = body.slice(head[0].length);
      for (let j = 0; j < branches.length; j += 1) {
        if (branches[j] !== '{') continue;
        const branchEnd = closingBrace(branches, j);
        collectArguments(branches.slice(j + 1, branchEnd), names);
        j = branchEnd;
      }
    }
    i = end;
  }
}

/** Names of the ICU arguments in a message (`{name}`, `{count, plural, …}`), sorted. */
function placeholders(message: string): string[] {
  const names = new Set<string>();
  collectArguments(message, names);
  return [...names].sort();
}

const heFlat = flatten(he);
const enFlat = flatten(en);

describe('message files', () => {
  it('have all namespaces in both languages', () => {
    expect(Object.keys(he).sort()).toEqual([...NAMESPACES].sort());
    expect(Object.keys(en).sort()).toEqual([...NAMESPACES].sort());
  });

  it('have identical key sets', () => {
    expect([...heFlat.keys()].sort()).toEqual([...enFlat.keys()].sort());
  });

  it('have no empty strings', () => {
    for (const [name, flat] of [
      ['he', heFlat],
      ['en', enFlat],
    ] as const) {
      const empty = [...flat].filter(([, text]) => text.trim() === '').map(([key]) => key);
      expect(empty, `${name}.json has empty strings`).toEqual([]);
    }
  });

  it('read ICU arguments correctly', () => {
    expect(placeholders('{a} and {b}')).toEqual(['a', 'b']);
    expect(placeholders('{count, plural, =0 {empty} one {# {thing}} other {# items}}')).toEqual([
      'count',
      'thing',
    ]);
    expect(placeholders('no arguments')).toEqual([]);
  });

  it('use the same ICU placeholders per key', () => {
    const mismatched: string[] = [];
    for (const [key, text] of heFlat) {
      const other = enFlat.get(key);
      if (other === undefined) continue;
      if (placeholders(text).join('|') !== placeholders(other).join('|')) mismatched.push(key);
    }
    expect(mismatched).toEqual([]);
  });

  it('keep global-error.tsx strings in step with errors.generic', () => {
    expect(globalErrorMessages.he).toEqual(he.errors.generic);
    expect(globalErrorMessages.en).toEqual(en.errors.generic);
  });
});
