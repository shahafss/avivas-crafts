// No `server-only` import: next.config.ts imports this file.

export interface HeaderPair {
  key: string;
  value: string;
}

export const HSTS_VALUE = 'max-age=63072000; includeSubDomains';

/**
 * The static security headers (research.md R14). HSTS is sent only over https, so local and E2E
 * runs on http are not pinned to https.
 */
export function staticSecurityHeaders({ https }: { https: boolean }): HeaderPair[] {
  const headers: HeaderPair[] = [];
  if (https) headers.push({ key: 'Strict-Transport-Security', value: HSTS_VALUE });
  headers.push(
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  );
  return headers;
}
