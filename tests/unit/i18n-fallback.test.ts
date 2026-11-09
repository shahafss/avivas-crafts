import { describe, expect, it } from 'vitest';
import { fallbackAttrs, pick } from '@/lib/i18n-fallback';

describe('pick', () => {
  it('returns the English text on English pages when it is not empty', () => {
    expect(pick('en', 'שלום', 'Hello')).toEqual({ text: 'Hello', lang: 'en', fallback: false });
  });

  it('falls back to Hebrew, marked as a fallback, when the English text is missing or blank', () => {
    for (const en of [null, undefined, '', '   ']) {
      expect(pick('en', 'שלום', en)).toEqual({ text: 'שלום', lang: 'he', fallback: true });
    }
  });

  it('always returns the Hebrew text on Hebrew pages, without a fallback mark', () => {
    expect(pick('he', 'שלום', 'Hello')).toEqual({ text: 'שלום', lang: 'he', fallback: false });
    expect(pick('he', 'שלום', null)).toEqual({ text: 'שלום', lang: 'he', fallback: false });
  });

  it('returns an empty text when there is no text at all', () => {
    expect(pick('en', null, null).text).toBe('');
  });
});

describe('fallbackAttrs', () => {
  it('sets lang and dir only for Hebrew fallback text', () => {
    expect(fallbackAttrs(pick('en', 'שלום', null))).toEqual({ lang: 'he', dir: 'auto' });
    expect(fallbackAttrs(pick('en', 'שלום', 'Hello'))).toEqual({});
    expect(fallbackAttrs(pick('he', 'שלום', null))).toEqual({});
  });
});
