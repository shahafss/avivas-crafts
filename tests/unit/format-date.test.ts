import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, isoDateInIsrael } from '@/lib/format-date';

/** Strips Unicode bidi marks and normalises no-break spaces: ICU versions place them differently. */
const clean = (value: string): string =>
  value.replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').replace(/[\u00A0\u202F]/g, ' ');

describe('formatDateTime', () => {
  it('renders winter time (UTC+2) in Israel, 24-hour, Hebrew', () => {
    // Israel's DST starts Friday 2027-03-26 at 02:00; this is the day before: UTC+2.
    expect(clean(formatDateTime(new Date('2027-03-25T12:05:00Z'), 'he'))).toBe('25.3.2027, 14:05');
  });

  it('renders summer time (UTC+3) in Israel, 24-hour, Hebrew', () => {
    expect(clean(formatDateTime(new Date('2027-03-27T12:05:00Z'), 'he'))).toBe('27.3.2027, 15:05');
  });

  it('renders English as en-GB with a 24-hour clock', () => {
    expect(clean(formatDateTime(new Date('2027-03-25T12:05:00Z'), 'en'))).toBe('25/03/2027, 14:05');
    expect(clean(formatDateTime(new Date('2027-03-27T12:05:00Z'), 'en'))).toBe('27/03/2027, 15:05');
  });

  it('rolls over to the next Israel day late in the evening UTC', () => {
    expect(clean(formatDateTime(new Date('2026-11-09T22:30:00Z'), 'he'))).toBe('10.11.2026, 00:30');
  });

  it('shows midnight as 00:xx, not 24:xx', () => {
    expect(clean(formatDateTime(new Date('2026-11-09T22:05:00Z'), 'en'))).toBe('10/11/2026, 00:05');
  });

  it('handles the autumn DST change (UTC+3 to UTC+2)', () => {
    // Israel's DST ends Sunday 2026-10-25 at 02:00 local.
    expect(clean(formatDateTime(new Date('2026-10-24T20:30:00Z'), 'he'))).toBe('24.10.2026, 23:30');
    expect(clean(formatDateTime(new Date('2026-10-25T20:30:00Z'), 'he'))).toBe('25.10.2026, 22:30');
  });
});

describe('formatDate', () => {
  it('renders only the Israel-local date', () => {
    expect(clean(formatDate(new Date('2026-11-09T22:30:00Z'), 'he'))).toBe('10.11.2026');
    expect(clean(formatDate(new Date('2027-03-27T12:05:00Z'), 'en'))).toBe('27/03/2027');
  });
});

describe('isoDateInIsrael', () => {
  it('is the Israel-local day as YYYY-MM-DD', () => {
    expect(isoDateInIsrael(new Date('2026-11-09T12:00:00Z'))).toBe('2026-11-09');
    expect(isoDateInIsrael(new Date('2027-03-27T12:05:00Z'))).toBe('2027-03-27');
  });

  it('rolls over to the next Israel day late in the evening UTC, winter and summer', () => {
    expect(isoDateInIsrael(new Date('2026-11-09T22:30:00Z'))).toBe('2026-11-10');
    expect(isoDateInIsrael(new Date('2026-07-09T21:30:00Z'))).toBe('2026-07-10');
    expect(isoDateInIsrael(new Date('2026-07-09T20:30:00Z'))).toBe('2026-07-09');
  });
});
