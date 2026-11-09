'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Button } from './Button';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What will happen, in one sentence. */
  children?: ReactNode;
  /** Translated action name, e.g. "Delete product". Defaults to the common "Confirm". */
  confirmLabel?: string;
  /** The action is running; the confirm button shows it and cannot be pressed twice. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Native modal `<dialog>` (focus trap, `Esc`, inert page behind it) used by every destructive
 * action. Focus starts on "Cancel", so a stray Enter never deletes anything.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const t = useTranslations('common.dialog');
  const busyText = useTranslations('common')('busy');
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={open && children !== undefined ? bodyId : undefined}
      onCancel={(event) => {
        // The parent owns the state; it closes the dialog by setting `open` to false.
        event.preventDefault();
        if (!busy) onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-card border border-line bg-panel p-6 text-ink shadow-float backdrop:bg-ink/40"
    >
      {/* Only an open dialog has content, so several dialogs on one page never share test ids or focus. */}
      {open ? (
        <>
          <h2 id={titleId} className="text-xl font-extrabold">
            {title}
          </h2>
          {children === undefined ? null : (
            <div id={bodyId} className="mt-2 text-ink-2">
              {children}
            </div>
          )}
          <div className="mt-5 grid gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                if (!busy) onCancel();
              }}
              data-testid="confirm-dialog-cancel"
            >
              {t('cancel')}
            </Button>
            <Button
              busy={busy}
              busyLabel={busyText}
              onClick={onConfirm}
              data-testid="confirm-dialog-confirm"
            >
              {confirmLabel ?? t('confirm')}
            </Button>
          </div>
        </>
      ) : null}
    </dialog>
  );
}
