import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const FULL_FOLDER = fileURLToPath(new URL('../../src/server/db/migrations', import.meta.url));

// Migration 004 (0003): sessions end, admins keep their access as role `admin`, passkey tables go.
let client: PGlite;
let tempFolder: string;

async function rows<T>(query: string): Promise<T[]> {
  return (await client.query<T>(query)).rows;
}

beforeAll(async () => {
  // Migrations 0000-0002 and a journal trimmed to them: the schema as it was before 004.
  tempFolder = mkdtempSync(join(tmpdir(), 'migration-004-'));
  mkdirSync(join(tempFolder, 'meta'));
  const journal = JSON.parse(readFileSync(join(FULL_FOLDER, 'meta', '_journal.json'), 'utf8')) as {
    entries: { idx: number; tag: string }[];
  };
  const old = journal.entries.filter((entry) => entry.idx <= 2);
  expect(old).toHaveLength(3);
  for (const entry of old) {
    cpSync(join(FULL_FOLDER, `${entry.tag}.sql`), join(tempFolder, `${entry.tag}.sql`));
  }
  writeFileSync(
    join(tempFolder, 'meta', '_journal.json'),
    JSON.stringify({ ...journal, entries: old }),
  );

  client = new PGlite();
  await migrate(drizzle(client), { migrationsFolder: tempFolder });

  // Pre-004 data, as raw SQL because the current schema no longer has these columns.
  await client.exec(`
    INSERT INTO admin_user (id, display_name, google_email, google_sub, setup_token_hash,
      setup_token_expires_at, passkey_fail_count, passkey_blocked_until) VALUES
      ('00000000-0000-4000-8000-000000000001', 'Aviva', 'aviva@example.test', 'sub-aviva', NULL, NULL, 0, NULL),
      ('00000000-0000-4000-8000-000000000002', 'Dev', 'dev@example.test', NULL, '\\x0102', now() + interval '1 day', 3, now() + interval '1 hour');
    INSERT INTO admin_passkey (admin_id, credential_id, public_key, device_label, registered_via) VALUES
      ('00000000-0000-4000-8000-000000000001', '\\x0a', '\\x0b', 'Phone', 'setup'),
      ('00000000-0000-4000-8000-000000000002', '\\x0c', '\\x0d', 'Laptop', 'normal');
    INSERT INTO admin_recovery_code (admin_id, code_hash) VALUES
      ('00000000-0000-4000-8000-000000000001', 'hash-1'),
      ('00000000-0000-4000-8000-000000000002', 'hash-2');
    INSERT INTO admin_session (token_hash, admin_id, stage, expires_at) VALUES
      ('\\x01', '00000000-0000-4000-8000-000000000001', 'full', now() + interval '1 hour'),
      ('\\x02', '00000000-0000-4000-8000-000000000002', 'pending_passkey', now() + interval '1 hour');
    INSERT INTO oauth_flow (state_hash, code_verifier, nonce, purpose, expires_at) VALUES
      ('\\x11', 'verifier-1', 'nonce-1', 'sign_in', now() + interval '10 minutes'),
      ('\\x12', 'verifier-2', 'nonce-2', 'setup', now() + interval '10 minutes');
    INSERT INTO admin_activity (id, admin_id, actor_kind, action) VALUES
      ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'admin', 'passkey.added'),
      ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000002', 'admin', 'recovery.used'),
      ('10000000-0000-4000-8000-000000000003', NULL, 'unapproved_account', 'signin.google_rejected');
  `);

  // The full folder, as production applies it on deploy.
  await migrate(drizzle(client), { migrationsFolder: FULL_FOLDER });
});

afterAll(async () => {
  await client.close();
  rmSync(tempFolder, { recursive: true, force: true });
});

describe('migration 0003 (simpler admin access)', () => {
  it('drops the passkey and recovery-code tables and the passkey-only enums', async () => {
    const tables = await rows<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    const names = tables.map((table) => table.tablename);
    expect(names).not.toContain('admin_passkey');
    expect(names).not.toContain('admin_recovery_code');
    expect(names).toContain('admin_user');
    const enums = await rows<{ typname: string }>(
      `SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname`,
    );
    const enumNames = enums.map((e) => e.typname);
    for (const gone of [
      'passkey_status',
      'passkey_registered_via',
      'session_stage',
      'oauth_purpose',
    ]) {
      expect(enumNames).not.toContain(gone);
    }
    expect(enumNames).toContain('user_role');
  });

  it('keeps both admins and gives them role admin', async () => {
    const admins = await rows<{ google_email: string; role: string; google_sub: string | null }>(
      `SELECT google_email, role, google_sub FROM admin_user ORDER BY google_email`,
    );
    expect(admins).toEqual([
      { google_email: 'aviva@example.test', role: 'admin', google_sub: 'sub-aviva' },
      { google_email: 'dev@example.test', role: 'admin', google_sub: null },
    ]);
    const columns = await rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'admin_user'`,
    );
    const names = columns.map((c) => c.column_name);
    for (const gone of [
      'setup_token_hash',
      'setup_token_expires_at',
      'passkey_fail_count',
      'passkey_blocked_until',
    ]) {
      expect(names).not.toContain(gone);
    }
  });

  it('new users default to role user', async () => {
    await client.exec(
      `INSERT INTO admin_user (display_name, google_email) VALUES ('New', 'new@example.test')`,
    );
    const [row] = await rows<{ role: string }>(
      `SELECT role FROM admin_user WHERE google_email = 'new@example.test'`,
    );
    expect(row?.role).toBe('user');
  });

  it('ends every session and half-finished sign-in, and simplifies both tables', async () => {
    expect(await rows(`SELECT 1 FROM admin_session`)).toHaveLength(0);
    expect(await rows(`SELECT 1 FROM oauth_flow`)).toHaveLength(0);
    const sessionColumns = await rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'admin_session' ORDER BY column_name`,
    );
    expect(sessionColumns.map((c) => c.column_name)).toEqual([
      'admin_id',
      'created_at',
      'expires_at',
      'last_seen_at',
      'token_hash',
      'user_agent_summary',
    ]);
    const flowColumns = await rows<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'oauth_flow' ORDER BY column_name`,
    );
    expect(flowColumns.map((c) => c.column_name)).toEqual([
      'code_verifier',
      'created_at',
      'expires_at',
      'next_path',
      'nonce',
      'state_hash',
    ]);
  });

  it('keeps the activity history unchanged, including passkey and recovery actions', async () => {
    const activity = await rows<{ id: string; admin_id: string | null; action: string }>(
      `SELECT id, admin_id, action FROM admin_activity ORDER BY id`,
    );
    expect(activity.map((a) => a.action)).toEqual([
      'passkey.added',
      'recovery.used',
      'signin.google_rejected',
    ]);
    expect(activity[0]?.admin_id).toBe('00000000-0000-4000-8000-000000000001');
    expect(activity[2]?.admin_id).toBeNull();
  });
});
