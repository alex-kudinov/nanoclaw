import type { gmail_v1 } from 'googleapis';
import { describe, expect, it, vi } from 'vitest';

import {
  advanceCompanyGmailMailboxAudit,
  beginCompanyGmailMailboxAudit,
  createCompanyGmailMailboxAuditReadOnlyPort,
  deriveCompanyGmailMailboxAuditCursorEvidence,
  deriveCompanyGmailMailboxAuditIdentity,
  type CompanyGmailMailboxAuditBeginInput,
  type CompanyGmailMailboxAuditCompleteInput,
  type CompanyGmailMailboxAuditInvalidateInput,
  type CompanyGmailMailboxAuditPageInput,
  type CompanyGmailMailboxAuditPort,
  type CompanyGmailMailboxAuditSnapshot,
  type CompanyGmailMailboxAuditStore,
  type CompanyGmailMailboxAuditStoreResult,
} from './company-gmail-mailbox-audit.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const STARTED_AT = '2026-08-18T15:00:00.000Z';

class MemoryStore implements CompanyGmailMailboxAuditStore {
  snapshot: CompanyGmailMailboxAuditSnapshot | null = null;

  async begin(
    input: CompanyGmailMailboxAuditBeginInput,
  ): Promise<CompanyGmailMailboxAuditStoreResult> {
    const identity = deriveCompanyGmailMailboxAuditIdentity({
      definitionId: HASH_A,
      sourceFingerprint: HASH_B,
      expectedWatermarkVersion: 1,
      cursorEvidenceSha256: HASH_C,
      startedAt: input.startedAt,
      initialHistoryId: input.initialHistoryId,
    });
    this.snapshot = Object.freeze({
      ...identity,
      definitionId: HASH_A,
      sourceFingerprint: HASH_B,
      expectedWatermarkVersion: 1,
      cursorEvidenceSha256: HASH_C,
      startedAt: input.startedAt,
      initialHistoryId: input.initialHistoryId,
      status: 'pending',
      version: 0,
      resumeToken: null,
      resumeTokenSha256: null,
      pagesRead: 0,
      candidateCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      unknownCount: 0,
      completedAt: null,
      finalHistoryId: null,
      auditEvidenceSha256: null,
      invalidReason: null,
    });
    return { snapshot: this.snapshot, applied: true, duplicate: false };
  }

  async get(): Promise<CompanyGmailMailboxAuditSnapshot> {
    if (!this.snapshot) throw new Error('missing');
    return this.snapshot;
  }

  async recordPage(
    input: CompanyGmailMailboxAuditPageInput,
  ): Promise<CompanyGmailMailboxAuditStoreResult> {
    const snapshot = await this.get();
    const accepted = input.candidates.filter(
      (candidate) => candidate.disposition === 'accepted',
    ).length;
    const rejected = input.candidates.filter(
      (candidate) => candidate.disposition === 'rejected',
    ).length;
    const unknown = input.candidates.length - accepted - rejected;
    this.snapshot = Object.freeze({
      ...snapshot,
      status: input.page.nextPageToken === null ? 'listed' : 'pending',
      version: snapshot.version + 1,
      resumeToken: input.page.nextPageToken,
      resumeTokenSha256: input.page.nextPageToken === null ? null : HASH_A,
      pagesRead: snapshot.pagesRead + 1,
      candidateCount: snapshot.candidateCount + input.candidates.length,
      acceptedCount: snapshot.acceptedCount + accepted,
      rejectedCount: snapshot.rejectedCount + rejected,
      unknownCount: snapshot.unknownCount + unknown,
    });
    return { snapshot: this.snapshot, applied: true, duplicate: false };
  }

  async complete(
    input: CompanyGmailMailboxAuditCompleteInput,
  ): Promise<CompanyGmailMailboxAuditStoreResult> {
    const snapshot = await this.get();
    this.snapshot = Object.freeze({
      ...snapshot,
      status: 'complete',
      version: snapshot.version + 1,
      completedAt: input.completedAt,
      finalHistoryId: input.finalHistoryId,
      auditEvidenceSha256: input.auditEvidenceSha256,
    });
    return { snapshot: this.snapshot, applied: true, duplicate: false };
  }

  async invalidate(
    input: CompanyGmailMailboxAuditInvalidateInput,
  ): Promise<CompanyGmailMailboxAuditStoreResult> {
    const snapshot = await this.get();
    this.snapshot = Object.freeze({
      ...snapshot,
      status: 'invalidated',
      version: snapshot.version + 1,
      resumeToken: null,
      resumeTokenSha256: null,
      invalidReason: input.invalidReason,
    });
    return { snapshot: this.snapshot, applied: true, duplicate: false };
  }
}

function port(input: {
  heads: string[];
  pages: Array<{ messageIds: string[]; nextPageToken: string | null }>;
  times?: string[];
}): CompanyGmailMailboxAuditPort {
  let head = 0;
  let page = 0;
  let time = 0;
  const times = input.times ?? [
    STARTED_AT,
    '2026-08-18T15:00:01.000Z',
    '2026-08-18T15:00:02.000Z',
  ];
  return {
    now: () => times[Math.min(time++, times.length - 1)],
    getProfile: async () => ({
      historyId: input.heads[Math.min(head++, input.heads.length - 1)],
    }),
    listMessages: async () =>
      input.pages[Math.min(page++, input.pages.length - 1)],
    accountCandidate: async (messageId) =>
      messageId === 'accepted-1'
        ? {
            disposition: 'accepted',
            reasonKey: 'inbound_message_persisted',
            evidenceSha256: HASH_A,
          }
        : {
            disposition: 'unknown',
            reasonKey: 'receipt_missing',
            evidenceSha256: HASH_B,
          },
  };
}

