// `pnpm admin:role` (tasks.md T017): the logic behind the script, one test per row of
// contracts/admin-role-command.md.
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb, type TestDbHandle } from '../setup/pglite';
import { adminActivity, adminSession, adminUser } from '@/server/db/schema';
import { setAdminRole } from '@/server/auth/admin-role';

let testDb: TestDbHandle;

beforeAll(async () => {
  testDb = await createTestDb();
});
afterAll(() => testDb.close());
beforeEach(() => testDb.reset());

const users = () => testDb.db.select().from(adminUser);
const sessions = () => testDb.db.select().from(adminSession);
const activity = () => testDb.db.select().from(adminActivity);

async function addUser(email: string, role: 'admin' | 'user', name = 'Someone') {
  const [row] = await testDb.db
    .insert(adminUser)
    .values({ displayName: name, googleEmail: email, role })
    .returning({ id: adminUser.id });
  return row?.id ?? '';
}

async function addSession(adminId: string, key: string) {
  await testDb.db.insert(adminSession).values({
    tokenHash: Buffer.from(key),
    adminId,
    expiresAt: new Date(Date.now() + 3_600_000),
  });
}

describe('setAdminRole: invalid input changes nothing', () => {
  it.each([
    ['an email that is not an email', { email: 'not-an-email', role: 'admin' }],
    ['an email over 254 characters', { email: `${'a'.repeat(250)}@x.test`, role: 'admin' }],
    ['a role that is neither admin nor user', { email: 'a@example.test', role: 'owner' }],
    ['an empty name', { email: 'a@example.test', role: 'admin', name: '   ' }],
    ['a name over 60 characters', { email: 'a@example.test', role: 'admin', name: 'x'.repeat(61) }],
  ])('%s', async (_label, input) => {
    await addUser('a@example.test', 'user', 'Original');
    const result = await setAdminRole(testDb.db, input);
    expect(result).toMatchObject({ ok: false, error: 'invalid' });
    expect((await users()).map((u) => [u.displayName, u.role])).toEqual([['Original', 'user']]);
    expect(await activity()).toHaveLength(0);
  });
});

describe('setAdminRole: a new email', () => {
  it('with role admin inserts the user, named after the given name', async () => {
    const result = await setAdminRole(testDb.db, {
      email: 'New.Person@Example.test',
      role: 'admin',
      name: 'Dana',
    });
    expect(result).toMatchObject({ ok: true, displayName: 'Dana', role: 'admin' });
    const [row] = await users();
    expect(row).toMatchObject({
      googleEmail: 'new.person@example.test',
      displayName: 'Dana',
      role: 'admin',
      googleSub: null,
    });
  });

  it('without a name uses the email local part, cut to 60 characters', async () => {
    await setAdminRole(testDb.db, { email: 'aviva@example.test', role: 'admin' });
    const long = 'l'.repeat(70);
    await setAdminRole(testDb.db, { email: `${long}@example.test`, role: 'admin' });
    const names = (await users()).map((u) => u.displayName).sort();
    expect(names).toEqual(['aviva', 'l'.repeat(60)]);
  });

  it('with role user changes nothing and says there is no such user', async () => {
    const result = await setAdminRole(testDb.db, { email: 'ghost@example.test', role: 'user' });
    expect(result).toMatchObject({ ok: false, error: 'no_such_user' });
    expect(await users()).toHaveLength(0);
    expect(await activity()).toHaveLength(0);
  });
});

describe('setAdminRole: an existing user', () => {
  it('sets the role and the optional name; the lookup is case-insensitive', async () => {
    const id = await addUser('aviva@example.test', 'user', 'Old name');
    expect(
      await setAdminRole(testDb.db, { email: 'AVIVA@example.test', role: 'admin' }),
    ).toMatchObject({ ok: true, displayName: 'Old name', role: 'admin' });
    expect((await users())[0]).toMatchObject({ id, role: 'admin', displayName: 'Old name' });

    expect(
      await setAdminRole(testDb.db, { email: 'aviva@example.test', role: 'admin', name: 'Aviva' }),
    ).toMatchObject({ ok: true, displayName: 'Aviva' });
    expect((await users())[0]).toMatchObject({ role: 'admin', displayName: 'Aviva' });
    expect(await users()).toHaveLength(1);
  });

  it('role user deletes all of that user sessions and nobody else', async () => {
    const aviva = await addUser('aviva@example.test', 'admin', 'Aviva');
    const dev = await addUser('dev@example.test', 'admin', 'Dev');
    await addSession(aviva, 'a1');
    await addSession(aviva, 'a2');
    await addSession(dev, 'd1');
    const result = await setAdminRole(testDb.db, { email: 'aviva@example.test', role: 'user' });
    expect(result).toMatchObject({ ok: true, role: 'user' });
    const left = await sessions();
    expect(left).toHaveLength(1);
    expect(left[0]?.adminId).toBe(dev);
    expect((await users()).find((u) => u.id === aviva)?.role).toBe('user');
  });

  it('role admin keeps the sessions', async () => {
    const aviva = await addUser('aviva@example.test', 'admin', 'Aviva');
    await addSession(aviva, 'a1');
    await setAdminRole(testDb.db, { email: 'aviva@example.test', role: 'admin' });
    expect(await sessions()).toHaveLength(1);
  });
});

describe('setAdminRole: the activity log', () => {
  it('writes one admin.role_set row per change with details { role } and never the email', async () => {
    await setAdminRole(testDb.db, { email: 'aviva@example.test', role: 'admin', name: 'Aviva' });
    const [created] = await users();
    await setAdminRole(testDb.db, { email: 'aviva@example.test', role: 'user' });
    const rows = await activity();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({
        action: 'admin.role_set',
        actorKind: 'system',
        actorLabel: 'admin:role',
        adminId: created?.id,
      });
    }
    expect(rows.map((row) => row.details)).toEqual([{ role: 'admin' }, { role: 'user' }]);
    expect(JSON.stringify(rows)).not.toContain('aviva@example.test');
  });

  it('keeps the row when the user is later removed (admin_id set null)', async () => {
    await setAdminRole(testDb.db, { email: 'aviva@example.test', role: 'admin' });
    await testDb.db.delete(adminUser).where(eq(adminUser.googleEmail, 'aviva@example.test'));
    expect(await activity()).toHaveLength(1);
  });
});
