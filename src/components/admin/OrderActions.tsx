'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Notice } from '@/components/ui/Notice';
import { TextArea } from '@/components/ui/TextArea';
import { TextField } from '@/components/ui/TextField';
import { Toast } from '@/components/ui/Toast';
import type { ActionResult } from '@/server/catalog/result';
import type { OrderStatus, PaymentMethod, PaymentState } from '@/server/orders/status';
import { useHydrated } from './useHydrated';

/** The Server Actions of `orders/[id]/actions.ts`, passed in by the page (like `CategoriesManager`). */
export interface OrderActionsApi {
  setOrderStatus: (input: {
    orderId: string;
    expectedStatus: OrderStatus;
    to: 'in_preparation' | 'shipped' | 'ready_for_pickup' | 'completed' | 'cancelled';
    trackingNumber?: string;
    pickupNote?: string;
    confirm?: boolean;
    alsoMarkPaid?: boolean;
  }) => Promise<ActionResult<{ changed: boolean; status: OrderStatus; refundReminder: boolean }>>;
  stepBackOrderStatus: (input: {
    orderId: string;
    expectedStatus: 'in_preparation' | 'shipped' | 'ready_for_pickup';
  }) => Promise<ActionResult<{ changed: boolean; status: OrderStatus }>>;
  updateFulfilmentDetails: (input: {
    orderId: string;
    expectedStatus: 'shipped' | 'ready_for_pickup';
    trackingNumber?: string;
    pickupNote?: string;
  }) => Promise<ActionResult<{ changed: boolean }>>;
  markOrderPaid: (input: {
    orderId: string;
    confirm?: boolean;
  }) => Promise<ActionResult<{ changed: boolean }>>;
  markOrderRefunded: (input: {
    orderId: string;
    confirm?: boolean;
  }) => Promise<ActionResult<{ changed: boolean }>>;
}

export interface OrderActionsProps {
  orderId: string;
  status: OrderStatus;
  trackingNumber: string | null;
  pickupNote: string | null;
  /** Drives the refund reminder (Cancelled and paid) and its method sentence. */
  paymentState: PaymentState;
  paymentMethod: PaymentMethod;
  /** From `getOrderDetail().allowed` (computed with `status.ts`); no other personal data. */
  allowed: {
    forward: OrderStatus[];
    stepBackTo: OrderStatus | null;
    cancel: boolean;
    markPaid: boolean;
    markRefunded: boolean;
    editFulfilment: 'trackingNumber' | 'pickupNote' | null;
  };
  actions: OrderActionsApi;
}

type FulfilmentField = 'trackingNumber' | 'pickupNote';

/** The open tracking / pickup-note form: a status move that takes a detail, or an edit. */
type Form =
  | { mode: 'move'; to: 'shipped' | 'ready_for_pickup'; field: FulfilmentField }
  | { mode: 'edit'; field: FulfilmentField };

type BusyKey =
  | 'status'
  | 'back'
  | 'save'
  | 'complete'
  | 'completeAndPay'
  | 'cancel'
  | 'markPaid'
  | 'markRefunded';

/** The payment dialogs: "received" and "returned" (storefront.md §12.3). */
type PaymentDialog = 'paid' | 'refunded';

const SECTION = 'grid gap-3 rounded-card border border-line bg-panel p-4';

function fieldOf(to: 'shipped' | 'ready_for_pickup'): FulfilmentField {
  return to === 'shipped' ? 'trackingNumber' : 'pickupNote';
}

