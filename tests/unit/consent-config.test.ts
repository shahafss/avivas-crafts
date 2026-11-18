// 003 US6 (FR-020, SC-002; contracts/consent.md > config.ts): consent is required only when an
// optional category exists, which is never at launch.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { consentConfig, consentRequired } from '@/server/consent/config';

let testCategory: string | undefined;
vi.mock('@/server/env', () => ({
  getEnv: () => ({ CONSENT_TEST_CATEGORY: testCategory }),
}));

beforeEach(() => {
  testCategory = undefined;
});

describe('consentConfig / consentRequired', () => {
  it('is not required at launch: no categories, no test dummy', () => {
    expect(consentConfig()).toEqual({ required: false, categories: [], test: false });
    expect(consentRequired()).toBe(false);
  });

  it('is required with CONSENT_TEST_CATEGORY=analytics, with the dummy script', () => {
    testCategory = 'analytics';
    expect(consentConfig()).toEqual({
      required: true,
      categories: [{ id: 'analytics', scripts: [{ src: '/test-optional.js' }] }],
      test: true,
    });
    expect(consentRequired()).toBe(true);
  });

  it('ignores any other value of CONSENT_TEST_CATEGORY', () => {
    testCategory = 'marketing';
    expect(consentRequired()).toBe(false);
  });
});
