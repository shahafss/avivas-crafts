'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { PasskeyButton } from './PasskeyButton';

interface ActionResultLike {
  ok: boolean;
  formError?: string | undefined;
}

function ReauthDialog({
  open,
  onResult,
}: {
  open: boolean;
  onResult: (confirmed: boolean) => void;
}) {
  const t = useTranslations('admin.auth.reauth');
  const common = useTranslations('admin.auth.passkey');
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="reauth-title"
      onCancel={(event) => {
        event.preventDefault();
        onResult(false);
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-card border border-line bg-panel p-6 text-ink shadow-float backdrop:bg-ink/40"
    >
      <h2 id="reauth-title" className="text-xl font-extrabold">
        {t('title')}
      </h2>
      <p className="mt-2 text-ink-2">{t('text')}</p>
      <p className="mt-2 text-[13px] text-ink-2">{common('pinHint')}</p>
      <div className="mt-5 grid gap-3">
        {open ? (
          <PasskeyButton
            mode="reauth"
            busyLabel={common('busy')}
            data-testid="admin-reauth-confirm"
            onDone={() => {
              onResult(true);
            }}
          >
            {t('confirm')}
          </PasskeyButton>
        ) : null}
        <Button
          variant="quiet"
          onClick={() => {
            onResult(false);
          }}
        >
          {t('cancel')}
        </Button>
      </div>
    </dialog>
  );
}

/**
 * Wraps the ⟳ Server Actions (contracts/server-actions.md › Passkey re-check): when an action
 * answers `admin.reauth_required`, it opens the passkey dialog, runs the re-check through
 * `/api/auth/reauth/*` and repeats the action once. Render `dialog` somewhere in the component.
 */
export function useReauthGate(): {
  run: <T extends ActionResultLike>(action: () => Promise<T>) => Promise<T>;
  dialog: ReactElement;
} {
  const [open, setOpen] = useState(false);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  const run = useCallback(
    async <T extends ActionResultLike>(action: () => Promise<T>): Promise<T> => {
      const first = await action();
      if (first.ok || first.formError !== 'admin.reauth_required') return first;
      const confirmed = await new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOpen(true);
      });
      return confirmed ? action() : first;
    },
    [],
  );

  const dialog = (
    <ReauthDialog
      open={open}
      onResult={(confirmed) => {
        setOpen(false);
        resolver.current?.(confirmed);
        resolver.current = null;
      }}
    />
  );
  return { run, dialog };
}
