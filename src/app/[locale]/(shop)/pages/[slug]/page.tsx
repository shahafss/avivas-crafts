import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { StorageTable } from '@/components/shop/StorageTable';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { Markdown } from '@/components/ui/Markdown';
import { Prose } from '@/components/ui/Prose';
import { routing } from '@/i18n/routing';
import { fallbackAttrs } from '@/lib/i18n-fallback';
import { renderMarkdown } from '@/server/content/markdown';
import { getPage } from '@/server/content/pages';

type Params = Promise<{ locale: string; slug: string }>;

/** The six pages served here; `contact` has its own route (storefront.md §8.9, §8.10). */
const PAGE_SLUGS: readonly string[] = [
  'about',
  'shipping-returns',
  'terms',
  'privacy',
  'cookies',
  'accessibility',
];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale) || !PAGE_SLUGS.includes(slug)) return {};
  const page = await getPage(slug, locale);
  return page === null ? {} : { title: page.title.text };
}

// A content page (storefront.md §8.9): breadcrumbs, the owner-written title as the only h1 and the
// Markdown text in `Prose`; the Cookie Policy adds the device-storage table after the text.
export default async function ContentPage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale) || !PAGE_SLUGS.includes(slug)) notFound();
  const page = await getPage(slug, locale);
  if (page === null) notFound();

  const common = await getTranslations({ locale, namespace: 'common' });
  const html = renderMarkdown(page.body.text);
  return (
    <article className="mx-auto grid max-w-[68ch] gap-5 py-6 lg:py-10">
      <Breadcrumbs
        label={common('breadcrumbs')}
        items={[
          { label: common('home'), href: `/${locale}` },
          {
            label: page.title.text,
            ...(page.title.fallback ? { lang: 'he' as const } : {}),
          },
        ]}
      />
      <h1
        {...fallbackAttrs(page.title)}
        className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance lg:text-[34px]"
      >
        {page.title.text}
      </h1>
      <Prose>
        <Markdown html={html} {...fallbackAttrs(page.body)} />
      </Prose>
      {slug === 'cookies' ? <StorageTable locale={locale} /> : null}
    </article>
  );
}
