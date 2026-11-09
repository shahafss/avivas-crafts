import { NextResponse } from 'next/server';
import { z } from 'zod';
import { startGoogleFlow } from '@/server/auth/google';
import { jsonError, originGuard } from '@/server/auth/api';
import { getEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

const formSchema = z.object({
  purpose: z.enum(['sign_in', 'recovery', 'setup']),
  next: z.string().max(1024).optional(),
  t: z.string().max(128).optional(),
});

function back(error: string): NextResponse {
  return NextResponse.redirect(new URL(`/admin/sign-in?e=${error}`, getEnv().APP_ORIGIN), 303);
}

/** Form POST from the sign-in and setup pages: `303` to Google's authorisation endpoint. */
export async function POST(request: Request): Promise<Response> {
  const blocked = originGuard(request);
  if (blocked) return blocked;
  if (
    !(request.headers.get('content-type') ?? '').startsWith('application/x-www-form-urlencoded')
  ) {
    return jsonError(415, 'unsupported_media_type');
  }
  const form = await request.formData();
  const parsed = formSchema.safeParse({
    purpose: form.get('purpose'),
    next: form.get('next') ?? undefined,
    t: form.get('t') ?? undefined,
  });
  if (!parsed.success) return back('error');

  const started = await startGoogleFlow(
    parsed.data.purpose,
    parsed.data.t === '' ? undefined : parsed.data.t,
    parsed.data.next === '' ? undefined : parsed.data.next,
  );
  if (!started.ok) return back(started.error === 'rate_limited' ? 'rate_limited' : 'expired');
  return NextResponse.redirect(started.url, 303);
}
