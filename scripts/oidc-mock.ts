// Mock Google for local development and E2E tests (pnpm dev:oidc, port 4011).
// ID token claims `email`, `sub` and `email_verified` come from tests/fixtures/oidc/user.json
// (or $OIDC_MOCK_USER_FILE),
// which is re-read on every token request so tests can change the signed-in user at any time.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Events, OAuth2Server, type MutableToken } from 'oauth2-mock-server';

// Local development: take settings from .env.local when it exists. Variables already set in the
// environment win (loadEnvFile never overrides them), so tests and CI keep control.
try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local: use the environment as it is.
}

export const OIDC_MOCK_PORT = 4011;

// The user file is configurable so E2E runs (tests/e2e/env.ts) use their own file and never
// overwrite the identity local `pnpm dev` signs in with. Default: the dev file.
const DEFAULT_USER_FILE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../tests/fixtures/oidc/user.json',
);

function userFile(): string {
  return process.env.OIDC_MOCK_USER_FILE
    ? resolve(process.env.OIDC_MOCK_USER_FILE)
    : DEFAULT_USER_FILE;
}

interface MockUser {
  email: string;
  sub: string;
  email_verified: boolean;
}

const DEFAULT_USER: MockUser = {
  email: 'admin-a@example.test',
  sub: 'google-sub-admin-a',
  email_verified: true,
};

function readUser(): MockUser {
  const file = userFile();
  if (!existsSync(file)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(DEFAULT_USER, null, 2));
  }
  return { ...DEFAULT_USER, ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<MockUser>) };
}

/** Email of the mock Google user (what `pnpm dev` gives the first admin). */
export function mockUserEmail(): string {
  return readUser().email;
}

export interface OidcMock {
  issuer: string;
  stop: () => Promise<void>;
}

export async function startOidcMock(port: number = OIDC_MOCK_PORT): Promise<OidcMock> {
  const server = new OAuth2Server();
  await server.issuer.keys.generate('RS256');
  server.service.on(Events.BeforeTokenSigning, (token: MutableToken) => {
    const user = readUser();
    token.payload.email = user.email;
    token.payload.sub = user.sub;
    token.payload.email_verified = user.email_verified;
  });
  await server.start(port, 'localhost');
  return {
    issuer: server.issuer.url ?? `http://localhost:${String(port)}`,
    stop: () => server.stop(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mock = await startOidcMock();
  console.log(`Mock OIDC issuer listening at ${mock.issuer}`);
  process.on('SIGINT', () => {
    void mock.stop().finally(() => process.exit(0));
  });
}
