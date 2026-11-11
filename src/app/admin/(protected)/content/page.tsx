import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Icon } from '@/components/ui/Icon';
import { formatDateTime } from '@/lib/format-date';
import { requireAdmin } from '@/server/auth/require-admin';
import { listPages } from '@/server/content/pages';
import { isVersionedSlug } from '@/server/content/slugs';

export async function generateMetadata() {
  const t = await getTranslations('admin.content');
  return { title: t('title') };
}

// storefront.md §12.5. Every card is one link to the editor; the Terms and the Privacy Policy
// add a link to their history beside it, outside the card link.
export default async function ContentListPage() {
  await requireAdmin();
  const [t, pages] = await Promise.all([getTranslations('admin.content'), listPages()]);
  return (
    <div className="grid grid-cols-1 gap-5">
      <header className="grid gap-2">
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance">
          {t('title')}
        </h1>
        <p className="text-ink-2">{t('intro')}</p>
      </header>
      <ul aria-label={t('list.label')} className="grid gap-3">
        {pages.map((page) => (
          <li
            key={page.slug}
            data-testid="content-card"
            className="overflow-hidden rounded-card border border-line bg-panel"
          >
            <Link
              href={`/admin/content/${page.slug}`}
              prefetch={false}
              data-testid={`content-link-${page.slug}`}
              className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 p-4"
            >
              <span className="min-w-0 flex-1 text-lg font-bold" dir="auto">
                {page.titleHe}
              </span>
              <Icon name="chevron" className="text-ink-2" />
              <span className="flex basis-full flex-wrap items-center gap-x-3 gap-y-1.5">
                <span
                  data-testid={`content-badge-${page.slug}`}
                  className={
                    page.ownerEdited
                      ? 'rounded-pill border-[1.5px] border-field bg-panel px-3 py-0.5 text-[13px] font-bold'
                      : 'rounded-pill bg-sun-soft px-3 py-0.5 text-[13px] font-bold'
                  }
                >
                  {page.ownerEdited ? t('list.badgeEdited') : t('list.badgeDraft')}
                </span>
                <span className="text-[13px] text-ink-2">
                  {t.rich('list.updated', {
                    date: formatDateTime(page.updatedAt, 'he'),
                    d: (chunks) => <bdi className="tnum">{chunks}</bdi>,
                  })}
                </span>
              </span>
            </Link>
            {isVersionedSlug(page.slug) ? (
              <div className="border-t border-line px-4">
                <Link
                  href={`/admin/content/${page.slug}/versions`}
                  prefetch={false}
                  aria-label={t('list.versionsOf', { title: page.titleHe })}
                  data-testid={`content-versions-${page.slug}`}
                  className="inline-flex min-h-11 items-center text-[15px] font-bold underline underline-offset-[3px]"
                >
                  {t('list.versions')}
                </Link>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
