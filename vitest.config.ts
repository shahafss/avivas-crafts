import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Server-only modules import 'server-only', which throws outside React's server build.
      'server-only': fromRoot('./tests/setup/empty.ts'),
      '@': fromRoot('./src'),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['tests/unit/**/*.test.ts'],
          setupFiles: ['tests/setup/next-mocks.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          environment: 'node',
          include: ['tests/integration/**/*.test.ts'],
          setupFiles: ['tests/setup/next-mocks.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
      {
        // Real PostgreSQL 17 (DATABASE_URL_TEST) for concurrency/locking tests.
        extends: true,
        test: {
          name: 'pg',
          environment: 'node',
          include: ['tests/integration-pg/**/*.test.ts'],
          setupFiles: ['tests/setup/next-mocks.ts'],
          globalSetup: ['tests/setup/pg-global-setup.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
