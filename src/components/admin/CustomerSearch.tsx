'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useRef, useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Notice } from '@/components/ui/Notice';
import { Price } from '@/components/ui/Price';
import { TextField } from '@/components/ui/TextField';
import { Toast } from '@/components/ui/Toast';
import { formatDateTime } from '@/lib/format-date';
import type { ActionResult } from '@/server/catalog/result';
import type { SearchResult } from '@/server/privacy/customers';
import { OrderBadgesClient } from './OrderBadgesClient';
import { useHydrated } from './useHydrated';

/** The Server Actions of `customers/actions.ts`, passed in by the page. */
export interface CustomerSearchApi {
  searchCustomers: (input: { q: string }) => Promise<ActionResult<SearchResult>>;
  exportCustomer: (input: {
    q: string;
    orderIds: string[];
  }) => Promise<ActionResult<{ filename: string; content: string }>>;
  withdrawMarketingConsent: (input: {
    q: string;
    orderIds: string[];
    confirm: true;
  }) => Promise<ActionResult<{ count: number }>>;
  anonymizeCustomer: (input: {
    q: string;
    orderIds: string[];
    confirm: true;
  }) => Promise<ActionResult<{ count: number; skipped: number; keptCheckouts: number }>>;
}

type Dialog = 'withdraw' | 'erase' | null;
type Busy = 'search' | 'export' | 'withdraw' | 'erase' | null;

interface Shown {
  /** The text that was searched; the actions send it back so the server re-matches it. */
  q: string;
  data: SearchResult;
}

const ID = 'customer-search-q';

/** Triggers the browser's download of `content` as a file; the object URL is revoked afterwards. */
function download(filename: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}

