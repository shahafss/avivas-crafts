import { cookies } from 'next/headers';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { cache } from 'react';
import type { Locale } from '@/i18n/routing';
import { STORAGE_ITEMS } from '@/lib/consent/registry';
import { consentConfig, consentRequired } from '@/server/consent/config';
import { CONSENT_COOKIE, consentState, getCookiesVersion } from '@/server/consent/consent';
import { ConsentLoader } from './ConsentLoader';

const loadState = cache(async () => {
  const [jar, version] = await Promise.all([cookies(), getCookiesVersion()]);
  const state = consentState(jar.get(CONSENT_COOKIE)?.value, version);
  // Seen on the server, so `HttpOnly` cookies count too (the client's `document.cookie` hides them).
  const optional = new Set(
    STORAGE_ITEMS.filter((item) => item.kind === 'cookie' && item.category !== 'necessary').map(
      (item) => item.name,
    ),
  );
  const staleOptional =
    state.needsChoice && jar.getAll().some((cookie) => optional.has(cookie.name));
  return { ...state, staleOptional };
});

/**
 * The consent mechanism's server half (storefront.md §7.21, contracts/consent.md): nothing at all
 * unless `consentRequired()`, so at launch no consent code is requested and no cookie is read.
 * Otherwise the client loader gets the state and its own provider with only the consent messages.
 */
export async function ConsentRoot({ locale, nonce }: { locale: Locale; nonce: string }) {
  if (!consentRequired()) return null;
  const [state, messages] = await Promise.all([loadState(), getMessages()]);
  const { banner, dialog, categories, errors } = (
    messages as unknown as { consent: Record<string, unknown> }
  ).consent;
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={{ consent: { banner, dialog, categories, errors } }}
    >
      <ConsentLoader
        categories={consentConfig().categories}
        choices={state.choices}
        effectiveChoices={state.effectiveChoices}
        needsChoice={state.needsChoice}
        staleOptional={state.staleOptional}
        nonce={nonce}
        cookiesHref={`/${locale}/pages/cookies`}
      />
    </NextIntlClientProvider>
  );
}

/** The skip link at the start of the page, only while the visitor still has to choose. */
export async function ConsentSkipLink({ locale }: { locale: Locale }) {
  if (!consentRequired()) return null;
  const [state, t] = await Promise.all([
    loadState(),
    getTranslations({ locale, namespace: 'consent.banner' }),
  ]);
  if (!state.needsChoice) return null;
  return (
    <a
      href="#consent-banner"
      className="sr-only rounded-pill bg-sun px-5 py-3 font-bold text-ink focus:not-sr-only focus:fixed focus:start-3 focus:top-3 focus:z-banner"
    >
      {t('skip')}
    </a>
  );
}
