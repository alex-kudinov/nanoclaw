import { describe, it, expect, vi } from 'vitest';

vi.mock('./config.js', () => ({
  GMAIL_MONITORED_EMAIL: 'info@tandemcoach.co',
  GMAIL_SEND_AS: 'Tandem Coaching <info@tandemcoach.co>',
  GMAIL_REPLY_TO: 'info@tandemcoach.co',
  GMAIL_BCC: 'info@tandemcoach.co',
  GMAIL_LABEL: '',
  TRACKING_DOMAIN: 't.tandemcoach.co',
}));

vi.mock('./gmail-auth.js', () => ({
  getGmailClient: vi.fn(),
}));

vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import {
  buildRawMessage,
  encodeHeaderValue,
  extractThreadQuery,
  findThreadForReply,
  foldHeaderValue,
  getThread,
  replyToThread,
  searchEmails,
  threadHeaders,
} from './gmail-api.js';
import type { gmail_v1 } from 'googleapis';

/** Minimal Gmail message with a Message-ID header (or none when msgId is null). */
function msgWithId(msgId: string | null): gmail_v1.Schema$Message {
  return {
    payload: {
      headers: msgId === null ? [] : [{ name: 'Message-ID', value: msgId }],
    },
  } as gmail_v1.Schema$Message;
}
import { getGmailClient } from './gmail-auth.js';

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

describe('threadHeaders (Layer 2 — reliable RFC threading)', () => {
  it('uses the last message as In-Reply-To and the full chain as References', () => {
    const h = threadHeaders(
      [msgWithId('<a@x>'), msgWithId('<b@x>'), msgWithId('<c@x>')],
      'thr-1',
    );
    expect(h.inReplyTo).toBe('<c@x>');
    expect(h.references).toBe('<a@x> <b@x> <c@x>');
  });

  it('walks back past an empty last Message-ID (the FM6 silent-detach)', () => {
    // Last message has no Message-ID — must NOT drop threading; use the newest
    // message that has one.
    const h = threadHeaders([msgWithId('<a@x>'), msgWithId(null)], 'thr-1');
    expect(h.inReplyTo).toBe('<a@x>');
    expect(h.references).toBe('<a@x>');
  });

  it('returns no headers only when the thread exposes zero Message-IDs', () => {
    const h = threadHeaders([msgWithId(null), msgWithId(null)], 'thr-1');
    expect(h.inReplyTo).toBeUndefined();
    expect(h.references).toBeUndefined();
  });
});

describe('foldHeaderValue', () => {
  it('leaves a short value unfolded', () => {
    expect(foldHeaderValue('References', '<a@x>')).toBe('References: <a@x>');
  });

  it('folds a long chain so no physical line exceeds the RFC limit', () => {
    const ids = Array.from(
      { length: 40 },
      (_, i) => `<msg-${i}-aaaaaaaaaaaaaaaaaaaa@example.com>`,
    );
    const folded = foldHeaderValue('References', ids.join(' '));
    const lines = folded.split('\r\n');
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(998);
    // Continuation lines begin with folding whitespace.
    for (const l of lines.slice(1)) expect(l.startsWith(' ')).toBe(true);
    // Every id is preserved, none split.
    for (const id of ids) expect(folded).toContain(id);
  });
});

