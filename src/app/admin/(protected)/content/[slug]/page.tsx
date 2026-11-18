import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { MarkdownEditor } from '@/components/admin/MarkdownEditor';
import { requireAdmin } from '@/server/auth/require-admin';
import { listPages } from '@/server/content/pages';
import { isContentSlug, isVersionedSlug } from '@/server/content/slugs';
import { previewContent, updateContentPage } from './actions';

export async function generateMetadata() {
  const t = await getTranslations('admin.content');
  return { title: t('title') };
}

// storefront.md §12.6. The admin layout already provides the `admin` message namespace
// (including `admin.content`) to the island.
export default async function ContentEditorPage({ params }: { params: Promise<{ slug: string }> }) {
  await requireAdmin();
  const { slug } = await params;
  if (!isContentSlug(slug)) notFound();
  const [t, pages] = await Promise.all([getTranslations('admin.content'), listPages()]);
  const page = pages.find((row) => row.slug === slug);
  if (!page) notFound();
  return (
    <div className="grid grid-cols-1 gap-5">
      <header className="grid gap-2">
        <Link
          href="/admin/content"
          prefetch={false}
          className="inline-flex min-h-11 items-center text-[15px] font-bold underline underline-offset-[3px]"
        >
          {t('editor.back')}
        </Link>
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight text-balance">
          {page.titleHe}
        </h1>
        <p className="text-ink-2">{t('editor.intro')}</p>
      </header>
      <MarkdownEditor
        slug={slug}
        version={page.version}
        titleHe={page.titleHe}
        bodyHe={page.bodyHe}
        titleEn={page.titleEn ?? ''}
        bodyEn={page.bodyEn ?? ''}
        versioned={isVersionedSlug(slug)}
        actions={{ updateContentPage, previewContent }}
      />
    </div>
  );
}
