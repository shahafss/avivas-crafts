import 'server-only';

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export interface RenderEmailInput {
  locale: 'he' | 'en';
  title: string;
  /** Trusted HTML: templates build it from `escapeHtml()`-ed values only. */
  bodyHtml: string;
  bodyText: string;
}

/** HTML (with `lang` and `dir`) plus the plain-text part. Inline styles are fine in email. */
export function renderEmail({ locale, title, bodyHtml, bodyText }: RenderEmailInput): {
  html: string;
  text: string;
} {
  const dir = locale === 'he' ? 'rtl' : 'ltr';
  const html =
    `<!doctype html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${escapeHtml(title)}</title></head>` +
    `<body style="margin:0;padding:24px;background:#fff8f0;color:#3a2a21;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6">` +
    `<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:16px;padding:28px">` +
    `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.25">${escapeHtml(title)}</h1>` +
    `${bodyHtml}</div></body></html>`;
  return { html, text: `${title}\n\n${bodyText}\n` };
}
