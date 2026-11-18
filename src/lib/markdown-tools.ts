/** The four toolbar buttons of the content editor (storefront.md §12.6). */
export type MarkdownTool = 'heading' | 'bold' | 'list' | 'link';

export interface Edit {
  value: string;
  /** Selection to restore after the edit. */
  start: number;
  end: number;
}

const HEADING = '## ';
const ITEM = '- ';
const LINK_TARGET = 'https://';

function lineStartOf(value: string, index: number): number {
  return index === 0 ? 0 : value.lastIndexOf('\n', index - 1) + 1;
}

/**
 * Inserts the Markdown syntax of `tool` at the selection `[start, end)` and returns the new text
 * with the selection to restore. Pure: the editor island applies the result to its textarea.
 */
export function applyTool(
  tool: MarkdownTool,
  value: string,
  start: number,
  end: number,
  linkText: string,
): Edit {
  const from = Math.min(start, end);
  const to = Math.max(start, end);
  const selected = value.slice(from, to);

  if (tool === 'bold') {
    if (selected === '') {
      return {
        value: `${value.slice(0, from)}****${value.slice(to)}`,
        start: from + 2,
        end: from + 2,
      };
    }
    return {
      value: `${value.slice(0, from)}**${selected}**${value.slice(to)}`,
      start: from + 2,
      end: to + 2,
    };
  }

  if (tool === 'link') {
    const text = selected === '' ? linkText : selected;
    const before = `${value.slice(0, from)}[${text}](`;
    return {
      value: `${before}${LINK_TARGET})${value.slice(to)}`,
      start: before.length,
      end: before.length + LINK_TARGET.length,
    };
  }

  const prefix = tool === 'heading' ? HEADING : ITEM;
  const blockStart = lineStartOf(value, from);
  // A selection that ends just after a line break does not include the next line.
  const blockEnd = to > from && value[to - 1] === '\n' ? to - 1 : to;
  const lines = value.slice(blockStart, blockEnd).split('\n');
  const several = tool === 'list' && lines.length > 1;
  let added = 0;
  let addedBeforeStart = 0;
  const changed = lines.map((line, index) => {
    const skip = line.startsWith(prefix) || (several && line === '');
    if (skip || (tool === 'heading' && index > 0)) return line;
    added += prefix.length;
    if (index === 0) addedBeforeStart = prefix.length;
    return `${prefix}${line}`;
  });
  return {
    value: `${value.slice(0, blockStart)}${changed.join('\n')}${value.slice(blockEnd)}`,
    start: from + addedBeforeStart,
    end: to + added,
  };
}
