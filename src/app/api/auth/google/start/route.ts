import { NextResponse } from 'next/server';
import { z } from 'zod';
import { startGoogleFlow } from '@/server/auth/google';
import { jsonError, originGuard } from '@/server/auth/api';
import { getEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

// `purpose` is a leftover of the old form: only its absence or `sign_in` is accepted.
const formSchema = z.object({
  purpose: z.literal('sign_in').optional(),
  next: z.string().max(1024).optional(),
});

function back(error: string): NextResponse {
  return NextResponse.redirect(new URL(`/admin/sign-in?e=${error}`, getEnv().APP_ORIGIN), 303);
}

/** Form POST from the sign-in page: `303` to Google's authorisation endpoint. */
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
    purpose: form.get('purpose') ?? undefined,
    next: form.get('next') ?? undefined,
  });
  if (!parsed.success) return jsonError(400, 'bad_request');

  const started = await startGoogleFlow(parsed.data.next === '' ? undefined : parsed.data.next);
  if (!started.ok) return back('rate_limited');
  return NextResponse.redirect(started.url, 303);
}
