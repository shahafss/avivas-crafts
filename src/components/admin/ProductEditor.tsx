'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useState, type ReactNode } from 'react';
import { Checkbox } from '@/components/ui/Checkbox';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FieldError, hintId } from '@/components/ui/Field';
import { FormField } from '@/components/ui/FormField';
import { Toast } from '@/components/ui/Toast';
import { cn } from '@/lib/cn';
import { minorToMajorText } from '@/lib/money-input';
import { priceMajorToMinor, type ProductUpdate } from '@/lib/validation/product';
import type { ProductState } from '@/server/catalog/admin-queries';
import type { ActionResult } from '@/server/catalog/result';
import { OptionGroupsEditor, type OptionActions, type OptionGroupItem } from './OptionGroupsEditor';
import { PhotoManager, type PhotoActions, type PhotoItem } from './PhotoManager';
import { PublishBar, type StateAction } from './PublishBar';
import { useHydrated } from './useHydrated';

export interface ProductEditorActions extends PhotoActions, OptionActions {
  updateProduct: (productId: string, input: ProductUpdate) => Promise<ActionResult>;
  setProductState: (productId: string, action: string) => Promise<ActionResult>;
  setProductOrderable: (productId: string, orderable: boolean) => Promise<ActionResult>;
  deleteProduct: (input: { id: string; confirm: boolean }) => Promise<ActionResult>;
}

export interface EditorProductData {
  id: string;
  slug: string;
  nameHe: string;
  nameEn: string | null;
  descriptionHe: string | null;
  descriptionEn: string | null;
  priceIlsMinor: number | null;
  priceUsdMinor: number | null;
  prepTimeHe: string | null;
  prepTimeEn: string | null;
  categoryIds: string[];
  state: ProductState;
  orderable: boolean;
}

interface Feedback {
  message: string;
  tone: 'success' | 'error';
}

/** Server field names (from Zod paths and publish checks) -> the form field they belong to. */
const FIELD_OF: Record<string, string> = {
  nameHe: 'nameHe',
  nameEn: 'nameEn',
  descriptionHe: 'descriptionHe',
  descriptionEn: 'descriptionEn',
  priceIlsMinor: 'priceIls',
  priceUsdMinor: 'priceUsd',
  prepTimeHe: 'prepTimeHe',
  prepTimeEn: 'prepTimeEn',
  // The "missing category" key is `categoryId` (its text is unchanged); the unknown-id error is `categoryIds`.
  categoryId: 'categories',
  categoryIds: 'categories',
};

const SECTION = 'grid gap-4 rounded-card border border-line bg-paper p-4 sm:p-5';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={SECTION}>
      <h2 className="text-xl font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

