import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import type { Locale } from '@/i18n/routing';
import { fallbackAttrs, pick } from '@/lib/i18n-fallback';
import type { Settings } from '@/server/settings/settings';
import { SocialLinks } from './SocialLinks';

const NAME_MARK = '\u0001';
const LINK = 'flex min-h-11 items-center hover:underline hover:underline-offset-[3px]';

/**
 * The footer on every public page (storefront.md §7.20, 003 FR-005): the business details from
 * the shop settings, the "Info" and "Legal" link lists and the bottom row: the language switch
 * (`languageSwitch`, full words) beside the copyright line. `cookieSettings` is the "Cookie
 * settings" button, passed only when visitors must be asked for consent.
 */
export async function Footer({
  locale,
  brand,
  settings,
  cookieSettings,
  languageSwitch,
}: {
  locale: Locale;
  brand: { text: string; lang?: 'he' };
  settings: Settings;
  cookieSettings?: ReactNode;
  /** `LanguageSwitch` island, full variant. */
  languageSwitch?: ReactNode;
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
  const heading = 'text-lg leading-[1.3] font-bold';
  // The copyright message keeps its `{shopName}` placeholder; the name is put in its own element
  // so it can carry `lang="he"` when an English page falls back to the Hebrew name.
  const [before = '', after = ''] = t('copyright', {
    year: new Date().getFullYear(),
    shopName: NAME_MARK,
  }).split(NAME_MARK);
  return (
    <footer className="bg-mint px-4 py-12 text-[15px] text-ink lg:px-6 lg:py-16">
      <div className="mx-auto grid max-w-[1240px] gap-8 lg:grid-cols-[2fr_1fr_1fr]">
        <div className="grid content-start gap-1">
          <h2 lang={brand.lang} className={heading}>
            {brand.text}
          </h2>
          <p data-testid="footer-business-name" {...fallbackAttrs(businessName)}>
            {businessName.text}
          </p>
          <p data-testid="footer-business-address" {...fallbackAttrs(address)}>
            {address.text}
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
          <SocialLinks
            urls={{
              instagram: settings.socialInstagramUrl,
              facebook: settings.socialFacebookUrl,
              tiktok: settings.socialTiktokUrl,
            }}
            labels={{
              list: t('social.label'),
              instagram: t('social.instagram'),
              facebook: t('social.facebook'),
              tiktok: t('social.tiktok'),
            }}
          />
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
      <div className="mx-auto mt-8 flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-ink/25 pt-4">
        {languageSwitch}
        <p className="text-sm text-ink-2">
          {before}
          {brand.lang === undefined ? (
            brand.text
          ) : (
            <span lang={brand.lang} dir="auto">
              {brand.text}
            </span>
          )}
          {after}
        </p>
      </div>
    </footer>
  );
}
