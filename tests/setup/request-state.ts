// Per-test request state behind the mocked next/headers. Tests set cookies and headers here;
// tests/setup/next-mocks.ts clears it before every test.
export interface JarCookie {
  name: string;
  value: string;
}

export const cookieJar = new Map<string, string>();
export const requestHeaders = new Headers();
/** Cookies written by code under test through cookies().set(); inspect them in assertions. */
export const setCookieCalls: { name: string; value: string; options?: unknown }[] = [];

export function setRequestCookie(name: string, value: string): void {
  cookieJar.set(name, value);
}

export function setRequestHeader(name: string, value: string): void {
  requestHeaders.set(name, value);
}

export function resetRequestState(): void {
  cookieJar.clear();
  setCookieCalls.length = 0;
  for (const key of [...requestHeaders.keys()]) requestHeaders.delete(key);
}
