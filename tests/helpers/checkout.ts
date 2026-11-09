// Shared by the US2 integration tests (T065, T066): a stub payment provider, a catalog fixture
// and a valid `placeOrder` input. The stub stands in for `getProvider()` (tests mock
// `@/server/payments`), so these tests do not depend on the fake adapter's internals.
import { vi } from 'vitest';
import { db } from '@/server/db/client';
import { optionValue } from '@/server/db/schema';
import { createCategory } from '@/server/catalog/categories';
import { addImage } from '@/server/catalog/images';
import { upsertOptionGroup } from '@/server/catalog/options';
import { createProduct, setProductState, updateProduct } from '@/server/catalog/products';
import type { Actor } from '@/server/catalog/result';
import { photo } from './catalog';

export interface PageInput {
  reference: string;
  amountMinor: number;
  currency: 'ILS' | 'USD';
  locale: 'he' | 'en';
  customer: { name: string; email: string; phone: string };
  description: string;
  successUrl: string;
  failureUrl: string;
  callbackUrl: string;
}

export interface ProviderStatus {
  status: 'paid' | 'failed' | 'pending';
  reference: string;
  amountMinor: number;
  currency: 'ILS' | 'USD';
  transactionId: string | null;
  method: 'card' | 'bit' | 'apple_pay' | 'google_pay' | 'other' | null;
}

/** A controllable `PaymentProvider`. */
export function createStubProvider() {
  const pages = new Map<string, { input: PageInput; status: ProviderStatus; disabled: boolean }>();
  let counter = 0;
  const state = { failDisable: false, failStatus: false, failCreate: false };

  const provider = {
    id: 'fake' as const,
    state,
    pages,
    createPaymentPage: vi.fn((input: PageInput) => {
      if (state.failCreate) return Promise.reject(new Error('provider down'));
      counter += 1;
      const pageId = `page-${String(counter)}`;
      pages.set(pageId, {
        input,
        disabled: false,
        status: {
          status: 'pending',
          reference: input.reference,
          amountMinor: input.amountMinor,
          currency: input.currency,
          transactionId: null,
          method: null,
        },
      });
      return Promise.resolve({ pageId, redirectUrl: `https://pay.test/${pageId}` });
    }),
    disablePaymentPage: vi.fn((pageId: string) => {
      if (state.failDisable) return Promise.reject(new Error('disable failed'));
      const page = pages.get(pageId);
      if (page) page.disabled = true;
      return Promise.resolve();
    }),
    verifyCallback: vi.fn(({ headers, rawBody }: { headers: Headers; rawBody: string }) => {
      if (headers.get('x-test-signature') !== 'valid') {
        return Promise.resolve({ ok: false as const, reason: 'bad_signature' as const });
      }
      try {
        const body = JSON.parse(rawBody) as { pageId?: string };
        return body.pageId === undefined
          ? Promise.resolve({ ok: false as const, reason: 'malformed' as const })
          : Promise.resolve({ ok: true as const, pageId: body.pageId });
      } catch {
        return Promise.resolve({ ok: false as const, reason: 'malformed' as const });
      }
    }),
    fetchPaymentStatus: vi.fn((pageId: string) => {
      if (state.failStatus) return Promise.reject(new Error('status unavailable'));
      const page = pages.get(pageId);
      if (!page) return Promise.reject(new Error('unknown page'));
      return Promise.resolve({ ...page.status });
    }),
    /** What the provider will report for a page from now on. */
    setStatus(pageId: string, patch: Partial<ProviderStatus>): void {
      const page = pages.get(pageId);
      if (!page) throw new Error(`no page ${pageId}`);
      page.status = { ...page.status, ...patch };
    },
    /** The page was paid with the amount and currency it was created with (unless overridden). */
    pay(pageId: string, patch: Partial<ProviderStatus> = {}): ProviderStatus {
      provider.setStatus(pageId, { status: 'paid', transactionId: `tx-${pageId}`, ...patch });
      return { ...(pages.get(pageId) as { status: ProviderStatus }).status };
    },
    lastPageId(): string {
      return [...pages.keys()].at(-1) ?? '';
    },
    /** The resume token embedded in a page's return URLs. */
    resumeToken(pageId: string): string {
      const url = (pages.get(pageId) as { input: PageInput }).input.successUrl;
      return new URL(url, 'http://localhost').searchParams.get('c') ?? '';
    },
    callbackRequest(pageId: string, signature = 'valid'): Request {
      return new Request('http://localhost/api/payments/fake/callback', {
        method: 'POST',
        headers: { 'x-test-signature': signature, 'content-type': 'application/json' },
        body: JSON.stringify({ pageId }),
      });
    },
  };
  return provider;
}
export type StubProvider = ReturnType<typeof createStubProvider>;

export interface CheckoutFixture {
  /** A product with colour options (brown +0, blond +20): base price 100. */
  doll: { id: string; slug: string; brown: string; blond: string };
  /** A product without options: price 45. */
  candle: { id: string; slug: string };
}

/** Two published products with a photo each, in a category. */
export async function seedCatalog(actor: Actor): Promise<CheckoutFixture> {
  const cat = await createCategory(actor, { nameHe: 'בובות' });
  if (!cat.ok) throw new Error('category');
  const categoryId = cat.data.id;
  async function make(
    nameHe: string,
    nameEn: string,
    price: number,
    prepHe: string,
    prepEn: string,
  ) {
    const created = await createProduct(actor, { nameHe, nameEn });
    if (!created.ok) throw new Error('product');
    await updateProduct(actor, created.data.id, {
      descriptionHe: 'תיאור',
      priceIlsMinor: price,
      categoryId,
      prepTimeHe: prepHe,
      prepTimeEn: prepEn,
    });
    await addImage(actor, created.data.id, await photo(640, 480, 90 + price / 100));
    return created.data;
  }
  const doll = await make('בובה סרוגה', 'Crocheted doll', 10000, 'כשבועיים', 'about two weeks');
  const group = await upsertOptionGroup(actor, doll.id, {
    nameHe: 'צבע שיער',
    nameEn: 'Hair colour',
    values: [
      { labelHe: 'חום', labelEn: 'Brown', deltaIlsMinor: 0 },
      { labelHe: 'בלונד', labelEn: 'Blond', deltaIlsMinor: 2000 },
    ],
  });
  if (!group.ok) throw new Error('options');
  const values = await db.select().from(optionValue);
  const idOf = (label: string): string => values.find((value) => value.labelHe === label)?.id ?? '';
  const candle = await make('נר סויה', 'Soy candle', 4500, 'כשלושה ימים', 'about three days');
  await setProductState(actor, doll.id, 'publish');
  await setProductState(actor, candle.id, 'publish');
  return {
    doll: { id: doll.id, slug: doll.slug, brown: idOf('חום'), blond: idOf('בלונד') },
    candle: { id: candle.id, slug: candle.slug },
  };
}
