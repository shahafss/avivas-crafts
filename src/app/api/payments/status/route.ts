import { and, eq, isNull, lte, or } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { pendingCheckout } from '@/server/db/schema';
import { confirmOnlinePayment } from '@/server/orders/confirm-online-payment';
import { onlineOrderToken, sha256, TOKEN_PATTERN } from '@/server/orders/create-order';
import { getProvider } from '@/server/payments';
import { getClientIp } from '@/server/security/client-ip';
import { log } from '@/server/security/logger';
import { checkRateLimit } from '@/server/security/rate-limit';

// Polled by the payment-return page (contracts/http-endpoints.md). It reads no cookies and can
// confirm a payment only from the provider's own verified status. No personal data in answers.

const QUERY_INTERVAL_MS = 5000;
const HEADERS = { 'Cache-Control': 'no-store' };

type State =
  'awaiting_provider' | 'confirmed' | 'failed' | 'mismatch' | 'switched_offline' | 'expired';

function respond(state: State, orderUrl?: string): Response {
  return Response.json(orderUrl === undefined ? { state } : { state, orderUrl }, {
    headers: HEADERS,
  });
}

export async function GET(request: Request): Promise<Response> {
  const limit = await checkRateLimit('payment-status', getClientIp(request.headers) ?? 'unknown', {
    limit: 60,
    windowSec: 60,
  });
  if (!limit.allowed) {
    return Response.json(
      { error: 'rate_limited' },
      { status: 429, headers: { ...HEADERS, 'Retry-After': String(limit.retryAfterSec) } },
    );
  }

  const token = new URL(request.url).searchParams.get('c') ?? '';
  if (!TOKEN_PATTERN.test(token)) return respond('expired');
  const hash = sha256(token);

  const find = async () =>
    (await db.select().from(pendingCheckout).where(eq(pendingCheckout.resumeTokenHash, hash)))[0];
  let pending = await find();
  if (!pending) return respond('expired');

  if (pending.state === 'awaiting_provider' && pending.providerPageId !== null) {
    const now = new Date();
    // One caller per interval asks the provider; the others get the stored state.
    const claimed = await db
      .update(pendingCheckout)
      .set({ lastStatusCheckAt: now })
      .where(
        and(
          eq(pendingCheckout.id, pending.id),
          eq(pendingCheckout.state, 'awaiting_provider'),
          or(
            isNull(pendingCheckout.lastStatusCheckAt),
            lte(pendingCheckout.lastStatusCheckAt, new Date(now.getTime() - QUERY_INTERVAL_MS)),
          ),
        ),
      )
      .returning({ id: pendingCheckout.id });
    if (claimed.length > 0) {
      try {
        const provider = getProvider(pending.provider);
        const status = await provider.fetchPaymentStatus(pending.providerPageId);
        await confirmOnlinePayment(status, pending.providerPageId, { provider: pending.provider });
      } catch (error) {
        log.warn('payment.status_failed', {
          pendingId: pending.id,
          errorCode: error instanceof Error ? error.name : 'unknown',
        });
      }
      pending = (await find()) ?? pending;
    }
  }

  if (pending.state === 'confirmed') {
    return respond(
      'confirmed',
      `/${pending.locale}/order/${onlineOrderToken(pending.resumeTokenHash)}`,
    );
  }
  if (pending.expiresAt.getTime() <= Date.now() && pending.state !== 'mismatch') {
    return respond('expired');
  }
  return respond(pending.state);
}
