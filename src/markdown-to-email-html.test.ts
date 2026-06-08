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

  it('converts single-asterisk *bold* to <strong> (Slack-style)', () => {
    expect(
      convertMarkdownToEmailHtml('*One clarification first.* Then more'),
    ).toBe('<p><strong>One clarification first.</strong> Then more</p>');
  });

  it('handles multiple single-asterisk pairs in one paragraph', () => {
    expect(
      convertMarkdownToEmailHtml(
        'an accreditation for *programs*, not a *credential*',
      ),
    ).toBe(
      '<p>an accreditation for <strong>programs</strong>, not a <strong>credential</strong></p>',
    );
  });

  it('leaves no literal asterisks when both ** and * are present', () => {
    const result = convertMarkdownToEmailHtml('**double** and *single* here');
    expect(result).not.toContain('*');
    expect(result).toBe(
      '<p><strong>double</strong> and <strong>single</strong> here</p>',
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

  // 4b. Numbered lists → <ol><li> (chief drafts often use 1. 2. 3. format)
  it('converts numbered list items into ol/li elements', () => {
    const input = '1. First\n2. Second\n3. Third';
    const result = convertMarkdownToEmailHtml(input);
    expect(result).toContain(
      '<ol><li>First</li><li>Second</li><li>Third</li></ol>',
    );
  });

  it('preserves long numbered list items as separate <li>', () => {
    const input =
      '1. First, we schedule a 30-minute discovery call\n2. Then we co-design the engagement scope\n3. Finally we kick off with a chemistry session';
    const result = convertMarkdownToEmailHtml(input);
    expect(result).toContain('<ol>');
    expect(result).toContain(
      '<li>First, we schedule a 30-minute discovery call</li>',
    );
    expect(result).toContain('<li>Then we co-design the engagement scope</li>');
    expect(result).toContain(
      '<li>Finally we kick off with a chemistry session</li>',
    );
    expect(result).not.toMatch(/1\. First.*2\. Then/);
  });

  it('handles prose followed by a numbered list in one paragraph', () => {
    const input =
      'Here are the next steps to get you started with the program:\n1. Schedule the discovery call\n2. Sign the engagement letter\n3. Kick off';
    const result = convertMarkdownToEmailHtml(input);
    expect(result).toContain(
      '<ol><li>Schedule the discovery call</li><li>Sign the engagement letter</li><li>Kick off</li></ol>',
    );
    expect(result).toContain('Here are the next steps');
    expect(result).not.toMatch(/1\. Schedule.*2\. Sign/);
  });

  it('splits adjacent bulleted and numbered lists into separate ul/ol blocks', () => {
    const input = '- Bullet1\n- Bullet2\n1. Step1\n2. Step2';
    const result = convertMarkdownToEmailHtml(input);
    expect(result).toContain('<ul><li>Bullet1</li><li>Bullet2</li></ul>');
    expect(result).toContain('<ol><li>Step1</li><li>Step2</li></ol>');
  });

  // 5. Multiple paragraphs
  it('wraps multiple paragraphs in separate <p> tags', () => {
    const input = 'First paragraph\n\nSecond paragraph';
    const result = convertMarkdownToEmailHtml(input);
    expect(result).toBe('<p>First paragraph</p><p>Second paragraph</p>');
  });

  // 6. Soft wrap: single newlines within a paragraph fold into a space
  // when the paragraph contains long-line wrapped prose. Short-line blocks
  // (sigs, addresses) keep <br>. See sig-block tests below.
  it('folds single newlines within a long-line paragraph into a space', () => {
    const input =
      'This is a sufficiently long first line that exceeds the threshold\nand continues onto a second line with more wrapped prose.';
    const result = convertMarkdownToEmailHtml(input);
    expect(result).toBe(
      '<p>This is a sufficiently long first line that exceeds the threshold and continues onto a second line with more wrapped prose.</p>',
    );
  });

  it('reflows a hard-wrapped paragraph into one continuous line', () => {
    const input =
      'Your access has been updated — you should now see the Mentor Coaching\ncourses listed under the Courses section in the platform.';
    const result = convertMarkdownToEmailHtml(input);
    expect(result).toBe(
      '<p>Your access has been updated - you should now see the Mentor Coaching courses listed under the Courses section in the platform.</p>',
    );
  });

  it('preserves hard breaks in short-line signature blocks', () => {
    // A two-line sig: both lines are short, treat as intentional hard breaks.
    const input = 'Best,\nTandem Coaching';
    const result = convertMarkdownToEmailHtml(input);
    expect(result).toBe('<p>Best,<br>Tandem Coaching</p>');
  });

  it('preserves hard breaks in multi-line address-style blocks', () => {
    const input =
      'Love Rutledge\nExecutive Coach\nHost, FedUpward Podcast\n(202) 297-5238';
    const result = convertMarkdownToEmailHtml(input);
    expect(result).toBe(
      '<p>Love Rutledge<br>Executive Coach<br>Host, FedUpward Podcast<br>(202) 297-5238</p>',
    );
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
