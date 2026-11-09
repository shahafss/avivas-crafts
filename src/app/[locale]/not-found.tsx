import { getLocale, getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/Button';
import { LinkButton } from '@/components/ui/LinkButton';
import { TextField } from '@/components/ui/TextField';

export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations('errors.notFound');
  const common = await getTranslations('common');
  return (
    <div className="mx-auto grid max-w-xl gap-5 py-10 text-center">
      <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance lg:text-[34px]">
        {t('title')}
      </h1>
      <p className="text-ink-2">{t('text')}</p>
      <form
        action={`/${locale}/search`}
        method="get"
        role="search"
        className="grid gap-3 text-start"
      >
        <TextField
          name="q"
          type="search"
          label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
          maxLength={80}
        />
        <Button type="submit" variant="secondary">
          {t('searchButton')}
        </Button>
      </form>
      <div>
        <LinkButton href={`/${locale}`}>{common('allPieces')}</LinkButton>
      </div>
    </div>
  );
}
