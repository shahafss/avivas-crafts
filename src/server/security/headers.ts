import { staticSecurityHeaders } from '@/lib/security-headers';

// Pure and without `server-only`: the proxy and the upload route import it.

export interface CspOptions {
  /** Host of the hosted payment page (`PAYPLUS_PAYMENT_HOST`); left out when unset (fake provider). */
  paymentHost?: string | undefined;
  /** Origin that serves public product images. */
  imageOrigin: string;
  /** Hosts of optional (consent-gated) scripts; none at launch. */
  optionalScriptHosts: readonly string[];
  /** Origin of `OIDC_ISSUER`; given only for the admin sign-in and setup paths. */
  oidcOrigin?: string | undefined;
  /** `NODE_ENV === 'development'`: adds `'unsafe-eval'` to `script-src` (React's dev build) and nothing else. */
  dev?: boolean | undefined;
  /** False when `APP_ORIGIN` is http (local and E2E): leaves out `upgrade-insecure-requests`. Default true. */
  upgradeInsecureRequests?: boolean | undefined;
}

function asOrigin(hostOrOrigin: string): string {
  return /^https?:\/\//.test(hostOrOrigin) ? hostOrOrigin : `https://${hostOrOrigin}`;
}

/** A fresh random nonce for one request. */
export function generateNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
}

/** The Content-Security-Policy of research.md R14. No `'unsafe-inline'` anywhere. */
export function buildCsp(nonce: string, options: CspOptions): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...options.optionalScriptHosts,
    ...(options.dev === true ? ["'unsafe-eval'"] : []),
  ];
  const formAction = [
    "'self'",
    ...(options.paymentHost !== undefined && options.paymentHost !== ''
      ? [asOrigin(options.paymentHost)]
      : []),
    ...(options.oidcOrigin !== undefined ? [options.oidcOrigin] : []),
  ];
  const directives = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' ${options.imageOrigin} data: blob:`,
    "font-src 'self'",
    "connect-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    `form-action ${formAction.join(' ')}`,
  ];
  if (options.upgradeInsecureRequests !== false) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/** The static security headers as a plain record (HSTS only over https). */
export function securityHeaders({ https }: { https: boolean }): Record<string, string> {
  return Object.fromEntries(staticSecurityHeaders({ https }).map(({ key, value }) => [key, value]));
}
