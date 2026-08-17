import fs from 'fs';
import path from 'path';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  _attemptGmailDispositionMutationForTest,
  _initTestDatabase,
  getGmailInboundCandidateAccounting,
  getGmailInboundDispositionReceipt,
  getStoredInboundMessageEvidence,
  recordGmailInboundDisposition,
  storeChatMetadata,
  storeMessageDirect,
} from './db.js';
import {
  GmailInboundDispositionError,
  gmailInboundReceiptToCandidateAccounting,
  hashGmailInboundSourceEvidence,
  normalizeGmailInboundDispositionInput,
} from './gmail-inbound-disposition.js';

const observedAt = '2026-08-17T22:00:00.000Z';

function accepted(messageId = 'msg-1') {
  return {
    messageId,
    disposition: 'accepted' as const,
    reasonKey: 'inbound_message_persisted' as const,
    sourceEvidenceSha256: hashGmailInboundSourceEvidence(
      'inbound_message_persisted',
      [messageId, 'thread-1', 'sqlite_messages'],
    ),
    observedAt,
  };
}

describe('Gmail inbound disposition receipts', () => {
  beforeEach(() => {
    _initTestDatabase();
  });

  it('appends once and converges exact semantic replay across retry time', () => {
    const first = recordGmailInboundDisposition(accepted());
    const replay = recordGmailInboundDisposition({
      ...accepted(),
      observedAt: '2026-08-17T22:05:00.000Z',
    });

    expect(first.applied).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(replay.applied).toBe(false);
    expect(replay.duplicate).toBe(true);
    expect(replay.receipt).toEqual(first.receipt);
    expect(replay.receipt.observedAt).toBe(observedAt);
    expect(replay.receipt.sourceKey).toBe('gmail:inbound-v1');
  });

  it('refuses changed disposition evidence under the same Gmail ID', () => {
    recordGmailInboundDisposition(accepted());

    let error: unknown;
    try {
      recordGmailInboundDisposition({
        messageId: 'msg-1',
        disposition: 'rejected',
        reasonKey: 'hard_filter',
        sourceEvidenceSha256: hashGmailInboundSourceEvidence('hard_filter', [
          'msg-1',
          'filter-1',
        ]),
        observedAt,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(GmailInboundDispositionError);
    expect((error as GmailInboundDispositionError).code).toBe('conflict');
  });

  it('enforces disposition-specific closed reason keys', () => {
    let error: unknown;
    try {
      normalizeGmailInboundDispositionInput({
        ...accepted(),
        disposition: 'rejected',
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(GmailInboundDispositionError);
    expect((error as GmailInboundDispositionError).code).toBe('invalid_input');
  });

  it('returns accepted/rejected evidence and keeps absence unknown', () => {
    const stored = recordGmailInboundDisposition(accepted()).receipt;

    expect(getGmailInboundCandidateAccounting('msg-1')).toEqual({
      disposition: 'accepted',
      reasonKey: 'inbound_message_persisted',
      evidenceSha256: stored.receiptFingerprint,
    });
    expect(getGmailInboundCandidateAccounting('missing-1')).toEqual(
      expect.objectContaining({
        disposition: 'unknown',
        reasonKey: 'receipt_missing',
        evidenceSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      }),
    );
    expect(
      gmailInboundReceiptToCandidateAccounting(
        'msg-1',
        getGmailInboundDispositionReceipt('msg-1'),
      ),
    ).toEqual(getGmailInboundCandidateAccounting('msg-1'));
  });

  it('bridges only an exact durable legacy Gmail message row', () => {
    const jid = 'gmail:test@example.com';
    storeChatMetadata(jid, observedAt, 'mailman', 'gmail', true);
    storeMessageDirect({
      id: 'legacy-1',
      chat_jid: jid,
      sender: 'sender@example.com',
      sender_name: 'Sender',
      content: 'content remains in the existing message authority only',
      timestamp: observedAt,
      is_from_me: false,
    });

    expect(getStoredInboundMessageEvidence('legacy-1', jid)).toBe(
      'ordinary_persisted',
    );
    expect(
      getStoredInboundMessageEvidence('legacy-1', 'gmail:other@example.com'),
    ).toBeUndefined();
    storeMessageDirect({
      id: 'legacy-outbound-1',
      chat_jid: jid,
      sender: 'test@example.com',
      sender_name: 'Test',
      content: 'existing outbound content is not acceptance evidence',
      timestamp: observedAt,
      is_from_me: true,
    });
    expect(
      getStoredInboundMessageEvidence('legacy-outbound-1', jid),
    ).toBeUndefined();
    storeMessageDirect({
      id: 'legacy-route-staged-1',
      chat_jid: jid,
      sender: 'sender@example.com',
      sender_name: 'Sender',
      content: 'no-wake recovery copy staged before direct routing',
      timestamp: observedAt,
      is_from_me: false,
      is_bot_message: true,
      from_group: 'mailman',
    });
    expect(getStoredInboundMessageEvidence('legacy-route-staged-1', jid)).toBe(
      'direct_route_staged',
    );
    expect(getGmailInboundDispositionReceipt('legacy-1')).toBeUndefined();
  });

  it('makes receipt rows executable append-only evidence', () => {
    recordGmailInboundDisposition(accepted());

    expect(() =>
      _attemptGmailDispositionMutationForTest('update', 'msg-1'),
    ).toThrow(/append-only/);
    expect(() =>
      _attemptGmailDispositionMutationForTest('delete', 'msg-1'),
    ).toThrow(/append-only/);
    expect(getGmailInboundDispositionReceipt('msg-1')).toBeDefined();
  });

  it('keeps the tracked schema content-free and reason-bounded', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/db.ts'),
      'utf8',
    );
    const table = source.slice(
      source.indexOf(
        'CREATE TABLE IF NOT EXISTS gmail_inbound_disposition_receipts',
      ),
      source.indexOf(
        'CREATE TRIGGER IF NOT EXISTS gmail_inbound_disposition_receipts_no_update',
      ),
    );
    expect(table).toContain('source_evidence_sha256');
    expect(table).toContain('receipt_fingerprint');
    expect(table).not.toMatch(
      /sender|recipient|address|subject|body|header|snippet|payload|prompt|task|approval|action|metadata/i,
    );
  });
});
