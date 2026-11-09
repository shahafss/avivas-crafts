// pnpm fake-pay:replay <pendingId>
// Rebuilds and re-signs the fake provider's callback for a pending checkout and sends it to the
// shop again (same env as the app it targets: SECRET_HMAC_KEY, LOCAL_DATA_DIR, APP_ORIGIN).
// Replaying a paid page twice must still give one order and one set of emails. Development and
// test only; the fake provider refuses to load when APP_ENV=production.
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/server/db/client';
import { pendingCheckout } from '@/server/db/schema';
import { getEnv } from '@/server/env';
import { fakeCallbackParts, readFakePage } from '@/server/payments/fake';

try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local: use the environment as it is.
}

const parsed = z.uuid().safeParse(process.argv[2]);
if (!parsed.success) {
  console.error('Usage: pnpm fake-pay:replay <pendingId>');
  process.exit(1);
}

try {
  const env = getEnv();
  if (env.APP_ENV === 'production' || env.PAYMENT_PROVIDER !== 'fake') {
    console.error(
      'The fake provider is only available with PAYMENT_PROVIDER=fake outside production.',
    );
    process.exit(1);
  }
  const [pending] = await db
    .select({ providerPageId: pendingCheckout.providerPageId })
    .from(pendingCheckout)
    .where(eq(pendingCheckout.id, parsed.data));
  if (!pending?.providerPageId) {
    console.error(
      'No pending checkout with a payment page for this id (it may have been deleted).',
    );
    process.exit(1);
  }
  const page = await readFakePage(pending.providerPageId);
  if (page === null) {
    console.error(
      `No fake page file for ${pending.providerPageId} in ${env.LOCAL_DATA_DIR}/fake-pay.`,
    );
    process.exit(1);
  }
  const { rawBody, headers } = fakeCallbackParts(page.pageId);
  const response = await fetch(page.input.callbackUrl, { method: 'POST', headers, body: rawBody });
  console.log(
    `Callback sent to ${page.input.callbackUrl}: HTTP ${String(response.status)} (page is ${page.state}).`,
  );
  process.exit(response.ok ? 0 : 1);
} catch (error) {
  console.error('Replay failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
