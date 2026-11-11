import type { RenderedHtml } from '@/lib/rendered-html';

/**
 * The only place Markdown output reaches the DOM (the ESLint rule exempts this file). Takes
 * HTML already produced by `renderMarkdown()` on the server; no renderer import, so server pages
 * and the client editor preview can both use it. Put it inside `Prose`.
 */
export function Markdown({
  html,
  lang,
  dir,
}: {
  html: RenderedHtml;
  lang?: 'he' | 'en';
  dir?: 'rtl' | 'ltr' | 'auto';
}) {
  return <div lang={lang} dir={dir} dangerouslySetInnerHTML={{ __html: html }} />;
}
