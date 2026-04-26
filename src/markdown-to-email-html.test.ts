import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { convertMarkdownToEmailHtml } from './markdown-to-email-html.js';

describe('convertMarkdownToEmailHtml', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Empty/null input
  it('returns empty string for empty input', () => {
    expect(convertMarkdownToEmailHtml('')).toBe('');
  });

  it('returns empty string for null-like input', () => {
    expect(convertMarkdownToEmailHtml(null as unknown as string)).toBe('');
    expect(convertMarkdownToEmailHtml(undefined as unknown as string)).toBe('');
  });

  it('returns empty string for non-string input', () => {
    expect(convertMarkdownToEmailHtml(42 as unknown as string)).toBe('');
  });

  // 2. Plain text wrapped in <p>
  it('wraps plain text in a paragraph', () => {
    expect(convertMarkdownToEmailHtml('Hello world')).toBe(
      '<p>Hello world</p>',
    );
  });

  // 3. Bold
  it('converts **bold** to <strong>', () => {
    expect(convertMarkdownToEmailHtml('This is **bold** text')).toBe(
      '<p>This is <strong>bold</strong> text</p>',
    );
  });

  // 4. List items grouped into <ul><li>
  it('converts list items into ul/li elements', () => {
    const input = '- Alpha\n- Beta\n- Gamma';
    const result = convertMarkdownToEmailHtml(input);
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>Alpha</li>');
    expect(result).toContain('<li>Beta</li>');
    expect(result).toContain('<li>Gamma</li>');
  });

  it('groups consecutive list items and breaks on non-list lines', () => {
    const input = '- Item1\n- Item2\nNot a list';
    const result = convertMarkdownToEmailHtml(input);
    expect(result).toContain('<ul><li>Item1</li><li>Item2</li></ul>');
    expect(result).toContain('Not a list');
  });

  // 5. Multiple paragraphs
  it('wraps multiple paragraphs in separate <p> tags', () => {
    const input = 'First paragraph\n\nSecond paragraph';
    const result = convertMarkdownToEmailHtml(input);
    expect(result).toBe('<p>First paragraph</p><p>Second paragraph</p>');
  });

  // 6. Single line break → <br>
  it('converts single newlines within a paragraph to <br>', () => {
    const input = 'Line one\nLine two';
    const result = convertMarkdownToEmailHtml(input);
    expect(result).toBe('<p>Line one<br>Line two</p>');
  });

  // 7. Bare URL → <a href> with domain text
  it('converts bare https:// URL to anchor with domain text', () => {
    const result = convertMarkdownToEmailHtml('Visit https://example.com/page');
    expect(result).toContain(
      '<a href="https://example.com/page">example.com/page</a>',
    );
  });

  it('uses domain only when URL has no path', () => {
    const result = convertMarkdownToEmailHtml('Go to https://example.com');
    expect(result).toContain('<a href="https://example.com">example.com</a>');
  });

  // 8. Markdown link [text](url)
  it('converts markdown links to anchor tags', () => {
    const result = convertMarkdownToEmailHtml(
      '[Click here](https://example.com)',
    );
    expect(result).toBe('<p><a href="https://example.com">Click here</a></p>');
  });

  // 9. URL with query params (& escaped in href)
  it('escapes & in href attributes for query string URLs', () => {
    const result = convertMarkdownToEmailHtml(
      '[Link](https://example.com?a=1&b=2)',
    );
    expect(result).toContain('href="https://example.com?a=1&amp;b=2"');
    expect(result).toContain('>Link</a>');
  });

  it('escapes & in bare URL hrefs', () => {
    const result = convertMarkdownToEmailHtml(
      'See https://example.com?foo=1&bar=2 now',
    );
    expect(result).toContain('href="https://example.com?foo=1&amp;bar=2"');
  });

  // 10. XSS: <script> tags are escaped
  it('escapes HTML special characters to prevent XSS', () => {
    const input = "<script>alert('xss')</script>";
    const result = convertMarkdownToEmailHtml(input);
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('&lt;/script&gt;');
  });

  it('escapes angle brackets in content', () => {
    const result = convertMarkdownToEmailHtml('a < b & c > d');
    expect(result).toContain('&lt;');
    expect(result).toContain('&amp;');
    expect(result).toContain('&gt;');
  });

  // 11. Mixed: bold inside list item
  it('applies bold inside list items', () => {
    const input = '- Normal\n- **Bold item**';
    const result = convertMarkdownToEmailHtml(input);
    expect(result).toContain('<li>Normal</li>');
    expect(result).toContain('<li><strong>Bold item</strong></li>');
  });

  // 12. 100KB+ input → ''
  it('returns empty string for input exceeding 100KB', () => {
    const huge = 'a'.repeat(100 * 1024 + 1);
    expect(convertMarkdownToEmailHtml(huge)).toBe('');
  });

  // 13. Smart quotes and em/en dashes → ASCII
  it('converts em dash to hyphen', () => {
    const result = convertMarkdownToEmailHtml('before\u2014after');
    expect(result).toContain('before-after');
  });

  it('converts en dash to hyphen', () => {
    const result = convertMarkdownToEmailHtml('before\u2013after');
    expect(result).toContain('before-after');
  });

  it('converts smart double quotes to ASCII (html-escaped in output)', () => {
    const result = convertMarkdownToEmailHtml('\u201chello\u201d');
    // \u201c \u201d → " then HTML-escaped to &quot; in body text
    expect(result).toContain('&quot;hello&quot;');
    expect(result).not.toContain('\u201c');
    expect(result).not.toContain('\u201d');
  });

  it('converts smart single quotes to straight ASCII quotes', () => {
    const result = convertMarkdownToEmailHtml('\u2018hi\u2019');
    // \u2018 \u2019 → ' (single quote is not escaped by escapeHtml)
    expect(result).toContain("'hi'");
    expect(result).not.toContain('\u2018');
    expect(result).not.toContain('\u2019');
  });
});
