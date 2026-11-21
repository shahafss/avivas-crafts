import { describe, expect, it } from 'vitest';
import { whatsAppLink } from '@/lib/whatsapp';

describe('whatsAppLink', () => {
  it.each([
    ['050-1234567', 'https://wa.me/972501234567'],
    ['+972 50 123 4567', 'https://wa.me/972501234567'],
    ['+1 415 555 2671', 'https://wa.me/14155552671'],
    ['', null],
    ['abc', null],
    ['123', null],
  ])('%j -> %j', (phone, expected) => {
    expect(whatsAppLink(phone)).toBe(expected);
  });
});
