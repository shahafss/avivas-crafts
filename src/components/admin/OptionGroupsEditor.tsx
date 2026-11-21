'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FieldError, errorId } from '@/components/ui/Field';
import { FormField } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { Notice } from '@/components/ui/Notice';
import { cn } from '@/lib/cn';
import { deltaMajorToMinor, minorToMajorText } from '@/lib/money-input';
import { SWATCHES, type OptionGroupInput, type Swatch } from '@/lib/validation/product';
import type { ActionResult } from '@/server/catalog/result';

export interface OptionValueItem {
  id: string;
  labelHe: string;
  labelEn: string | null;
  deltaIlsMinor: number;
  deltaUsdMinor: number | null;
  swatch: Swatch | null;
}

export interface OptionGroupItem {
  id: string;
  nameHe: string;
  nameEn: string | null;
  values: OptionValueItem[];
}

export interface OptionActions {
  upsertOptionGroup: (
    productId: string,
    group: OptionGroupInput,
  ) => Promise<ActionResult<{ id: string; valueIds: string[] }>>;
  deleteOptionGroup: (input: {
    productId: string;
    groupId: string;
    confirm: boolean;
  }) => Promise<ActionResult>;
}

const OPTIONS_ID = 'product-options';
const OPTIONS_FIELD = 'options';
const OPTIONS_ERROR_ID = errorId(OPTIONS_ID);

interface ValueDraft {
  key: number;
  id?: string;
  labelHe: string;
  labelEn: string;
  delta: string;
  deltaUsd: string;
  swatch: Swatch | null;
}

interface GroupDraft {
  key: number;
  id?: string;
  nameHe: string;
  nameEn: string;
  values: ValueDraft[];
  error?: string | undefined;
  /** Edited since the last save: the group's own save button has not been pressed. */
  dirty: boolean;
}

const SWATCH_CHOICES: (Swatch | null)[] = [null, ...SWATCHES];

