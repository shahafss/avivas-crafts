import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { BuyBox } from '@/components/shop/BuyBox';
import { Gallery, type GalleryImage } from '@/components/shop/Gallery';
import { JsonLd } from '@/components/shop/JsonLd';
import type { SelectorGroup } from '@/components/shop/OptionSelector';
import { ProductGrid } from '@/components/shop/ProductGrid';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Disclosure } from '@/components/ui/Disclosure';
import { Icon, type IconName } from '@/components/ui/Icon';
import { LinkButton } from '@/components/ui/LinkButton';
import { Notice } from '@/components/ui/Notice';
import type MessageFile from '@/i18n/messages/he.json';
import { routing, type Locale } from '@/i18n/routing';
import { fallbackAttrs, pick } from '@/lib/i18n-fallback';
import { formatMoney } from '@/lib/money';
import {
  getPublishedProductBySlug,
  listAlsoLikeFor,
  type PublicProduct,
} from '@/server/catalog/public-queries';
import { getEnv } from '@/server/env';
import { effectivePaymentMethods } from '@/server/payments/availability';
import { alternates, ogLocale } from '@/server/seo';
import { getSettings, getZoneForCountry } from '@/server/settings/settings';
import { shopNameFor } from '@/server/settings/shop-name';

type Params = Promise<{ locale: string; slug: string }>;

/** Relative image URLs (fs driver in development and tests) become absolute for link previews. */
function absolute(url: string): string {
  return url.startsWith('/') ? `${getEnv().APP_ORIGIN}${url}` : url;
}

function priceText(product: PublicProduct, locale: Locale, from: string): string {
  const price = formatMoney(product.fromPriceMinor, 'ILS', locale);
  if (!product.priceVaries) return price;
  return locale === 'he' ? `${from}${price}` : `${from} ${price}`;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const product = await getPublishedProductBySlug(slug);
  if (product === null) return {};
  const [t, settings] = await Promise.all([
    getTranslations({ locale, namespace: 'shop.product' }),
    getSettings(),
  ]);
  const siteName = shopNameFor(settings, locale).text;
  const name = pick(locale, product.nameHe, product.nameEn).text;
  const description = pick(locale, product.descriptionHe, product.descriptionEn)
    .text.replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  // WhatsApp and Telegram ignore product:price:*, so the price leads the description.
  const text = `${priceText(product, locale, t('from'))} · ${description}`;
  const image = product.images[0];
  const origin = getEnv().APP_ORIGIN;
  return {
    title: name,
    description: text,
    alternates: alternates(`/p/${product.slug}`, locale),
    openGraph: {
      title: name,
      description: text,
      type: 'website',
      siteName,
      locale: ogLocale(locale),
      url: `${origin}/${locale}/p/${product.slug}`,
      ...(image === undefined
        ? {}
        : { images: [{ url: absolute(image.url800), width: 800, height: 1000, alt: name }] }),
    },
    twitter: {
      card: image === undefined ? 'summary' : 'summary_large_image',
      title: name,
      description: text,
      ...(image === undefined ? {} : { images: [absolute(image.url800)] }),
    },
    other: {
      'product:price:amount': (product.fromPriceMinor / 100).toFixed(2),
      'product:price:currency': 'ILS',
    },
  };
}

function Fact({
  icon,
  children,
  note,
}: {
  icon: IconName;
  children: ReactNode;
  note?: string | undefined;
}) {
  return (
    <li className="flex items-start gap-3">
      <Icon name={icon} className="mt-0.5 text-forest" />
      <span>
        <span className="block">{children}</span>
        {note === undefined ? null : <span className="block text-[13px] text-ink-2">{note}</span>}
      </span>
    </li>
  );
}