export function OrderActions({
  orderId,
  status,
  trackingNumber,
  pickupNote,
  paymentState,
  paymentMethod,
  allowed,
  actions,
}: OrderActionsProps) {
  const t = useTranslations('admin.orders');
  const messages = useTranslations();
  const router = useRouter();
  const hydrated = useHydrated();
  const busyRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState<BusyKey | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [value, setValue] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [notice, setNotice] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  // The kind outlives the open flag, so the texts do not change while the dialog closes.
  const [paymentKind, setPaymentKind] = useState<PaymentDialog>('paid');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const dismissToast = useCallback(() => {
    setToast(null);
  }, []);

  // A newly opened field takes focus, so the keyboard is ready on a phone.
  const formKey = form === null ? null : `${form.mode}:${form.field}`;
  useEffect(() => {
    if (formKey === null) return;
    formRef.current?.querySelector<HTMLElement>('input, textarea')?.focus();
  }, [formKey]);

  /**
   * Runs one action; a second press while one runs does nothing. Success: toast and refresh.
   * Stale or not allowed: a notice and a refresh, so the page corrects itself.
   */
  async function perform<T>(
    key: BusyKey,
    call: () => Promise<ActionResult<T>>,
    successText: string,
  ): Promise<void> {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(key);
    setNotice(null);
    setFieldError(undefined);
    try {
      const result = await call();
      if (result.ok) {
        setToast(successText);
        setForm(null);
        setConfirmingComplete(false);
        setConfirmingCancel(false);
        setPaymentOpen(false);
        router.refresh();
        return;
      }
      const fieldKey = Object.values(result.fieldErrors ?? {})[0];
      if (fieldKey !== undefined) {
        setFieldError(messages(fieldKey));
        return;
      }
      const formError = result.formError ?? 'admin.failed';
      setNotice(messages(formError));
      setConfirmingComplete(false);
      setConfirmingCancel(false);
      setPaymentOpen(false);
      if (formError !== 'admin.failed') {
        setForm(null);
        router.refresh();
      }
    } catch {
      setNotice(messages('admin.failed'));
      setConfirmingComplete(false);
      setConfirmingCancel(false);
      setPaymentOpen(false);
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  function openForm(next: Form): void {
    setNotice(null);
    setFieldError(undefined);
    setValue((next.field === 'trackingNumber' ? trackingNumber : pickupNote) ?? '');
    setForm(next);
  }

  function choose(to: OrderStatus): void {
    if (busyRef.current) return;
    setNotice(null);
    if (to === 'shipped' || to === 'ready_for_pickup') {
      openForm({ mode: 'move', to, field: fieldOf(to) });
    } else if (to === 'completed') {
      setForm(null);
      setConfirmingComplete(true);
    } else if (to === 'in_preparation') {
      setForm(null);
      void perform(
        'status',
        () => actions.setOrderStatus({ orderId, expectedStatus: status, to }),
        t('actions.toast.status', { status: t(`status.${to}`) }),
      );
    }
  }

  function submitForm(event: SyntheticEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (form === null) return;
    if (form.mode === 'move') {
      const detail =
        form.field === 'trackingNumber' ? { trackingNumber: value } : { pickupNote: value };
      void perform(
        'save',
        () => actions.setOrderStatus({ orderId, expectedStatus: status, to: form.to, ...detail }),
        t('actions.toast.status', { status: t(`status.${form.to}`) }),
      );
      return;
    }
    if (status !== 'shipped' && status !== 'ready_for_pickup') return;
    const detail =
      form.field === 'trackingNumber' ? { trackingNumber: value } : { pickupNote: value };
    void perform(
      'save',
      () => actions.updateFulfilmentDetails({ orderId, expectedStatus: status, ...detail }),
      t('actions.toast.saved'),
    );
  }

  function complete(alsoMarkPaid: boolean): void {
    void perform(
      alsoMarkPaid ? 'completeAndPay' : 'complete',
      () =>
        actions.setOrderStatus({
          orderId,
          expectedStatus: status,
          to: 'completed',
          confirm: true,
          ...(alsoMarkPaid ? { alsoMarkPaid: true } : {}),
        }),
      t('actions.toast.status', { status: t('status.completed') }),
    );
  }

  function cancelOrder(): void {
    void perform(
      'cancel',
      () =>
        actions.setOrderStatus({ orderId, expectedStatus: status, to: 'cancelled', confirm: true }),
      t('actions.toast.status', { status: t('status.cancelled') }),
    );
  }

  function markPayment(kind: PaymentDialog): void {
    void perform(
      kind === 'paid' ? 'markPaid' : 'markRefunded',
      () =>
        kind === 'paid'
          ? actions.markOrderPaid({ orderId, confirm: true })
          : actions.markOrderRefunded({ orderId, confirm: true }),
      t(kind === 'paid' ? 'actions.toast.paid' : 'actions.toast.refunded'),
    );
  }

  if (!hydrated) {
    return <div aria-hidden="true" className="h-40 rounded-card bg-photo" />;
  }

  const [primary, ...others] = allowed.forward;
  const closed = status === 'completed' || status === 'cancelled';
  const editField = allowed.editFulfilment;
  const storedValue = editField === 'trackingNumber' ? trackingNumber : pickupNote;
  const askPayment = allowed.markPaid;
  // Cancelled and paid: the money still has to go back, so a persistent Notice holds the only
  // "mark refunded" button (storefront.md §12.3) and the panel leaves it out.
  const refundReminder = status === 'cancelled' && paymentState === 'paid';
  const methodSentence = t(`cancel.method.${paymentMethod}`);

  // One button per payment step, kept as elements so the refund reminder (T036) can show the
  // "mark refunded" one inside its Notice instead of here.
  const markPaidButton = allowed.markPaid ? (
    <Button
      variant="secondary"
      busy={busy === 'markPaid'}
      busyLabel={t('actions.markPaid')}
      onClick={() => {
        if (busyRef.current) return;
        setNotice(null);
        setPaymentKind('paid');
        setPaymentOpen(true);
      }}
      data-testid="order-action-mark-paid"
    >
      {t('actions.markPaid')}
    </Button>
  ) : null;
  const markRefundedButton = allowed.markRefunded ? (
    <Button
      variant="secondary"
      busy={busy === 'markRefunded'}
      busyLabel={t('actions.markRefunded')}
      onClick={() => {
        if (busyRef.current) return;
        setNotice(null);
        setPaymentKind('refunded');
        setPaymentOpen(true);
      }}
      data-testid="order-action-mark-refunded"
    >
      {t('actions.markRefunded')}
    </Button>
  ) : null;

  const cancelButton = allowed.cancel ? (
    <Button
      variant="secondary"
      busy={busy === 'cancel'}
      busyLabel={t('cancel.button')}
      onClick={() => {
        if (busyRef.current) return;
        setNotice(null);
        setForm(null);
        setConfirmingCancel(true);
      }}
      data-testid="order-action-cancel"
    >
      {t('cancel.button')}
    </Button>
  ) : null;
  const panelRefundedButton = refundReminder ? null : markRefundedButton;

  return (
    <>
      {refundReminder ? (
        <div data-testid="order-refund-reminder" className="mb-5">
          <Notice tone="attention">
            <p className="font-bold">{t('cancel.reminderTitle')}</p>
            <p>{methodSentence}</p>
            <div className="mt-2 grid">{markRefundedButton}</div>
          </Notice>
        </div>
      ) : null}
      <section
        className={SECTION}
        aria-labelledby="order-actions-title"
        data-testid="order-actions"
      >
        <h2 id="order-actions-title" className="text-lg leading-tight font-extrabold">
          {t('detail.actions')}
        </h2>

        {closed ? (
          <p className="font-bold" data-testid="order-actions-done">
            {t(status === 'completed' ? 'actions.done.completed' : 'actions.done.cancelled')}
          </p>
        ) : null}

        {notice === null ? null : (
          <div data-testid="order-actions-notice">
            <Notice tone="alert" role="alert">
              {notice}
            </Notice>
          </div>
        )}

        {primary === undefined && cancelButton === null ? null : (
          <div className="grid gap-3">
            {primary === undefined ? null : (
              <Button
                busy={busy === 'status' && primary === 'in_preparation'}
                busyLabel={t(`status.${primary}`)}
                onClick={() => {
                  choose(primary);
                }}
                data-testid={`order-action-${primary}`}
              >
                {t(`status.${primary}`)}
              </Button>
            )}
            {others.map((to) => (
              <Button
                key={to}
                variant="secondary"
                onClick={() => {
                  choose(to);
                }}
                data-testid={`order-action-${to}`}
              >
                {t(`status.${to}`)}
              </Button>
            ))}
            {cancelButton}
          </div>
        )}

        {form === null ? null : (
          <form ref={formRef} onSubmit={submitForm} className="grid gap-3" noValidate>
            {form.field === 'trackingNumber' ? (
              <TextField
                label={t('actions.trackingLabel')}
                ltr
                value={value}
                maxLength={100}
                error={fieldError}
                onChange={(event) => {
                  setValue(event.target.value);
                }}
                data-testid="order-tracking-input"
              />
            ) : (
              <TextArea
                label={t('actions.pickupNoteLabel')}
                value={value}
                maxLength={500}
                error={fieldError}
                onChange={(event) => {
                  setValue(event.target.value);
                }}
                data-testid="order-pickup-note-input"
              />
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="submit"
                busy={busy === 'save'}
                busyLabel={t('actions.save')}
                data-testid="order-fulfilment-save"
              >
                {t('actions.save')}
              </Button>
              <Button
                variant="quiet"
                onClick={() => {
                  if (busyRef.current) return;
                  setForm(null);
                  setFieldError(undefined);
                }}
                data-testid="order-fulfilment-close"
              >
                {t('actions.close')}
              </Button>
            </div>
          </form>
        )}

        {editField === null || form !== null ? null : (
          <div
            className="grid gap-1 border-t border-line pt-3"
            data-testid="order-actions-fulfilment"
          >
            <span className="text-[13px] font-bold text-ink-2">
              {t(
                editField === 'trackingNumber'
                  ? 'actions.trackingCurrent'
                  : 'actions.pickupNoteCurrent',
              )}
            </span>
            {storedValue === null || storedValue === '' ? (
              <span className="text-ink-2">{t('actions.noneEntered')}</span>
            ) : editField === 'trackingNumber' ? (
              <bdi
                dir="ltr"
                className="tnum text-start"
                data-testid="order-actions-fulfilment-value"
              >
                {storedValue}
              </bdi>
            ) : (
              <p
                dir="auto"
                className="whitespace-pre-line"
                data-testid="order-actions-fulfilment-value"
              >
                {storedValue}
              </p>
            )}
            <Button
              variant="quiet"
              className="justify-self-start"
              onClick={() => {
                if (busyRef.current) return;
                openForm({ mode: 'edit', field: editField });
              }}
              data-testid="order-fulfilment-edit"
            >
              {t('actions.edit')}
            </Button>
          </div>
        )}

        {allowed.stepBackTo === null ? null : (
          <Button
            variant="quiet"
            busy={busy === 'back'}
            busyLabel={t('actions.back')}
            className="justify-self-start"
            onClick={() => {
              if (
                status !== 'in_preparation' &&
                status !== 'shipped' &&
                status !== 'ready_for_pickup'
              )
                return;
              const expectedStatus = status;
              void perform(
                'back',
                () => actions.stepBackOrderStatus({ orderId, expectedStatus }),
                t('actions.toast.back'),
              );
            }}
            data-testid="order-action-back"
          >
            {t('actions.back')}
          </Button>
        )}

        {markPaidButton === null && panelRefundedButton === null ? null : (
          <div className="grid gap-3" data-testid="order-actions-payment">
            {markPaidButton}
            {panelRefundedButton}
          </div>
        )}

        <ConfirmDialog
          open={paymentOpen}
          title={t(paymentKind === 'refunded' ? 'actions.refund.title' : 'actions.paid.title')}
          confirmLabel={t(paymentKind === 'refunded' ? 'actions.markRefunded' : 'actions.markPaid')}
          busy={busy === 'markPaid' || busy === 'markRefunded'}
          onConfirm={() => {
            markPayment(paymentKind);
          }}
          onCancel={() => {
            setPaymentOpen(false);
          }}
        >
          {t(paymentKind === 'refunded' ? 'actions.refund.body' : 'actions.paid.body')}
        </ConfirmDialog>

        <ConfirmDialog
          open={confirmingCancel}
          title={t('cancel.title')}
          confirmLabel={t('cancel.confirm')}
          cancelLabel={t('cancel.back')}
          busy={busy === 'cancel'}
          onConfirm={cancelOrder}
          onCancel={() => {
            setConfirmingCancel(false);
          }}
        >
          <p>{t('cancel.body')}</p>
          {paymentState === 'paid' ? (
            <p className="mt-2 font-bold" data-testid="order-cancel-refund-reminder">
              {t('cancel.paidReminder', { method: methodSentence })}
            </p>
          ) : null}
        </ConfirmDialog>

        <ConfirmDialog
          open={confirmingComplete}
          title={t('actions.complete.title')}
          confirmLabel={askPayment ? t('actions.complete.markPaid') : t('actions.complete.confirm')}
          busy={busy === 'complete' || busy === 'completeAndPay'}
          busyButton={busy === 'complete' && askPayment ? 'secondary' : 'confirm'}
          {...(askPayment
            ? {
                secondaryLabel: t('actions.complete.withoutPayment'),
                onSecondary: () => {
                  complete(false);
                },
              }
            : {})}
          onConfirm={() => {
            complete(askPayment);
          }}
          onCancel={() => {
            setConfirmingComplete(false);
          }}
        >
          {t(askPayment ? 'actions.complete.bodyUnpaid' : 'actions.complete.body')}
        </ConfirmDialog>

        <Toast message={toast} onDismiss={dismissToast} />
      </section>
    </>
  );
}
