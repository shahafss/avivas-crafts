// pnpm admin:role <googleEmail> <admin|user> ["display name"]
// Sets a user's role (contracts/admin-role-command.md). Role `admin` creates the user when the
// email is new; role `user` also signs that user out everywhere. Runs on the deployment too (the
// service's DATABASE_URL). The logic lives in src/server/auth/admin-role.ts.
import { setAdminRole } from '@/server/auth/admin-role';
import { db } from '@/server/db/client';

// Local development: take settings from .env.local when it exists. Variables already set in the
// environment win (loadEnvFile never overrides them), so tests and CI keep control.
try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local: use the environment as it is.
}

const [emailArg, roleArg, nameArg] = process.argv.slice(2);
const USAGE = 'Usage: pnpm admin:role <googleEmail> <admin|user> ["display name"]';

try {
  const result = await setAdminRole(db, {
    email: emailArg ?? '',
    role: roleArg ?? '',
    name: nameArg,
  });
  if (!result.ok) {
    if (result.error === 'invalid') {
      console.error(USAGE);
      console.error(
        'The email must be valid, the role admin or user, and the name 1-60 characters.',
      );
    } else {
      console.error('No such user. Create one first with role admin.');
    }
    process.exit(1);
  }
  console.log(
    `${result.created ? 'Created' : 'Updated'}: ${result.displayName} now has role ${result.role}.`,
  );
  process.exit(0);
} catch (error) {
  console.error('Could not set the role:', error instanceof Error ? error.message : error);
  process.exit(1);
}