function Swatches({
  name,
  value,
  onChange,
}: {
  name: string;
  value: Swatch | null;
  onChange: (value: Swatch | null) => void;
}) {
  const t = useTranslations('admin.products');

  /** Arrow keys move the choice (and focus) like a native radio group; one button is in the tab order. */
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const forward = ['ArrowDown', rtl ? 'ArrowLeft' : 'ArrowRight'];
    const backward = ['ArrowUp', rtl ? 'ArrowRight' : 'ArrowLeft'];
    const by = forward.includes(event.key) ? 1 : backward.includes(event.key) ? -1 : 0;
    if (by === 0) return;
    event.preventDefault();
    const index = SWATCH_CHOICES.indexOf(value);
    const next = SWATCH_CHOICES[(index + by + SWATCH_CHOICES.length) % SWATCH_CHOICES.length];
    onChange(next ?? null);
    const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="radio"]');
    buttons.item((index + by + SWATCH_CHOICES.length) % SWATCH_CHOICES.length).focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={t('options.swatchLegend')}
      className="grid gap-1.5"
      onKeyDown={onKeyDown}
    >
      <span className="text-sm font-bold">{t('options.swatchLegend')}</span>
      <div className="flex flex-wrap gap-1.5">
        {SWATCH_CHOICES.map((swatch) => {
          const label = t(`swatch.${swatch ?? 'none'}`);
          const checked = value === swatch;
          return (
            <button
              key={swatch ?? 'none'}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={label}
              title={label}
              tabIndex={checked ? 0 : -1}
              onClick={() => {
                onChange(swatch);
              }}
              data-testid={
                swatch === null ? `option-swatch-none-${name}` : `option-swatch-${swatch}`
              }
              className={cn(
                swatch === null
                  ? 'inline-flex items-center justify-center bg-paper'
                  : `swatch-${swatch}`,
                'size-11 rounded-full border-[1.5px]',
                swatch === null ? 'border-field' : 'border-ink/25',
                checked &&
                  (swatch === null
                    ? 'border-ink ring-2 ring-ink ring-inset'
                    : 'border-ink ring-2 ring-ink ring-offset-2'),
              )}
            >
              {swatch === null ? <Icon name="close" size={18} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

let clientKey = 0;
/** Local identity of a row that has no database id yet. */
function nextKey(): number {
  clientKey += 1;
  return clientKey;
}

function toDraft(group: OptionGroupItem, key: () => number): GroupDraft {
  return {
    key: key(),
    id: group.id,
    nameHe: group.nameHe,
    nameEn: group.nameEn ?? '',
    dirty: false,
    values: group.values.map((value) => ({
      key: key(),
      id: value.id,
      labelHe: value.labelHe,
      labelEn: value.labelEn ?? '',
      delta: value.deltaIlsMinor === 0 ? '' : minorToMajorText(value.deltaIlsMinor),
      deltaUsd: value.deltaUsdMinor === null ? '' : minorToMajorText(value.deltaUsdMinor),
      swatch: value.swatch,
    })),
  };
}

/** Option groups of one product: each group is edited and saved on its own. */
export function OptionGroupsEditor({
  productId,
  initial,
  hasUsdPrice,
  published,
  actions,
  onFeedback,
  error: requiredError,
  onChange,
}: {
  productId: string;
  initial: OptionGroupItem[];
  /** The product has a USD base price, so option adjustments need a USD amount too. */
  hasUsdPrice: boolean;
  published: boolean;
  actions: OptionActions;
  onFeedback: (message: string, tone: 'success' | 'error') => void;
  /** "Required" message from a failed publish; shown as a red outline and a line under the heading. */
  error?: string | undefined;
  /** Called when the groups are edited, added or removed. */
  onChange?: (() => void) | undefined;
}) {
  const t = useTranslations('admin.products');
  const common = useTranslations();
  const [groups, setGroups] = useState<GroupDraft[]>(() => initial.map((g) => toDraft(g, nextKey)));
  const [savingKey, setSavingKey] = useState<number | null>(null);
  const [removeGroup, setRemoveGroup] = useState<GroupDraft | null>(null);
  const [removeValue, setRemoveValue] = useState<{ group: number; value: number } | null>(null);
  const [pending, startTransition] = useTransition();

  function patch(key: number, change: (group: GroupDraft) => GroupDraft): void {
    onChange?.();
    setGroups((current) =>
      current.map((group) => (group.key === key ? { ...change(group), dirty: true } : group)),
    );
  }

  function addGroup(): void {
    onChange?.();
    setGroups((current) => [
      ...current,
      { key: nextKey(), nameHe: '', nameEn: '', values: [], dirty: true },
    ]);
  }

  function addValue(groupKey: number): void {
    patch(groupKey, (group) => ({
      ...group,
      values: [
        ...group.values,
        { key: nextKey(), labelHe: '', labelEn: '', delta: '', deltaUsd: '', swatch: null },
      ],
    }));
  }

  function dropValue(groupKey: number, valueKey: number): void {
    patch(groupKey, (group) => ({
      ...group,
      values: group.values.filter((value) => value.key !== valueKey),
    }));
  }

  function save(group: GroupDraft): void {
    const values: OptionGroupInput['values'] = [];
    for (const value of group.values) {
      const delta = deltaMajorToMinor(value.delta);
      const deltaUsd = value.deltaUsd.trim() === '' ? null : deltaMajorToMinor(value.deltaUsd);
      if (delta === null || (value.deltaUsd.trim() !== '' && deltaUsd === null)) {
        patch(group.key, (current) => ({ ...current, error: t('errors.invalid_delta') }));
        return;
      }
      values.push({
        ...(value.id === undefined ? {} : { id: value.id }),
        labelHe: value.labelHe,
        labelEn: value.labelEn,
        deltaIlsMinor: delta,
        deltaUsdMinor: deltaUsd,
        swatch: value.swatch,
      });
    }
    patch(group.key, (current) => ({ ...current, error: undefined }));
    setSavingKey(group.key);
    startTransition(async () => {
      const result = await actions.upsertOptionGroup(productId, {
        ...(group.id === undefined ? {} : { id: group.id }),
        nameHe: group.nameHe,
        nameEn: group.nameEn,
        values,
      });
      setSavingKey(null);
      if (result.ok) {
        const { id, valueIds } = result.data;
        setGroups((all) =>
          all.map((item) =>
            item.key === group.key
              ? {
                  ...item,
                  id,
                  error: undefined,
                  dirty: false,
                  values: item.values.map((value, index) => {
                    const valueId = valueIds[index];
                    return valueId === undefined ? value : { ...value, id: valueId };
                  }),
                }
              : item,
          ),
        );
        onFeedback(t('options.saved'), 'success');
      } else {
        const key =
          Object.values(result.fieldErrors ?? {})[0] ?? result.formError ?? 'admin.failed';
        patch(group.key, (current) => ({ ...current, error: common(key) }));
      }
    });
  }

  function confirmRemoveGroup(): void {
    const group = removeGroup;
    if (group === null) return;
    if (group.id === undefined) {
      setGroups((current) => current.filter((item) => item.key !== group.key));
      setRemoveGroup(null);
      onChange?.();
      return;
    }
    const { id } = group;
    startTransition(async () => {
      const result = await actions.deleteOptionGroup({ productId, groupId: id, confirm: true });
      setRemoveGroup(null);
      if (result.ok) {
        setGroups((current) => current.filter((item) => item.key !== group.key));
        onChange?.();
        onFeedback(t('options.deleted'), 'success');
      } else {
        patch(group.key, (current) => ({
          ...current,
          error: common(result.formError ?? 'admin.failed'),
        }));
      }
    });
  }

  function confirmRemoveValue(): void {
    if (removeValue !== null) dropValue(removeValue.group, removeValue.value);
    setRemoveValue(null);
  }

  return (
    <div
      className={cn(
        'grid gap-4',
        requiredError !== undefined &&
          'rounded-card outline-[1.5px] outline-offset-4 outline-alert',
      )}
      role="group"
      aria-label={t('sections.options')}
    >
      {requiredError === undefined ? null : (
        <FieldError id={OPTIONS_ID}>{requiredError}</FieldError>
      )}
      <p className="text-ink-2">{t('options.hint')}</p>
      {groups.length === 0 ? <p className="text-ink-2">{t('options.empty')}</p> : null}

      {groups.map((group, groupIndex) => (
        <section
          key={group.key}
          className="grid gap-4 rounded-card border border-line bg-paper p-4"
          data-testid="option-group"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField
              label={t('options.groupName')}
              hint={t('options.groupNameHint')}
              value={group.nameHe}
              maxLength={60}
              onChange={(event) => {
                patch(group.key, (current) => ({ ...current, nameHe: event.target.value }));
              }}
              data-testid="option-group-name"
              data-field={groupIndex === 0 ? OPTIONS_FIELD : undefined}
              aria-invalid={groupIndex === 0 && requiredError !== undefined ? true : undefined}
              aria-describedby={
                groupIndex === 0 && requiredError !== undefined ? OPTIONS_ERROR_ID : undefined
              }
            />
            <FormField
              label={t('options.groupNameEn')}
              value={group.nameEn}
              maxLength={60}
              dir="ltr"
              onChange={(event) => {
                patch(group.key, (current) => ({ ...current, nameEn: event.target.value }));
              }}
              data-testid="option-group-name-en"
            />
          </div>

          <ul className="grid gap-3">
            {group.values.map((value) => (
              <li
                key={value.key}
                className="grid gap-3 rounded-chip border border-line p-3 sm:grid-cols-2"
                data-testid="option-value"
              >
                <FormField
                  label={t('options.valueLabel')}
                  value={value.labelHe}
                  maxLength={60}
                  onChange={(event) => {
                    patch(group.key, (current) => ({
                      ...current,
                      values: current.values.map((item) =>
                        item.key === value.key ? { ...item, labelHe: event.target.value } : item,
                      ),
                    }));
                  }}
                  data-testid="option-value-label"
                />
                <FormField
                  label={t('options.valueLabelEn')}
                  value={value.labelEn}
                  maxLength={60}
                  dir="ltr"
                  onChange={(event) => {
                    patch(group.key, (current) => ({
                      ...current,
                      values: current.values.map((item) =>
                        item.key === value.key ? { ...item, labelEn: event.target.value } : item,
                      ),
                    }));
                  }}
                  data-testid="option-value-label-en"
                />
                <FormField
                  label={t('options.delta')}
                  hint={t('options.deltaHint')}
                  value={value.delta}
                  inputMode="decimal"
                  dir="ltr"
                  onChange={(event) => {
                    patch(group.key, (current) => ({
                      ...current,
                      values: current.values.map((item) =>
                        item.key === value.key ? { ...item, delta: event.target.value } : item,
                      ),
                    }));
                  }}
                  data-testid="option-value-delta"
                />
                {hasUsdPrice ? (
                  <FormField
                    label={t('options.deltaUsd')}
                    hint={t('options.deltaHint')}
                    value={value.deltaUsd}
                    inputMode="decimal"
                    dir="ltr"
                    onChange={(event) => {
                      patch(group.key, (current) => ({
                        ...current,
                        values: current.values.map((item) =>
                          item.key === value.key ? { ...item, deltaUsd: event.target.value } : item,
                        ),
                      }));
                    }}
                    data-testid="option-value-delta-usd"
                  />
                ) : null}
                <div className="sm:col-span-2">
                  <Swatches
                    name={String(value.key)}
                    value={value.swatch}
                    onChange={(swatch) => {
                      patch(group.key, (current) => ({
                        ...current,
                        values: current.values.map((item) =>
                          item.key === value.key ? { ...item, swatch } : item,
                        ),
                      }));
                    }}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button
                    variant="quiet"
                    className="text-alert"
                    onClick={() => {
                      if (value.id === undefined) dropValue(group.key, value.key);
                      else setRemoveValue({ group: group.key, value: value.key });
                    }}
                    data-testid="option-value-remove"
                  >
                    {t('options.valueRemove')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          {published && group.values.length < 2 ? (
            <p className="text-[13px] text-ink-2">{t('options.valuesRequired')}</p>
          ) : null}
          {group.dirty ? (
            <p className="text-[13px] font-bold text-ink-2">{t('options.unsaved')}</p>
          ) : null}
          {group.error === undefined ? null : (
            <Notice tone="alert" role="alert">
              {group.error}
            </Notice>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                addValue(group.key);
              }}
              data-testid="option-value-add"
            >
              <Icon name="plus" />
              {t('options.valueAdd')}
            </Button>
            <Button
              busy={savingKey === group.key}
              busyLabel={t('options.groupSave')}
              onClick={() => {
                save(group);
              }}
              data-testid="option-group-save"
            >
              {t('options.groupSave')}
            </Button>
            <Button
              variant="quiet"
              className="ms-auto text-alert"
              onClick={() => {
                setRemoveGroup(group);
              }}
              data-testid="option-group-delete"
            >
              {t('options.groupDelete')}
            </Button>
          </div>
        </section>
      ))}

      <div>
        <Button
          variant="secondary"
          onClick={addGroup}
          data-testid="option-group-add"
          data-field={groups.length === 0 ? OPTIONS_FIELD : undefined}
          aria-describedby={
            groups.length === 0 && requiredError !== undefined ? OPTIONS_ERROR_ID : undefined
          }
        >
          <Icon name="plus" />
          {t('options.add')}
        </Button>
      </div>

      <ConfirmDialog
        open={removeGroup !== null}
        title={t('options.groupDeleteTitle')}
        confirmLabel={t('options.groupDeleteConfirm')}
        busy={pending && removeGroup !== null}
        onConfirm={confirmRemoveGroup}
        onCancel={() => {
          setRemoveGroup(null);
        }}
      >
        {t('options.groupDeleteText')}
      </ConfirmDialog>
      <ConfirmDialog
        open={removeValue !== null}
        title={t('options.valueRemoveTitle')}
        confirmLabel={t('options.valueRemoveConfirm')}
        onConfirm={confirmRemoveValue}
        onCancel={() => {
          setRemoveValue(null);
        }}
      >
        {t('options.valueRemoveText')}
      </ConfirmDialog>
    </div>
  );
}
