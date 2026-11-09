import 'server-only';
import { escapeHtml, renderEmail } from '../layout';
import { emailT } from '../t';
import {
  itemsParts,
  labelled,
  money,
  orderNumberText,
  pickText,
  sellerParts,
  type OrderEmailData,
} from './order-parts';

/**
 * Customer email in the order's language (contracts/emails.md > order-cancelled): the order was
 * cancelled. Holds the order number, the items and total, what happens to the money (by payment
 * state and method) and the seller block; no address, no order-page link. The subject holds the
 * shop name and the order number only.
 */
export function renderOrderCancelled(data: Pick<OrderEmailData, 'order' | 'lines' | 'settings'>): {
  subject: string;
  html: string;
  text: string;
} {
  const { order, settings } = data;
  const locale = order.locale;
  const number = orderNumberText(order);
  const shopName = pickText(locale, settings.shopNameHe, settings.shopNameEn);
  const items = itemsParts(data, locale, false);
  const seller = sellerParts(settings, locale);

  const moneyKey =
    order.paymentState === 'refunded'
      ? 'emails.cancelled.refunded'
      : order.paymentState === 'paid'
        ? `emails.cancelled.paid.${order.paymentMethod}`
        : 'emails.cancelled.unpaid';
  const moneyText = emailT(locale, moneyKey);
  const intro = emailT(locale, 'emails.cancelled.intro');
  const closing = emailT(locale, 'emails.cancelled.closing');
  const numberLabel = emailT(locale, 'emails.cancelled.number');
  const totalLabel = emailT(locale, 'emails.order.total');
  const total = money(order.totalMinor, order, locale);

  const rendered = renderEmail({
    locale,
    title: emailT(locale, 'emails.cancelled.title'),
    bodyHtml: [
      `<p>${escapeHtml(intro)}</p>`,
      labelled(numberLabel, number),
      items.html,
      labelled(totalLabel, total),
      `<p>${escapeHtml(moneyText)}</p>`,
      `<p>${escapeHtml(closing)}</p>`,
      seller.html,
    ].join(''),
    bodyText: [
      intro,
      `${numberLabel}: ${number}`,
      '',
      items.text,
      '',
      `${totalLabel}: ${total}`,
      '',
      moneyText,
      '',
      closing,
      '',
      seller.text,
    ].join('\n'),
  });
  return { subject: emailT(locale, 'emails.cancelled.subject', { number, shopName }), ...rendered };
}
