import 'server-only';
import { z } from 'zod';

/** Empty strings (as in `.env.example`) count as "not set". */
const optional = (schema: z.ZodType<string>) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const text = z.string().min(1);

/** An http(s) origin exactly as `new URL(v).origin` prints it: no path, no trailing slash. */
const origin = z.string().superRefine((value, ctx) => {
  let normalised: string | null = null;
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') normalised = url.origin;
  } catch {
    // falls through to the issue below
  }
  if (normalised === null || normalised !== value) {
    ctx.addIssue({
      code: 'custom',
      message: 'must be an http(s) origin without path or trailing slash, e.g. https://example.com',
    });
  }
});

const baseSchema = z.object({
  APP_ENV: z.enum(['development', 'test', 'staging', 'production']),
  APP_ORIGIN: origin,
  IMAGE_PUBLIC_ORIGIN: origin,
  DATABASE_URL: text,
  SECRET_HMAC_KEY: text
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/, {
      message: 'must be valid base64',
    })
    .refine((value) => Buffer.from(value, 'base64').length >= 32, {
      message: 'must be at least 32 bytes, base64 encoded',
    }),
  TRUSTED_PROXY_HOPS: z.preprocess(
    (value) => (value === undefined || value === '' ? 1 : Number(value)),
    z.number().int().min(0),
  ),
  STORAGE_DRIVER: z.enum(['fs', 'r2']),
  LOCAL_DATA_DIR: z.preprocess(
    (value) => (value === '' ? undefined : value),
    text.default('.data'),
  ),
  R2_ACCOUNT_ID: optional(text),
  R2_ACCESS_KEY_ID: optional(text),
  R2_SECRET_ACCESS_KEY: optional(text),
  R2_BUCKET_PRIVATE: optional(text),
  R2_BUCKET_PUBLIC: optional(text),
  R2_JURISDICTION: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['eu', 'default']).default('eu'),
  ),
  EMAIL_DRIVER: z.enum(['resend', 'outbox']),
  RESEND_API_KEY: optional(text),
  EMAIL_FROM: text,
  PAYMENT_PROVIDER: z.enum(['payplus', 'fake']),
  PAYPLUS_BASE_URL: optional(text),
  PAYPLUS_API_KEY: optional(text),
  PAYPLUS_SECRET_KEY: optional(text),
  PAYPLUS_PAYMENT_PAGE_UID: optional(text),
  PAYPLUS_PAYMENT_HOST: optional(text),
  OIDC_ISSUER: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.url().default('https://accounts.google.com'),
  ),
  GOOGLE_CLIENT_ID: text,
  GOOGLE_CLIENT_SECRET: text,
  WEBAUTHN_RP_ID: text,
  WEBAUTHN_RP_NAME: text,
  CONSENT_TEST_CATEGORY: optional(text),
});

const envSchema = baseSchema.superRefine((env, ctx) => {
  const fail = (path: string, message: string): void => {
    ctx.addIssue({ code: 'custom', path: [path], message });
  };
  const require = (names: (keyof z.infer<typeof baseSchema>)[], reason: string): void => {
    for (const name of names) {
      if (env[name] === undefined) fail(name, `is required ${reason}`);
    }
  };

  if (env.STORAGE_DRIVER === 'r2') {
    require([
      'R2_ACCOUNT_ID',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET_PRIVATE',
      'R2_BUCKET_PUBLIC',
    ], 'when STORAGE_DRIVER=r2');
  }
  if (env.EMAIL_DRIVER === 'resend') require(['RESEND_API_KEY'], 'when EMAIL_DRIVER=resend');
  if (env.PAYMENT_PROVIDER === 'payplus') {
    require([
      'PAYPLUS_BASE_URL',
      'PAYPLUS_API_KEY',
      'PAYPLUS_SECRET_KEY',
      'PAYPLUS_PAYMENT_PAGE_UID',
      'PAYPLUS_PAYMENT_HOST',
    ], 'when PAYMENT_PROVIDER=payplus');
  }

  if (env.APP_ENV === 'production') {
    if (env.PAYMENT_PROVIDER === 'fake') {
      fail('PAYMENT_PROVIDER', 'must not be "fake" when APP_ENV=production');
    }
    if (env.STORAGE_DRIVER === 'fs') {
      fail('STORAGE_DRIVER', 'must not be "fs" when APP_ENV=production');
    }
    if (!env.OIDC_ISSUER.startsWith('https://')) {
      fail('OIDC_ISSUER', 'must be an https:// URL when APP_ENV=production');
    }
    if (env.CONSENT_TEST_CATEGORY !== undefined) {
      fail('CONSENT_TEST_CATEGORY', 'must not be set when APP_ENV=production');
    }
  }

  if (env.APP_ENV === 'test') {
    if (env.STORAGE_DRIVER === 'r2') {
      fail('STORAGE_DRIVER', 'APP_ENV=test must not be combined with STORAGE_DRIVER=r2');
    }
    if (env.APP_ORIGIN.startsWith('https://')) {
      fail('APP_ORIGIN', 'APP_ENV=test must not be combined with an https:// APP_ORIGIN');
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates an environment record. Throws one error that names the offending variables and
 * the rule they break, never their values (secrets).
 */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (result.success) return result.data;
  const lines = result.error.issues.map(
    (issue) => `- ${issue.path.map(String).join('.') || '(env)'}: ${issue.message}`,
  );
  throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
}

let cached: Env | undefined;

/** Parses on first server-side use (never at build time) and memoises. */
export function getEnv(): Env {
  cached ??= parseEnv();
  return cached;
}
