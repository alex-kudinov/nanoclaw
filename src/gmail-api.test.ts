import { describe, it, expect, vi } from 'vitest';

vi.mock('./config.js', () => ({
  GMAIL_MONITORED_EMAIL: 'info@tandemcoach.co',
  GMAIL_SEND_AS: 'Tandem Coaching <info@tandemcoach.co>',
  GMAIL_REPLY_TO: 'info@tandemcoach.co',
  GMAIL_BCC: 'info@tandemcoach.co',
  TRACKING_DOMAIN: 't.tandemcoach.co',
}));

vi.mock('./gmail-auth.js', () => ({
  getGmailClient: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { buildRawMessage } from './gmail-api.js';

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

  it('includes Reply-To header', () => {
    const raw = buildRawMessage({
      to: 'test@example.com',
      subject: 'Test',
      body: 'Hello',
    });
    const decoded = decodeRaw(raw);
    expect(decoded).toContain('Reply-To: info@tandemcoach.co');
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
    // (the GMAIL_BCC mock value is the only legitimate Bcc header, on its own line)
    expect(decoded).toMatch(/^Bcc: info@tandemcoach\.co$/m);
    expect(decoded).not.toMatch(/^Bcc: evil@attacker\.com$/m);
    // The To field has the injection text concatenated (harmless — no newline)
    expect(decoded).toContain('To: test@example.comBcc: evil@attacker.com');
  });

  it('includes default Bcc when body has no tracking pixel', () => {
    const raw = buildRawMessage({
      to: 'lead@example.com',
      subject: 'Hello',
      body: '<p>Plain HTML</p>',
      html: true,
    });
    const decoded = decodeRaw(raw);
    expect(decoded).toMatch(/^Bcc: info@tandemcoach\.co$/m);
  });

  it('drops the tandemcoach.co Bcc when body contains a tracking pixel', () => {
    const raw = buildRawMessage({
      to: 'lead@example.com',
      subject: 'Hello',
      body: '<p>Hi</p><img src="https://t.tandemcoach.co/t/abc-123" width="1" height="1">',
      html: true,
    });
    const decoded = decodeRaw(raw);
    expect(decoded).not.toMatch(/^Bcc:/m);
  });

  it('strips tandemcoach.co addresses from Cc when body contains a tracking pixel', () => {
    const raw = buildRawMessage({
      to: 'lead@example.com',
      subject: 'Hello',
      body: '<p>Hi</p><img src="https://t.tandemcoach.co/t/abc-123" width="1" height="1">',
      cc: 'partner@external.com, info@tandemcoach.co, alex@tandemcoach.co',
      html: true,
    });
    const decoded = decodeRaw(raw);
    expect(decoded).toMatch(/^Cc: partner@external\.com$/m);
    // Inspect only the Cc header line, not the body (which legitimately
    // contains a t.tandemcoach.co tracking URL).
    const ccLine = decoded.split('\r\n').find((l) => l.startsWith('Cc:')) || '';
    expect(ccLine).not.toMatch(/info@tandemcoach\.co/i);
    expect(ccLine).not.toMatch(/alex@tandemcoach\.co/i);
    expect(decoded).not.toMatch(/^Bcc:/m);
  });

  it('keeps tandemcoach.co Cc when body has no tracking pixel', () => {
    const raw = buildRawMessage({
      to: 'lead@example.com',
      subject: 'Hello',
      body: 'Plain text',
      cc: 'info@tandemcoach.co',
    });
    const decoded = decodeRaw(raw);
    expect(decoded).toMatch(/^Cc: info@tandemcoach\.co$/m);
  });
});
