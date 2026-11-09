import { getTranslations } from 'next-intl/server';
import { LinkButton } from '@/components/ui/LinkButton';

export default async function AdminNotFound() {
  const t = await getTranslations('admin.notFound');
  return (
    <main
      id="main"
      className="mx-auto grid min-h-dvh max-w-md content-center gap-4 px-4 py-10 text-center"
    >
      <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight">{t('title')}</h1>
      <p className="text-ink-2">{t('text')}</p>
      <div>
        <LinkButton href="/admin" prefetch={false}>
          {t('toDashboard')}
        </LinkButton>
      </div>
    </main>
  );
}
