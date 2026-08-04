import { describe, it, expect } from 'vitest';
import { gmail_v1 } from 'googleapis';

import {
  parseEmailBody,
  parseEmailHeaders,
  formatEmailForAgent,
  resolveForwardedIdentity,
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

  it('preserves forwarded message markers and original content', () => {
    const text =
      'See below\n\n---------- Forwarded message ---------\nFrom: Prospect <prospect@example.com>\nSubject: Level 1 registration\n\nOriginal content';
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/plain',
      body: { data: base64url(text) },
    };
    expect(parseEmailBody(payload)).toBe(text);
  });

  it('preserves quoted original content beneath a forwarded marker', () => {
    const text =
      'Please respond\n\n---------- Forwarded message ---------\n> From: Prospect <prospect@example.com>\n> I need help registering.';
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/plain',
      body: { data: base64url(text) },
    };
    expect(parseEmailBody(payload)).toContain('I need help registering.');
  });

  it('preserves an original inquiry beneath On-wrote inside a forward', () => {
    const text =
      'Please handle\n\n---------- Forwarded message ---------\nFrom: Alex <alex@example.com>\nSubject: Re: Level 1 registration\n\nI will check.\n\nOn Mon, Aug 3, 2026 Prospect wrote:\n> I want to register for Level 1. What is the price?';
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/plain',
      body: { data: base64url(text) },
    };
    const result = parseEmailBody(payload);
    expect(result).toContain('On Mon, Aug 3, 2026 Prospect wrote:');
    expect(result).toContain('I want to register for Level 1.');
  });

  it('preserves Apple Mail quoted forwarded content', () => {
    const text =
      'Please handle\n\nBegin forwarded message:\n\n> From: Prospect <prospect@example.com>\n> Subject: Level 1 registration\n>\n> I want to register. What is the price?';
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/plain',
      body: { data: base64url(text) },
    };
    expect(parseEmailBody(payload)).toContain(
      'I want to register. What is the price?',
    );
  });

  it('preserves a quoted forward marker below reply history', () => {
    const text =
      'Please handle\n\nOn Mon, Aug 3, 2026 Alex wrote:\n> See below\n> ---------- Forwarded message ---------\n> From: Prospect <prospect@example.com>\n> I want to register. What is the price?';
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/plain',
      body: { data: base64url(text) },
    };
    expect(parseEmailBody(payload)).toContain(
      'I want to register. What is the price?',
    );
  });

  it('preserves Outlook original-message forwarded content', () => {
    const text =
      'Please handle\n\n-----Original Message-----\nFrom: Prospect <prospect@example.com>\nSubject: Level 1 registration\n\nI want to register. What is the price?';
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/plain',
      body: { data: base64url(text) },
    };
    expect(parseEmailBody(payload)).toBe(text);
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

  it('presents the trusted forwarded author while preserving the internal forwarder', () => {
    const forwarded = { email: 'prospect@example.com', name: 'Prospect' };
    const result = formatEmailForAgent(
      {
        ...headers,
        from: 'Cherie Silas <cherie@tandemcoach.co>',
        fromName: 'Cherie Silas',
        subject: 'Fwd: Level 1 registration',
      },
      'Forwarded body',
      'source-thread',
      'source-message',
      forwarded,
    );
    expect(result).toContain('From: Prospect <prospect@example.com>');
    expect(result).toContain('Forwarded-Inquiry: yes');
    expect(result).toContain(
      'Forwarded-By: Cherie Silas <cherie@tandemcoach.co>',
    );
    expect(result).toContain('Thread-ID: source-thread');
  });
});

describe('resolveForwardedIdentity', () => {
  const authenticatedHeaders: gmail_v1.Schema$MessagePartHeader[] = [
    {
      name: 'Authentication-Results',
      value:
        'mx.google.com; dkim=pass header.i=@tandemcoach.co; dmarc=pass header.from=tandemcoach.co',
    },
  ];
  const internalHeaders: ParsedHeaders = {
    from: 'Cherie Silas <cherie@tandemcoach.co>',
    fromName: 'Cherie Silas',
    replyTo: '',
    to: 'info@tandemcoach.co',
    subject: 'Fwd: Level 1 registration',
    date: 'Mon, 3 Aug 2026',
    messageId: '<forward@example.com>',
    inReplyTo: '',
  };

  it('resolves the external author from an explicit internal forward', () => {
    const body =
      'Please respond\n\n---------- Forwarded message ---------\nFrom: External Prospect <prospect@example.com>\nSubject: Level 1 registration\n\nI need help.';
    expect(
      resolveForwardedIdentity(internalHeaders, body, authenticatedHeaders),
    ).toEqual({
      email: 'prospect@example.com',
      name: 'External Prospect',
    });
  });

  it('prefers an external forwarded Reply-To over From', () => {
    const body =
      '---------- Forwarded message ---------\nFrom: Relay <relay@example.net>\nReply-To: Customer <customer@example.com>\n\nQuestion';
    expect(
      resolveForwardedIdentity(internalHeaders, body, authenticatedHeaders),
    ).toEqual({
      email: 'customer@example.com',
      name: 'Customer',
    });
  });

  it('rejects a forged own-domain From without Gmail authentication', () => {
    const body =
      '---------- Forwarded message ---------\nFrom: Attacker Choice <attacker@evil.example>\n\nQuestion';
    expect(resolveForwardedIdentity(internalHeaders, body, [])).toBeNull();
    expect(
      resolveForwardedIdentity(internalHeaders, body, [
        {
          name: 'Authentication-Results',
          value:
            'attacker.example; dkim=pass header.i=@tandemcoach.co; dmarc=pass header.from=tandemcoach.co',
        },
      ]),
    ).toBeNull();
  });

  it('keeps Reply-To preference inside the first forwarded header block', () => {
    const body =
      '---------- Forwarded message ---------\nFrom: First Prospect <first@example.com>\nSubject: First\n\nBody text\nReply-To: Later Person <later@example.com>';
    expect(
      resolveForwardedIdentity(internalHeaders, body, authenticatedHeaders),
    ).toEqual({
      email: 'first@example.com',
      name: 'First Prospect',
    });
  });

  it('does not trust forwarded-looking headers from an external envelope', () => {
    const body =
      '---------- Forwarded message ---------\nFrom: Victim <victim@example.com>\n\nQuestion';
    expect(
      resolveForwardedIdentity(
        { ...internalHeaders, from: 'attacker@example.net' },
        body,
        authenticatedHeaders,
      ),
    ).toBeNull();
  });

  it('requires both a forward subject and an explicit marker', () => {
    expect(
      resolveForwardedIdentity(
        { ...internalHeaders, subject: 'Level 1 registration' },
        'From: Victim <victim@example.com>',
        authenticatedHeaders,
      ),
    ).toBeNull();
    expect(
      resolveForwardedIdentity(
        internalHeaders,
        'From: Victim <victim@example.com>',
        authenticatedHeaders,
      ),
    ).toBeNull();
  });
});