describe('Company Gmail mailbox audit', () => {
  it('binds the cursor without exposing its raw value in the evidence hash', () => {
    const first = deriveCompanyGmailMailboxAuditCursorEvidence({
      definitionId: HASH_A,
      sourceFingerprint: HASH_B,
      watermarkVersion: 1,
      cursorValue: '123456',
    });
    const second = deriveCompanyGmailMailboxAuditCursorEvidence({
      definitionId: HASH_A,
      sourceFingerprint: HASH_B,
      watermarkVersion: 1,
      cursorValue: '123457',
    });
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain('123456');
    expect(second).not.toBe(first);
  });

  it('uses only profile and unfiltered ID listing Gmail calls', async () => {
    const getProfile = vi
      .fn()
      .mockResolvedValue({ data: { historyId: '700' } });
    const list = vi.fn().mockResolvedValue({
      data: { messages: [{ id: 'id-1' }], nextPageToken: 'next-1' },
    });
    const gmail = {
      users: { getProfile, messages: { list } },
    } as unknown as gmail_v1.Gmail;
    const readOnly = createCompanyGmailMailboxAuditReadOnlyPort(gmail, {
      now: () => STARTED_AT,
      accountCandidate: async () => ({
        disposition: 'unknown',
        reasonKey: 'receipt_missing',
        evidenceSha256: HASH_A,
      }),
    });
    await expect(readOnly.getProfile()).resolves.toEqual({ historyId: '700' });
    await expect(
      readOnly.listMessages({
        pageToken: null,
        maxResults: 500,
        includeSpamTrash: true,
      }),
    ).resolves.toEqual({ messageIds: ['id-1'], nextPageToken: 'next-1' });
    expect(getProfile).toHaveBeenCalledWith({ userId: 'me' });
    expect(list).toHaveBeenCalledWith({
      userId: 'me',
      maxResults: 500,
      includeSpamTrash: true,
    });
    expect(list.mock.calls[0][0]).not.toHaveProperty('q');
    expect(list.mock.calls[0][0]).not.toHaveProperty('labelIds');
  });

  it('completes a stable one-page audit with honest unknown accounting', async () => {
    const store = new MemoryStore();
    const auditPort = port({
      heads: ['700', '700'],
      pages: [
        {
          messageIds: ['accepted-1', 'unknown-1'],
          nextPageToken: null,
        },
      ],
    });
    const begun = await beginCompanyGmailMailboxAudit(auditPort, store);
    const result = await advanceCompanyGmailMailboxAudit(
      begun.auditId,
      1,
      auditPort,
      store,
    );
    expect(result).toMatchObject({
      status: 'complete',
      pagesRead: 1,
      candidateCount: 2,
      acceptedCount: 1,
      rejectedCount: 0,
      unknownCount: 1,
      safety: {
        gmailReadScope: 'profile_and_unfiltered_id_listing_only',
        gmailContentRead: false,
        cursorWritten: false,
        messagesRecovered: 0,
        actionAuthority: 'none',
      },
    });
    expect(result.auditEvidenceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('pauses safely at the explicit page budget', async () => {
    const store = new MemoryStore();
    const auditPort = port({
      heads: ['700'],
      pages: [{ messageIds: ['unknown-1'], nextPageToken: 'next-1' }],
    });
    const begun = await beginCompanyGmailMailboxAudit(auditPort, store);
    const result = await advanceCompanyGmailMailboxAudit(
      begun.auditId,
      1,
      auditPort,
      store,
    );
    expect(result).toMatchObject({
      status: 'pending',
      pagesRead: 1,
      candidateCount: 1,
      unknownCount: 1,
      auditEvidenceSha256: null,
    });
  });

  it('invalidates rather than completing across a moving mailbox head', async () => {
    const store = new MemoryStore();
    const auditPort = port({
      heads: ['700', '701'],
      pages: [{ messageIds: [], nextPageToken: null }],
    });
    const begun = await beginCompanyGmailMailboxAudit(auditPort, store);
    await expect(
      advanceCompanyGmailMailboxAudit(begun.auditId, 1, auditPort, store),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(store.get()).resolves.toMatchObject({
      status: 'invalidated',
      invalidReason: 'head_changed',
    });
  });

  it('invalidates a repeated ID within one Gmail page', async () => {
    const store = new MemoryStore();
    const auditPort = port({
      heads: ['700'],
      pages: [
        {
          messageIds: ['unknown-1', 'unknown-1'],
          nextPageToken: null,
        },
      ],
    });
    const begun = await beginCompanyGmailMailboxAudit(auditPort, store);
    await expect(
      advanceCompanyGmailMailboxAudit(begun.auditId, 1, auditPort, store),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(store.get()).resolves.toMatchObject({
      status: 'invalidated',
      invalidReason: 'duplicate_candidate',
    });
  });
});
