import { notFound } from 'next/navigation';
import { ProductEditor } from '@/components/admin/ProductEditor';
import { requireAdmin } from '@/server/auth/require-admin';
import { getEditorData } from '@/server/catalog/admin-queries';
import { listCategories } from '@/server/catalog/categories';
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

export default async function ProductEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [data, categories] = await Promise.all([getEditorData(id), listCategories()]);
  if (!data) notFound();

  return (
    <ProductEditor
      product={data.product}
      categories={categories.map((item) => ({ id: item.id, nameHe: item.nameHe }))}
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
