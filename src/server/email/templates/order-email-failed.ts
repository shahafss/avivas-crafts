import 'server-only';
import { escapeHtml, renderEmail } from '../layout';
import { emailT } from '../t';
import { labelled } from './order-parts';

export interface OrderEmailFailedData {
  shopName: string;
  orderNumber: number;
  orderId: string;
  /** `APP_ORIGIN`, for the admin link. */
  origin: string;
}

/**
 * Owner email (Hebrew): the customer's "order received" email could not be sent (002 FR-007).
 * The subject holds the shop name and the order number only; the body adds the admin link. No
 * customer name, phone, email or address: they are on the admin page behind sign-in.
 */
export function renderOrderEmailFailed(data: OrderEmailFailedData): {
  subject: string;
  html: string;
  text: string;
} {
  const locale = 'he';
  const number = `#${String(data.orderNumber)}`;
  const adminUrl = `${data.origin}/admin/orders/${data.orderId}`;
  const what = emailT(locale, 'emails.orderEmailFailed.what');
  const open = emailT(locale, 'emails.orderEmailFailed.open');
  const numberLabel = emailT(locale, 'emails.orderEmailFailed.number');
  const rendered = renderEmail({
    locale,
    title: emailT(locale, 'emails.orderEmailFailed.title'),
    bodyHtml: `<p>${escapeHtml(what)}</p>${labelled(numberLabel, number)}<p><a href="${escapeHtml(adminUrl)}">${escapeHtml(open)}</a></p>`,
    bodyText: `${what}\n\n${numberLabel}: ${number}\n\n${open}: ${adminUrl}`,
  });
  return {
    subject: emailT(locale, 'emails.orderEmailFailed.subject', {
      shopName: data.shopName,
      number,
    }),
    ...rendered,
  };
}
