import { describe, expect, it } from 'vitest';
import { customerRegNumber } from '@/lib/business-number';

describe('customerRegNumber', () => {
  it.each([
    [null, null],
    ['', null],
    ['  ', null],
    ['000000000', null],
    [' 000000000 ', null],
    [' 123 ', '123'],
    ['515151515', '515151515'],
  ])('%j gives %j', (input, expected) => {
    expect(customerRegNumber({ businessRegNumber: input })).toBe(expected);
  });
});
