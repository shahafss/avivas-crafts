/**
 * HTML produced by `renderMarkdown()` (src/server/content/markdown.ts) and nothing else. The brand
 * lets `ui/Markdown` accept only rendered output, so a raw string cannot reach
 * `dangerouslySetInnerHTML` by mistake. Type only: safe to import from client code.
 */
export type RenderedHtml = string & { readonly __brand: 'RenderedHtml' };
