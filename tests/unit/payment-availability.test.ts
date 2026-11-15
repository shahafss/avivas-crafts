import { describe, expect, it } from 'vitest';
import { effectivePaymentMethods } from '@/server/payments/availability';

const rows = [
  // provider, stored online, stored offline, -> online, offline, cardAvailable
  ['payplus', true, true, true, true, true],
  ['payplus', true, false, true, false, true],
  ['payplus', false, true, false, true, true],
  ['fake', true, true, true, true, true],
  ['fake', true, false, true, false, true],
  ['fake', false, true, false, true, true],
  ['none', true, true, false, true, false],
  ['none', true, false, false, true, false],
  ['none', false, true, false, true, false],
] as const;

describe('effectivePaymentMethods', () => {
  it.each(rows)(
    '%s, stored online=%s offline=%s',
    (provider, onlinePaymentEnabled, offlinePaymentEnabled, online, offline, cardAvailable) => {
      expect(
        effectivePaymentMethods({ onlinePaymentEnabled, offlinePaymentEnabled }, provider),
      ).toEqual({ online, offline, cardAvailable });
    },
  );
});