export default async function ProductPage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const product = await getPublishedProductBySlug(slug);
  if (product === null) notFound();

  const [t, common, rawMessages, settings, zone] = await Promise.all([
    getTranslations({ locale, namespace: 'shop.product' }),
    getTranslations({ locale, namespace: 'common' }),
    getMessages(),
    getSettings(),
    getZoneForCountry('IL'),
  ]);
  // The home-row category holds every piece, so sharing it says nothing (007 D8).
  const alsoLike = await listAlsoLikeFor(product, settings.homeCategoryId, 4);
  const messages = rawMessages as unknown as typeof MessageFile;

  const name = pick(locale, product.nameHe, product.nameEn);
  const description = pick(locale, product.descriptionHe, product.descriptionEn);
  const prepTime = pick(locale, product.prepTimeHe, product.prepTimeEn);
  const category =
    product.mainCategory === null
      ? null
      : pick(locale, product.mainCategory.nameHe, product.mainCategory.nameEn);

  const images: GalleryImage[] = product.images.map((image) => {
    const alt = pick(locale, image.altHe, image.altEn);
    return {
      id: image.id,
      src400: image.url400,
      src800: image.url800,
      src1600: image.url1600,
      width: image.width,
      height: image.height,
      alt: alt.text,
      ...(alt.text !== '' && alt.fallback ? { altLang: 'he' as const } : {}),
    };
  });

  const groups: SelectorGroup[] = product.groups.map((group) => {
    const groupName = pick(locale, group.nameHe, group.nameEn);
    return {
      id: group.id,
      name: groupName.text,
      ...(groupName.fallback ? { nameLang: 'he' as const } : {}),
      values: group.values.map((value) => {
        const label = pick(locale, value.labelHe, value.labelEn);
        return {
          id: value.id,
          label: label.text,
          ...(label.fallback ? { labelLang: 'he' as const } : {}),
          deltaMinor: value.deltaIlsMinor,
          swatch: value.swatch,
        };
      }),
    };
  });

  const shipping = zone?.enabled === true && zone.shippingEnabled ? zone : null;
  const pickup = zone?.enabled === true && zone.pickupEnabled;
  const methods = effectivePaymentMethods(settings, getEnv().PAYMENT_PROVIDER);
  const hasFacts = shipping !== null || pickup || methods.online || methods.offline;
  const base = `/${locale}`;
  const shippingPage = `${base}/pages/shipping-returns`;

  const crumbs = [
    { label: common('home'), href: base },
    ...(category === null
      ? []
      : [
          {
            label: category.text,
            href: `${base}/c/${product.mainCategory?.slug ?? ''}`,
            ...(category.fallback ? { lang: 'he' as const } : {}),
          },
        ]),
    { label: name.text, ...(name.fallback ? { lang: 'he' as const } : {}) },
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: name.text,
    description: description.text,
    image: product.images.map((image) => absolute(image.url800)),
    url: `${getEnv().APP_ORIGIN}/${locale}/p/${product.slug}`,
    offers: {
      '@type': 'Offer',
      price: (product.fromPriceMinor / 100).toFixed(2),
      priceCurrency: 'ILS',
      availability: product.orderable
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };

  const clientMessages = {
    shop: { gallery: messages.shop.gallery, product: messages.shop.product },
    cart: { stepper: messages.cart.stepper, add: messages.cart.add },
  };

  return (
    <div className="grid gap-8 pt-2 lg:gap-10">
      <JsonLd data={jsonLd} />
      <div className="grid gap-4">
        <Breadcrumbs label={t('breadcrumbs')} items={crumbs} />
        <NextIntlClientProvider locale={locale} messages={clientMessages}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start lg:gap-10">
            <Gallery name={name.text} images={images} />
            <div className="grid content-start gap-4 lg:sticky lg:top-[calc(var(--header-h)+16px)]">
              <h1
                {...fallbackAttrs(name)}
                className="text-[30px] leading-[1.15] font-bold tracking-[-0.01em] text-balance lg:text-[36px]"
              >
                {name.text}
              </h1>
              <BuyBox
                productId={product.id}
                name={{ text: name.text, ...(name.fallback ? { lang: 'he' as const } : {}) }}
                basePriceMinor={product.priceIlsMinor}
                groups={groups}
                orderable={product.orderable}
              >
                <Notice tone="made">
                  <p>
                    <strong>{t('madeLead')}</strong>{' '}
                    {t.rich('madeTime', {
                      prepTime: prepTime.text,
                      prep: (chunks) => <span {...fallbackAttrs(prepTime)}>{chunks}</span>,
                    })}
                  </p>
                </Notice>
                <p {...fallbackAttrs(description)} className="max-w-[65ch] whitespace-pre-line">
                  {description.text}
                </p>
              </BuyBox>

              {hasFacts ? (
                <ul
                  aria-label={t('factsLabel')}
                  className="grid gap-3 border-t border-line pt-4 text-[15px]"
                >
                  {shipping === null ? null : (
                    <Fact
                      icon="truck"
                      note={
                        shipping.freeShippingThresholdMinor === null
                          ? undefined
                          : t('shippingFreeOver', {
                              threshold: formatMoney(
                                shipping.freeShippingThresholdMinor,
                                shipping.currency,
                                locale,
                              ),
                            })
                      }
                    >
                      {shipping.shippingFeeMinor > 0
                        ? t('shippingFee', {
                            fee: formatMoney(shipping.shippingFeeMinor, shipping.currency, locale),
                          })
                        : t('shipping')}
                    </Fact>
                  )}
                  {pickup ? (
                    <Fact icon="pin" note={t('pickupNote')}>
                      {t('pickup')}
                    </Fact>
                  ) : null}
                  {methods.online ? (
                    <Fact icon="card" note={methods.offline ? t('payOnlineAlt') : undefined}>
                      {t('payOnline')}
                    </Fact>
                  ) : methods.offline ? (
                    <Fact icon="card">{t('payOffline')}</Fact>
                  ) : null}
                </ul>
              ) : null}

              <div>
                <Disclosure title={t('shippingTitle')}>
                  <p>{t('shippingText')}</p>
                  <LinkButton href={shippingPage} variant="quiet" className="text-ink">
                    {t('readMore')}
                  </LinkButton>
                </Disclosure>
                <Disclosure title={t('returnsTitle')}>
                  <p>{t('returnsText')}</p>
                  <LinkButton href={shippingPage} variant="quiet" className="text-ink">
                    {t('readMore')}
                  </LinkButton>
                </Disclosure>
              </div>
            </div>
          </div>
        </NextIntlClientProvider>
      </div>

      {alsoLike.length === 0 ? null : (
        <section data-testid="also-like" aria-labelledby="also-like-title" className="grid gap-4">
          <h2
            id="also-like-title"
            className="text-[28px] leading-tight font-bold tracking-tight lg:text-[40px]"
          >
            {t('alsoLike')}
          </h2>
          <ProductGrid
            products={alsoLike}
            locale={locale}
            label={t('relatedLabel')}
            eagerCount={0}
          />
        </section>
      )}
    </div>
  );
}
