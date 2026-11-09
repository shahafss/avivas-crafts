import 'server-only';
import { escapeHtml, renderEmail } from '../layout';
import { emailT } from '../t';
import {
  addressText,
  deliveryLabel,
  heading,
  itemsParts,
  labelled,
  orderNumberText,
  paymentMethodLabel,
  paymentStateLabel,
  totalsParts,
  type OrderEmailData,
} from './order-parts';

/**
 * Owner email (Hebrew): what was ordered, who by, and a link to the admin order page (it opens
 * through the same-site bounce, contracts/http-endpoints.md). The subject holds the shop name
 * and the order number only; the customer's details are in the body, which is erased once sent.
 */
export function renderNewOrder(data: Omit<OrderEmailData, 'orderToken'>): {
  subject: string;
  html: string;
  text: string;
} {
  const { order, settings, origin } = data;
  const locale = 'he';
  const number = orderNumberText(order);
  const items = itemsParts(data, locale, false);
  const totals = totalsParts(data, locale);
  const address = addressText(order);
  const adminUrl = `${origin}/admin/orders/${order.id}`;
  const phone = order.customerPhone ?? '';
  const email = order.customerEmail ?? '';
  const note = order.note ?? '';

  const html: string[] = [
    labelled(emailT(locale, 'emails.newOrder.number'), number),
    heading(emailT(locale, 'emails.order.items')),
    items.html,
    totals.html,
    labelled(emailT(locale, 'emails.order.paymentMethod'), paymentMethodLabel(order, locale)),
    labelled(emailT(locale, 'emails.order.paymentState'), paymentStateLabel(order, locale)),
    heading(emailT(locale, 'emails.newOrder.customer')),
    labelled(emailT(locale, 'emails.newOrder.name'), order.customerName),
    labelled(emailT(locale, 'emails.newOrder.phone'), phone),
    labelled(emailT(locale, 'emails.newOrder.email'), email),
    labelled(emailT(locale, 'emails.order.deliveryMethod'), deliveryLabel(order, locale)),
    ...(address === null ? [] : [labelled(emailT(locale, 'emails.order.shipTo'), address)]),
    ...(note === '' ? [] : [labelled(emailT(locale, 'emails.newOrder.note'), note)]),
    `<p><a href="${escapeHtml(adminUrl)}">${escapeHtml(emailT(locale, 'emails.newOrder.open'))}</a></p>`,
  ];
  const text: string[] = [
    `${emailT(locale, 'emails.newOrder.number')}: ${number}`,
    '',
    items.text,
    '',
    totals.text,
    `${emailT(locale, 'emails.order.paymentMethod')}: ${paymentMethodLabel(order, locale)}`,
    `${emailT(locale, 'emails.order.paymentState')}: ${paymentStateLabel(order, locale)}`,
    '',
    `${emailT(locale, 'emails.newOrder.name')}: ${order.customerName}`,
    `${emailT(locale, 'emails.newOrder.phone')}: ${phone}`,
    `${emailT(locale, 'emails.newOrder.email')}: ${email}`,
    `${emailT(locale, 'emails.order.deliveryMethod')}: ${deliveryLabel(order, locale)}`,
    ...(address === null ? [] : [`${emailT(locale, 'emails.order.shipTo')}: ${address}`]),
    ...(note === '' ? [] : [`${emailT(locale, 'emails.newOrder.note')}: ${note}`]),
    '',
    `${emailT(locale, 'emails.newOrder.open')}: ${adminUrl}`,
  ];
  const rendered = renderEmail({
    locale,
    title: emailT(locale, 'emails.newOrder.title'),
    bodyHtml: html.join(''),
    bodyText: text.join('\n'),
  });
  return {
    subject: emailT(locale, 'emails.newOrder.subject', {
      number,
      shopName: settings.shopNameHe,
    }),
    ...rendered,
  };
}
