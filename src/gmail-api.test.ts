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

import { buildRawMessage, encodeHeaderValue } from './gmail-api.js';

function decodeEncodedWord(headerValue: string): string {
  const parts = headerValue.split(/\r\n /);
  return parts
    .map((part) => {
      const m = part.match(/^=\?UTF-8\?B\?(.*)\?=$/);
      if (!m) return part;
      return Buffer.from(m[1], 'base64').toString('utf-8');
    })
    .join('');
}

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

  it('passes ASCII subjects through unchanged', () => {
    const raw = buildRawMessage({
      to: 'a@example.com',
      subject: 'PCC Certification Path - Tandem Coaching',
      body: 'Hi',
    });
    const decoded = decodeRaw(raw);
    expect(decoded).toMatch(
      /^Subject: PCC Certification Path - Tandem Coaching$/m,
    );
  });

  it('RFC 2047-encodes subjects containing non-ASCII (em dash)', () => {
    const subject = 'How to choose — Tandem';
    const raw = buildRawMessage({
      to: 'a@example.com',
      subject,
      body: 'Hi',
    });
    const decoded = decodeRaw(raw);
    const subjLine =
      decoded.split('\r\n').find((l) => l.startsWith('Subject:')) || '';
    expect(subjLine).toMatch(/^Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
    expect(decodeEncodedWord(subjLine.slice('Subject: '.length))).toBe(subject);
    // Raw bytes for em dash (E2 80 94) must NOT appear in the on-the-wire
    // header — that's exactly what triggers Latin-1 mojibake on receive.
    const subjBytes = Buffer.from(subjLine, 'utf-8');
    expect(subjBytes.includes(Buffer.from([0xe2, 0x80, 0x94]))).toBe(false);
  });

  it('encodes smart quotes, en dashes, and accented characters', () => {
    for (const subject of [
      'Welcome – let’s get started',
      'Café Olé',
      '“Quoted” phrase',
    ]) {
      const raw = buildRawMessage({
        to: 'a@example.com',
        subject,
        body: 'Hi',
      });
      const decoded = decodeRaw(raw);
      const subjLine =
        decoded.split('\r\n').find((l) => l.startsWith('Subject:')) || '';
      expect(subjLine).toMatch(/=\?UTF-8\?B\?/);
      expect(decodeEncodedWord(subjLine.slice('Subject: '.length))).toBe(
        subject,
      );
    }
  });

  it('splits long non-ASCII subjects into multiple encoded-words on codepoint boundaries', () => {
    // Build a subject long enough to need ≥2 encoded-words (>45 UTF-8 bytes).
    // Each ñ is 2 bytes — 30 of them = 60 bytes, forcing a split.
    const subject = 'ñ'.repeat(30);
    const value = encodeHeaderValue(subject);
    const words = value.split(/\r\n /);
    expect(words.length).toBeGreaterThanOrEqual(2);
    for (const w of words) {
      expect(w).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=$/);
    }
    expect(decodeEncodedWord(value)).toBe(subject);
  });

  it('strips CRLF from non-ASCII subjects before encoding (header-injection guard)', () => {
    const subject = 'Hi —\r\nBcc: evil@attacker.com';
    const raw = buildRawMessage({
      to: 'a@example.com',
      subject,
      body: 'Hi',
    });
    const decoded = decodeRaw(raw);
    expect(decoded).not.toMatch(/^Bcc: evil@attacker\.com$/m);
    const subjLine =
      decoded.split('\r\n').find((l) => l.startsWith('Subject:')) || '';
    expect(decodeEncodedWord(subjLine.slice('Subject: '.length))).toBe(
      'Hi —Bcc: evil@attacker.com',
    );
  });
});
