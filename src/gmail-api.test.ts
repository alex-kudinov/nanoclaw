import { describe, it, expect, vi } from 'vitest';

vi.mock('./config.js', () => ({
  GMAIL_MONITORED_EMAIL: 'info@tandemcoach.co',
  GMAIL_SEND_AS: 'hello@tandemcoach.co',
  GMAIL_SIGNATURE: 'The Tandem Coaching Team',
}));

vi.mock('./gmail-auth.js', () => ({
  getGmailClient: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { buildRawMessage, appendHtmlSignature } from './gmail-api.js';

function decodeRaw(raw: string): string {
  const base64 = raw.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

describe('buildRawMessage', () => {
  it('uses text/plain content type by default', () => {
    const raw = buildRawMessage({
      to: 'test@example.com',
      subject: 'Test',
      body: 'Hello',
    });
    const decoded = decodeRaw(raw);
    expect(decoded).toContain('Content-Type: text/plain; charset=utf-8');
  });

  it('uses text/html content type when html:true', () => {
    const raw = buildRawMessage({
      to: 'test@example.com',
      subject: 'Test',
      body: '<p>Hello</p>',
      html: true,
    });
    const decoded = decodeRaw(raw);
    expect(decoded).toContain('Content-Type: text/html; charset=utf-8');
  });

  it('appends signature to HTML emails', () => {
    const raw = buildRawMessage({
      to: 'test@example.com',
      subject: 'Test',
      body: '<p>Hello</p>',
      html: true,
    });
    const decoded = decodeRaw(raw);
    expect(decoded).toContain('The Tandem Coaching Team');
  });

  it('does not append signature to plain text emails', () => {
    const raw = buildRawMessage({
      to: 'test@example.com',
      subject: 'Test',
      body: 'Hello plain text',
    });
    const decoded = decodeRaw(raw);
    expect(decoded).not.toContain('The Tandem Coaching Team');
  });

  it('strips CRLF from header fields to prevent injection', () => {
    const raw = buildRawMessage({
      to: 'test@example.com\r\nBcc: evil@attacker.com',
      subject: 'Safe\r\nBcc: evil@attacker.com',
      body: 'Hello',
      cc: 'cc@example.com\r\nBcc: evil@attacker.com',
    });
    const decoded = decodeRaw(raw);
    // CRLF stripped — injected Bcc is concatenated into the same line, not a separate header
    expect(decoded).not.toMatch(/^Bcc:/m);
    // The To field has the injection text concatenated (harmless — no newline)
    expect(decoded).toContain('To: test@example.comBcc: evil@attacker.com');
  });
});

describe('appendHtmlSignature', () => {
  it('appends signature block to HTML body', () => {
    const result = appendHtmlSignature('<p>Hello</p>');
    expect(result).toContain('<p>Hello</p>');
    expect(result).toContain('The Tandem Coaching Team');
    expect(result).toContain('color: #666');
  });
});
