'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  retryOnlinePayment,
  switchToOfflinePayment,
} from '@/app/[locale]/(shop)/checkout/return/actions';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/ClientIcon';
import type { CoreIconName } from '@/components/ui/icon-core';
import { LinkButton } from '@/components/ui/LinkButton';
import { Notice } from '@/components/ui/Notice';
import { Spinner } from '@/components/ui/Spinner';
import { CART_DRAWER_ID } from '@/lib/cart/drawer';
import { clearCart } from '@/lib/cart/store';
import { formatMoney, type MoneyLocale } from '@/lib/money';

const POLL_MS = 2000;
const GIVE_UP_MS = 60_000;

type ServerState =
  'awaiting_provider' | 'confirmed' | 'failed' | 'mismatch' | 'switched_offline' | 'expired';

type View =
  | { kind: 'checking' }
  | { kind: 'confirmed' }
  | { kind: 'failed' }
  | { kind: 'mismatch' }
  | { kind: 'switched' }
  | { kind: 'expired' }
  | { kind: 'timeout' };

type Action = 'retry' | 'switch';

interface StatusAnswer {
  state: ServerState;
  orderUrl?: string;
}

/** The view for a status answer, or null while the payment is still with the provider. */
function nextView(
  state: ServerState | undefined,
  result: 'success' | 'failure' | null,
): View | null {
  if (state === 'failed') return { kind: 'failed' };
  if (state === 'mismatch') return { kind: 'mismatch' };
  if (state === 'switched_offline') return { kind: 'switched' };
  if (state === 'expired') return { kind: 'expired' };
  // A visitor who came back from a cancelled page can act at once.
  if (state === 'awaiting_provider' && result === 'failure') return { kind: 'failed' };
  return null;
}

function forgetCheckout(): void {
  try {
    window.sessionStorage.removeItem('ac_checkout');
  } catch {
    // nothing stored
  }
}

function Panel({
  icon,
  title,
  children,
  'data-testid': testId,
}: {
  icon: CoreIconName;
  title: string;
  children?: ReactNode;
  'data-testid'?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="grid justify-items-center gap-3 rounded-card border border-line bg-paper px-5 py-8 text-center"
    >
      <span className="grid size-14 place-items-center rounded-full bg-sage text-ink">
        <Icon name={icon} size={26} />
      </span>
      <h1 className="text-xl leading-tight font-extrabold tracking-tight text-balance">{title}</h1>
      {children}
    </div>
  );
}

/**
 * The payment-return page body (storefront.md §8.7): polls the status endpoint every 2 s for up
 * to 60 s, sends the visitor to the order page once the payment is confirmed, and otherwise
 * offers retry or direct payment. It never marks anything paid itself.
 */
