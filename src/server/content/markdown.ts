import 'server-only';
import MarkdownIt from 'markdown-it';
import type { RenderedHtml } from '@/lib/rendered-html';

export type { RenderedHtml };

/**
 * Link allow-list (spec 003 FR-003, research R2): `https:`, `mailto:`, `tel:` and same-site
 * paths. Everything else (`javascript:`, `data:`, `vbscript:`, `http:`, `//host`, `/\host`) stays
 * as plain text. `url` is the already normalised link target.
 */
function isAllowedLink(url: string): boolean {
  const value = url.trim().toLowerCase();
  if (/^(https:|mailto:|tel:)/.test(value)) return true;
  // A same-site path: one leading slash, no second slash and no backslash (browsers read `/\x` as `//x`).
  return value.startsWith('/') && !value.startsWith('//') && !/\\|%5c/.test(value);
}

function createRenderer(): InstanceType<typeof MarkdownIt> {
  const md = new MarkdownIt('default', {
    html: false,
    breaks: true,
    linkify: true,
    typographer: false,
  });
  md.linkify.set({ fuzzyLink: false });
  md.disable(['image', 'table', 'code', 'fence', 'blockquote', 'hr', 'strikethrough']);
  md.validateLink = isAllowedLink;

  // The page title is the h1, so `#` becomes h2 and everything below h2 becomes h3.
  md.core.ruler.push('ac_heading_levels', (state) => {
    for (const token of state.tokens) {
      if (token.type === 'heading_open' || token.type === 'heading_close') {
        token.tag = Number(token.tag.slice(1)) <= 2 ? 'h2' : 'h3';
      }
    }
    return true;
  });

  const defaultLinkOpen =
    md.renderer.rules.link_open ??
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (
      token &&
      String(token.attrGet('href') ?? '')
        .toLowerCase()
        .startsWith('https:')
    ) {
      token.attrSet('rel', 'noopener noreferrer');
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
  };
  return md;
}

const renderer = createRenderer();

/** Owner-written Markdown to safe HTML. Show the result only through `ui/Markdown`. */
export function renderMarkdown(source: string): RenderedHtml {
  return renderer.render(source) as RenderedHtml;
}
