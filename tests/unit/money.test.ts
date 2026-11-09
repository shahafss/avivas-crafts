import { describe, expect, it } from 'vitest';
import { addMoney, formatMoney, mulMoney } from '@/lib/money';

/** Strips Unicode bidi marks and normalises no-break spaces: ICU versions place them differently. */
const clean = (value: string): string => value.replace(/[‎‏‪-‮⁦-⁩]/g, '').replace(/[  ]/g, ' ');

describe('formatMoney', () => {
  it('formats ILS minor units in Hebrew with the shekel sign', () => {
    expect(clean(formatMoney(1999, 'ILS', 'he'))).toBe('19.99 ₪');
  });

  it('formats ILS in English with the shekel sign', () => {
    expect(clean(formatMoney(1999, 'ILS', 'en'))).toBe('₪19.99');
  });

  it('formats USD', () => {
    expect(clean(formatMoney(1250, 'USD', 'en'))).toBe('$12.50');
  });

  it('formats zero and whole amounts with two decimals', () => {
    expect(clean(formatMoney(0, 'ILS', 'he'))).toBe('0.00 ₪');
    expect(clean(formatMoney(30000, 'ILS', 'he'))).toBe('300.00 ₪');
  });

  it('formats negatives', () => {
    expect(clean(formatMoney(-500, 'ILS', 'he'))).toContain('5.00');
    expect(clean(formatMoney(-500, 'ILS', 'he'))).toContain('-');
    expect(clean(formatMoney(-500, 'USD', 'en'))).toBe('-$5.00');
  });

  it('never rounds: sub-unit digits are exact', () => {
    expect(clean(formatMoney(1, 'USD', 'en'))).toBe('$0.01');
    expect(clean(formatMoney(99999999, 'ILS', 'en'))).toBe('₪999,999.99');
  });

  it('rejects non-integer minor units', () => {
    expect(() => formatMoney(10.5, 'ILS', 'he')).toThrow();
  });
});

describe('integer arithmetic', () => {
  it('adds and multiplies integers', () => {
    expect(addMoney(1999, 1)).toBe(2000);
    expect(mulMoney(1999, 3)).toBe(5997);
  });

  it('rejects fractional operands', () => {
    expect(() => addMoney(1.5, 1)).toThrow();
    expect(() => mulMoney(10, 0.5)).toThrow();
  });
});
