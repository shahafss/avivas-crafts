import { and, eq, isNull } from 'drizzle-orm';
import { abandonedPasskeySessionsTask } from '@/server/auth/throttle';
import { db } from '@/server/db/client';
import { adminSession } from '@/server/db/schema';
import { getEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

/**
 * Test only (`APP_ENV=test`, 404 otherwise): ages the open `pending_passkey` sessions past their
 * 5-minute idle limit and runs the abandoned-session task right away, because the job loop does
 * not run under `APP_ENV=test`.
 */
export async function POST(): Promise<Response> {
  if (getEnv().APP_ENV !== 'test') return new Response(null, { status: 404 });
  const now = new Date();
  await db
    .update(adminSession)
    .set({ lastSeenAt: new Date(now.getTime() - 10 * 60_000) })
    .where(
      and(
        eq(adminSession.stage, 'pending_passkey'),
        isNull(adminSession.endedAt),
        isNull(adminSession.abandonProcessedAt),
      ),
    );
  const result = await abandonedPasskeySessionsTask.run(db, now);
  return Response.json({ ok: true, result }, { headers: { 'Cache-Control': 'no-store' } });
}
