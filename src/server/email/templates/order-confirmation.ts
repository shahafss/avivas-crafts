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
  paragraphsHtml,
  paymentMethodLabel,
  paymentStateLabel,
  pickText,
  sellerParts,
  totalsParts,
  type OrderEmailData,
} from './order-parts';

/**
 * Customer email in the order's language (contracts/emails.md): order details with each line's
 * own preparation time, payment instructions (offline) or pickup instructions, the seller's
 * identity and the cancellation policy summary (distance-selling written disclosure, R19). The
 * subject holds the shop name and the order number only.
 */
export function renderOrderConfirmation(data: OrderEmailData): {
  subject: string;
  html: string;
  text: string;
} {
  const { order, settings, origin, orderToken } = data;
  const locale = order.locale;
  const number = orderNumberText(order);
  const shopName = pickText(locale, settings.shopNameHe, settings.shopNameEn);
  const items = itemsParts(data, locale, true);
  const totals = totalsParts(data, locale);
  const address = addressText(order);
  const pickup = pickText(
    locale,
    settings.pickupInstructionsHe,
    settings.pickupInstructionsEn,
  ).trim();
  const offline = pickText(
    locale,
    settings.offlineInstructionsHe,
    settings.offlineInstructionsEn,
  ).trim();
  const orderUrl = `${origin}/${locale}/order/${orderToken}`;
  const policyUrl = `${origin}/${locale}/pages/shipping-returns`;
  const seller = sellerParts(settings, locale);
  const quote = emailT(locale, 'emails.order.quoteNumber', { number });
  const cancellation = emailT(locale, 'emails.order.cancellationText');

  const html: string[] = [
    `<p>${escapeHtml(emailT(locale, 'emails.order.intro'))}</p>`,
    labelled(emailT(locale, 'emails.order.number'), number),
    heading(emailT(locale, 'emails.order.items')),
    items.html,
    totals.html,
    labelled(emailT(locale, 'emails.order.paymentMethod'), paymentMethodLabel(order, locale)),
    labelled(emailT(locale, 'emails.order.paymentState'), paymentStateLabel(order, locale)),
    labelled(emailT(locale, 'emails.order.deliveryMethod'), deliveryLabel(order, locale)),
  ];
  const text: string[] = [
    emailT(locale, 'emails.order.intro'),
    `${emailT(locale, 'emails.order.number')}: ${number}`,
    '',
    emailT(locale, 'emails.order.items'),
    items.text,
    '',
    totals.text,
    `${emailT(locale, 'emails.order.paymentMethod')}: ${paymentMethodLabel(order, locale)}`,
    `${emailT(locale, 'emails.order.paymentState')}: ${paymentStateLabel(order, locale)}`,
    `${emailT(locale, 'emails.order.deliveryMethod')}: ${deliveryLabel(order, locale)}`,
  ];

  if (address !== null) {
    html.push(labelled(emailT(locale, 'emails.order.shipTo'), address));
    text.push(`${emailT(locale, 'emails.order.shipTo')}: ${address}`);
  }
  if (order.deliveryMethod === 'pickup' && pickup !== '') {
    html.push(heading(emailT(locale, 'emails.order.pickupInstructions')), paragraphsHtml(pickup));
    text.push('', emailT(locale, 'emails.order.pickupInstructions'), pickup);
  }
  if (order.paymentMethod === 'offline' && order.paymentState === 'awaiting_payment') {
    html.push(heading(emailT(locale, 'emails.order.howToPay')), paragraphsHtml(offline));
    html.push(`<p><strong>${escapeHtml(quote)}</strong></p>`);
    text.push('', emailT(locale, 'emails.order.howToPay'), offline, quote);
  }

  html.push(
    heading(emailT(locale, 'emails.order.cancellation')),
    `<p>${escapeHtml(cancellation)} <a href="${escapeHtml(policyUrl)}">${escapeHtml(policyUrl)}</a></p>`,
    seller.html,
    `<p>${escapeHtml(emailT(locale, 'emails.order.followIntro'))}<br><a href="${escapeHtml(orderUrl)}">${escapeHtml(emailT(locale, 'emails.order.viewOrder'))}</a></p>`,
  );
  text.push(
    '',
    emailT(locale, 'emails.order.cancellation'),
    `${cancellation} ${policyUrl}`,
    '',
    seller.text,
    '',
    emailT(locale, 'emails.order.followIntro'),
    `${emailT(locale, 'emails.order.viewOrder')}: ${orderUrl}`,
  );

  const rendered = renderEmail({
    locale,
    title: emailT(locale, 'emails.order.title'),
    bodyHtml: html.join(''),
    bodyText: text.join('\n'),
  });
  return { subject: emailT(locale, 'emails.order.subject', { number, shopName }), ...rendered };
}
