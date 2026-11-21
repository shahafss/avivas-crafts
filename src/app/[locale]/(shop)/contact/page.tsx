import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { ContactForm } from '@/components/shop/ContactForm';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { buttonClasses } from '@/components/ui/button-styles';
import { Icon } from '@/components/ui/Icon';
import { Markdown } from '@/components/ui/Markdown';
import { Prose } from '@/components/ui/Prose';
import type MessageFile from '@/i18n/messages/he.json';
import { routing } from '@/i18n/routing';
import { fallbackAttrs, pick } from '@/lib/i18n-fallback';
import { SEED_PLACEHOLDERS } from '@/lib/seed-placeholders';
import { whatsAppLink } from '@/lib/whatsapp';
import { issueFormToken } from '@/server/checkout/form-token';
import { renderMarkdown } from '@/server/content/markdown';
import { getPage } from '@/server/content/pages';
import { pageMetadata } from '@/server/seo';
import { getSettings } from '@/server/settings/settings';
import { shopNameFor } from '@/server/settings/shop-name';

type Params = Promise<{ locale: string }>;

const LINK = 'inline-flex min-h-11 items-center underline underline-offset-[3px]';

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const page = await getPage('contact', locale);
  if (page === null) return {};
  const [settings, common] = await Promise.all([
    getSettings(),
    getTranslations({ locale, namespace: 'common' }),
  ]);
  const siteName = shopNameFor(settings, locale).text;
  const description = common('meta.description');
  const title = page.title.text;
  return {
    title,
    ...pageMetadata({ locale, path: '/contact', title, description, siteName }),
  };
}

// The contact page (storefront.md §8.10): the owner-written intro, the business details and the
// form. The form comes first in the markup, so it stays first when the columns stack.
export default async function ContactPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const page = await getPage('contact', locale);
  if (page === null) notFound();

  const [t, common, settings, rawMessages] = await Promise.all([
    getTranslations({ locale, namespace: 'contact' }),
    getTranslations({ locale, namespace: 'common' }),
    getSettings(),
    getMessages(),
  ]);
  const messages = rawMessages as unknown as typeof MessageFile;
  const businessName = pick(locale, settings.businessNameHe, settings.businessNameEn);
  const address = pick(locale, settings.businessAddressHe, settings.businessAddressEn);
  const whatsApp =
    settings.businessPhone === SEED_PLACEHOLDERS.businessPhone
      ? null
      : whatsAppLink(settings.businessPhone);

  return (
    <div className="mx-auto grid max-w-[1000px] gap-5 py-6 lg:py-10">
      <Breadcrumbs
        label={common('breadcrumbs')}
        items={[
          { label: common('home'), href: `/${locale}` },
          { label: page.title.text, ...(page.title.fallback ? { lang: 'he' as const } : {}) },
        ]}
      />
      <h1
        {...fallbackAttrs(page.title)}
        className="text-[32px] leading-[1.15] font-bold tracking-[-0.01em] text-balance lg:text-[44px]"
      >
        {page.title.text}
      </h1>
      <div data-testid="contact-intro">
        <Prose>
          <Markdown html={renderMarkdown(page.body.text)} {...fallbackAttrs(page.body)} />
        </Prose>
      </div>
      {whatsApp !== null && (
        <section
          data-testid="contact-whatsapp"
          aria-labelledby="contact-whatsapp-heading"
          className="grid gap-3 rounded-card border border-line bg-paper p-[18px]"
        >
          <h2 id="contact-whatsapp-heading" className="text-lg font-extrabold">
            {t('whatsapp.heading')}
          </h2>
          <p>{t('whatsapp.text')}</p>
          <a
            data-testid="contact-whatsapp-link"
            href={whatsApp}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClasses('primary', false, 'h-auto min-h-14 w-full min-[900px]:w-fit')}
          >
            <Icon name="whatsapp" size={24} />
            <span>
              {t('whatsapp.button')}
              <span className="sr-only">{t('whatsapp.newTab')}</span>
            </span>
          </a>
        </section>
      )}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
        <section className="rounded-card border border-line bg-paper p-[18px]">
          <h2 className="mb-3 text-lg font-extrabold">
            {whatsApp === null ? t('formHeading') : t('formHeadingAlt')}
          </h2>
          <NextIntlClientProvider locale={locale} messages={{ contact: messages.contact }}>
            <ContactForm formToken={issueFormToken()} locale={locale} />
          </NextIntlClientProvider>
        </section>
        <section
          data-testid="contact-details"
          aria-labelledby="contact-details-heading"
          className="grid content-start gap-1 rounded-card border border-line bg-paper p-[18px]"
        >
          <h2 id="contact-details-heading" className="mb-1 text-lg font-extrabold">
            {t('detailsHeading')}
          </h2>
          <p {...fallbackAttrs(businessName)} className="font-bold">
            {businessName.text}
          </p>
          <p {...fallbackAttrs(address)}>{address.text}</p>
          <p>
            <a href={`mailto:${settings.businessEmail}`} className={LINK}>
              <bdi dir="ltr">{settings.businessEmail}</bdi>
            </a>
          </p>
          <p>
            <a href={`tel:${settings.businessPhone}`} className={LINK}>
              <bdi dir="ltr">{settings.businessPhone}</bdi>
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
