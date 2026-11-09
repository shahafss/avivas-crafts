// PayPlus adapter (tasks.md T067), `fetch` mocked. Written before T076: it fails until
// `src/server/payments/payplus.ts` exists. API assumed of the implementation:
//   createPayPlusProvider(config: { baseUrl; apiKey; secretKey; paymentPageUid }) -> PaymentProvider
// Request and response shapes follow PayPlus's public documentation and are marked
// `// TODO confirm against sandbox` where research.md > R4 lists them as open points.
import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPayPlusProvider } from '@/server/payments/payplus';

const config = {
  baseUrl: 'https://restapidev.payplus.co.il',
  apiKey: 'api-key-SECRET-1',
  secretKey: 'secret-key-SECRET-2',
  paymentPageUid: 'page-uid-1',
};

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const pageInput = {
  reference: '5c7e2b0e-6b0a-4a52-9a3a-1d5c1d9f7a11',
  amountMinor: 23050,
  currency: 'ILS' as const,
  locale: 'he' as const,
  customer: { name: 'דנה כהן', email: 'dana@example.com', phone: '+972522345678' },
  description: "Aviva's Crafts — 2 items",
  successUrl: 'https://shop.example/he/checkout/return?c=T&r=success',
  failureUrl: 'https://shop.example/he/checkout/return?c=T&r=failure',
  callbackUrl: 'https://shop.example/api/payments/payplus/callback',
};

describe('logging', () => {
  it('never writes an API key to stdout, stderr or the console, even when every call fails', async () => {
    const written: string[] = [];
    const capture = (chunk: unknown): boolean => {
      written.push(String(chunk));
      return true;
    };
    const spies = [
      vi.spyOn(process.stdout, 'write').mockImplementation(capture),
      vi.spyOn(process.stderr, 'write').mockImplementation(capture),
      vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
        written.push(args.map(String).join(' '));
      }),
      vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
        written.push(args.map(String).join(' '));
      }),
      vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
        written.push(args.map(String).join(' '));
      }),
    ];
    try {
      fetchMock.mockResolvedValue(json({ results: { status: 'error' } }, 500));
      const provider = createPayPlusProvider(config);
      await provider.createPaymentPage(pageInput).catch(() => undefined);
      await provider.disablePaymentPage('req-1').catch(() => undefined);
      await provider.fetchPaymentStatus('req-1').catch(() => undefined);
      await provider.verifyCallback({ headers: new Headers({ hash: 'AAAA' }), rawBody: '{}' });
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
    const output = written.join('\n');
    expect(output).not.toContain(config.apiKey);
    expect(output).not.toContain(config.secretKey);
  });
});

