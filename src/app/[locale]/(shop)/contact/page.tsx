import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import { ContactForm } from '@/components/shop/ContactForm';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Markdown } from '@/components/ui/Markdown';
import { Prose } from '@/components/ui/Prose';
import type MessageFile from '@/i18n/messages/he.json';
import { routing } from '@/i18n/routing';
import { fallbackAttrs, pick } from '@/lib/i18n-fallback';
import { issueFormToken } from '@/server/checkout/form-token';
import { renderMarkdown } from '@/server/content/markdown';
import { getPage } from '@/server/content/pages';
import { alternates } from '@/server/seo';
import { getSettings } from '@/server/settings/settings';

type Params = Promise<{ locale: string }>;

const LINK = 'inline-flex min-h-11 items-center underline underline-offset-[3px]';

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const page = await getPage('contact', locale);
  return page === null
    ? {}
    : { title: page.title.text, alternates: alternates('/contact', locale) };
}

// The contact page (storefront.md §8.10): the owner-written intro, the business details and the
// form. The form comes first in the markup, so it stays first when the columns stack.
export default async function ContactPage({ params }: { params: Params }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const page = await getPage('contact', locale);
  if (page === null) notFound();

  const [t, footer, common, settings, rawMessages] = await Promise.all([
    getTranslations({ locale, namespace: 'contact' }),
    getTranslations({ locale, namespace: 'common.footer' }),
    getTranslations({ locale, namespace: 'common' }),
    getSettings(),
    getMessages(),
  ]);
  const messages = rawMessages as unknown as typeof MessageFile;
  const businessName = pick(locale, settings.businessNameHe, settings.businessNameEn);
  const address = pick(locale, settings.businessAddressHe, settings.businessAddressEn);

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
        className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance lg:text-[34px]"
      >
        {page.title.text}
      </h1>
      <div data-testid="contact-intro">
        <Prose>
          <Markdown html={renderMarkdown(page.body.text)} {...fallbackAttrs(page.body)} />
        </Prose>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
        <section className="rounded-card bg-panel p-[18px]">
          <h2 className="mb-3 text-lg font-extrabold">{t('formHeading')}</h2>
          <NextIntlClientProvider locale={locale} messages={{ contact: messages.contact }}>
            <ContactForm formToken={issueFormToken()} locale={locale} />
          </NextIntlClientProvider>
        </section>
        <section
          data-testid="contact-details"
          aria-labelledby="contact-details-heading"
          className="grid content-start gap-1 rounded-card bg-panel p-[18px]"
        >
          <h2 id="contact-details-heading" className="mb-1 text-lg font-extrabold">
            {t('detailsHeading')}
          </h2>
          <p {...fallbackAttrs(businessName)} className="font-bold">
            {businessName.text}
          </p>
          <p {...fallbackAttrs(address)}>{address.text}</p>
          <p>
            {footer.rich('vat', {
              number: settings.businessRegNumber,
              num: (chunks) => <bdi className="tnum">{chunks}</bdi>,
            })}
          </p>
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