describe('buildRawMessage', () => {
  it('emits In-Reply-To and a folded References when threading', () => {
    const raw = buildRawMessage({
      to: 't@example.com',
      subject: 'Re: Hi',
      body: 'Hello',
      inReplyTo: '<c@x>',
      references: '<a@x> <b@x> <c@x>',
    });
    const decoded = decodeRaw(raw);
    expect(decoded).toContain('In-Reply-To: <c@x>');
    expect(decoded).toContain('References: <a@x> <b@x> <c@x>');
  });

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
    expect(decoded).not.toMatch(/^Bcc:/m);
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

describe('findThreadForReply', () => {
  function mockThreadsList(threads: Array<{ id: string }> | undefined) {
    const list = vi.fn().mockResolvedValue({ data: { threads } });
    vi.mocked(getGmailClient).mockReturnValue({
      users: { threads: { list } },
    } as never);
    return list;
  }

  it('queries scoped to recipient + base subject and returns the newest thread', async () => {
    const list = mockThreadsList([{ id: 'thread-19dd' }]);
    const result = await findThreadForReply({
      to: 'Carol Del Priore <pink.coaching.usa@gmail.com>',
      subject: 'Re: Mentor Coach Evaluation Training - Tandem Coaching',
    });

    expect(result).toBe('thread-19dd');
    const q = list.mock.calls[0][0].q as string;
    expect(q).toContain(
      'subject:"Mentor Coach Evaluation Training - Tandem Coaching"',
    );
    expect(q).toContain('to:pink.coaching.usa@gmail.com');
    expect(q).toContain('from:pink.coaching.usa@gmail.com');
  });

  it('returns null when no thread matches', async () => {
    mockThreadsList([]);
    const result = await findThreadForReply({
      to: 'nobody@example.com',
      subject: 'Re: Nothing here',
    });
    expect(result).toBeNull();
  });

  it('returns null when the base subject is empty after stripping Re:', async () => {
    const list = mockThreadsList([{ id: 'should-not-be-used' }]);
    const result = await findThreadForReply({
      to: 'a@example.com',
      subject: 'Re: ',
    });
    expect(result).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it('returns null and does not throw when the Gmail API errors', async () => {
    const list = vi.fn().mockRejectedValue(new Error('quota exceeded'));
    vi.mocked(getGmailClient).mockReturnValue({
      users: { threads: { list } },
    } as never);
    const result = await findThreadForReply({
      to: 'a@example.com',
      subject: 'Re: Boom',
    });
    expect(result).toBeNull();
  });
});

describe('replyToThread external-party addressing', () => {
  type Hdr = { name: string; value: string };
  const msg = (headers: Hdr[]) => ({ payload: { headers } });

  function mockGmail(messages: ReturnType<typeof msg>[]) {
    const send = vi.fn().mockResolvedValue({ data: { id: 'sent-1' } });
    vi.mocked(getGmailClient).mockReturnValue({
      users: {
        threads: { get: vi.fn().mockResolvedValue({ data: { messages } }) },
        messages: { send },
      },
    } as never);
    return send;
  }

  const toLine = (send: ReturnType<typeof vi.fn>): string => {
    const raw = send.mock.calls[0][0].requestBody.raw as string;
    return (
      decodeRaw(raw)
        .split('\r\n')
        .find((l) => l.startsWith('To:')) || ''
    );
  };

  const ccLine = (send: ReturnType<typeof vi.fn>): string | undefined => {
    const raw = send.mock.calls[0][0].requestBody.raw as string;
    return decodeRaw(raw)
      .split('\r\n')
      .find((line) => line.startsWith('Cc:'));
  };

  it('addresses the reply to the customer, not our own last outbound', async () => {
    // Thread whose NEWEST message is our own send to Liz — the old code
    // boomeranged the reply back to info@tandemcoach.co.
    const send = mockGmail([
      msg([
        { name: 'From', value: 'Liz Dobbins <liz@propelogy.com>' },
        { name: 'To', value: 'info@tandemcoach.co' },
        { name: 'Subject', value: 'Re: Log in to Tandem Coaching Community' },
        { name: 'Message-ID', value: '<m2>' },
      ]),
      msg([
        { name: 'From', value: 'Tandem Coaching <info@tandemcoach.co>' },
        { name: 'To', value: 'liz@propelogy.com' },
        { name: 'Subject', value: 'Re: Log in to Tandem Coaching Community' },
        { name: 'Message-ID', value: '<m3>' },
      ]),
    ]);
    await replyToThread({ threadId: 't1', body: 'Hi Liz' });
    const to = toLine(send);
    expect(to).toContain('liz@propelogy.com');
    expect(to).not.toMatch(/info@tandemcoach\.co/i);
  });

  it('falls back to the last external recipient when the whole thread is ours', async () => {
    const send = mockGmail([
      msg([
        { name: 'From', value: 'Tandem Coaching <info@tandemcoach.co>' },
        { name: 'To', value: 'liz@propelogy.com' },
        { name: 'Subject', value: 'Welcome' },
        { name: 'Message-ID', value: '<a>' },
      ]),
      msg([
        { name: 'From', value: 'Tandem Coaching <info@tandemcoach.co>' },
        { name: 'To', value: 'liz@propelogy.com' },
        { name: 'Subject', value: 'Re: Welcome' },
        { name: 'Message-ID', value: '<b>' },
      ]),
    ]);
    await replyToThread({ threadId: 't2', body: 'Following up' });
    expect(toLine(send)).toContain('liz@propelogy.com');
  });

  it('honors Reply-To over a relay From (Encharge no-reply)', async () => {
    // Encharge relays the customer's message but stamps its own bounce address
    // in From; the real human is in Reply-To. Replying to From dead-letters.
    const send = mockGmail([
      msg([
        { name: 'From', value: 'Mavrita Franklin <no-reply@encharge.com>' },
        { name: 'Reply-To', value: 'Mavrita Franklin <mavrita@example.com>' },
        { name: 'To', value: 'info@tandemcoach.co' },
        { name: 'Subject', value: 'Interested in coaching' },
        { name: 'Message-ID', value: '<enc-1>' },
      ]),
    ]);
    await replyToThread({ threadId: 't4', body: 'Hi Mavrita' });
    const to = toLine(send);
    expect(to).toContain('mavrita@example.com');
    expect(to).not.toMatch(/no-reply@encharge\.com/i);
  });

  it('skips a mailer-daemon bounce and honors the relay Reply-To beneath it', async () => {
    // Marvita's real thread, 2026-06-16: relay inbound, our bounced reply,
    // then a mailer-daemon failure notice on top. Must resolve to her real
    // address, not the relay and not mailer-daemon.
    const send = mockGmail([
      msg([
        { name: 'From', value: 'Marvita Franklin <no-reply@encharge.io>' },
        { name: 'Reply-To', value: 'marvitafranklin@mac.com' },
        { name: 'To', value: 'info@tandemcoach.co' },
        { name: 'Subject', value: 'Re: ICF Mentor Coaching [Circling Back]' },
        { name: 'Message-ID', value: '<mf-1>' },
      ]),
      msg([
        { name: 'From', value: 'Tandem Coaching <info@tandemcoach.co>' },
        { name: 'To', value: 'Marvita Franklin <no-reply@encharge.io>' },
        { name: 'Subject', value: 'Re: ICF Mentor Coaching [Circling Back]' },
        { name: 'Message-ID', value: '<mf-2>' },
      ]),
      msg([
        {
          name: 'From',
          value: 'Mail Delivery Subsystem <mailer-daemon@googlemail.com>',
        },
        { name: 'To', value: 'info@tandemcoaching.academy' },
        { name: 'Subject', value: 'Delivery Status Notification (Failure)' },
        { name: 'Message-ID', value: '<mf-3>' },
      ]),
    ]);
    await replyToThread({ threadId: 't5', body: 'Hi Marvita' });
    const to = toLine(send);
    expect(to).toContain('marvitafranklin@mac.com');
    expect(to).not.toMatch(/encharge|mailer-daemon/i);
  });

  it('replies to the original sender on a normal inbound-last thread', async () => {
    const send = mockGmail([
      msg([
        { name: 'From', value: 'Carl Customer <carl@acme.com>' },
        { name: 'To', value: 'info@tandemcoach.co' },
        { name: 'Subject', value: 'Question about ACC' },
        { name: 'Message-ID', value: '<x>' },
      ]),
    ]);
    await replyToThread({ threadId: 't3', body: 'Answer' });
    expect(toLine(send)).toContain('carl@acme.com');
  });

  it('validates the Gmail-derived recipient before sending', async () => {
    const send = mockGmail([
      msg([
        { name: 'From', value: 'Carl Customer <carl@acme.com>' },
        { name: 'To', value: 'info@tandemcoach.co' },
        { name: 'Subject', value: 'Question about ACC' },
        { name: 'Message-ID', value: '<x>' },
      ]),
    ]);
    const prepareSend = vi.fn(async () => ({ body: 'Validated answer' }));

    await replyToThread({
      threadId: 't3',
      body: 'Unvalidated answer',
      prepareSend,
    });

    expect(prepareSend).toHaveBeenCalledWith({
      to: 'Carl Customer <carl@acme.com>',
      cc: undefined,
    });
    expect(decodeRaw(send.mock.calls[0][0].requestBody.raw)).toContain(
      'Validated answer',
    );
  });

  it('test-routes replies and strips CC after validating the intended envelope', async () => {
    const send = mockGmail([
      msg([
        { name: 'From', value: 'Carl Customer <carl@acme.com>' },
        { name: 'To', value: 'info@tandemcoach.co' },
        { name: 'Subject', value: 'Question about ACC' },
        { name: 'Message-ID', value: '<x>' },
      ]),
    ]);
    const prepareSend = vi.fn(async () => ({ body: 'Answer' }));

    const result = await replyToThread({
      threadId: 't3',
      body: 'Answer',
      cc: 'colleague@external.com',
      recipientOverride: 'test@tandemcoach.co',
      prepareSend,
    });

    expect(prepareSend).toHaveBeenCalledWith({
      to: 'Carl Customer <carl@acme.com>',
      cc: 'colleague@external.com',
    });
    expect(toLine(send)).toContain('test@tandemcoach.co');
    expect(ccLine(send)).toBeUndefined();
    expect(result.originalTo).toBe('Carl Customer <carl@acme.com>');
    expect(result.to).toBe('test@tandemcoach.co');
  });
});

describe('extractThreadQuery', () => {
  it('pulls the id from a bare thread: query', () => {
    expect(extractThreadQuery('thread:19e0daefe7cea171')).toBe(
      '19e0daefe7cea171',
    );
  });

  it('pulls the id when thread: is combined with other operators', () => {
    expect(
      extractThreadQuery('subject:"Just a heads up" thread:19e9de839df5c5a5'),
    ).toBe('19e9de839df5c5a5');
  });

  it('handles a quoted id', () => {
    expect(extractThreadQuery('thread:"19abc"')).toBe('19abc');
  });

  it('returns null for an ordinary search with no thread token', () => {
    expect(extractThreadQuery('from:carl@acme.com OR to:carl@acme.com')).toBe(
      null,
    );
  });
});

describe('getThread', () => {
  function mockThreadGet(
    messages:
      | Array<{
          payload: { headers: Array<{ name: string; value: string }> };
          id?: string;
          threadId?: string;
        }>
      | undefined,
    reject = false,
  ) {
    const get = reject
      ? vi.fn().mockRejectedValue(new Error('not found'))
      : vi.fn().mockResolvedValue({ data: { messages } });
    vi.mocked(getGmailClient).mockReturnValue({
      users: { threads: { get } },
    } as never);
    return get;
  }

  it('formats every message in the thread', async () => {
    mockThreadGet([
      {
        id: 'm1',
        threadId: 't1',
        payload: {
          headers: [
            { name: 'From', value: 'Carl <carl@acme.com>' },
            { name: 'Subject', value: 'Question about ACC' },
            { name: 'Date', value: 'Mon, 1 Jun 2026' },
          ],
        },
      },
      {
        id: 'm2',
        threadId: 't1',
        payload: {
          headers: [
            { name: 'From', value: 'Tandem <info@tandemcoach.co>' },
            { name: 'Subject', value: 'Re: Question about ACC' },
            { name: 'Date', value: 'Tue, 2 Jun 2026' },
          ],
        },
      },
    ]);
    const out = await getThread('t1');
    expect(out).toContain('Thread t1 — 2 message(s)');
    expect(out).toContain('carl@acme.com');
    expect(out).toContain('info@tandemcoach.co');
    expect(out).toContain('Message-ID: m2');
  });

  it('returns a not-found string for an empty thread', async () => {
    mockThreadGet([]);
    expect(await getThread('missing')).toBe('No thread found for ID missing.');
  });

  it('returns a not-found string (never throws) when the API errors', async () => {
    mockThreadGet(undefined, true);
    expect(await getThread('boom')).toBe('No thread found for ID boom.');
  });
});

describe('searchEmails thread: routing', () => {
  it('routes a thread: query to threads.get, not messages.list', async () => {
    const threadsGet = vi.fn().mockResolvedValue({ data: { messages: [] } });
    const messagesList = vi.fn();
    vi.mocked(getGmailClient).mockReturnValue({
      users: {
        threads: { get: threadsGet },
        messages: { list: messagesList },
      },
    } as never);

    await searchEmails({ query: 'thread:19e0daefe7cea171' });

    expect(threadsGet).toHaveBeenCalledWith(
      expect.objectContaining({ id: '19e0daefe7cea171' }),
    );
    expect(messagesList).not.toHaveBeenCalled();
  });

  it('routes an ordinary query through messages.list', async () => {
    const messagesList = vi.fn().mockResolvedValue({ data: { messages: [] } });
    vi.mocked(getGmailClient).mockReturnValue({
      users: { messages: { list: messagesList } },
    } as never);

    await searchEmails({ query: 'from:carl@acme.com' });

    expect(messagesList).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'from:carl@acme.com' }),
    );
  });
});
