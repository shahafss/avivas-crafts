import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Markdown } from '@/components/ui/Markdown';
import { Prose } from '@/components/ui/Prose';
import { formatDate } from '@/lib/format-date';
import { requireAdmin } from '@/server/auth/require-admin';
import { renderMarkdown } from '@/server/content/markdown';
import { getVersion } from '@/server/content/pages';

export async function generateMetadata() {
  const t = await getTranslations('admin.content.versions');
  return { title: t('versionTitle') };
}

// storefront.md §12.6: one recorded version, read only, rendered like the public page.
export default async function ContentVersionPage({
  params,
}: {
  params: Promise<{ slug: string; version: string }>;
}) {
  await requireAdmin();
  const { slug, version } = await params;
  if (!/^\d{1,9}$/.test(version)) notFound();
  const row = await getVersion(slug, Number(version));
  if (row === null) notFound();
  const t = await getTranslations('admin.content.versions');
  return (
    <div className="grid grid-cols-1 gap-5">
      <header className="grid gap-2">
        <Link
          href={`/admin/content/${slug}/versions`}
          prefetch={false}
          className="inline-flex min-h-11 items-center text-[15px] font-bold underline underline-offset-[3px]"
        >
          {t('backToList')}
        </Link>
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance">
          {row.titleHe}
        </h1>
        <p className="text-ink-2" data-testid="content-version-meta">
          {t.rich('meta', {
            n: row.version,
            date: formatDate(row.createdAt, 'he'),
            d: (chunks) => <bdi className="tnum">{chunks}</bdi>,
          })}
        </p>
      </header>
      <article data-testid="content-version-body" className="grid gap-6">
        <Prose>
          <Markdown html={renderMarkdown(row.bodyHe)} lang="he" dir="rtl" />
        </Prose>
        {row.bodyEn === null ? null : (
          <section lang="en" dir="ltr" className="grid gap-2 border-t border-line pt-5">
            <h2 className="text-xl font-extrabold">{row.titleEn ?? t('englishHeading')}</h2>
            <Prose>
              <Markdown html={renderMarkdown(row.bodyEn)} lang="en" dir="ltr" />
            </Prose>
          </section>
        )}
      </article>
    </div>
  );
}
