import 'server-only';
import { formatMoney } from '@/lib/money';
import { renderEmail } from '../layout';
import { emailT } from '../t';
import { heading, labelled } from './order-parts';

export interface PaymentMismatchData {
  shopName: string;
  /** The pending checkout's id (the reference at the provider). */
  reference: string;
  provider: string;
  expectedMinor: number;
  expectedCurrency: 'ILS' | 'USD';
  reportedMinor: number;
  reportedCurrency: 'ILS' | 'USD';
  transactionId: string | null;
  customer: { name: string; phone: string; email: string };
}

/**
 * Owner email (Hebrew) when the provider reports a different amount or currency than the
 * checkout: no order was made, and the customer's contact details let the owner follow up.
 * The subject is fixed text plus the shop name. No card data is ever involved.
 */
export function renderPaymentMismatch(data: PaymentMismatchData): {
  subject: string;
  html: string;
  text: string;
} {
  const locale = 'he';
  const expected = formatMoney(data.expectedMinor, data.expectedCurrency, locale);
  const reported = formatMoney(data.reportedMinor, data.reportedCurrency, locale);
  const rows: [string, string][] = [
    [emailT(locale, 'emails.paymentMismatch.reference'), data.reference],
    [emailT(locale, 'emails.paymentMismatch.provider'), data.provider],
    [emailT(locale, 'emails.paymentMismatch.expected'), expected],
    [emailT(locale, 'emails.paymentMismatch.reported'), reported],
    ...(data.transactionId === null
      ? []
      : [
          [emailT(locale, 'emails.paymentMismatch.transaction'), data.transactionId] as [
            string,
            string,
          ],
        ]),
    [emailT(locale, 'emails.newOrder.name'), data.customer.name],
    [emailT(locale, 'emails.newOrder.phone'), data.customer.phone],
    [emailT(locale, 'emails.newOrder.email'), data.customer.email],
  ];
  const todo = emailT(locale, 'emails.paymentMismatch.todo');
  const rendered = renderEmail({
    locale,
    title: emailT(locale, 'emails.paymentMismatch.title'),
    bodyHtml: `<p>${emailT(locale, 'emails.paymentMismatch.what')}</p>${rows.map(([label, value]) => labelled(label, value)).join('')}${heading(emailT(locale, 'emails.securityAlert.todoLabel'))}<p>${todo}</p>`,
    bodyText: `${emailT(locale, 'emails.paymentMismatch.what')}\n\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\n${emailT(locale, 'emails.securityAlert.todoLabel')}: ${todo}`,
  });
  return {
    subject: emailT(locale, 'emails.paymentMismatch.subject', { shopName: data.shopName }),
    ...rendered,
  };
}
