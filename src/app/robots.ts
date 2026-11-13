import type { MetadataRoute } from 'next';
import { getEnv } from '@/server/env';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/'] },
    sitemap: `${getEnv().APP_ORIGIN}/sitemap.xml`,
  };
}
