import { getTranslations } from 'next-intl/server';
import { CategoriesManager } from '@/components/admin/CategoriesManager';
import { requireAdmin } from '@/server/auth/require-admin';
import { listCategories } from '@/server/catalog/categories';
import { createCategory, deleteCategory, reorderCategories, updateCategory } from './actions';

export default async function CategoriesPage() {
  await requireAdmin();
  const [t, categories] = await Promise.all([
    getTranslations('admin.categories'),
    listCategories(),
  ]);
  return (
    <div className="grid gap-5">
      <div>
        <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-ink-2">{t('intro')}</p>
      </div>
      <CategoriesManager
        categories={categories}
        actions={{ createCategory, updateCategory, reorderCategories, deleteCategory }}
      />
    </div>
  );
}
