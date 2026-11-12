import 'server-only';
import { checkRateLimit } from '@/server/security/rate-limit';

/** Google sign-in starts: 10 per 15 minutes per IP-hash. */
export async function googleStartAllowed(ip: string | null, now?: Date): Promise<boolean> {
  const result = await checkRateLimit('google-start', ip ?? 'unknown', {
    limit: 10,
    windowSec: 900,
    ...(now === undefined ? {} : { now }),
  });
  return result.allowed;
}
