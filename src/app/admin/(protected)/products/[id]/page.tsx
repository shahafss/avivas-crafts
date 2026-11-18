import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { ProductEditor } from '@/components/admin/ProductEditor';
import { requireAdmin } from '@/server/auth/require-admin';
import { getEditorData } from '@/server/catalog/admin-queries';
import { listCategories } from '@/server/catalog/categories';
import { getSettings } from '@/server/settings/settings';
import {
  deleteOptionGroup,
  deleteProduct,
  removeImage,
  reorderImages,
  setImageAlt,
  setMainImage,
  setProductOrderable,
  setProductState,
  updateProduct,
  upsertOptionGroup,
} from './actions';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Every page has a title (WCAG 2.4.2); "product details" tells the editor apart from the list.
export async function generateMetadata() {
  const t = await getTranslations('admin.products');
  return { title: t('sections.details') };
}

export default async function ProductEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [data, categories, settings] = await Promise.all([
    getEditorData(id),
    listCategories(),
    getSettings(),
  ]);
  if (!data) notFound();

  return (
    <ProductEditor
      product={data.product}
      categories={categories.map((item) => ({ id: item.id, nameHe: item.nameHe }))}
      homeCategoryName={
        categories.find((item) => item.id === settings.homeCategoryId)?.nameHe ?? null
      }
      images={data.images.map((image) => ({
        id: image.id,
        url: image.url,
        altHe: image.altHe,
        altEn: image.altEn,
      }))}
      groups={data.groups.map((group) => ({
        id: group.id,
        nameHe: group.nameHe,
        nameEn: group.nameEn,
        values: group.values.map((value) => ({
          id: value.id,
          labelHe: value.labelHe,
          labelEn: value.labelEn,
          deltaIlsMinor: value.deltaIlsMinor,
          deltaUsdMinor: value.deltaUsdMinor,
          swatch: value.swatch,
        })),
      }))}
      actions={{
        updateProduct,
        setProductState,
        setProductOrderable,
        deleteProduct,
        reorderImages,
        setMainImage,
        removeImage,
        setImageAlt,
        upsertOptionGroup,
        deleteOptionGroup,
      }}
    />
  );
}