export function CustomerSearch({ actions }: { actions: CustomerSearchApi }) {
  const t = useTranslations('admin.customers');
  const messages = useTranslations();
  const hydrated = useHydrated();
  const busyRef = useRef(false);

  const [text, setText] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [alertText, setAlertText] = useState<string | null>(null);
  const [kept, setKept] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  /** Runs one action at a time; a second tap while one runs does nothing. */
  async function guarded(kind: Exclude<Busy, null>, work: () => Promise<void>): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setAlertText(null);
    try {
      await work();
    } catch {
      setAlertText(messages('admin.failed'));
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  function fail(result: Extract<ActionResult<unknown>, { ok: false }>): void {
    setAlertText(messages(result.formError ?? 'admin.failed'));
  }

  async function runSearch(q: string): Promise<boolean> {
    setFieldError(null);
    const result = await actions.searchCustomers({ q });
    if (result.ok) {
      setShown({ q, data: result.data });
      return true;
    }
    setShown(null);
    const key = result.fieldErrors?.q;
    if (key !== undefined) setFieldError(messages(key));
    else fail(result);
    return false;
  }

  function submit(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    setKept(null);
    void guarded('search', async () => {
      await runSearch(text);
    });
  }

  function searchFor(identifier: string): void {
    setText(identifier);
    setKept(null);
    void guarded('search', async () => {
      await runSearch(identifier);
    });
  }

  function exportData(): void {
    if (shown === null) return;
    const { q, data } = shown;
    void guarded('export', async () => {
      const result = await actions.exportCustomer({
        q,
        orderIds: data.orders.map((order) => order.id),
      });
      if (!result.ok) {
        fail(result);
        return;
      }
      download(result.data.filename, result.data.content);
      setToast(t('toast.exported'));
    });
  }

  function withdraw(): void {
    if (shown === null) return;
    const { q, data } = shown;
    void guarded('withdraw', async () => {
      const result = await actions.withdrawMarketingConsent({
        q,
        orderIds: data.orders.map((order) => order.id),
        confirm: true,
      });
      setDialog(null);
      if (!result.ok) {
        fail(result);
        return;
      }
      // The same orders, now without consent: no second search (and no second activity row).
      setShown({
        q,
        data: {
          ...data,
          orders: data.orders.map((order) => ({ ...order, marketingOptIn: false })),
        },
      });
      setToast(t('toast.withdrawn'));
    });
  }

  function erase(): void {
    if (shown === null) return;
    const { q, data } = shown;
    void guarded('erase', async () => {
      const result = await actions.anonymizeCustomer({
        q,
        orderIds: data.orders.map((order) => order.id),
        confirm: true,
      });
      setDialog(null);
      if (!result.ok) {
        fail(result);
        return;
      }
      // Payments left to expire are reported whatever else happened (FR-019, Q6).
      setKept(result.data.keptCheckouts > 0 ? result.data.keptCheckouts : null);
      // Silent only when every shown order was skipped; an erase of stored emails alone confirms too.
      if (result.data.count > 0 || data.orders.length === 0) setToast(t('toast.erased'));
      if (result.data.skipped > 0) {
        // Some shown orders changed since the search: say so and show what is there now.
        setAlertText(t('stale'));
        await runSearch(q);
        return;
      }
      setShown(null);
      setText('');
    });
  }

  if (!hydrated) return null;

  const view = shown?.data ?? null;
  const nothingFound =
    view !== null && view.orders.length === 0 && view.pendingCheckouts === 0 && view.emails === 0;
  const anyConsent = view?.orders.some((order) => order.marketingOptIn) ?? false;
  const anyOpen = view?.orders.some((order) => order.open) ?? false;
  const orderCount = view?.orders.length ?? 0;
  // Only unfinished checkouts found: nothing to erase now (they expire on their own, §12.7).
  const canErase = orderCount > 0 || (view?.emails ?? 0) > 0;
  // Same Notice as after an erase that kept checkouts: when only unfinished checkouts were found
  // there is nothing to erase, and Aviva learns why and to search again later (§12.7).
  const onlyCheckouts = view !== null && !canErase && view.pendingCheckouts > 0;
  const keptShown = kept ?? (onlyCheckouts ? view.pendingCheckouts : null);
  const others =
    view === null ? [] : [...view.otherIdentifiers.emails, ...view.otherIdentifiers.phones];

  return (
    <div className="grid gap-5">
      <form
        method="post"
        onSubmit={submit}
        noValidate
        className="flex items-end gap-2"
        data-testid="customer-search-form"
      >
        <TextField
          id={ID}
          label={t('search.label')}
          ltr
          autoComplete="off"
          enterKeyHint="search"
          value={text}
          error={fieldError ?? undefined}
          onChange={(event) => {
            setText(event.target.value);
          }}
          className="min-w-0 flex-1"
          data-testid="customer-search-input"
        />
        <Button
          type="submit"
          busy={busy === 'search'}
          busyLabel={t('search.submit')}
          className="h-[52px]"
          data-testid="customer-search-submit"
        >
          {t('search.submit')}
        </Button>
      </form>

      {alertText === null ? null : (
        <Notice tone="alert" role="alert" id="customer-alert">
          {alertText}
        </Notice>
      )}

      {keptShown === null ? null : (
        <Notice tone="info" role="status" id="customer-kept-notice">
          {t('keptCheckouts', { count: keptShown })}
        </Notice>
      )}

      {nothingFound ? (
        <div data-testid="customer-empty">
          <EmptyState icon="search" title={t('empty.title')} text={t('empty.text')} />
        </div>
      ) : null}

      {view === null || nothingFound ? null : (
        <section aria-label={t('results')} className="grid gap-4" data-testid="customer-results">
          <p className="font-bold" data-testid="customer-summary">
            {[
              t('summary.orders', { count: orderCount }),
              view.pendingCheckouts > 0
                ? t('summary.checkouts', { count: view.pendingCheckouts })
                : null,
              view.emails > 0 ? t('summary.emails', { count: view.emails }) : null,
            ]
              .filter((part): part is string => part !== null)
              .join(', ')}
          </p>

          {orderCount === 0 ? null : (
            <ul aria-label={t('ordersLabel')} className="grid gap-3">
              {view.orders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/orders/${order.id}`}
                    prefetch={false}
                    data-testid="customer-order-card"
                    className="grid min-h-11 gap-2 rounded-card border border-line bg-panel p-4 hover:bg-sun-soft"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <bdi className="tnum text-base font-bold">#{order.orderNumber}</bdi>
                      <bdi className="tnum text-[13px] text-ink-2">
                        {formatDateTime(new Date(order.createdAt), 'he')}
                      </bdi>
                    </span>
                    <Price minor={order.totalMinor} currency={order.currency} locale="he" />
                    <OrderBadgesClient status={order.status} paymentState={order.paymentState} />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {others.length === 0 ? null : (
            <div className="grid gap-1" data-testid="customer-others">
              <p className="text-[15px] text-ink-2">{t('others')}</p>
              <ul className="flex flex-wrap gap-2">
                {others.map((identifier) => (
                  <li key={identifier}>
                    <Button
                      variant="quiet"
                      onClick={() => {
                        searchFor(identifier);
                      }}
                      data-testid="customer-other"
                    >
                      <bdi dir="ltr">{identifier}</bdi>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Button
              variant="secondary"
              busy={busy === 'export'}
              busyLabel={t('export')}
              onClick={exportData}
              data-testid="customer-export"
            >
              {t('export')}
            </Button>
            {anyConsent ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setDialog('withdraw');
                }}
                data-testid="customer-withdraw"
              >
                {t('withdraw.action')}
              </Button>
            ) : null}
            {canErase ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setDialog('erase');
                }}
                data-testid="customer-erase"
              >
                {t('erase.action')}
              </Button>
            ) : null}
          </div>
        </section>
      )}

      <ConfirmDialog
        open={dialog === 'withdraw'}
        title={t('withdraw.title')}
        confirmLabel={t('withdraw.confirm')}
        busy={busy === 'withdraw'}
        onConfirm={withdraw}
        onCancel={() => {
          setDialog(null);
        }}
      >
        <p>{t('withdraw.body')}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'erase'}
        title={t('erase.title')}
        confirmLabel={t('erase.confirm')}
        busy={busy === 'erase'}
        onConfirm={erase}
        onCancel={() => {
          setDialog(null);
        }}
      >
        <div className="grid gap-3">
          <p>{orderCount === 0 ? t('erase.bodyEmails') : t('erase.body', { count: orderCount })}</p>
          {anyOpen ? <Notice tone="attention">{t('erase.open')}</Notice> : null}
        </div>
      </ConfirmDialog>

      <Toast message={toast} onDismiss={dismissToast} />
    </div>
  );
}
