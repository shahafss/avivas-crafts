import { sql } from 'drizzle-orm';
import { db } from '@/server/db/client';

const NO_STORE = { 'Cache-Control': 'no-store' };

export const dynamic = 'force-dynamic';

/** Render health check and Playwright's webServer probe: 200 when the database answers a trivial `SELECT 1` query. */
export async function GET(): Promise<Response> {
  try {
    // A bare SELECT 1: it touches no application table, so the check passes on an empty database
    // (CI starts the web server before the migrations run).
    // The result is ignored, so the driver-specific result shape does not matter (the only place
    // `db.execute()` is accepted): the query builder has no awaitable form without a table.
    await db.execute(sql`select 1`);
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch {
    return Response.json({ ok: false }, { status: 503, headers: NO_STORE });
  }
}
