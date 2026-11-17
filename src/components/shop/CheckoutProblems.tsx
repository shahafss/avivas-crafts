'use client';

import { useEffect, useRef } from 'react';
import { ErrorSummary, type ErrorSummaryItem } from '@/components/ui/ErrorSummary';
import { Notice } from '@/components/ui/Notice';
import { CART_DRAWER_ID } from '@/lib/cart/drawer';
import { CHECKOUT_SUMMARY_ID } from './checkout-ids';

/**
 * What went wrong with a checkout submit: the alert with its recovery (a button that opens the cart drawer
 * when lines can no longer be ordered) and the error summary that links to each invalid field.
 * Loaded only when there is something to show, so the checkout's first load stays small.
 * `focusToken` changes on every failed submit: the summary takes focus, or the alert scrolls
 * into view when there are no field errors.
 */
export default function CheckoutProblems({
  message,
  cartLink,
  summaryHeading,
  summaryItems,
  focusToken,
}: {
  /** The alert text, if any. */
  message: string | null;
  /** Translated button that opens the cart drawer; null when not offered. */
  cartLink: { label: string } | null;
  summaryHeading: string;
  summaryItems: ErrorSummaryItem[];
  focusToken: number;
}) {
  const noticeRef = useRef<HTMLDivElement>(null);
  const hasFieldErrors = summaryItems.length > 0;
  useEffect(() => {
    if (focusToken === 0) return;
    if (hasFieldErrors) document.getElementById(CHECKOUT_SUMMARY_ID)?.focus();
    else noticeRef.current?.scrollIntoView({ block: 'center' });
    // Only a new failed submit moves focus, not every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusToken]);

  return (
    <>
      {message === null ? null : (
        <div ref={noticeRef}>
          <Notice tone="alert" role="alert">
            <p className="font-bold">{message}</p>
            {cartLink === null ? null : (
              <button
                type="button"
                popoverTarget={CART_DRAWER_ID}
                data-testid="checkout-back-to-cart"
                className="mt-1 inline-flex min-h-11 items-center underline underline-offset-[3px]"
              >
                {cartLink.label}
              </button>
            )}
          </Notice>
        </div>
      )}
      <ErrorSummary
        id={CHECKOUT_SUMMARY_ID}
        data-testid="checkout-errors"
        heading={summaryHeading}
        items={summaryItems}
      />
    </>
  );
}
