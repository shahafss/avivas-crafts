'use client';

import { useLocale, useTranslations } from 'next-intl';

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('errors.generic');
  const locale = useLocale();
  return (
    <div className="mx-auto grid max-w-xl gap-5 py-10 text-center">
      <h1 className="text-[32px] leading-[1.15] font-bold tracking-[-0.01em] text-balance lg:text-[44px]">
        {t('title')}
      </h1>
      <p className="text-ink-2">{t('text')}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        {/* Plain elements with the `Button` classes, as `global-error.tsx` does: this boundary is in
            the first load of every page, and the `Button` module would be a second copy there
            (SC-004 budget). The home link is a full page load, which also resets the failed state. */}
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-[52px] items-center justify-center gap-2 rounded-pill bg-forest px-7 text-center text-base font-semibold text-paper transition-colors duration-150 ease-out hover:bg-forest-hover motion-safe:active:scale-[0.98]"
        >
          {t('retry')}
        </button>
        <a
          href={`/${locale}`}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-pill border-[1.5px] border-ink bg-transparent px-6 text-center text-base font-semibold text-ink transition-colors duration-150 ease-out hover:bg-photo"
        >
          {t('home')}
        </a>
      </div>
    </div>
  );
}
