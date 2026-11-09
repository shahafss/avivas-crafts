// The fake payment provider (tasks.md T076): its own signing and page lifecycle.
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createFakeProvider,
  fakeCallbackParts,
  readFakePage,
  setFakePageResult,
} from '@/server/payments/fake';

const state = vi.hoisted(() => ({ dir: '', appEnv: 'test' }));

vi.mock('@/server/env', () => ({
  getEnv: () => ({
    APP_ENV: state.appEnv,
    PAYMENT_PROVIDER: 'fake',
    LOCAL_DATA_DIR: state.dir,
    SECRET_HMAC_KEY: Buffer.from('fake-provider-test-hmac-key-0123456789').toString('base64'),
  }),
}));

beforeAll(async () => {
  state.dir = await mkdtemp(join(tmpdir(), 'fake-pay-'));
});
afterAll(() => rm(state.dir, { recursive: true, force: true }));

const input = {
  reference: '5c7e2b0e-6b0a-4a52-9a3a-1d5c1d9f7a11',
  amountMinor: 23000,
  currency: 'ILS' as const,
  locale: 'he' as const,
  customer: { name: 'דנה', email: 'dana@example.com', phone: '+972522345678' },
  description: 'x',
  successUrl: 'http://localhost/he/checkout/return?c=T&r=success',
  failureUrl: 'http://localhost/he/checkout/return?c=T&r=failure',
  callbackUrl: 'http://localhost/api/payments/fake/callback',
};

describe('fake provider', () => {
  it('keeps a page per file and reports pending, then paid or failed', async () => {
    const provider = createFakeProvider();
    const { pageId, redirectUrl } = await provider.createPaymentPage(input);
    expect(redirectUrl).toBe(`/he/checkout/fake-pay?page=${pageId}`);
    expect(await provider.fetchPaymentStatus(pageId)).toMatchObject({
      status: 'pending',
      reference: input.reference,
      amountMinor: 23000,
      currency: 'ILS',
      transactionId: null,
    });
    await setFakePageResult(pageId, 'paid');
    expect(await provider.fetchPaymentStatus(pageId)).toMatchObject({
      status: 'paid',
      transactionId: `fake-tx-${pageId}`,
      method: 'card',
    });
    await setFakePageResult(pageId, 'failed');
    expect((await provider.fetchPaymentStatus(pageId)).status).toBe('failed');
  });

  it('a disabled page can no longer be paid', async () => {
    const provider = createFakeProvider();
    const { pageId } = await provider.createPaymentPage(input);
    await provider.disablePaymentPage(pageId);
    expect((await readFakePage(pageId))?.disabled).toBe(true);
    expect(await setFakePageResult(pageId, 'paid')).toBeNull();
    expect((await provider.fetchPaymentStatus(pageId)).status).toBe('pending');
  });

  it('accepts only callbacks signed with the shop key', async () => {
    const provider = createFakeProvider();
    const { pageId } = await provider.createPaymentPage(input);
    const { rawBody, headers } = fakeCallbackParts(pageId);
    expect(await provider.verifyCallback({ headers: new Headers(headers), rawBody })).toEqual({
      ok: true,
      pageId,
    });
    const bad = { ok: false, reason: 'bad_signature' };
    expect(
      await provider.verifyCallback({
        headers: new Headers({ ...headers, 'x-fake-signature': 'forged' }),
        rawBody,
      }),
    ).toEqual(bad);
    expect(await provider.verifyCallback({ headers: new Headers(), rawBody })).toEqual(bad);
    // A body changed after signing no longer verifies.
    expect(
      await provider.verifyCallback({
        headers: new Headers(headers),
        rawBody: rawBody.replace(pageId, 'fp_000000000000000000000000'),
      }),
    ).toEqual(bad);
  });

  it('refuses page ids that could leave the data folder, and unknown pages', async () => {
    const provider = createFakeProvider();
    expect(await readFakePage('../../etc/passwd')).toBeNull();
    await expect(provider.fetchPaymentStatus('fp_000000000000000000000000')).rejects.toThrow();
  });

  it('refuses to load when APP_ENV=production', () => {
    state.appEnv = 'production';
    try {
      expect(() => createFakeProvider()).toThrow(/production/);
    } finally {
      state.appEnv = 'test';
    }
  });
});
