import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
import { staticSecurityHeaders } from './src/lib/security-headers';

const withNextIntl = createNextIntlPlugin({
  requestConfig: './src/i18n/request.ts',
  experimental: {
    messages: {
      format: 'json',
      path: './src/i18n/messages',
      locales: ['he', 'en'],
      precompile: true,
    },
  },
});

const appOrigin = process.env.APP_ORIGIN ?? 'http://localhost:3001';
const appHost = new URL(appOrigin).host;

// HSTS is decided from APP_ORIGIN when the config loads (build time), so a production build
// without an https origin would ship without it.
if (process.env.APP_ENV === 'production' && !appOrigin.startsWith('https://')) {
  throw new Error('APP_ORIGIN must be set to an https:// origin when APP_ENV=production');
}

const noStoreHeaders = [
  { key: 'Cache-Control', value: 'no-store' },
  { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
];

const nextConfig: NextConfig = {
  // Stop `next dev` from generating AGENTS.md in the repository.
  agentRules: false,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  images: { unoptimized: true },
  experimental: {
    serverActions: {
      allowedOrigins: [appHost],
      bodySizeLimit: '1mb',
    },
  },
  // Native/WASM packages stay out of the Turbopack server bundle.
  serverExternalPackages: ['sharp', 'heic-decode', 'libheif-js'],
  headers() {
    const https = appOrigin.startsWith('https://');
    return Promise.resolve([
      // Static security headers for every path, including those the proxy matcher skips.
      { source: '/:path*', headers: staticSecurityHeaders({ https }) },
      ...[
        '/admin/:path*',
        '/api/admin/:path*',
        '/api/auth/:path*',
        '/api/payments/status',
        '/:locale/order/:path*',
        '/:locale/checkout/:path*',
      ].map((source) => ({ source, headers: noStoreHeaders })),
    ]);
  },
};

export default withNextIntl(nextConfig);
