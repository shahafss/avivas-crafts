'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type SyntheticEvent,
} from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormField } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { IconButton } from '@/components/ui/IconButton';
import { Notice } from '@/components/ui/Notice';
import { Toast } from '@/components/ui/Toast';
import type { CategoryInput } from '@/lib/validation/category';
import type { ActionResult } from '@/server/catalog/result';
import { useHydrated } from './useHydrated';

export interface CategoryItem {
  id: string;
  slug: string;
  nameHe: string;
  nameEn: string | null;
  productCount: number;
}

export interface CategoriesActions {
  createCategory: (input: CategoryInput) => Promise<ActionResult<{ id: string; slug: string }>>;
  updateCategory: (
    id: string,
    input: CategoryInput,
  ) => Promise<ActionResult<{ id: string; slug: string }>>;
  reorderCategories: (ids: string[]) => Promise<ActionResult>;
  deleteCategory: (input: { id: string; confirm: boolean }) => Promise<ActionResult>;
}

interface Feedback {
  message: string;
  tone: 'success' | 'error';
}

/** Failure -> the translated form error (with the product count when a delete is refused). */
function useFailureText() {
  const t = useTranslations();
  return (result: Extract<ActionResult, { ok: false }>): string => {
    const key = result.formError ?? Object.values(result.fieldErrors ?? {})[0] ?? 'admin.failed';
    return result.count === undefined ? t(key) : t(key, { count: result.count });
  };
}

/** The translated error of one field (a name too long shows under its own input), or undefined. */
function useFieldText() {
  const t = useTranslations();
  return (result: Extract<ActionResult, { ok: false }>, field: 'nameHe' | 'nameEn') => {
    const key = result.fieldErrors?.[field];
    return key === undefined ? undefined : t(key);
  };
}

/**
 * A refused name save: each name error shows under its own input; any other failure goes to the
 * form's general error. Shared by the row's edit form and the create form.
 */
function useApplyFailure() {
  const failureText = useFailureText();
  const fieldText = useFieldText();
  return (
    result: Extract<ActionResult, { ok: false }>,
    setHe: (text: string | undefined) => void,
    setEn: (text: string | undefined) => void,
    setOther: (text: string | undefined) => void,
  ): void => {
    const he = fieldText(result, 'nameHe');
    const en = fieldText(result, 'nameEn');
    setHe(he);
    setEn(en);
    if (he === undefined && en === undefined) setOther(failureText(result));
  };
}

function CategoryRow({
  item,
  index,
  total,
  busy,
  actions,
  onMove,
  onDelete,
  onFeedback,
}: {
  item: CategoryItem;
  index: number;
  total: number;
  busy: boolean;
  actions: CategoriesActions;
  onMove: (index: number, by: -1 | 1) => void;
  onDelete: (item: CategoryItem) => void;
  onFeedback: (feedback: Feedback) => void;
}) {
  const t = useTranslations('admin.categories');
  const applyFailure = useApplyFailure();
  const router = useRouter();
  const [nameHe, setNameHe] = useState(item.nameHe);
  const [nameEn, setNameEn] = useState(item.nameEn ?? '');
  const [error, setError] = useState<string | undefined>();
  const [errorHe, setErrorHe] = useState<string | undefined>();
  const [errorEn, setErrorEn] = useState<string | undefined>();
  const [saving, startSaving] = useTransition();

  function save(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(undefined);
    setErrorHe(undefined);
    setErrorEn(undefined);
    startSaving(async () => {
      const result = await actions.updateCategory(item.id, { nameHe, nameEn });
      if (result.ok) {
        onFeedback({ message: t('toast.updated'), tone: 'success' });
        router.refresh();
      } else {
        applyFailure(result, setErrorHe, setErrorEn, setError);
      }
    });
  }

  return (
    <li
      className="grid gap-3 rounded-card border border-line bg-paper p-4"
      data-testid="category-row"
      data-category-id={item.id}
    >
      <form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        <FormField
          label={t('row.nameHe')}
          value={nameHe}
          onChange={(event) => {
            setNameHe(event.target.value);
          }}
          maxLength={12}
          error={errorHe ?? error}
          data-testid="category-name-he"
        />
        <FormField
          label={t('row.nameEn')}
          value={nameEn}
          onChange={(event) => {
            setNameEn(event.target.value);
          }}
          maxLength={12}
          error={errorEn}
          dir="ltr"
        />
        <p className="text-sm text-ink-2 sm:col-span-2">
          <bdi dir="ltr">{item.slug}</bdi> · {t('products', { count: item.productCount })}
        </p>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button type="submit" variant="secondary" busy={saving} busyLabel={t('row.save')}>
            {t('row.save')}
          </Button>
          <IconButton
            label={t('row.moveUp')}
            onClick={() => {
              onMove(index, -1);
            }}
            className={index === 0 ? 'invisible' : 'border-[1.5px] border-field'}
            disabled={busy}
            tabIndex={index === 0 ? -1 : undefined}
            data-testid="category-up"
          >
            <Icon name="chevron" direction="down" className="rotate-180" />
          </IconButton>
          <IconButton
            label={t('row.moveDown')}
            onClick={() => {
              onMove(index, 1);
            }}
            className={index === total - 1 ? 'invisible' : 'border-[1.5px] border-field'}
            disabled={busy}
            tabIndex={index === total - 1 ? -1 : undefined}
            data-testid="category-down"
          >
            <Icon name="chevron" direction="down" />
          </IconButton>
          <Button
            variant="quiet"
            className="ms-auto text-alert"
            onClick={() => {
              onDelete(item);
            }}
            data-testid="category-delete"
          >
            {t('row.delete')}
          </Button>
        </div>
      </form>
    </li>
  );
}

