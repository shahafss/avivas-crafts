import { getTranslations } from 'next-intl/server';
import type { Locale } from '@/i18n/routing';

/** Placeholder footer: completed in T113 (business details, content links, language switch). */
export async function Footer({
  locale,
  brand,
}: {
  locale: Locale;
  brand: { text: string; lang?: 'he' };
}) {
  const t = await getTranslations({ locale, namespace: 'common.footer' });
  return (
    <footer className="rounded-t-[28px] bg-peach px-5 py-8 text-sm lg:px-6 lg:py-12">
      <div className="mx-auto max-w-[1240px]">
        <h2 lang={brand.lang} className="text-base font-extrabold">
          {brand.text}
        </h2>
        <p className="mt-4 text-ink-2">
          {t('copyright', { year: new Date().getFullYear(), shopName: brand.text })}
        </p>
      </div>
    </footer>
  );
}
