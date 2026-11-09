import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { getEnv } from '@/server/env';
import {
  PaymentProviderError,
  type CreatePaymentPageInput,
  type PaymentProvider,
  type PaymentStatus,
} from './provider';

/**
 * The `fake` provider for tests and local development (contracts/payment-provider.md). Each page
 * is a JSON file `<LOCAL_DATA_DIR>/fake-pay/<pageId>.json`, shared by the app process and
 * `scripts/fake-pay-replay.ts`. Callbacks are signed with `SECRET_HMAC_KEY`.
 */

export const FAKE_SIGNATURE_HEADER = 'x-fake-signature';
const PAGE_ID = /^fp_[0-9a-f]{24}$/;

export interface FakePage {
  pageId: string;
  input: CreatePaymentPageInput;
  state: 'pending' | 'paid' | 'failed';
  transactionId: string | null;
  disabled: boolean;
}

function assertNotProduction(): void {
  if (getEnv().APP_ENV === 'production') {
    throw new Error('The fake payment provider is not available when APP_ENV=production');
  }
}

/** The fake provider is for development and tests only. */
export function fakeProviderAvailable(): boolean {
  const env = getEnv();
  return env.PAYMENT_PROVIDER === 'fake' && env.APP_ENV !== 'production';
}

export function isFakePageId(value: string): boolean {
  return PAGE_ID.test(value);
}

function pageFile(pageId: string): string {
  if (!isFakePageId(pageId)) throw new PaymentProviderError('fake page id');
  return join(resolve(getEnv().LOCAL_DATA_DIR, 'fake-pay'), `${pageId}.json`);
}

export async function readFakePage(pageId: string): Promise<FakePage | null> {
  try {
    return JSON.parse(await readFile(pageFile(pageId), 'utf8')) as FakePage;
  } catch {
    return null;
  }
}

async function writeFakePage(page: FakePage): Promise<void> {
  const file = pageFile(page.pageId);
  await mkdir(resolve(file, '..'), { recursive: true });
  await writeFile(file, JSON.stringify(page, null, 2));
}

function sign(rawBody: string): string {
  return createHmac('sha256', Buffer.from(getEnv().SECRET_HMAC_KEY, 'base64'))
    .update(`fake-pay:${rawBody}`)
    .digest('hex');
}

/** The body and headers of the callback the fake provider "sends" for a page. */
export function fakeCallbackParts(pageId: string): {
  rawBody: string;
  headers: Record<string, string>;
} {
  const rawBody = JSON.stringify({ pageId });
  return {
    rawBody,
    headers: { 'content-type': 'application/json', [FAKE_SIGNATURE_HEADER]: sign(rawBody) },
  };
}

/** What the visitor did on the fake page. A page that was disabled can no longer be paid. */
export async function setFakePageResult(
  pageId: string,
  result: 'paid' | 'failed',
): Promise<FakePage | null> {
  assertNotProduction();
  const page = await readFakePage(pageId);
  if (page === null || page.disabled) return null;
  const updated: FakePage = {
    ...page,
    state: result,
    transactionId: result === 'paid' ? `fake-tx-${pageId}` : page.transactionId,
  };
  await writeFakePage(updated);
  return updated;
}

export function createFakeProvider(): PaymentProvider {
  assertNotProduction();
  return {
    id: 'fake',
    async createPaymentPage(input) {
      const pageId = `fp_${randomBytes(12).toString('hex')}`;
      await writeFakePage({
        pageId,
        input,
        state: 'pending',
        transactionId: null,
        disabled: false,
      });
      return {
        pageId,
        redirectUrl: `/${input.locale}/checkout/fake-pay?page=${encodeURIComponent(pageId)}`,
      };
    },
    async disablePaymentPage(pageId) {
      const page = await readFakePage(pageId);
      if (page === null) throw new PaymentProviderError('disablePaymentPage', 404);
      await writeFakePage({ ...page, disabled: true });
    },
    verifyCallback({ headers, rawBody }) {
      const given = headers.get(FAKE_SIGNATURE_HEADER);
      const expected = Buffer.from(sign(rawBody));
      const actual = Buffer.from(given ?? '');
      if (
        given === null ||
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      ) {
        return Promise.resolve({ ok: false, reason: 'bad_signature' });
      }
      try {
        const body = JSON.parse(rawBody) as { pageId?: unknown };
        return Promise.resolve(
          typeof body.pageId === 'string' && isFakePageId(body.pageId)
            ? { ok: true, pageId: body.pageId }
            : { ok: false, reason: 'malformed' },
        );
      } catch {
        return Promise.resolve({ ok: false, reason: 'malformed' });
      }
    },
    async fetchPaymentStatus(pageId): Promise<PaymentStatus> {
      const page = await readFakePage(pageId);
      if (page === null) throw new PaymentProviderError('fetchPaymentStatus', 404);
      return {
        status: page.state,
        reference: page.input.reference,
        amountMinor: page.input.amountMinor,
        currency: page.input.currency,
        transactionId: page.state === 'paid' ? page.transactionId : null,
        method: page.state === 'paid' ? 'card' : null,
      };
    },
  };
}
