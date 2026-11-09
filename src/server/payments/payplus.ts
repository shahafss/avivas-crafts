import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  PaymentProviderError,
  type CreatePaymentPageInput,
  type PaymentMethodKind,
  type PaymentProvider,
  type PaymentStatus,
} from './provider';

/**
 * PayPlus hosted payment page (research.md R4). Request and response shapes follow PayPlus's
 * public REST documentation; every spot marked `TODO confirm against sandbox` is an open point
 * of the launch checklist. API keys travel only in request headers and never reach an error
 * message or a log line.
 */

export interface PayPlusConfig {
  baseUrl: string;
  apiKey: string;
  secretKey: string;
  paymentPageUid: string;
}

const TIMEOUT_MS = 10_000;
const PAGE_EXPIRY_MINUTES = 24 * 60;
/** Documented approval code of a successful transaction. TODO confirm against sandbox. */
const APPROVED_STATUS_CODE = '000';

interface PayPlusEnvelope {
  results?: { status?: string; code?: number };
  data?: Record<string, unknown>;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

function methodOf(value: unknown): PaymentMethodKind | null {
  const raw = str(value)?.toLowerCase().replaceAll('_', '-');
  if (raw === undefined) return null;
  if (raw === 'credit-card' || raw === 'card') return 'card';
  if (raw === 'bit') return 'bit';
  if (raw === 'apple-pay') return 'apple_pay';
  if (raw === 'google-pay') return 'google_pay';
  return 'other';
}

export function createPayPlusProvider(config: PayPlusConfig): PaymentProvider {
  const base = config.baseUrl.replace(/\/+$/, '');

  async function call(operation: string, path: string, body: unknown): Promise<PayPlusEnvelope> {
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'api-key': config.apiKey,
          'secret-key': config.secretKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (error) {
      const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
      throw new PaymentProviderError(operation, null, timedOut ? 'timeout' : 'network');
    }
    if (!response.ok) throw new PaymentProviderError(operation, response.status);
    try {
      return (await response.json()) as PayPlusEnvelope;
    } catch {
      throw new PaymentProviderError(operation, response.status, 'unreadable response');
    }
  }

  return {
    id: 'payplus',

    async createPaymentPage(input: CreatePaymentPageInput) {
      // PayPlus takes major units. TODO confirm against sandbox: JSON number vs 2-decimal string.
      const amount = Number((input.amountMinor / 100).toFixed(2));
      const result = await call('createPaymentPage', '/api/v1.0/PaymentPages/generateLink', {
        payment_page_uid: config.paymentPageUid,
        charge_method: 1,
        amount,
        currency_code: input.currency,
        more_info: input.reference,
        refURL_success: input.successUrl,
        refURL_failure: input.failureUrl,
        refURL_callback: input.callbackUrl,
        language_code: input.locale,
        // TODO confirm against sandbox: expiry field name and unit (minutes).
        expiry_datetime: PAGE_EXPIRY_MINUTES,
        customer: {
          customer_name: input.customer.name,
          email: input.customer.email,
          phone: input.customer.phone,
        },
        items: [{ name: input.description, quantity: 1, price: amount }],
      });
      const pageId = str(result.data?.page_request_uid);
      const redirectUrl = str(result.data?.payment_page_link);
      if (pageId === null || redirectUrl === null) {
        throw new PaymentProviderError('createPaymentPage', null, 'no payment link in response');
      }
      return { pageId, redirectUrl };
    },

    async disablePaymentPage(pageId) {
      // TODO confirm against sandbox: whether the endpoint exists and what it is called.
      await call('disablePaymentPage', '/api/v1.0/PaymentPages/disablePaymentLink', {
        payment_request_uid: pageId,
      });
    },

    verifyCallback({ headers, rawBody }) {
      const given = headers.get('hash');
      const agent = headers.get('user-agent');
      if (given === null || agent?.toLowerCase() !== 'payplus') {
        return Promise.resolve({ ok: false, reason: 'bad_signature' });
      }
      // TODO confirm against sandbox: the HMAC input (raw body vs re-serialised JSON), R4.
      const expected = Buffer.from(
        createHmac('sha256', config.secretKey).update(rawBody).digest('base64'),
      );
      const actual = Buffer.from(given);
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        return Promise.resolve({ ok: false, reason: 'bad_signature' });
      }
      try {
        const body = JSON.parse(rawBody) as {
          transaction?: { payment_page_request_uid?: unknown };
        };
        const pageId = str(body.transaction?.payment_page_request_uid);
        return Promise.resolve(
          pageId === null ? { ok: false, reason: 'malformed' } : { ok: true, pageId },
        );
      } catch {
        return Promise.resolve({ ok: false, reason: 'malformed' });
      }
    },

    async fetchPaymentStatus(pageId): Promise<PaymentStatus> {
      // TODO confirm against sandbox: the IPN endpoint, request body and response fields.
      const result = await call('fetchPaymentStatus', '/api/v1.0/PaymentPages/ipn', {
        payment_request_uid: pageId,
      });
      const data = result.data ?? {};
      const code = str(data.status_code);
      const amount = typeof data.amount === 'number' ? data.amount : Number(data.amount);
      const currency = str(data.currency_code);
      if (!Number.isFinite(amount) || (currency !== 'ILS' && currency !== 'USD')) {
        throw new PaymentProviderError('fetchPaymentStatus', null, 'unreadable status');
      }
      const transactionId = str(data.transaction_uid);
      // A paid page without a transaction id is reported as it is; confirmOnlinePayment waits for
      // an id, and the expiry task treats it as a status it could not verify.
      const status: PaymentStatus['status'] =
        code === null ? 'pending' : code === APPROVED_STATUS_CODE ? 'paid' : 'failed';
      return {
        status,
        reference: str(data.more_info) ?? '',
        amountMinor: Math.round(amount * 100),
        currency,
        transactionId,
        method: methodOf(data.payment_method),
      };
    },
  };
}
