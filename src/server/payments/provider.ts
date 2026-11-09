import 'server-only';

/** contracts/payment-provider.md: the only surface the shop knows of a payment provider. */

export type PaymentCurrency = 'ILS' | 'USD';
export type PaymentMethodKind = 'card' | 'bit' | 'apple_pay' | 'google_pay' | 'other';

export interface CreatePaymentPageInput {
  /** `pending_checkout.id`. */
  reference: string;
  /** Total incl. delivery, in currency minor units. */
  amountMinor: number;
  currency: PaymentCurrency;
  /** Provider page language. */
  locale: 'he' | 'en';
  /** Pre-fill only. */
  customer: { name: string; email: string; phone: string };
  description: string;
  successUrl: string;
  failureUrl: string;
  callbackUrl: string;
}

export interface PaymentStatus {
  status: 'paid' | 'failed' | 'pending';
  /** Must equal `pending_checkout.id`. */
  reference: string;
  amountMinor: number;
  currency: PaymentCurrency;
  /** Provider transaction id (unique). */
  transactionId: string | null;
  method: PaymentMethodKind | null;
}

export type CallbackVerification =
  { ok: true; pageId: string } | { ok: false; reason: 'bad_signature' | 'malformed' };

export interface PaymentProvider {
  readonly id: 'payplus' | 'fake';
  /** Creates a hosted payment page for a pending checkout. */
  createPaymentPage(
    input: CreatePaymentPageInput,
  ): Promise<{ pageId: string; redirectUrl: string }>;
  /**
   * Disables a page so it can no longer be paid (retry, switch to offline, expiry). Best effort:
   * callers log a failure and carry on.
   */
  disablePaymentPage(pageId: string): Promise<void>;
  /** Authenticity of a callback request (signature, headers). No side effects. */
  verifyCallback(request: { headers: Headers; rawBody: string }): Promise<CallbackVerification>;
  /** Server-to-server status query: the only source of truth for confirming a payment. */
  fetchPaymentStatus(pageId: string): Promise<PaymentStatus>;
}

/**
 * A failed provider call. The message names the operation and the HTTP status only: never a
 * key, a URL with credentials or a response body, so callers can log it as it is.
 */
export class PaymentProviderError extends Error {
  readonly operation: string;
  readonly httpStatus: number | null;

  constructor(operation: string, httpStatus: number | null = null, reason?: string) {
    super(
      `Payment provider call failed: ${operation}${httpStatus === null ? '' : ` (HTTP ${String(httpStatus)})`}${reason === undefined ? '' : `: ${reason}`}`,
    );
    this.name = 'PaymentProviderError';
    this.operation = operation;
    this.httpStatus = httpStatus;
  }
}