export function ProductEditor({
  product,
  categories,
  homeCategoryName,
  images,
  groups,
  actions,
}: {
  product: EditorProductData;
  /** In the shop's category order. */
  categories: { id: string; nameHe: string }[];
  /** Name of the home-row category, or null when none is chosen (for the hint). */
  homeCategoryName: string | null;
  images: PhotoItem[];
  groups: OptionGroupItem[];
  actions: ProductEditorActions;
}) {
  const t = useTranslations('admin.products');
  const common = useTranslations();
  const router = useRouter();
  const hydrated = useHydrated();

  const [nameHe, setNameHe] = useState(product.nameHe);
  const [nameEn, setNameEn] = useState(product.nameEn ?? '');
  const [descriptionHe, setDescriptionHe] = useState(product.descriptionHe ?? '');
  const [descriptionEn, setDescriptionEn] = useState(product.descriptionEn ?? '');
  const [priceIls, setPriceIls] = useState(minorToMajorText(product.priceIlsMinor));
  const [priceUsd, setPriceUsd] = useState(minorToMajorText(product.priceUsdMinor));
  const [prepTimeHe, setPrepTimeHe] = useState(product.prepTimeHe ?? '');
  const [prepTimeEn, setPrepTimeEn] = useState(product.prepTimeEn ?? '');
  const [categoryIds, setCategoryIds] = useState<string[]>(product.categoryIds);
  const [notOrderable, setNotOrderable] = useState(!product.orderable);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dismiss = useCallback(() => {
    setFeedback(null);
  }, []);
  const notify = useCallback((message: string, tone: 'success' | 'error') => {
    setFeedback({ message, tone });
  }, []);

  function failureMessage(result: Extract<ActionResult, { ok: false }>): string {
    return common(result.formError ?? Object.values(result.fieldErrors ?? {})[0] ?? 'admin.failed');
  }

  /** Shows a failed result next to its fields; returns false so callers can stop. */
  function showFailure(result: Extract<ActionResult, { ok: false }>): false {
    if (result.missingFields !== undefined) setMissing(result.missingFields);
    const fieldErrors: Record<string, string> = {};
    for (const [field, key] of Object.entries(result.fieldErrors ?? {})) {
      if (result.missingFields?.includes(field) === true) continue;
      fieldErrors[FIELD_OF[field] ?? field] = common(key);
    }
    setErrors(fieldErrors);
    if (result.missingFields === undefined) notify(failureMessage(result), 'error');
    return false;
  }

  /** Saves the fields and the "not available" switch. The state does not change. */
  async function saveAll(): Promise<boolean> {
    const next: Record<string, string> = {};
    const ils = priceIls.trim() === '' ? null : priceMajorToMinor(priceIls);
    const usd = priceUsd.trim() === '' ? null : priceMajorToMinor(priceUsd);
    if (priceIls.trim() !== '' && ils === null) next.priceIls = t('errors.invalid_price');
    if (priceUsd.trim() !== '' && usd === null) next.priceUsd = t('errors.invalid_price');
    if (Object.keys(next).length > 0) {
      setErrors(next);
      return false;
    }
    setErrors({});
    const updated = await actions.updateProduct(product.id, {
      nameHe,
      nameEn,
      descriptionHe,
      descriptionEn,
      priceIlsMinor: ils,
      priceUsdMinor: usd,
      prepTimeHe,
      prepTimeEn,
      categoryIds,
    });
    if (!updated.ok) return showFailure(updated);
    // Changed when the switch and the saved state agree (orderable = not notOrderable).
    if (notOrderable === product.orderable) {
      const orderable = await actions.setProductOrderable(product.id, !notOrderable);
      if (!orderable.ok) return showFailure(orderable);
    }
    return true;
  }

  async function onSave(): Promise<void> {
    setBusy(true);
    setMissing([]);
    try {
      if (await saveAll()) {
        notify(t('toast.saved'), 'success');
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  async function onState(action: StateAction): Promise<void> {
    setBusy(true);
    setMissing([]);
    try {
      // Every state change takes what is on the screen, so nothing typed is left behind.
      if (!(await saveAll())) return;
      const result = await actions.setProductState(product.id, action);
      if (!result.ok) {
        showFailure(result);
        return;
      }
      const toast = { publish: 'published', hide: 'hidden', unhide: 'unhidden', draft: 'drafted' };
      notify(t(`toast.${toast[action]}`), 'success');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(): Promise<void> {
    setBusy(true);
    try {
      const result = await actions.deleteProduct({ id: product.id, confirm: true });
      if (result.ok) {
        router.push('/admin/products');
        return;
      }
      setConfirmDelete(false);
      showFailure(result);
    } finally {
      setBusy(false);
    }
  }

  const stateBadge = cn(
    'rounded-pill px-2.5 py-0.5 text-[13px] font-bold',
    product.state === 'published' && 'bg-sage',
    product.state === 'draft' && 'bg-photo',
    product.state === 'hidden' && 'border-[1.5px] border-field bg-paper',
  );

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Link
          href="/admin/products"
          prefetch={false}
          className="inline-flex min-h-11 w-fit items-center text-[15px] font-bold underline underline-offset-[3px]"
        >
          {t('editor.back')}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[28px] leading-[1.15] font-extrabold tracking-tight" dir="auto">
            {product.nameHe}
          </h1>
          <span className={stateBadge} data-testid="product-state">
            {t(`state.${product.state}`)}
          </span>
        </div>
        <p className="text-[13px] text-ink-2">{t('editor.address', { slug: product.slug })}</p>
      </div>

      {!hydrated ? (
        <p role="status" className="text-ink-2">
          {t('editor.loading')}
        </p>
      ) : (
        <>
          <Section title={t('sections.details')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label={t('fields.nameHe')}
                value={nameHe}
                maxLength={120}
                error={errors.nameHe}
                onChange={(event) => {
                  setNameHe(event.target.value);
                }}
                data-testid="field-nameHe"
              />
              <FormField
                label={t('fields.nameEn')}
                hint={t('fields.nameEnHint')}
                value={nameEn}
                maxLength={120}
                dir="ltr"
                error={errors.nameEn}
                onChange={(event) => {
                  setNameEn(event.target.value);
                }}
                data-testid="field-nameEn"
              />
              <FormField
                as="textarea"
                label={t('fields.descriptionHe')}
                value={descriptionHe}
                maxLength={5000}
                rows={5}
                error={errors.descriptionHe}
                className="sm:col-span-2"
                onChange={(event) => {
                  setDescriptionHe(event.target.value);
                }}
                data-testid="field-descriptionHe"
              />
              <FormField
                as="textarea"
                label={t('fields.descriptionEn')}
                value={descriptionEn}
                maxLength={5000}
                rows={4}
                dir="ltr"
                error={errors.descriptionEn}
                className="sm:col-span-2"
                onChange={(event) => {
                  setDescriptionEn(event.target.value);
                }}
                data-testid="field-descriptionEn"
              />
              <FormField
                label={t('fields.priceIls')}
                hint={t('fields.priceIlsHint')}
                value={priceIls}
                inputMode="decimal"
                dir="ltr"
                error={errors.priceIls}
                onChange={(event) => {
                  setPriceIls(event.target.value);
                }}
                data-testid="field-priceIls"
              />
              <FormField
                label={t('fields.priceUsd')}
                hint={t('fields.priceUsdHint')}
                value={priceUsd}
                inputMode="decimal"
                dir="ltr"
                error={errors.priceUsd}
                onChange={(event) => {
                  setPriceUsd(event.target.value);
                }}
                data-testid="field-priceUsd"
              />
              <fieldset
                data-testid="field-categories"
                aria-describedby={
                  errors.categories === undefined
                    ? hintId('field-categories')
                    : `${hintId('field-categories')} field-categories-error`
                }
                className="min-w-0"
              >
                <legend className="text-sm leading-snug font-bold">{t('categoriesLabel')}</legend>
                <p id={hintId('field-categories')} className="text-[13px] leading-snug text-ink-2">
                  {homeCategoryName === null
                    ? t('categoriesHintNoHome')
                    : t('categoriesHint', { home: homeCategoryName })}
                </p>
                <div className="mt-1.5 grid">
                  {categories.map((item) => (
                    <Checkbox
                      key={item.id}
                      label={item.nameHe}
                      checked={categoryIds.includes(item.id)}
                      onChange={(event) => {
                        const on = event.target.checked;
                        setCategoryIds((current) =>
                          on ? [...current, item.id] : current.filter((value) => value !== item.id),
                        );
                      }}
                    />
                  ))}
                </div>
                {errors.categories === undefined ? null : (
                  <FieldError id="field-categories">{errors.categories}</FieldError>
                )}
              </fieldset>
              <FormField
                label={t('fields.prepTimeHe')}
                hint={t('fields.prepTimeHeHint')}
                value={prepTimeHe}
                maxLength={120}
                error={errors.prepTimeHe}
                onChange={(event) => {
                  setPrepTimeHe(event.target.value);
                }}
                data-testid="field-prepTimeHe"
              />
              <FormField
                label={t('fields.prepTimeEn')}
                value={prepTimeEn}
                maxLength={120}
                dir="ltr"
                error={errors.prepTimeEn}
                onChange={(event) => {
                  setPrepTimeEn(event.target.value);
                }}
                data-testid="field-prepTimeEn"
              />
            </div>
          </Section>

          <Section title={t('sections.photos')}>
            <PhotoManager
              productId={product.id}
              initial={images}
              actions={actions}
              onFeedback={notify}
            />
          </Section>

          <Section title={t('sections.options')}>
            <OptionGroupsEditor
              productId={product.id}
              initial={groups}
              hasUsdPrice={product.priceUsdMinor !== null}
              published={product.state === 'published'}
              actions={actions}
              onFeedback={notify}
            />
          </Section>

          <Section title={t('sections.publish')}>
            <PublishBar
              state={product.state}
              notOrderable={notOrderable}
              onNotOrderableChange={setNotOrderable}
              missing={missing}
              busy={busy}
              onSave={() => void onSave()}
              onState={(action) => void onState(action)}
              onDelete={() => {
                setConfirmDelete(true);
              }}
            />
          </Section>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={t('bar.deleteTitle')}
        confirmLabel={t('bar.deleteConfirm')}
        busy={busy}
        onConfirm={() => void onDelete()}
        onCancel={() => {
          setConfirmDelete(false);
        }}
      >
        {t('bar.deleteText')}
      </ConfirmDialog>
      <Toast
        message={feedback?.message ?? null}
        tone={feedback?.tone ?? 'success'}
        onDismiss={dismiss}
      />
    </div>
  );
}
