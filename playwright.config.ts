import { defineConfig, devices } from '@playwright/test';
import { CONSENT_PORT, E2E_PORT, serverEnv } from './tests/e2e/env';

const STOREFRONT_SPECS =
  /(^|[\\/])(cart|checkout-.*|language|privacy|catalog|order-tracking|contact|home)\.spec\.ts$/;
// The `consent` project runs on the second server: the consent test category on, no card provider.
const CONSENT_SPEC = /(consent|no-card-payment)\.spec\.ts$/;

// The app is built once by `pnpm test:e2e`; the web servers only run `pnpm start`.
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1, // one shared database
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './tests/e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${String(E2E_PORT)}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: CONSENT_SPEC,
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 7'] },
      testIgnore: CONSENT_SPEC,
    },
    {
      // Storefront specs only. Historical: admin sign-in used to need Chromium's virtual authenticator
      // (passkeys, removed in 004); it no longer does, so the owner may widen this list.
      name: 'webkit-mobile',
      use: { ...devices['iPhone 14'] },
      testMatch: STOREFRONT_SPECS,
    },
    {
      // The "second server" project (3101): consent test category and PAYMENT_PROVIDER=none.
      name: 'consent',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${String(CONSENT_PORT)}`,
      },
      testMatch: CONSENT_SPEC,
    },
  ],
  webServer: [
    {
      command: `pnpm start -p ${String(E2E_PORT)}`,
      url: `http://localhost:${String(E2E_PORT)}/api/health`,
      env: serverEnv(E2E_PORT),
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // Without this the `pnpm` wrapper is killed but `next-server` lives on and the runner never exits.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
    {
      command: `pnpm start -p ${String(CONSENT_PORT)}`,
      url: `http://localhost:${String(CONSENT_PORT)}/api/health`,
      env: {
        ...serverEnv(CONSENT_PORT),
        CONSENT_TEST_CATEGORY: 'analytics',
        // No card provider; the stray host proves the proxy ignores it under `none` (006 FR-010).
        PAYMENT_PROVIDER: 'none',
        PAYPLUS_PAYMENT_HOST: 'pay.example.test',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // Without this the `pnpm` wrapper is killed but `next-server` lives on and the runner never exits.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
  ],
});
