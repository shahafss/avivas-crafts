import { getEnv } from '@/server/env';
import { confirmOnlinePayment } from '@/server/orders/confirm-online-payment';
import { getProvider } from '@/server/payments';
import { getClientIp } from '@/server/security/client-ip';
import { log } from '@/server/security/logger';
import { checkRateLimit } from '@/server/security/rate-limit';

// Server-to-server notification from the payment provider (contracts/http-endpoints.md). Only the
// provider's signature is checked here; the amount and status always come from the provider's
// own status query, never from this request.

const MAX_BODY_BYTES = 64 * 1024;
const HEADERS = { 'Cache-Control': 'no-store' };

function json(status: number, body: Record<string, unknown>, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...HEADERS, ...extra } });
}

/** The body as text, or null when it is larger than the limit. */
async function readLimited(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return null;
  if (request.body === null) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
): Promise<Response> {
  const { provider: providerId } = await params;
  if (
    (providerId !== 'payplus' && providerId !== 'fake') ||
    providerId !== getEnv().PAYMENT_PROVIDER
  ) {
    return json(404, { error: 'not_found' });
  }

  const limit = await checkRateLimit(
    'payment-callback',
    getClientIp(request.headers) ?? 'unknown',
    {
      limit: 120,
      windowSec: 60,
    },
  );
  if (!limit.allowed) {
    return json(429, { error: 'rate_limited' }, { 'Retry-After': String(limit.retryAfterSec) });
  }

  const rawBody = await readLimited(request);
  if (rawBody === null) return json(413, { error: 'too_large' });

  let provider;
  try {
    provider = getProvider(providerId);
  } catch {
    return json(404, { error: 'not_found' });
  }
  const verified = await provider.verifyCallback({ headers: request.headers, rawBody });
  if (!verified.ok) {
    if (verified.reason === 'bad_signature') {
      log.warn('payment.bad_signature', { route: '/api/payments/[provider]/callback' });
      return json(401, { error: 'bad_signature' });
    }
    return json(400, { error: 'malformed' });
  }

  try {
    const status = await provider.fetchPaymentStatus(verified.pageId);
    await confirmOnlinePayment(status, verified.pageId, { provider: providerId });
  } catch (error) {
    // The provider retries a 503.
    log.error('payment.callback_failed', {
      route: '/api/payments/[provider]/callback',
      errorCode: error instanceof Error ? error.name : 'unknown',
    });
    return json(503, { error: 'unavailable' });
  }
  return json(200, { ok: true });
}
