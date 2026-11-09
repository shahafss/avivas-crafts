import 'server-only';
import { formatMoney } from '@/lib/money';
import type { orderLine, orders } from '@/server/db/schema';
import type { Settings } from '@/server/settings/settings';
import { escapeHtml } from '../layout';
import { emailT } from '../t';

export type OrderRow = typeof orders.$inferSelect;
export type OrderLineRow = typeof orderLine.$inferSelect;
type Locale = 'he' | 'en';

export interface OrderEmailData {
  order: OrderRow;
  lines: OrderLineRow[];
  settings: Settings;
  /** `APP_ORIGIN`, for links. */
  origin: string;
  /** The confirmation-page token (only its hash is stored, so the caller passes it in). */
  orderToken: string;
}

/** English text with Hebrew fallback (the shop's content is Hebrew first). */
export function pickText(locale: Locale, he: string | null, en: string | null): string {
  return (locale === 'en' && en !== null && en !== '' ? en : he) ?? '';
}

export function money(minor: number, order: OrderRow, locale: Locale): string {
  return formatMoney(minor, order.currency, locale);
}

/** A block of paragraphs from owner-written text: escaped, line breaks kept. */
export function paragraphsHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((part) => `<p>${escapeHtml(part).replaceAll('\n', '<br>')}</p>`)
    .join('');
}

export function heading(text: string): string {
  return `<h2 style="margin:24px 0 8px;font-size:18px">${escapeHtml(text)}</h2>`;
}

export function labelled(label: string, value: string): string {
  return `<p style="margin:4px 0"><strong>${escapeHtml(label)}:</strong> <bdi>${escapeHtml(value)}</bdi></p>`;
}

export function orderNumberText(order: OrderRow): string {
  return `#${String(order.orderNumber)}`;
}

export function paymentMethodLabel(order: OrderRow, locale: Locale): string {
  return emailT(locale, `emails.order.method.${order.paymentMethod}`);
}

export function paymentStateLabel(order: OrderRow, locale: Locale): string {
  return emailT(locale, `emails.order.state.${order.paymentState}`);
}

export function deliveryLabel(order: OrderRow, locale: Locale): string {
  return emailT(locale, `emails.order.${order.deliveryMethod}`);
}

/** One line of the customer's address, or null for pickup. */
export function addressText(order: OrderRow): string | null {
  if (order.deliveryMethod !== 'shipping') return null;
  return [
    order.addressLine1,
    order.addressLine2,
    order.addressCity,
    order.addressPostalCode,
    order.addressCountry,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(', ');
}

function lineTitle(line: OrderLineRow, locale: Locale): string {
  const name = pickText(locale, line.productNameHe, line.productNameEn);
  const options = line.options as {
    group_he: string;
    group_en: string | null;
    value_he: string;
    value_en: string | null;
  }[];
  const chosen = options
    .map(
      (option) =>
        `${pickText(locale, option.group_he, option.group_en)}: ${pickText(locale, option.value_he, option.value_en)}`,
    )
    .join(', ');
  return chosen === '' ? name : `${name} (${chosen})`;
}

export interface RenderedParts {
  html: string;
  text: string;
}

/** The items, each with its quantity, line total and (when `withPrep`) its preparation time. */
export function itemsParts(
  { order, lines }: Pick<OrderEmailData, 'order' | 'lines'>,
  locale: Locale,
  withPrep: boolean,
): RenderedParts {
  const html: string[] = ['<ul style="padding-inline-start:20px">'];
  const text: string[] = [];
  for (const line of lines) {
    const title = lineTitle(line, locale);
    const quantity = emailT(locale, 'emails.order.quantity', { count: line.quantity });
    const total = money(line.lineTotalMinor, order, locale);
    const prep = pickText(locale, line.prepTimeHe, line.prepTimeEn);
    const prepText =
      withPrep && prep !== '' ? emailT(locale, 'emails.order.prep', { prepTime: prep }) : '';
    html.push(
      `<li style="margin:6px 0"><bdi>${escapeHtml(title)}</bdi> · ${escapeHtml(quantity)} · <bdi>${escapeHtml(total)}</bdi>` +
        (prepText === ''
          ? ''
          : `<br><span style="color:#6b564a;font-size:14px">${escapeHtml(prepText)}</span>`) +
        '</li>',
    );
    text.push(`- ${title} · ${quantity} · ${total}${prepText === '' ? '' : `\n  ${prepText}`}`);
  }
  html.push('</ul>');
  return { html: html.join(''), text: text.join('\n') };
}

/** Subtotal, delivery and total. */
export function totalsParts(
  { order }: Pick<OrderEmailData, 'order'>,
  locale: Locale,
): RenderedParts {
  const subtotal = money(order.subtotalMinor, order, locale);
  const fee =
    order.deliveryFeeMinor === 0
      ? emailT(locale, 'emails.order.free')
      : money(order.deliveryFeeMinor, order, locale);
  const total = money(order.totalMinor, order, locale);
  const rows: [string, string][] = [
    [emailT(locale, 'emails.order.subtotal'), subtotal],
    [emailT(locale, 'emails.order.deliveryFee'), fee],
    [emailT(locale, 'emails.order.total'), total],
  ];
  return {
    html: rows
      .map(([label, value], index) =>
        labelled(label, value).replace(
          '<p style="margin:4px 0">',
          `<p style="margin:4px 0${index === rows.length - 1 ? ';font-size:18px' : ''}">`,
        ),
      )
      .join(''),
    text: rows.map(([label, value]) => `${label}: ${value}`).join('\n'),
  };
}