export function ReturnView({
  token,
  result,
  offlineEnabled,
}: {
  token: string;
  /** `r` of the return URL. */
  result: 'success' | 'failure' | null;
  offlineEnabled: boolean;
}) {
  const locale = useLocale() as MoneyLocale;
  const t = useTranslations('checkout');
  const [view, setView] = useState<View>({ kind: 'checking' });
  const [busy, setBusy] = useState<Action | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [newTotal, setNewTotal] = useState<{
    action: Action;
    totalMinor: number;
    currency: 'ILS' | 'USD';
  } | null>(null);
  const [round, setRound] = useState(0);
  const leaving = useRef(false);

  // Poll until there is an answer worth showing.
  useEffect(() => {
    if (token === '') return;
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const started = Date.now();
    const poll = async (): Promise<void> => {
      let answer: StatusAnswer | null = null;
      try {
        const response = await fetch(`/api/payments/status?c=${encodeURIComponent(token)}`, {
          cache: 'no-store',
        });
        if (response.ok) answer = (await response.json()) as StatusAnswer;
      } catch {
        // A failed poll is tried again until the time is up.
      }
      if (!current) return;
      if (answer?.state === 'confirmed' && answer.orderUrl !== undefined) {
        leaving.current = true;
        setView({ kind: 'confirmed' });
        clearCart();
        forgetCheckout();
        window.location.assign(answer.orderUrl);
        return;
      }
      const next = nextView(answer?.state, result);
      if (next !== null) {
        setView(next);
        return;
      }
      if (Date.now() - started >= GIVE_UP_MS) {
        setView({ kind: 'timeout' });
        return;
      }
      timer = setTimeout(() => {
        void poll();
      }, POLL_MS);
    };
    void poll();
    return () => {
      current = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [token, result, round]);

  // Back to this page from the order page (bfcache): look again, the state may have changed.
  useEffect(() => {
    const onShow = (event: PageTransitionEvent): void => {
      if (event.persisted && !leaving.current) {
        setView({ kind: 'checking' });
        setRound((value) => value + 1);
      }
    };
    window.addEventListener('pageshow', onShow);
    return () => {
      window.removeEventListener('pageshow', onShow);
    };
  }, []);

  const run = useCallback(
    async (action: Action, acceptNewTotal: boolean): Promise<void> => {
      setBusy(action);
      setProblem(null);
      try {
        const answer =
          action === 'retry'
            ? await retryOnlinePayment({ resumeToken: token, acceptNewTotal })
            : await switchToOfflinePayment({ resumeToken: token, acceptNewTotal });
        if (answer.ok) {
          if (action === 'switch') {
            // Like an offline order: the cart and the saved inputs go before the order page opens.
            leaving.current = true;
            clearCart();
            forgetCheckout();
          }
          window.location.assign(answer.redirect);
          return;
        }
        const error = answer.formError ?? '';
        if (error === 'checkout.total_changed' && answer.data !== undefined) {
          setNewTotal({ action, ...answer.data, totalMinor: answer.data.newTotalMinor });
        } else if (error === 'checkout.already_completed') {
          // Finished elsewhere (a back button, a second tab): look at what it became.
          setView({ kind: 'checking' });
          setRound((value) => value + 1);
        } else if (error === 'checkout.link_expired') {
          setView({ kind: 'expired' });
        } else {
          setProblem(
            error.startsWith('checkout.') ? error.slice('checkout.'.length) : 'errors.generic',
          );
        }
      } catch {
        setProblem('errors.generic');
      }
      setBusy(null);
    },
    [token],
  );

  const text = (key: string): string => (t.has(key) ? t(key) : t('errors.generic'));
  const shown: View = token === '' ? { kind: 'expired' } : view;

  if (shown.kind === 'checking' || shown.kind === 'confirmed') {
    return (
      <div className="grid justify-items-center gap-3 rounded-card border border-line bg-paper px-5 py-8 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-sage text-ink">
          {shown.kind === 'confirmed' ? <Icon name="check" size={26} /> : <Spinner size={26} />}
        </span>
        <p role="status" data-testid="return-status" className="text-lg font-bold">
          {shown.kind === 'confirmed' ? t('return.confirmed') : t('return.checking')}
        </p>
      </div>
    );
  }

  if (shown.kind === 'failed') {
    return (
      <Panel icon="alert" title={t('return.failed.title')} data-testid="return-failed">
        <p role="status" data-testid="return-status" className="text-ink-2">
          {t('return.failed.text')}
        </p>
        {newTotal === null ? null : (
          <div data-testid="return-total-changed" className="w-full text-start">
            <Notice tone="attention" role="status">
              <p>
                {t('return.totalChanged', {
                  total: formatMoney(newTotal.totalMinor, newTotal.currency, locale),
                })}
              </p>
              <Button
                className="mt-3"
                data-testid="accept-new-total"
                busy={busy !== null}
                busyLabel={t('busy')}
                onClick={() => {
                  void run(newTotal.action, true);
                }}
              >
                {t('return.confirmContinue')}
              </Button>
            </Notice>
          </div>
        )}
        {problem === null ? null : (
          <div className="w-full text-start">
            <Notice tone="alert" role="alert">
              <p className="font-bold">{text(problem)}</p>
              {problem === 'lines_unavailable' ? (
                <button
                  type="button"
                  popoverTarget={CART_DRAWER_ID}
                  data-testid="return-cart"
                  className="mt-1 inline-flex min-h-11 items-center underline underline-offset-[3px]"
                >
                  {t('backToCart')}
                </button>
              ) : null}
            </Notice>
          </div>
        )}
        {newTotal !== null ? null : (
          <div className="mt-1 grid w-full gap-2.5">
            <Button
              data-testid="retry-payment"
              busy={busy === 'retry'}
              busyLabel={t('busy')}
              onClick={() => {
                void run('retry', false);
              }}
            >
              {t('return.retry')}
            </Button>
            {offlineEnabled ? (
              <Button
                variant="secondary"
                data-testid="switch-offline"
                busy={busy === 'switch'}
                busyLabel={t('busy')}
                onClick={() => {
                  void run('switch', false);
                }}
              >
                {t('return.switchOffline')}
              </Button>
            ) : null}
          </div>
        )}
      </Panel>
    );
  }

  if (shown.kind === 'mismatch') {
    return (
      <Panel icon="info" title={t('return.mismatch')} data-testid="return-mismatch">
        <p role="status" data-testid="return-status" className="sr-only">
          {t('return.mismatch')}
        </p>
      </Panel>
    );
  }

  if (shown.kind === 'switched') {
    return (
      <Panel icon="info" title={t('return.switched')} data-testid="return-switched">
        <LinkButton href={`/${locale}/shop`} variant="quiet">
          {t('backToShop')}
        </LinkButton>
      </Panel>
    );
  }

  if (shown.kind === 'timeout') {
    return (
      <Panel icon="info" title={t('return.timeout')} data-testid="return-timeout">
        <LinkButton href={`/${locale}/shop`} variant="quiet">
          {t('backToShop')}
        </LinkButton>
      </Panel>
    );
  }

  return (
    <Panel icon="alert" title={t('return.expired')} data-testid="return-expired">
      <Button variant="secondary" popoverTarget={CART_DRAWER_ID} data-testid="return-cart">
        {t('return.toCart')}
      </Button>
    </Panel>
  );
}
