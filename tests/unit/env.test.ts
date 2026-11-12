import { describe, expect, it } from 'vitest';
import { parseEnv } from '@/server/env';

const KEY = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64'); // 32 bytes

function base(extra: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    APP_ENV: 'development',
    APP_ORIGIN: 'http://localhost:3000',
    IMAGE_PUBLIC_ORIGIN: 'http://localhost:3000',
    DATABASE_URL: 'postgres://postgres:postgres@localhost:5433/avivas_crafts_dev',
    SECRET_HMAC_KEY: KEY,
    STORAGE_DRIVER: 'fs',
    EMAIL_DRIVER: 'outbox',
    EMAIL_FROM: 'shop@example.test',
    PAYMENT_PROVIDER: 'fake',
    GOOGLE_CLIENT_ID: 'id',
    GOOGLE_CLIENT_SECRET: 'secret',
    ...extra,
  };
}

const production = {
  APP_ENV: 'production',
  APP_ORIGIN: 'https://shop.example.com',
  IMAGE_PUBLIC_ORIGIN: 'https://img.example.com',
  STORAGE_DRIVER: 'r2',
  R2_ACCOUNT_ID: 'acc',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
  R2_BUCKET_PRIVATE: 'priv',
  R2_BUCKET_PUBLIC: 'pub',
  EMAIL_DRIVER: 'resend',
  RESEND_API_KEY: 're_test',
  PAYMENT_PROVIDER: 'payplus',
  PAYPLUS_BASE_URL: 'https://restapidev.payplus.co.il/api/v1.0',
  PAYPLUS_API_KEY: 'k',
  PAYPLUS_SECRET_KEY: 's',
  PAYPLUS_PAYMENT_PAGE_UID: 'uid',
  PAYPLUS_PAYMENT_HOST: 'payments.payplus.co.il',
};

describe('parseEnv', () => {
  it('accepts a valid development environment and applies defaults', () => {
    const env = parseEnv(base());
    expect(env.TRUSTED_PROXY_HOPS).toBe(1);
    expect(env.LOCAL_DATA_DIR).toBe('.data');
    expect(env.R2_JURISDICTION).toBe('eu');
    expect(env.OIDC_ISSUER).toBe('https://accounts.google.com');
  });

  it('accepts a valid production environment', () => {
    expect(parseEnv(base(production)).APP_ENV).toBe('production');
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => parseEnv(base({ DATABASE_URL: undefined }))).toThrow(/DATABASE_URL/);
  });

  it('rejects a SECRET_HMAC_KEY shorter than 32 bytes without printing it', () => {
    const short = Buffer.from('too-short-key').toString('base64');
    const run = (): unknown => parseEnv(base({ SECRET_HMAC_KEY: short }));
    expect(run).toThrow(/SECRET_HMAC_KEY/);
    try {
      run();
    } catch (error) {
      expect(String(error)).not.toContain(short);
    }
  });

  it('rejects PAYMENT_PROVIDER=fake in production', () => {
    expect(() => parseEnv(base({ ...production, PAYMENT_PROVIDER: 'fake' }))).toThrow(
      /PAYMENT_PROVIDER/,
    );
  });

  it('rejects STORAGE_DRIVER=fs in production', () => {
    expect(() => parseEnv(base({ ...production, STORAGE_DRIVER: 'fs' }))).toThrow(/STORAGE_DRIVER/);
  });

  it('rejects APP_ENV=test with STORAGE_DRIVER=r2', () => {
    const r2 = { ...production, APP_ENV: 'test', APP_ORIGIN: 'http://localhost:3100' };
    expect(() => parseEnv(base(r2))).toThrow(/APP_ENV=test/);
  });

  it('rejects APP_ENV=test with an https APP_ORIGIN', () => {
    expect(() =>
      parseEnv(base({ APP_ENV: 'test', APP_ORIGIN: 'https://shop.example.com' })),
    ).toThrow(/APP_ENV=test/);
  });

  it('accepts APP_ENV=test with fs storage and an http origin', () => {
    expect(parseEnv(base({ APP_ENV: 'test' })).APP_ENV).toBe('test');
  });

  it('requires R2 variables with the r2 driver', () => {
    expect(() => parseEnv(base({ ...production, R2_BUCKET_PUBLIC: undefined }))).toThrow(
      /R2_BUCKET_PUBLIC/,
    );
  });

  it('requires RESEND_API_KEY with the resend driver and PayPlus variables with payplus', () => {
    expect(() => parseEnv(base({ ...production, RESEND_API_KEY: undefined }))).toThrow(
      /RESEND_API_KEY/,
    );
    expect(() => parseEnv(base({ ...production, PAYPLUS_API_KEY: undefined }))).toThrow(
      /PAYPLUS_API_KEY/,
    );
  });

  it('requires an https OIDC_ISSUER in production', () => {
    expect(() => parseEnv(base({ ...production, OIDC_ISSUER: 'http://idp.example.com' }))).toThrow(
      /OIDC_ISSUER/,
    );
  });

  it('rejects CONSENT_TEST_CATEGORY in production', () => {
    expect(() => parseEnv(base({ ...production, CONSENT_TEST_CATEGORY: 'analytics' }))).toThrow(
      /CONSENT_TEST_CATEGORY/,
    );
  });

  it('rejects a negative TRUSTED_PROXY_HOPS', () => {
    expect(() => parseEnv(base({ TRUSTED_PROXY_HOPS: '-1' }))).toThrow(/TRUSTED_PROXY_HOPS/);
  });

  it('rejects origins with a trailing slash, a path or a non-http scheme', () => {
    for (const value of [
      'http://localhost:3000/',
      'https://shop.example.com/shop',
      'ftp://x.test',
    ]) {
      expect(() => parseEnv(base({ APP_ORIGIN: value }))).toThrow(/APP_ORIGIN/);
      expect(() => parseEnv(base({ IMAGE_PUBLIC_ORIGIN: value }))).toThrow(/IMAGE_PUBLIC_ORIGIN/);
    }
  });

  it('rejects a SECRET_HMAC_KEY that is not valid base64', () => {
    expect(() => parseEnv(base({ SECRET_HMAC_KEY: '!'.repeat(48) }))).toThrow(/SECRET_HMAC_KEY/);
  });
});
