import 'server-only';
import { escapeHtml, renderEmail } from '../layout';
import { emailT } from '../t';
import { labelled } from './order-parts';

export interface ContactMessageData {
  name: string;
  email: string;
  message: string;
  /** The language of the site the visitor used. */
  siteLocale: 'he' | 'en';
  shopName: string;
}

/**
 * Owner email (Hebrew): a message from the contact form (contracts/emails.md). The subject holds
 * the shop name only; the visitor's name, email and message are in the body, which is erased once
 * the email is sent. Every visitor value is escaped; the email address is text, not a link.
 */
export function renderContactMessage(data: ContactMessageData): {
  subject: string;
  html: string;
  text: string;
} {
  const locale = 'he';
  const siteLanguage = emailT(
    locale,
    data.siteLocale === 'he' ? 'emails.contact.localeHe' : 'emails.contact.localeEn',
  );
  const message = data.message.replaceAll('\r\n', '\n');
  const html = [
    labelled(emailT(locale, 'emails.contact.name'), data.name),
    labelled(emailT(locale, 'emails.contact.email'), data.email),
    labelled(emailT(locale, 'emails.contact.locale'), siteLanguage),
    `<p style="margin:16px 0 4px"><strong>${escapeHtml(emailT(locale, 'emails.contact.message'))}:</strong></p>`,
    `<p style="margin:4px 0">${escapeHtml(message).replaceAll('\n', '<br>')}</p>`,
    `<p style="margin:24px 0 0;color:#6b5a50">${escapeHtml(emailT(locale, 'emails.contact.footer'))}</p>`,
  ].join('');
  const text = [
    `${emailT(locale, 'emails.contact.name')}: ${data.name}`,
    `${emailT(locale, 'emails.contact.email')}: ${data.email}`,
    `${emailT(locale, 'emails.contact.locale')}: ${siteLanguage}`,
    '',
    `${emailT(locale, 'emails.contact.message')}:`,
    message,
    '',
    emailT(locale, 'emails.contact.footer'),
  ].join('\n');
  const rendered = renderEmail({
    locale,
    title: emailT(locale, 'emails.contact.title'),
    bodyHtml: html,
    bodyText: text,
  });
  return {
    subject: emailT(locale, 'emails.contact.subject', { shopName: data.shopName }),
    ...rendered,
  };
}
