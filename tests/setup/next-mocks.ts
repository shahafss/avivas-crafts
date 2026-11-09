import { beforeEach, vi } from 'vitest';
import {
  cookieJar,
  requestHeaders,
  resetRequestState,
  setCookieCalls,
  type JarCookie,
} from './request-state';

export * from './request-state';

beforeEach(() => {
  resetRequestState();
});

vi.mock('next/headers', () => {
  const store = {
    get(name: string): JarCookie | undefined {
      const value = cookieJar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    getAll(): JarCookie[] {
      return [...cookieJar].map(([name, value]) => ({ name, value }));
    },
    has(name: string): boolean {
      return cookieJar.has(name);
    },
    set(name: string, value: string, options?: unknown): void {
      cookieJar.set(name, value);
      setCookieCalls.push({ name, value, options });
    },
    delete(name: string): void {
      cookieJar.delete(name);
    },
  };
  return {
    cookies: () => Promise.resolve(store),
    headers: () => Promise.resolve(requestHeaders),
  };
});

vi.mock('next/navigation', () => ({
  redirect: (url: string, type: string = 'replace'): never => {
    const error = new Error('NEXT_REDIRECT') as Error & { digest: string };
    error.digest = `NEXT_REDIRECT;${type};${url};307;`;
    throw error;
  },
  notFound: (): never => {
    const error = new Error('NEXT_NOT_FOUND') as Error & { digest: string };
    error.digest = 'NEXT_NOT_FOUND';
    throw error;
  },
}));
