import 'server-only';
import { formatMoney } from '@/lib/money';
import { renderEmail } from '../layout';
import { emailT } from '../t';
import { heading, labelled } from './order-parts';

export type PaymentAttentionCase =
  'second_payment' | 'orphan_payment' | 'switched_offline' | 'unverified_expiry';

export interface PaymentAttentionData {
  case: PaymentAttentionCase;
  shopName: string;
  /** The pending checkout's id. */
  reference: string;
  provider: string;
  amountMinor: number | null;
  currency: 'ILS' | 'USD' | null;
  transactionId: string | null;
  /** The order the payment concerns: the confirmed order, or the offline order of a switch. */
  orderNumber?: number | undefined;
}

/**
 * Owner email (Hebrew) for a payment that needs a human decision (contracts/emails.md): a second
 * payment, a payment for an unknown or expired checkout, a payment after the customer switched
 * to direct payment (names that order, offers both choices), or a checkout whose final status
 * could not be checked. The subject is fixed text plus the shop name.
 */
export function renderPaymentAttention(data: PaymentAttentionData): {
  subject: string;
  html: string;
  text: string;
} {
  const locale = 'he';
  const key = `emails.paymentAttention.cases.${data.case}`;
  const rows: [string, string][] = [
    [emailT(locale, 'emails.paymentMismatch.reference'), data.reference],
    [emailT(locale, 'emails.paymentMismatch.provider'), data.provider],
    ...(data.orderNumber === undefined
      ? []
      : [
          [emailT(locale, 'emails.paymentAttention.order'), `#${String(data.orderNumber)}`] as [
            string,
            string,
          ],
        ]),
    ...(data.amountMinor === null || data.currency === null
      ? []
      : [
          [
            emailT(locale, 'emails.paymentAttention.amount'),
            formatMoney(data.amountMinor, data.currency, locale),
          ] as [string, string],
        ]),
    ...(data.transactionId === null
      ? []
      : [
          [emailT(locale, 'emails.paymentMismatch.transaction'), data.transactionId] as [
            string,
            string,
          ],
        ]),
  ];
  const orderParams = {
    number: data.orderNumber === undefined ? '' : `#${String(data.orderNumber)}`,
  };
  const what = emailT(locale, `${key}.what`, orderParams);
  const todo = emailT(locale, `${key}.todo`, orderParams);
  const rendered = renderEmail({
    locale,
    title: emailT(locale, `${key}.title`),
    bodyHtml: `<p>${what}</p>${rows.map(([label, value]) => labelled(label, value)).join('')}${heading(emailT(locale, 'emails.securityAlert.todoLabel'))}<p>${todo}</p>`,
    bodyText: `${what}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\n${emailT(locale, 'emails.securityAlert.todoLabel')}: ${todo}`,
  });
  return {
    subject: emailT(locale, 'emails.paymentAttention.subject', { shopName: data.shopName }),
    ...rendered,
  };
}
