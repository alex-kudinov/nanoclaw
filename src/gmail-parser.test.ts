import { describe, it, expect } from 'vitest';
import { gmail_v1 } from 'googleapis';

import {
  parseEmailBody,
  parseEmailHeaders,
  formatEmailForAgent,
  ParsedHeaders,
} from './gmail-parser.js';

function base64url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// --- parseEmailBody ---

describe('parseEmailBody', () => {
  it('extracts text/plain body', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/plain',
      body: { data: base64url('Hello world') },
    };
    expect(parseEmailBody(payload)).toBe('Hello world');
  });

  it('prefers text/plain over text/html', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/plain', body: { data: base64url('Plain text') } },
        {
          mimeType: 'text/html',
          body: { data: base64url('<p>HTML text</p>') },
        },
      ],
    };
    expect(parseEmailBody(payload)).toBe('Plain text');
  });

  it('falls back to stripped HTML when no text/plain', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/alternative',
      parts: [
        {
          mimeType: 'text/html',
          body: { data: base64url('<p>Hello</p><p>World</p>') },
        },
      ],
    };
    expect(parseEmailBody(payload)).toBe('Hello\n\nWorld');
  });

  it('returns empty string when no body', () => {
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'multipart/mixed',
      parts: [{ mimeType: 'image/png', body: {} }],
    };
    expect(parseEmailBody(payload)).toBe('');
  });

  it('strips quoted replies (On ... wrote:)', () => {
    const text =
      'My reply\n\nOn Mon, Jan 1 2026 at 10:00 AM John wrote:\n> old message';
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/plain',
      body: { data: base64url(text) },
    };
    expect(parseEmailBody(payload)).toBe('My reply');
  });

  it('strips forwarded message markers', () => {
    const text =
      'See below\n\n---------- Forwarded message ---------\nOriginal content';
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/plain',
      body: { data: base64url(text) },
    };
    expect(parseEmailBody(payload)).toBe('See below');
  });

  it('skips > quoted lines', () => {
    const text = 'My reply\n> quoted line\nMore text';
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/plain',
      body: { data: base64url(text) },
    };
    expect(parseEmailBody(payload)).toBe('My reply\nMore text');
  });

  it('truncates long bodies', () => {
    const longText = 'a'.repeat(15000);
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/plain',
      body: { data: base64url(longText) },
    };
    const result = parseEmailBody(payload);
    expect(result.length).toBeLessThan(15000);
    expect(result).toContain('[truncated]');
  });

  it('decodes HTML entities', () => {
    const html = '<p>A &amp; B &lt; C &gt; D &quot;E&quot; &#39;F&#39;</p>';
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/html',
      body: { data: base64url(html) },
    };
    expect(parseEmailBody(payload)).toBe('A & B < C > D "E" \'F\'');
  });

  it('strips style blocks and their content', () => {
    const html =
      '<style>body { font-family: Arial; } .header { color: red; }</style><p>Invoice total: $500</p>';
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/html',
      body: { data: base64url(html) },
    };
    expect(parseEmailBody(payload)).toBe('Invoice total: $500');
  });

  it('strips script blocks and their content', () => {
    const html = '<script>var x = 1;</script><p>Payment received</p>';
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/html',
      body: { data: base64url(html) },
    };
    expect(parseEmailBody(payload)).toBe('Payment received');
  });

  it('strips HTML comments including Outlook conditionals', () => {
    const html =
      '<!--[if mso]><table><tr><td><![endif]--><p>Content</p><!--[if mso]></td></tr></table><![endif]-->';
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/html',
      body: { data: base64url(html) },
    };
    expect(parseEmailBody(payload)).toBe('Content');
  });

  it('decodes numeric HTML entities', () => {
    const html = '<p>Price: &#36;100 &#8212; paid</p>';
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/html',
      body: { data: base64url(html) },
    };
    expect(parseEmailBody(payload)).toBe('Price: $100 \u2014 paid');
  });

  it('collapses excessive whitespace from complex HTML emails', () => {
    const html =
      '<style>.x{color:red}</style>\n\n\n<p>Line 1</p>\n\n\n\n<p>Line 2</p>';
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/html',
      body: { data: base64url(html) },
    };
    const result = parseEmailBody(payload);
    expect(result).not.toMatch(/\n{3,}/);
    expect(result).toContain('Line 1');
    expect(result).toContain('Line 2');
  });
});

// --- parseEmailHeaders ---

describe('parseEmailHeaders', () => {
  const headers: gmail_v1.Schema$MessagePartHeader[] = [
    { name: 'From', value: '"John Smith" <john@example.com>' },
    { name: 'Reply-To', value: 'john.reply@example.com' },
    { name: 'To', value: 'info@tandemcoach.co' },
    { name: 'Subject', value: 'Coaching Inquiry' },
    { name: 'Date', value: 'Mon, 1 Jan 2026 10:00:00 -0500' },
    { name: 'Message-ID', value: '<abc123@mail.example.com>' },
    { name: 'In-Reply-To', value: '<def456@mail.example.com>' },
  ];

  it('extracts all standard headers', () => {
    const parsed = parseEmailHeaders(headers);
    expect(parsed.from).toBe('"John Smith" <john@example.com>');
    expect(parsed.fromName).toBe('John Smith');
    expect(parsed.replyTo).toBe('john.reply@example.com');
    expect(parsed.to).toBe('info@tandemcoach.co');
    expect(parsed.subject).toBe('Coaching Inquiry');
    expect(parsed.messageId).toBe('<abc123@mail.example.com>');
    expect(parsed.inReplyTo).toBe('<def456@mail.example.com>');
  });

  it('extracts name without quotes', () => {
    const h = [{ name: 'From', value: 'Jane Doe <jane@example.com>' }];
    expect(parseEmailHeaders(h).fromName).toBe('Jane Doe');
  });

  it('falls back to email prefix when no display name', () => {
    const h = [{ name: 'From', value: 'alice@example.com' }];
    expect(parseEmailHeaders(h).fromName).toBe('alice');
  });

  it('returns empty strings for missing headers', () => {
    const parsed = parseEmailHeaders([]);
    expect(parsed.from).toBe('');
    expect(parsed.subject).toBe('');
    expect(parsed.messageId).toBe('');
  });
});

// --- formatEmailForAgent ---

describe('formatEmailForAgent', () => {
  const headers: ParsedHeaders = {
    from: 'john@example.com',
    fromName: 'John',
    replyTo: '',
    to: 'info@tandemcoach.co',
    subject: 'Inquiry',
    date: 'Mon, 1 Jan 2026',
    messageId: '<abc>',
    inReplyTo: '',
  };

  it('formats email with all fields', () => {
    const result = formatEmailForAgent(headers, 'Hello there');
    expect(result).toContain('From: John <john@example.com>');
    expect(result).toContain('Subject: Inquiry');
    expect(result).toContain('Hello there');
  });

  it('includes Thread-ID when threadId is provided', () => {
    const result = formatEmailForAgent(headers, 'Hello', '18e4f2a3bcd');
    expect(result).toContain('Thread-ID: 18e4f2a3bcd');
  });

  it('includes Reply-To when a relay supplies one', () => {
    const result = formatEmailForAgent(
      { ...headers, replyTo: 'Customer <customer@example.com>' },
      'Hello',
    );
    expect(result).toContain('Reply-To: Customer <customer@example.com>');
  });

  it('omits Thread-ID when threadId is not provided', () => {
    const result = formatEmailForAgent(headers, 'Hello');
    expect(result).not.toContain('Thread-ID');
  });
});
