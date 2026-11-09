import 'server-only';
import { getEnv } from '@/server/env';

export class OriginError extends Error {
  constructor() {
    super('Cross-origin request rejected');
    this.name = 'OriginError';
  }
}

/** True when the request's `Origin` header equals `APP_ORIGIN` exactly. A missing Origin is not accepted. */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin === getEnv().APP_ORIGIN;
}

/** Throws `OriginError` unless the request is same-origin (use for POST/mutating handlers). */
export function assertSameOrigin(request: Request): void {
  if (!isSameOrigin(request)) throw new OriginError();
}
