import { describe, expect, it } from 'vitest';
import { applyTool } from '@/lib/markdown-tools';

describe('applyTool (content editor toolbar)', () => {
  it('bold wraps the selection and keeps it selected', () => {
    expect(applyTool('bold', 'hello world', 6, 11, 'x')).toEqual({
      value: 'hello **world**',
      start: 8,
      end: 13,
    });
  });

  it('bold without a selection puts the caret between the markers', () => {
    expect(applyTool('bold', 'ab', 1, 1, 'x')).toEqual({ value: 'a****b', start: 3, end: 3 });
  });

  it('link uses the selection as its text and selects the address', () => {
    const edit = applyTool('link', 'see here now', 4, 8, 'text');
    expect(edit.value).toBe('see [here](https://) now');
    expect(edit.value.slice(edit.start, edit.end)).toBe('https://');
  });

  it('link without a selection uses the placeholder text', () => {
    expect(applyTool('link', '', 0, 0, 'link text').value).toBe('[link text](https://)');
  });

  it('heading prefixes the line of the caret, once', () => {
    expect(applyTool('heading', 'one\ntwo', 5, 5, '').value).toBe('one\n## two');
    expect(applyTool('heading', '## one', 3, 3, '').value).toBe('## one');
  });

  it('list prefixes every selected non-empty line', () => {
    const edit = applyTool('list', 'a\n\nb\nc', 0, 6, '');
    expect(edit.value).toBe('- a\n\n- b\n- c');
  });

  it('list on a caret in an empty text inserts one item marker', () => {
    expect(applyTool('list', '', 0, 0, '')).toEqual({ value: '- ', start: 2, end: 2 });
  });
});
