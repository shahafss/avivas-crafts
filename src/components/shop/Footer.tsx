import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/routing';
import { fallbackAttrs, pick } from '@/lib/i18n-fallback';
import type { Settings } from '@/server/settings/settings';

const LINK = 'flex min-h-11 items-center hover:underline';

/**
 * The footer on every public page (storefront.md §7.20, 003 FR-005): the business details from
 * the shop settings, the "Info" and "Legal" link lists and the copyright line. The language switch
 * is added by roadmap item 005. `cookieSettings` is the "Cookie settings" button, passed only when
 * visitors must be asked for consent.
 */
export async function Footer({
  locale,
  brand,
  settings,
  cookieSettings,
}: {
  locale: Locale;
  brand: { text: string; lang?: 'he' };
  settings: Settings;
  cookieSettings?: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: 'common.footer' });
  const base = `/${locale}`;
  const businessName = pick(locale, settings.businessNameHe, settings.businessNameEn);
  const address = pick(locale, settings.businessAddressHe, settings.businessAddressEn);
  const info = [
    { href: `${base}/pages/about`, label: t('about') },
    { href: `${base}/pages/shipping-returns`, label: t('shippingReturns') },
    { href: `${base}/contact`, label: t('contact') },
  ];
  const legal = [
    { href: `${base}/pages/terms`, label: t('terms') },
    { href: `${base}/pages/privacy`, label: t('privacy') },
    { href: `${base}/pages/cookies`, label: t('cookies') },
    { href: `${base}/pages/accessibility`, label: t('accessibility') },
  ];
  const heading = 'text-sm font-extrabold';
  return (
    <footer className="rounded-t-[28px] bg-peach px-5 py-8 text-sm lg:px-6 lg:py-12">
      <div className="mx-auto grid max-w-[1240px] gap-8 lg:grid-cols-[2fr_1fr_1fr]">
        <div className="grid content-start gap-1">
          <h2 lang={brand.lang} className="text-base font-extrabold">
            {brand.text}
          </h2>
          <p data-testid="footer-business-name" {...fallbackAttrs(businessName)}>
            {businessName.text}
          </p>
          <p data-testid="footer-business-address" {...fallbackAttrs(address)}>
            {address.text}
          </p>
          <p data-testid="footer-business-vat">
            {t.rich('vat', {
              number: settings.businessRegNumber,
              num: (chunks) => <bdi className="tnum">{chunks}</bdi>,
            })}
          </p>
          <p>
            <a
              href={`mailto:${settings.businessEmail}`}
              data-testid="footer-email"
              className="inline-flex min-h-11 items-center underline underline-offset-[3px]"
            >
              <bdi dir="ltr">{settings.businessEmail}</bdi>
            </a>
          </p>
          <p>
            <a
              href={`tel:${settings.businessPhone}`}
              data-testid="footer-phone"
              className="inline-flex min-h-11 items-center underline underline-offset-[3px]"
            >
              <bdi dir="ltr">{settings.businessPhone}</bdi>
            </a>
          </p>
        </div>
        <nav aria-label={t('infoNav')}>
          <h2 className={heading}>{t('info')}</h2>
          <ul className="mt-1">
            {info.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={LINK}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <nav aria-label={t('legalNav')}>
          <h2 className={heading}>{t('legal')}</h2>
          <ul className="mt-1">
            {legal.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={LINK}>
                  {item.label}
                </Link>
              </li>
            ))}
            {cookieSettings === undefined ? null : <li>{cookieSettings}</li>}
          </ul>
        </nav>
      </div>
      <p className="mx-auto mt-6 max-w-[1240px] text-ink-2">
        {t('copyright', { year: new Date().getFullYear(), shopName: brand.text })}
      </p>
    </footer>
  );
}
