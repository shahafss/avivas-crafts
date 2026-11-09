import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

// `requestLocale` is the stable API; next/root-params is still experimental in this setup.
// eslint-disable-next-line @typescript-eslint/no-deprecated
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  // Routes without a locale segment (e.g. /admin) get Hebrew.
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  const messages = (await import(`./messages/${locale}.json`)) as {
    default: Record<string, unknown>;
  };
  return { locale, messages: messages.default };
});
