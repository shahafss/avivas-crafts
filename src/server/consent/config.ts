import 'server-only';
import type { ConsentConfig } from '@/lib/consent/registry';
import { getEnv } from '@/server/env';

/**
 * Real optional categories: none at launch. Adding one is a code change reviewed together with
 * the Cookie Policy, the registry and the CSP (`optionalScriptHosts` in src/proxy.ts).
 */
export const OPTIONAL_CATEGORIES: ConsentConfig['categories'] = [];

/** The code-defined categories, plus the test-only dummy when `CONSENT_TEST_CATEGORY=analytics`. */
export function consentConfig(): ConsentConfig {
  const test = getEnv().CONSENT_TEST_CATEGORY === 'analytics';
  const categories: ConsentConfig['categories'] = [
    ...OPTIONAL_CATEGORIES,
    ...(test ? [{ id: 'analytics' as const, scripts: [{ src: '/test-optional.js' }] }] : []),
  ];
  return { required: categories.length > 0, categories, test };
}

/** Whether visitors must be asked (and `ac_consent` exists): false at launch. */
export function consentRequired(): boolean {
  return consentConfig().required;
}
