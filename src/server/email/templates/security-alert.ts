import 'server-only';
import { emailT } from '../t';
import { escapeHtml, renderEmail } from '../layout';

export const SECURITY_ALERT_KINDS = ['google_rejected'] as const;

export type SecurityAlertKind = (typeof SECURITY_ALERT_KINDS)[number];

/** Repeatable sign-in kinds: at most one email per kind per 15 minutes. */
export const THROTTLED_KINDS: readonly SecurityAlertKind[] = ['google_rejected'];

export interface SecurityAlertData {
  at: Date;
  /** Display name of the admin concerned. Never an unapproved account's email. */
  adminName?: string | undefined;
}

function formatWhen(at: Date): string {
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Jerusalem',
  }).format(at);
}

/**
 * Hebrew email to the admins. The subject is fixed text plus the shop name, so the outbox row's
 * kept subject holds no personal data; the admin's name appears only in the body.
 */
export function renderSecurityAlert(
  kind: SecurityAlertKind,
  data: SecurityAlertData,
  shopName: string,
): { subject: string; html: string; text: string } {
  const locale = 'he';
  const title = emailT(locale, `emails.securityAlert.kinds.${kind}.title`);
  const what = emailT(locale, `emails.securityAlert.kinds.${kind}.what`);
  const todo = emailT(locale, `emails.securityAlert.kinds.${kind}.todo`);
  const when = formatWhen(data.at);
  const admin = data.adminName === undefined ? null : data.adminName;

  const lines = [
    `<p>${escapeHtml(what)}</p>`,
    `<p><strong>${escapeHtml(emailT(locale, 'emails.securityAlert.when'))}:</strong> <bdi>${escapeHtml(when)}</bdi></p>`,
    ...(admin === null
      ? []
      : [
          `<p><strong>${escapeHtml(emailT(locale, 'emails.securityAlert.admin'))}:</strong> <bdi>${escapeHtml(admin)}</bdi></p>`,
        ]),
    `<p><strong>${escapeHtml(emailT(locale, 'emails.securityAlert.todoLabel'))}:</strong> ${escapeHtml(todo)}</p>`,
  ];
  const textLines = [
    what,
    `${emailT(locale, 'emails.securityAlert.when')}: ${when}`,
    ...(admin === null ? [] : [`${emailT(locale, 'emails.securityAlert.admin')}: ${admin}`]),
    `${emailT(locale, 'emails.securityAlert.todoLabel')}: ${todo}`,
  ];
  const rendered = renderEmail({
    locale,
    title,
    bodyHtml: lines.join(''),
    bodyText: textLines.join('\n'),
  });
  return { subject: emailT(locale, 'emails.securityAlert.subject', { shopName }), ...rendered };
}
