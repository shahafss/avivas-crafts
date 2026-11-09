// Environment for the E2E app servers and for the helpers/global setup that run in the test
// process. Single source of truth: playwright.config.ts, global-setup.ts and fixtures.ts import it.
// Ports can be moved without editing files (e.g. when another project holds 3100):
// `E2E_PORT=3200 CONSENT_PORT=3201 pnpm exec playwright test ...`. Origins derive from them.
export const E2E_PORT = Number(process.env.E2E_PORT ?? 3100);
export const CONSENT_PORT = Number(process.env.CONSENT_PORT ?? 3101);
export const OIDC_PORT = 4011;

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/avivas_crafts_e2e';

export const LOCAL_DATA_DIR = '.data/e2e';

export function serverEnv(port: number = E2E_PORT): Record<string, string> {
  const origin = `http://localhost:${String(port)}`;
  return {
    APP_ENV: 'test',
    APP_ORIGIN: origin,
    IMAGE_PUBLIC_ORIGIN: origin,
    DATABASE_URL: E2E_DATABASE_URL,
    // Fixed test value (>= 32 bytes, base64). Never used outside tests.
    SECRET_HMAC_KEY: Buffer.from('avivas-crafts-e2e-hmac-key-do-not-use-elsewhere').toString(
      'base64',
    ),
    STORAGE_DRIVER: 'fs',
    LOCAL_DATA_DIR,
    EMAIL_DRIVER: 'outbox',
    EMAIL_FROM: 'test@example.test',
    PAYMENT_PROVIDER: 'fake',
    OIDC_ISSUER: `http://localhost:${String(OIDC_PORT)}`,
    GOOGLE_CLIENT_ID: 'e2e-google-client-id',
    GOOGLE_CLIENT_SECRET: 'e2e-google-client-secret',
    WEBAUTHN_RP_ID: 'localhost',
    WEBAUTHN_RP_NAME: 'Aviva Crafts (test)',
    TRUSTED_PROXY_HOPS: '0',
  };
}

/** Refuses to wipe a database that is not clearly an e2e one. */
export function assertE2eDatabase(url: string = E2E_DATABASE_URL): void {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  if (!name.endsWith('_e2e')) {
    throw new Error(
      `Refusing to reset database "${name}": E2E_DATABASE_URL must point to a database whose name ends in "_e2e".`,
    );
  }
}
