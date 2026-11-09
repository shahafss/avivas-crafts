import 'server-only';
import type { EmailDriver } from './types';

/**
 * Sends nothing: the row is simply marked sent. Outside production the bodies are kept so tests
 * and developers can read them (`pnpm dev:outbox`).
 */
export function createOutboxOnlyDriver({ keepBodies }: { keepBodies: boolean }): EmailDriver {
  return {
    keepBodies,
    send: () => Promise.resolve(),
  };
}
