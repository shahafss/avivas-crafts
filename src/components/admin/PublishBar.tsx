'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import type { ProductState } from '@/server/catalog/admin-queries';

export type StateAction = 'publish' | 'hide' | 'unhide' | 'draft';

/**
 * Save, state buttons, the "not available to order" and "Show as New" boxes, delete, and what
 * blocks publishing.
 */
export function PublishBar({
  state,
  notOrderable,
  onNotOrderableChange,
  showAsNew,
  onShowAsNewChange,
  missing,
  busy,
  onSave,
  onState,
  onDelete,
}: {
  state: ProductState;
  notOrderable: boolean;
  onNotOrderableChange: (value: boolean) => void;
  showAsNew: boolean;
  onShowAsNewChange: (value: boolean) => void;
  /** Field names that block publishing (`nameHe`, `images`, ...), shown with their Hebrew labels. */
  missing: string[];
  busy: boolean;
  onSave: () => void;
  onState: (action: StateAction) => void;
  onDelete: () => void;
}) {
  const t = useTranslations('admin.products');
  return (
    <div className="grid gap-4">
      {missing.length === 0 ? null : (
        <Notice tone="alert" role="alert">
          <p className="font-bold">{t('bar.missingTitle')}</p>
          <ul className="mt-1 list-disc ps-5" data-testid="publish-errors">
            {missing.map((field) => (
              <li key={field}>{t(`missing.${field}`)}</li>
            ))}
          </ul>
        </Notice>
      )}

      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
        <input
          type="checkbox"
          checked={notOrderable}
          onChange={(event) => {
            onNotOrderableChange(event.target.checked);
          }}
          className="mt-1 size-6 shrink-0 accent-ink"
          data-testid="orderable-toggle"
        />
        <span>
          <span className="block font-bold">{t('bar.orderable')}</span>
          <span className="block text-[13px] text-ink-2">{t('bar.orderableHint')}</span>
        </span>
      </label>

      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
        <input
          type="checkbox"
          checked={showAsNew}
          onChange={(event) => {
            onShowAsNewChange(event.target.checked);
          }}
          className="mt-1 size-6 shrink-0 accent-ink"
          data-testid="show-as-new-toggle"
        />
        <span>
          <span className="block font-bold">{t('bar.showAsNew')}</span>
          <span className="block text-[13px] text-ink-2">{t('bar.showAsNewHint')}</span>
        </span>
      </label>

      <div className="flex flex-wrap gap-3">
        <Button
          variant={state === 'draft' ? 'secondary' : 'primary'}
          busy={busy}
          busyLabel={t('bar.save')}
          onClick={onSave}
          data-testid="save-product"
        >
          {t('bar.save')}
        </Button>
        {state === 'draft' ? (
          <Button
            busy={busy}
            busyLabel={t('bar.publish')}
            onClick={() => {
              onState('publish');
            }}
            data-testid="publish"
          >
            {t('bar.publish')}
          </Button>
        ) : null}
        {state === 'published' ? (
          <Button
            variant="secondary"
            busy={busy}
            busyLabel={t('bar.hide')}
            onClick={() => {
              onState('hide');
            }}
            data-testid="hide"
          >
            {t('bar.hide')}
          </Button>
        ) : null}
        {state === 'hidden' ? (
          <Button
            variant="secondary"
            busy={busy}
            busyLabel={t('bar.unhide')}
            onClick={() => {
              onState('unhide');
            }}
            data-testid="unhide"
          >
            {t('bar.unhide')}
          </Button>
        ) : null}
        {state === 'draft' ? null : (
          <Button
            variant="secondary"
            busy={busy}
            busyLabel={t('bar.setDraft')}
            onClick={() => {
              onState('draft');
            }}
            data-testid="set-draft"
          >
            {t('bar.setDraft')}
          </Button>
        )}
      </div>

      <div>
        <Button
          variant="quiet"
          className="text-alert"
          onClick={onDelete}
          data-testid="delete-product"
        >
          {t('bar.delete')}
        </Button>
      </div>
    </div>
  );
}
