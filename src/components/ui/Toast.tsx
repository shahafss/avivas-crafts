'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './ClientIcon';
import { IconButton } from './IconButton';

export interface ToastProps {
  /** `null` = nothing to show. Keep the component mounted: the live regions must exist before the text arrives. */
  message: string | null;
  tone?: 'success' | 'error';
  /** Called after `duration` ms and when the close button is pressed. */
  onDismiss: () => void;
  duration?: number;
}

/**
 * Short feedback after an action. Two persistent live regions (polite `status` and assertive
 * `alert`) are always in the page and the text is put into one of them, so screen readers announce it.
 */
export function Toast({ message, tone = 'success', onDismiss, duration = 6000 }: ToastProps) {
  const t = useTranslations('common.toast');

  useEffect(() => {
    if (message === null) return;
    const timer = window.setTimeout(onDismiss, duration);
    return () => {
      window.clearTimeout(timer);
    };
  }, [message, duration, onDismiss]);

  const error = tone === 'error';
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-3 z-banner mx-auto flex max-w-md justify-center">
      <div
        className={
          message === null
            ? // Present but invisible, so the live regions are in the page before the text arrives.
              'sr-only'
            : cn(
                'pointer-events-auto flex w-full items-center gap-2 rounded-card py-1.5 ps-4 pe-1.5 text-[15px] font-bold shadow-float',
                error ? 'border-[1.5px] border-alert bg-paper text-alert' : 'bg-ink text-paper',
              )
        }
      >
        <Icon name={error ? 'alert' : 'check'} />
        <span role="status" aria-live="polite" className="min-w-0 flex-1">
          {error ? null : message}
        </span>
        <span role="alert" className="min-w-0 flex-1 empty:hidden">
          {error ? message : null}
        </span>
        {message === null ? null : (
          <IconButton
            label={t('close')}
            onClick={onDismiss}
            className={error ? undefined : 'hover:bg-ink-2'}
          >
            <Icon name="close" size={18} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