describe('createPaymentPage', () => {
  it('sends the amount in major units with two decimals, the currency, reference and URLs', async () => {
    fetchMock.mockResolvedValue(
      json({
        results: { status: 'success', code: 0 },
        data: { page_request_uid: 'req-1', payment_page_link: 'https://pay.example/req-1' },
      }),
    );
    const result = await createPayPlusProvider(config).createPaymentPage(pageInput);
    expect(result).toEqual({ pageId: 'req-1', redirectUrl: 'https://pay.example/req-1' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${config.baseUrl}/api/v1.0/PaymentPages/generateLink`); // TODO confirm against sandbox
    expect(init.method).toBe('POST');
    const headers = new Headers(init.headers);
    expect(headers.get('api-key')).toBe(config.apiKey);
    expect(headers.get('secret-key')).toBe(config.secretKey);
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      payment_page_uid: 'page-uid-1',
      amount: 230.5,
      currency_code: 'ILS',
      more_info: pageInput.reference,
      refURL_success: pageInput.successUrl,
      refURL_failure: pageInput.failureUrl,
      refURL_callback: pageInput.callbackUrl,
      language_code: 'he',
    });
    // TODO confirm against sandbox: the amount goes out as a JSON number in major units
    // (230.5, and 97 for 97.00); whether PayPlus wants a fixed two-decimal string is unverified.
    expect(JSON.stringify(body)).toMatch(/"amount":230\.5\b/);
    expect(body.customer).toMatchObject({ customer_name: 'דנה כהן', email: 'dana@example.com' });
  });

  it('formats whole and USD amounts exactly', async () => {
    fetchMock.mockResolvedValue(
      json({
        results: { status: 'success' },
        data: { page_request_uid: 'r', payment_page_link: 'u' },
      }),
    );
    await createPayPlusProvider(config).createPaymentPage({
      ...pageInput,
      amountMinor: 9700,
      currency: 'USD',
      locale: 'en',
    });
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as {
      amount: number;
      currency_code: string;
      language_code: string;
    };
    expect(body).toMatchObject({ amount: 97, currency_code: 'USD', language_code: 'en' });
  });

  it('sets the page to expire after 24 hours', async () => {
    fetchMock.mockResolvedValue(
      json({
        results: { status: 'success' },
        data: { page_request_uid: 'r', payment_page_link: 'u' },
      }),
    );
    await createPayPlusProvider(config).createPaymentPage(pageInput);
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string,
    ) as Record<string, unknown>;
    // TODO confirm against sandbox: the expiry field name and unit (minutes) are assumptions.
    expect(body.expiry_datetime).toBe(24 * 60);
  });

  it('throws a typed error without the API keys when PayPlus refuses', async () => {
    fetchMock.mockResolvedValue(json({ results: { status: 'error', code: 1 } }, 401));
    const error = await createPayPlusProvider(config)
      .createPaymentPage(pageInput)
      .then(
        () => null,
        (caught: unknown) => caught as Error,
      );
    expect(error).toBeInstanceOf(Error);
    expect(String(error?.message)).not.toContain('SECRET');
    expect(JSON.stringify(error)).not.toContain('SECRET');
    expect(String(error?.stack)).not.toContain('SECRET');
  });

  it('times out instead of hanging (10 s) and leaks no key either', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return Promise.reject(new DOMException('The operation was aborted', 'TimeoutError'));
    });
    const error = await createPayPlusProvider(config)
      .createPaymentPage(pageInput)
      .then(
        () => null,
        (caught: unknown) => caught as Error,
      );
    expect(error).toBeInstanceOf(Error);
    expect(String(error?.message)).not.toContain('SECRET');
  });
});

describe('disablePaymentPage', () => {
  it('calls Disable Payment Link for the page', async () => {
    fetchMock.mockResolvedValue(json({ results: { status: 'success' } }));
    await createPayPlusProvider(config).disablePaymentPage('req-1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    // TODO confirm against sandbox: whether the endpoint exists and what it is called.
    expect(url).toContain('/api/v1.0/PaymentPages/');
    expect(url.toLowerCase()).toContain('disable');
    expect(init.method).toBe('POST');
    expect(init.body as string).toContain('req-1');
  });

  it('throws a typed, secret-free error on failure (callers log and ignore it)', async () => {
    fetchMock.mockResolvedValue(json({ results: { status: 'error' } }, 500));
    const error = await createPayPlusProvider(config)
      .disablePaymentPage('req-1')
      .then(
        () => null,
        (caught: unknown) => caught as Error,
      );
    expect(error).toBeInstanceOf(Error);
    expect(error?.name).not.toBe('Error'); // a named error type
    expect(`${String(error?.message)}${String(error?.stack)}`).not.toContain('SECRET');
  });
});

describe('verifyCallback', () => {
  // TODO confirm against sandbox: the HMAC input (raw body vs re-serialised JSON), research.md > R4.
  const rawBody = JSON.stringify({ transaction: { payment_page_request_uid: 'req-1' } });
  const sign = (body: string, key = config.secretKey) =>
    createHmac('sha256', key).update(body).digest('base64');
  const headers = (hash: string | null, agent: string | null = 'PayPlus') => {
    const result = new Headers();
    if (hash !== null) result.set('hash', hash);
    if (agent !== null) result.set('user-agent', agent);
    return result;
  };
  const provider = () => createPayPlusProvider(config);

  it('accepts a correct Base64 HMAC-SHA256 of the raw body from the PayPlus user agent', async () => {
    expect(await provider().verifyCallback({ headers: headers(sign(rawBody)), rawBody })).toEqual({
      ok: true,
      pageId: 'req-1',
    });
  });

  it('rejects a wrong hash, a hash of another body or key, a missing header and another user agent', async () => {
    const bad = { ok: false, reason: 'bad_signature' };
    expect(await provider().verifyCallback({ headers: headers('AAAA'), rawBody })).toEqual(bad);
    expect(
      await provider().verifyCallback({ headers: headers(sign(`${rawBody} `)), rawBody }),
    ).toEqual(bad);
    expect(
      await provider().verifyCallback({ headers: headers(sign(rawBody, 'other-key')), rawBody }),
    ).toEqual(bad);
    expect(await provider().verifyCallback({ headers: headers(null), rawBody })).toEqual(bad);
    expect(
      await provider().verifyCallback({ headers: headers(sign(rawBody), 'curl/8.0'), rawBody }),
    ).toEqual(bad);
    expect(
      await provider().verifyCallback({ headers: headers(sign(rawBody), null), rawBody }),
    ).toEqual(bad);
  });

  it('reports a signed body without a page id as malformed', async () => {
    const body = '{"nothing":true}';
    expect(
      await provider().verifyCallback({ headers: headers(sign(body)), rawBody: body }),
    ).toEqual({
      ok: false,
      reason: 'malformed',
    });
  });
});

describe('fetchPaymentStatus', () => {
  it('maps the IPN response to {status, reference, amountMinor, currency, transactionId, method}', async () => {
    fetchMock.mockResolvedValue(
      json({
        // TODO confirm against sandbox: the IPN response fields.
        results: { status: 'success' },
        data: {
          status_code: '000',
          amount: 230.5,
          currency_code: 'ILS',
          more_info: pageInput.reference,
          transaction_uid: 'tx-777',
          payment_method: 'credit-card',
        },
      }),
    );
    const status = await createPayPlusProvider(config).fetchPaymentStatus('req-1');
    expect(status).toEqual({
      status: 'paid',
      reference: pageInput.reference,
      amountMinor: 23050,
      currency: 'ILS',
      transactionId: 'tx-777',
      method: 'card',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/v1.0/PaymentPages/ipn');
    expect(init.body as string).toContain('req-1');
  });

  it('maps a declined payment to failed and a page nobody paid yet to pending', async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        results: { status: 'success' },
        data: {
          status_code: '001',
          amount: 10,
          currency_code: 'ILS',
          more_info: 'r',
          transaction_uid: 'tx-1',
        },
      }),
    );
    expect((await createPayPlusProvider(config).fetchPaymentStatus('p')).status).toBe('failed');
    fetchMock.mockResolvedValueOnce(
      json({
        results: { status: 'success' },
        data: { more_info: 'r', amount: 10, currency_code: 'ILS' },
      }),
    );
    expect(await createPayPlusProvider(config).fetchPaymentStatus('p')).toMatchObject({
      status: 'pending',
      transactionId: null,
    });
  });

  it('reports an approved page without a transaction id as paid with a null id', async () => {
    fetchMock.mockResolvedValue(
      json({
        results: { status: 'success' },
        data: { status_code: '000', amount: 10, currency_code: 'ILS', more_info: 'r' },
      }),
    );
    expect(await createPayPlusProvider(config).fetchPaymentStatus('p')).toMatchObject({
      status: 'paid',
      transactionId: null,
    });
  });

  it('never puts an API key in a thrown error', async () => {
    fetchMock.mockResolvedValue(json({ error: 'nope' }, 500));
    const error = await createPayPlusProvider(config)
      .fetchPaymentStatus('req-1')
      .then(
        () => null,
        (caught: unknown) => caught as Error,
      );
    expect(error).toBeInstanceOf(Error);
    expect(`${String(error?.message)}${String(error?.stack)}`).not.toContain('SECRET');
  });
});
