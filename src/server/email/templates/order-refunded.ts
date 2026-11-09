import 'server-only';
import { escapeHtml, renderEmail } from '../layout';
import { emailT } from '../t';
import {
  labelled,
  money,
  orderNumberText,
  pickText,
  sellerParts,
  type OrderEmailData,
} from './order-parts';

/**
 * Customer email in the order's language (contracts/emails.md › order-refunded): the payment was
 * marked as refunded in full. Holds the order number, the refunded amount, how the money comes
 * back (by payment method) and the seller block; no order-page link. The subject holds the shop
 * name and the order number only.
 */
export function renderOrderRefunded(data: Pick<OrderEmailData, 'order' | 'settings'>): {
  subject: string;
  html: string;
  text: string;
} {
  const { order, settings } = data;
  const locale = order.locale;
  const number = orderNumberText(order);
  const shopName = pickText(locale, settings.shopNameHe, settings.shopNameEn);
  const amount = money(order.totalMinor, order, locale);
  const method = emailT(locale, `emails.refunded.method.${order.paymentMethod}`);
  const seller = sellerParts(settings, locale);

  const intro = emailT(locale, 'emails.refunded.intro');
  const numberLabel = emailT(locale, 'emails.refunded.number');
  const amountLabel = emailT(locale, 'emails.refunded.amount');
  const rendered = renderEmail({
    locale,
    title: emailT(locale, 'emails.refunded.title'),
    bodyHtml: [
      `<p>${escapeHtml(intro)}</p>`,
      labelled(numberLabel, number),
      labelled(amountLabel, amount),
      `<p>${escapeHtml(method)}</p>`,
      seller.html,
    ].join(''),
    bodyText: [
      intro,
      `${numberLabel}: ${number}`,
      `${amountLabel}: ${amount}`,
      '',
      method,
      '',
      seller.text,
    ].join('\n'),
  });
  return { subject: emailT(locale, 'emails.refunded.subject', { number, shopName }), ...rendered };
}
