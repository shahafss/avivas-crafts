import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { formatDate } from '@/lib/format-date';
import { requireAdmin } from '@/server/auth/require-admin';
import { listPages, listVersions } from '@/server/content/pages';

export async function generateMetadata() {
  const t = await getTranslations('admin.content.versions');
  return { title: t('title') };
}

// storefront.md §12.6: the history of the Terms or the Privacy Policy, newest first.
export default async function ContentVersionsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdmin();
  const { slug } = await params;
  const versions = await listVersions(slug);
  if (versions === null) notFound();
  const [t, pages] = await Promise.all([getTranslations('admin.content.versions'), listPages()]);
  const page = pages.find((row) => row.slug === slug);
  if (!page) notFound();
  return (
    <div className="grid grid-cols-1 gap-5">
      <header className="grid gap-2">
        <Link
          href={`/admin/content/${slug}`}
          prefetch={false}
          className="inline-flex min-h-11 items-center text-[15px] font-bold underline underline-offset-[3px]"
        >
          {t('backToEditor')}
        </Link>
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance">
          {t('heading', { title: page.titleHe })}
        </h1>
        <p className="text-ink-2">{t('intro')}</p>
      </header>
      <ol aria-label={t('listLabel')} className="grid gap-3">
        {versions.map((row) => (
          <li key={row.version}>
            <Link
              href={`/admin/content/${slug}/versions/${String(row.version)}`}
              prefetch={false}
              data-testid="content-version-link"
              data-version={row.version}
              className="flex min-h-11 items-center rounded-card border border-line bg-paper p-4 font-bold"
            >
              {t.rich('item', {
                n: row.version,
                date: formatDate(row.createdAt, 'he'),
                d: (chunks) => <bdi className="tnum">{chunks}</bdi>,
              })}
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