export function CategoriesManager({
  categories,
  actions,
}: {
  categories: CategoryItem[];
  actions: CategoriesActions;
}) {
  const t = useTranslations('admin.categories');
  const failureText = useFailureText();
  const applyFailure = useApplyFailure();
  const router = useRouter();
  const hydrated = useHydrated();
  const [newHe, setNewHe] = useState('');
  const [newEn, setNewEn] = useState('');
  const [createError, setCreateError] = useState<string | undefined>();
  const [createErrorEn, setCreateErrorEn] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [deleting, setDeleting] = useState<CategoryItem | null>(null);
  const [pending, startTransition] = useTransition();
  // After a move the list is re-rendered from the server; focus follows the moved category.
  const focusAfter = useRef<{ id: string; prefer: string[] } | null>(null);
  useEffect(() => {
    const target = focusAfter.current;
    if (target === null) return;
    focusAfter.current = null;
    const row = document.querySelector(`[data-category-id="${target.id}"]`);
    for (const testId of target.prefer) {
      const button = row?.querySelector(`[data-testid="${testId}"]`);
      if (button instanceof HTMLElement && button.tabIndex >= 0) {
        button.focus();
        return;
      }
    }
  }, [categories]);
  const dismiss = useCallback(() => {
    setFeedback(null);
  }, []);

  function create(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    setCreateError(undefined);
    setCreateErrorEn(undefined);
    setFormError(undefined);
    startTransition(async () => {
      const result = await actions.createCategory({ nameHe: newHe, nameEn: newEn });
      if (result.ok) {
        setNewHe('');
        setNewEn('');
        setFeedback({ message: t('toast.created'), tone: 'success' });
        router.refresh();
      } else {
        applyFailure(result, setCreateError, setCreateErrorEn, setCreateError);
      }
    });
  }

  function move(index: number, by: -1 | 1): void {
    const ids = categories.map((item) => item.id);
    const target = index + by;
    const current = ids[index];
    const other = ids[target];
    if (current === undefined || other === undefined) return;
    ids[index] = other;
    ids[target] = current;
    focusAfter.current = {
      id: current,
      prefer: by === -1 ? ['category-up', 'category-down'] : ['category-down', 'category-up'],
    };
    setFormError(undefined);
    startTransition(async () => {
      const result = await actions.reorderCategories(ids);
      if (result.ok) {
        setFeedback({ message: t('toast.reordered'), tone: 'success' });
        router.refresh();
      } else {
        setFormError(failureText(result));
      }
    });
  }

  function confirmDelete(): void {
    if (deleting === null) return;
    const { id } = deleting;
    startTransition(async () => {
      const result = await actions.deleteCategory({ id, confirm: true });
      setDeleting(null);
      if (result.ok) {
        setFeedback({ message: t('toast.deleted'), tone: 'success' });
        router.refresh();
      } else {
        setFormError(failureText(result));
      }
    });
  }

  if (!hydrated) return <div aria-hidden="true" className="h-40 rounded-card bg-photo" />;

  return (
    <div className="grid gap-5">
      <form
        onSubmit={create}
        className="grid gap-3 rounded-card border border-line bg-paper p-4 sm:grid-cols-2"
      >
        <h2 className="text-xl font-extrabold sm:col-span-2">{t('add.title')}</h2>
        <FormField
          label={t('add.nameHe')}
          value={newHe}
          onChange={(event) => {
            setNewHe(event.target.value);
          }}
          maxLength={12}
          error={createError}
          data-testid="category-new-name-he"
        />
        <FormField
          label={t('add.nameEn')}
          value={newEn}
          onChange={(event) => {
            setNewEn(event.target.value);
          }}
          maxLength={12}
          error={createErrorEn}
          dir="ltr"
        />
        <div className="sm:col-span-2">
          <Button
            type="submit"
            busy={pending}
            busyLabel={t('add.submit')}
            data-testid="category-add"
          >
            {t('add.submit')}
          </Button>
        </div>
      </form>

      {formError === undefined ? null : (
        <Notice tone="alert" role="alert">
          {formError}
        </Notice>
      )}

      {categories.length === 0 ? (
        <p className="text-ink-2">{t('empty')}</p>
      ) : (
        <ul aria-label={t('listLabel')} className="grid gap-3">
          {categories.map((item, index) => (
            <CategoryRow
              key={`${item.id}-${item.nameHe}-${item.nameEn ?? ''}`}
              item={item}
              index={index}
              total={categories.length}
              busy={pending}
              actions={actions}
              onMove={move}
              onDelete={setDeleting}
              onFeedback={setFeedback}
            />
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleting !== null}
        title={t('delete.title')}
        confirmLabel={t('delete.confirm')}
        busy={pending}
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleting(null);
        }}
      >
        {deleting === null ? null : t('delete.text', { name: deleting.nameHe })}
      </ConfirmDialog>
      <Toast
        message={feedback?.message ?? null}
        tone={feedback?.tone ?? 'success'}
        onDismiss={dismiss}
      />
    </div>
  );
}
