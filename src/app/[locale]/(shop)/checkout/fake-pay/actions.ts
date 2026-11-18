'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  fakeCallbackParts,
  fakeProviderAvailable,
  isFakePageId,
  readFakePage,
  setFakePageResult,
} from '@/server/payments/fake';

const inputSchema = z.object({
  pageId: z.string().refine(isFakePageId),
  mode: z.enum(['pay', 'fail', 'pay-close']),
});

/**
 * What the visitor does on the fake payment page: record the result, send the signed callback
 * to the shop's own callback route (server-side, like a real provider would), then go back to
 * the shop. "Pay, close tab before return" stops after the callback.
 */
export async function submitFakePayment(formData: FormData): Promise<void> {
  if (!fakeProviderAvailable()) redirect('/');
  const parsed = inputSchema.safeParse({
    pageId: formData.get('pageId'),
    mode: formData.get('mode'),
  });
  if (!parsed.success) redirect('/');
  const { pageId, mode } = parsed.data;

  const page = await readFakePage(pageId);
  const updated = await setFakePageResult(pageId, mode === 'fail' ? 'failed' : 'paid');
  if (page === null || updated === null) redirect(`/${page?.input.locale ?? 'he'}/shop`);

  const { rawBody, headers } = fakeCallbackParts(pageId);
  const { POST } = await import('@/app/api/payments/[provider]/callback/route');
  await POST(new Request(updated.input.callbackUrl, { method: 'POST', headers, body: rawBody }), {
    params: Promise.resolve({ provider: 'fake' }),
  });

  if (mode === 'pay-close') {
    redirect(`/${updated.input.locale}/checkout/fake-pay?page=${pageId}&closed=1`);
  }
  redirect(mode === 'fail' ? updated.input.failureUrl : updated.input.successUrl);
}
