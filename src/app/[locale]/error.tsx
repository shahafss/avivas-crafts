'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { LinkButton } from '@/components/ui/LinkButton';

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
      <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance lg:text-[34px]">
        {t('title')}
      </h1>
      <p className="text-ink-2">{t('text')}</p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>{t('retry')}</Button>
        <LinkButton href={`/${locale}`} variant="secondary">
          {t('home')}
        </LinkButton>
      </div>
    </div>
  );
}
