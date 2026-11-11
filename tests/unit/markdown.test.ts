import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/server/content/markdown';

function render(source: string): string {
  return renderMarkdown(source);
}

describe('renderMarkdown: raw HTML and images', () => {
  it('escapes raw HTML as text', () => {
    const html = render('<script>alert(1)</script>');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');

    const img = render('<img src=x onerror=alert(1)>');
    expect(img).not.toContain('<img');
    expect(img).toContain('&lt;img');

    const iframe = render('<iframe src="https://evil.example"></iframe>');
    expect(iframe).not.toContain('<iframe');
    expect(iframe).toContain('&lt;iframe');
  });

  it('renders no <img> for image syntax', () => {
    expect(render('![x](https://a/b.png)')).not.toContain('<img');
  });
});

describe('renderMarkdown: link allow-list', () => {
  it.each([
    ['javascript:', '[x](javascript:alert(1))'],
    ['data:', '[x](data:text/html;base64,PHNjcmlwdD4=)'],
    ['vbscript:', '[x](vbscript:msgbox(1))'],
    ['http:', '[x](http://example.com)'],
    ['protocol-relative', '[x](//evil.example)'],
    ['backslash host', '[x](/\\evil.example)'],
  ])('does not render a %s link as <a>', (_name, source) => {
    const html = render(source);
    expect(html).not.toContain('<a');
    expect(html).toContain('x');
  });

  it('does not render a reference-style link to javascript:', () => {
    const html = render('[x][r]\n\n[r]: javascript:alert(1)');
    expect(html).not.toContain('<a');
    expect(html).not.toContain('href');
  });

  it.each([
    ['https:', '[x](https://example.com/a)', 'https://example.com/a'],
    ['mailto:', '[x](mailto:a@example.com)', 'mailto:a@example.com'],
    ['tel:', '[x](tel:+972501234567)', 'tel:+972501234567'],
    ['a same-site path', '[x](/he/contact)', '/he/contact'],
  ])('renders a %s link', (_name, source, href) => {
    expect(render(source)).toContain(`<a href="${href}"`);
  });

  it('adds rel="noopener noreferrer" to external https links only', () => {
    expect(render('[x](https://example.com)')).toContain('rel="noopener noreferrer"');
    expect(render('[x](/he/contact)')).not.toContain('rel=');
    expect(render('[x](mailto:a@example.com)')).not.toContain('rel=');
  });

  it('links written-out https:// URLs and leaves a bare www address as text', () => {
    expect(render('see https://example.com/page now')).toContain(
      '<a href="https://example.com/page"',
    );
    const bare = render('see www.example.co.il now');
    expect(bare).not.toContain('<a');
    expect(bare).toContain('www.example.co.il');
  });
});

describe('renderMarkdown: allowed formatting', () => {
  it('maps heading levels: # and ## to h2, ### and #### to h3', () => {
    expect(render('# A')).toContain('<h2>A</h2>');
    expect(render('## B')).toContain('<h2>B</h2>');
    expect(render('### C')).toContain('<h3>C</h3>');
    expect(render('#### D')).toContain('<h3>D</h3>');
    expect(render('# A')).not.toContain('<h1');
  });

  it('renders bold, italic and lists', () => {
    expect(render('**b**')).toContain('<strong>b</strong>');
    expect(render('*i*')).toContain('<em>i</em>');
    expect(render('- one\n- two')).toContain('<ul>');
    expect(render('1. one\n2. two')).toContain('<ol>');
  });

  it('turns a single newline into <br>', () => {
    expect(render('a\nb')).toContain('a<br>\nb');
  });
});

describe('renderMarkdown: disabled syntax', () => {
  it('does not render tables, code, blockquotes or rules', () => {
    expect(render('| a | b |\n| - | - |\n| 1 | 2 |')).not.toContain('<table');
    // Code blocks (fenced or indented) are not blocks; backticks fall back to inline text styling.
    expect(render('```\ncode\n```')).not.toContain('<pre');
    expect(render('    indented')).not.toMatch(/<pre|<code/);
    expect(render('> quote')).not.toContain('<blockquote');
    expect(render('---')).not.toContain('<hr');
  });
});
