'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { expireUndecidedCookies, saveConsent } from '@/app/[locale]/(shop)/consent/actions';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { cn } from '@/lib/cn';
import { SETTINGS_EVENT, SETTINGS_REQUESTED_ATTR, type ConsentProps } from './consent-types';

type Busy = 'accept' | 'reject' | 'save' | null;

/**
 * The consent banner and settings dialog (storefront.md §7.21, 003 FR-021). It is its own chunk,
 * loaded only through `ConsentLoader`, and the only module that holds the marker below. The sheet
 * shows while a choice is needed; the dialog also opens from the footer button
 * (`ac:consent-settings`). The bottom sheet is not a modal (the page stays usable); the settings dialog is a modal
 * `<dialog>`.
 */
export default function ConsentBanner({
  categories,
  choices,
  effectiveChoices,
  needsChoice,
  staleOptional,
  cookiesHref,
}: ConsentProps) {
  const t = useTranslations('consent');
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const dialogTitleId = useId();
  const [decided, setDecided] = useState(false);
  const [saved, setSaved] = useState<Record<string, boolean> | null>(null);
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<Busy>(null);
  const [failed, setFailed] = useState<'banner' | 'dialog' | null>(null);
  // The categories whose scripts have been loaded in this document (they cannot be unloaded).
  const running = useRef(effectiveChoices);
  const refocus = useRef(false);
  const current = saved ?? choices;

  useEffect(() => {
    function openDialog() {
      const dialog = dialogRef.current;
      if (dialog === null || dialog.open) return;
      document.documentElement.removeAttribute(SETTINGS_REQUESTED_ATTR);
      returnTo.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setDraft(
        Object.fromEntries(
          categories.map((category) => [category.id, current[category.id] === true]),
        ),
      );
      setFailed(null);
      dialog.showModal();
    }
    window.addEventListener(SETTINGS_EVENT, openDialog);
    // The footer button may have been pressed before this chunk had loaded.
    if (document.documentElement.hasAttribute(SETTINGS_REQUESTED_ATTR)) openDialog();
    return () => {
      window.removeEventListener(SETTINGS_EVENT, openDialog);
    };
  }, [categories, current]);

  // A newer Cookie Policy version (or no valid choice) means nothing optional may stay: expire what
  // an older choice left behind, at once and on the server (user decision Q2).
  useEffect(() => {
    if (!staleOptional) return;
    expireUndecidedCookies().catch(() => undefined);
  }, [staleOptional]);

  // The banner that held focus is gone after a choice: move focus to a stable place.
  useEffect(() => {
    // Only when focus was inside the banner or its dialog: never steal it, never scroll.
    if (!decided || !refocus.current) return;
    const target = document.querySelector<HTMLElement>('[data-testid="footer-cookie-settings"]');
    if (target !== null) {
      target.focus({ preventScroll: true });
      return;
    }
    const main = document.getElementById('main');
    main?.setAttribute('tabindex', '-1');
    main?.focus({ preventScroll: true });
  }, [decided]);

  async function save(kind: Exclude<Busy, null>, next: Record<string, boolean>) {
    if (busy !== null) return;
    const active = document.activeElement;
    refocus.current =
      active instanceof Element &&
      (active.closest('#consent-banner') !== null || dialogRef.current?.contains(active) === true);
    setBusy(kind);
    setFailed(null);
    try {
      const result = await saveConsent({ choices: next });
      if (!result.ok) {
        setFailed(kind === 'save' ? 'dialog' : 'banner');
        return;
      }
      const withdrawn = categories.some(
        (category) =>
          running.current[category.id] === true && result.data.choices[category.id] !== true,
      );
      running.current = result.data.choices;
      returnTo.current = null;
      setSaved(result.data.choices);
      setDecided(true);
      dialogRef.current?.close();
      if (withdrawn) {
        // A script that has already run cannot be stopped: a fresh page load without it.
        window.location.reload();
        return;
      }
      // `ConsentRoot` re-reads the new cookie: the gate loads scripts at once.
      router.refresh();
    } catch {
      setFailed(kind === 'save' ? 'dialog' : 'banner');
    } finally {
      setBusy(null);
    }
  }

  const all = (value: boolean) =>
    Object.fromEntries(categories.map((category) => [category.id, value]));
  const busyLabel = t('banner.busy');
  const failure = (surface: 'banner' | 'dialog') =>
    failed === surface ? (
      <Notice tone="alert" role="alert" className="mt-3">
        {t('errors.failed')}
      </Notice>
    ) : null;

  return (
    <div data-consent-banner="ac-consent-banner-v1">
      {needsChoice && !decided ? (
        <section
          id="consent-banner"
          tabIndex={-1}
          aria-labelledby={titleId}
          data-testid="consent-banner"
          className="fixed inset-x-0 bottom-0 z-banner mx-auto w-full max-w-[40rem] rounded-t-[12px] bg-paper p-5 text-ink shadow-float"
        >
          <h2 id={titleId} className="text-lg font-extrabold">
            {t('banner.title')}
          </h2>
          <p className="mt-1 text-[15px] leading-normal text-ink-2">
            {t('banner.text')}{' '}
            <Link
              href={cookiesHref}
              className="font-bold text-ink underline underline-offset-[3px]"
            >
              {t('banner.policyLink')}
            </Link>
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              className="px-3"
              busy={busy === 'accept'}
              busyLabel={busyLabel}
              data-testid="consent-accept-all"
              onClick={() => void save('accept', all(true))}
            >
              {t('banner.acceptAll')}
            </Button>
            <Button
              variant="secondary"
              className="px-3"
              busy={busy === 'reject'}
              busyLabel={busyLabel}
              data-testid="consent-reject-all"
              onClick={() => void save('reject', all(false))}
            >
              {t('banner.rejectAll')}
            </Button>
          </div>
          <div className="mt-1 flex justify-center">
            <Button
              variant="quiet"
              data-testid="consent-settings-open"
              onClick={() => window.dispatchEvent(new Event(SETTINGS_EVENT))}
            >
              {t('banner.settings')}
            </Button>
          </div>
          {failure('banner')}
        </section>
      ) : null}
      <dialog
        ref={dialogRef}
        aria-labelledby={dialogTitleId}
        data-testid="consent-dialog"
        onClose={() => {
          const element = returnTo.current;
          returnTo.current = null;
          if (element?.isConnected === true) element.focus();
        }}
        className="m-auto w-[min(92vw,30rem)] rounded-card border border-line bg-paper p-6 text-ink shadow-float backdrop:bg-ink/40"
      >
        <h2 id={dialogTitleId} className="text-xl font-extrabold">
          {t('dialog.title')}
        </h2>
        <p className="mt-1 text-[15px] text-ink-2">{t('dialog.intro')}</p>
        <ul className="mt-4 grid gap-4">
          <li className="flex items-center justify-between gap-4">
            <div>
              <p className="font-bold">{t('dialog.necessaryName')}</p>
              <p className="text-sm text-ink-2">{t('dialog.necessaryText')}</p>
            </div>
            <span className="shrink-0 text-sm font-bold">{t('dialog.alwaysOn')}</span>
          </li>
          {categories.map((category) => {
            const on = draft[category.id] === true;
            const nameId = `${dialogTitleId}-${category.id}`;
            const descId = `${nameId}-description`;
            return (
              <li key={category.id} className="flex items-center justify-between gap-4">
                <div>
                  <p id={nameId} className="font-bold">
                    {t(`categories.${category.id}.name`)}
                  </p>
                  <p id={descId} className="text-sm text-ink-2">
                    {t(`categories.${category.id}.description`)}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-labelledby={nameId}
                  aria-describedby={descId}
                  data-testid={`consent-switch-${category.id}`}
                  onClick={() => {
                    setDraft((previous) => ({ ...previous, [category.id]: !on }));
                  }}
                  className="inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-pill focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-ink"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'relative block h-7 w-12 rounded-pill border-[1.5px] border-ink transition-colors',
                      on ? 'bg-ink' : 'bg-paper',
                    )}
                  >
                    <span
                      className={cn(
                        'absolute top-1/2 block size-5 -translate-y-1/2 rounded-full',
                        on ? 'end-[3px] bg-paper' : 'start-[3px] bg-ink',
                      )}
                    />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {failure('dialog')}
        <div className="mt-5 grid gap-3">
          <Button
            busy={busy === 'save'}
            busyLabel={busyLabel}
            data-testid="consent-save"
            onClick={() => void save('save', draft)}
          >
            {t('dialog.save')}
          </Button>
          <Button
            variant="quiet"
            onClick={() => {
              dialogRef.current?.close();
            }}
          >
            {t('dialog.close')}
          </Button>
        </div>
      </dialog>
    </div>
  );
}
