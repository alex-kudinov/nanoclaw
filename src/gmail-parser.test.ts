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
    const text = 'My reply\n\nOn Mon, Jan 1 2026 at 10:00 AM John wrote:\n> old message';
    const payload: gmail_v1.Schema$MessagePart = {
      mimeType: 'text/plain',
      body: { data: base64url(text) },
    };
    expect(parseEmailBody(payload)).toBe('My reply');
  });

  it('strips forwarded message markers', () => {
    const text = 'See below\n\n---------- Forwarded message ---------\nOriginal content';
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
});

// --- parseEmailHeaders ---

describe('parseEmailHeaders', () => {
  const headers: gmail_v1.Schema$MessagePartHeader[] = [
    { name: 'From', value: '"John Smith" <john@example.com>' },
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
  it('formats email with all fields', () => {
    const headers: ParsedHeaders = {
      from: 'john@example.com',
      fromName: 'John',
      to: 'info@tandemcoach.co',
      subject: 'Inquiry',
      date: 'Mon, 1 Jan 2026',
      messageId: '<abc>',
      inReplyTo: '',
    };
    const result = formatEmailForAgent(headers, 'Hello there');
    expect(result).toContain('From: John <john@example.com>');
    expect(result).toContain('Subject: Inquiry');
    expect(result).toContain('Hello there');
  });
});
