import type { gmail_v1 } from 'googleapis';
import { describe, expect, it, vi } from 'vitest';

import {
  CompanyGmailReconciliationError,
  createCompanyGmailInboundSource,
  type CompanyGmailCandidateReceipt,
  type CompanyGmailReconciliationInput,
  type CompanyGmailReconciliationPort,
  type CompanyGmailSnapshotListPage,
} from './company-gmail-reconciliation.js';
import {
  advanceCompanyGmailReconciliationShadow,
  beginCompanyGmailReconciliationShadow,
  COMPANY_GMAIL_SHADOW_MAX_PAGES_PER_ADVANCE,
  CompanyGmailShadowError,
  createCompanyGmailReadOnlyPort,
  deriveCompanyGmailShadowPageFingerprint,
  deriveCompanyGmailShadowSnapshotIdentity,
  hashCompanyGmailShadowPageToken,
  type CompanyGmailShadowBeginInput,
  type CompanyGmailShadowCompleteInput,
  type CompanyGmailShadowInvalidateInput,
  type CompanyGmailShadowPageInput,
  type CompanyGmailShadowSnapshot,
  type CompanyGmailShadowStore,
  type CompanyGmailShadowStoreResult,
} from './company-gmail-reconciliation-shadow.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const CURSOR_OBSERVED_AT = '2026-08-17T18:30:00.000Z';
const STARTED_AT = '2026-08-17T19:00:00.000Z';

const source = createCompanyGmailInboundSource({
  accountAlias: 'primary',
  ownerKey: 'core:gmail',
  alertRouteKey: 'group:chief',
});

function reconciliation(): CompanyGmailReconciliationInput {
  return {
    source,
    state: {
      definitionId: source.definitionId,
      version: 2,
      status: 'gap',
      cursorValue: '100',
      cursorObservedAt: CURSOR_OBSERVED_AT,
      openGapEventId: '51',
      lastEventId: '51',
    },
    gap: { eventId: '51', targetHistoryId: '400' },
  };
}

function cloneSnapshot(
  snapshot: CompanyGmailShadowSnapshot,
): CompanyGmailShadowSnapshot {
  return Object.freeze({ ...snapshot });
}

class MemoryShadowStore implements CompanyGmailShadowStore {
  readonly snapshots = new Map<string, CompanyGmailShadowSnapshot>();
  readonly candidates = new Map<
    string,
    Map<string, CompanyGmailCandidateReceipt>
  >();
  readonly pageFingerprints = new Map<string, Map<number, string>>();
  readonly tokenHashes = new Map<string, Set<string>>();

  async begin(
    input: CompanyGmailShadowBeginInput,
  ): Promise<CompanyGmailShadowStoreResult> {
    const state = input.reconciliation.state;
    const identityInput = {
      definitionId: input.reconciliation.source.definitionId,
      sourceFingerprint: input.reconciliation.source.sourceFingerprint,
      gapEventId: input.reconciliation.gap.eventId,
      expectedWatermarkVersion: state.version,
      previousCursor: state.cursorValue!,
      cursorObservedAt: state.cursorObservedAt!,
      targetHistoryId: input.reconciliation.gap.targetHistoryId,
      startedAt: new Date(input.startedAt).toISOString(),
      initialHistoryId: input.initialHistoryId,
    };
    const identity = deriveCompanyGmailShadowSnapshotIdentity(identityInput);
    const active = [...this.snapshots.values()].find(
      (snapshot) =>
        snapshot.definitionId === identityInput.definitionId &&
        snapshot.gapEventId === identityInput.gapEventId &&
        (snapshot.status === 'pending' || snapshot.status === 'listed'),
    );
    if (active) {
      return { snapshot: active, applied: false, duplicate: true };
    }
    const snapshot = cloneSnapshot({
      snapshotId: identity.snapshotId,
      snapshotFingerprint: identity.snapshotFingerprint,
      ...identityInput,
      status: 'pending',
      version: 0,
      resumeToken: null,
      resumeTokenSha256: null,
      pagesRead: 0,
      candidateCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      completedAt: null,
      finalHistoryId: null,
      reconciliationEvidenceSha256: null,
      proposedEventFingerprint: null,
      invalidReason: null,
    });
    this.snapshots.set(snapshot.snapshotId, snapshot);
    this.candidates.set(snapshot.snapshotId, new Map());
    this.pageFingerprints.set(snapshot.snapshotId, new Map());
    this.tokenHashes.set(snapshot.snapshotId, new Set());
    return { snapshot, applied: true, duplicate: false };
  }

  async get(snapshotId: string): Promise<CompanyGmailShadowSnapshot> {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) throw new CompanyGmailShadowError('not_found', 'missing');
    return snapshot;
  }

  async recordPage(
    input: CompanyGmailShadowPageInput,
  ): Promise<CompanyGmailShadowStoreResult> {
    const snapshot = await this.get(input.snapshotId);
    const fingerprint = deriveCompanyGmailShadowPageFingerprint({
      snapshotId: input.snapshotId,
      pageIndex: input.expectedVersion,
      requestPageToken: input.requestPageToken,
      nextPageToken: input.page.nextPageToken,
      candidates: input.candidates,
    });
    if (snapshot.version !== input.expectedVersion) {
      if (
        this.pageFingerprints
          .get(input.snapshotId)
          ?.get(input.expectedVersion) === fingerprint
      ) {
        return { snapshot, applied: false, duplicate: true };
      }
      throw new CompanyGmailShadowError('stale_version', 'stale');
    }
    if (snapshot.status !== 'pending') {
      throw new CompanyGmailShadowError('wrong_status', 'not pending');
    }
    if (snapshot.resumeToken !== input.requestPageToken) {
      throw new CompanyGmailShadowError('conflict', 'wrong token');
    }
    const nextHash = hashCompanyGmailShadowPageToken(input.page.nextPageToken);
    if (
      nextHash !== null &&
      this.tokenHashes.get(input.snapshotId)!.has(nextHash)
    ) {
      throw new CompanyGmailReconciliationError(
        'pagination_cycle',
        'repeated token',
      );
    }
    const receipts = this.candidates.get(input.snapshotId)!;
    for (const candidate of input.candidates) {
      if (receipts.has(candidate.messageId)) {
        throw new CompanyGmailReconciliationError(
          'duplicate_candidate',
          'repeated message',
        );
      }
    }
    for (const candidate of input.candidates) {
      receipts.set(candidate.messageId, { ...candidate });
    }
    if (nextHash !== null)
      this.tokenHashes.get(input.snapshotId)!.add(nextHash);
    this.pageFingerprints
      .get(input.snapshotId)!
      .set(input.expectedVersion, fingerprint);
    const accepted = input.candidates.filter(
      (candidate) => candidate.disposition === 'accepted',
    ).length;
    const updated = cloneSnapshot({
      ...snapshot,
      status: input.page.nextPageToken === null ? 'listed' : 'pending',
      version: snapshot.version + 1,
      resumeToken: input.page.nextPageToken,
      resumeTokenSha256: nextHash,
      pagesRead: snapshot.pagesRead + 1,
      candidateCount: snapshot.candidateCount + input.candidates.length,
      acceptedCount: snapshot.acceptedCount + accepted,
      rejectedCount:
        snapshot.rejectedCount + input.candidates.length - accepted,
    });
    this.snapshots.set(updated.snapshotId, updated);
    return { snapshot: updated, applied: true, duplicate: false };
  }

  async listCandidates(
    snapshotId: string,
  ): Promise<CompanyGmailCandidateReceipt[]> {
    await this.get(snapshotId);
    return [...this.candidates.get(snapshotId)!.values()].sort((left, right) =>
      left.messageId.localeCompare(right.messageId),
    );
  }

  async complete(
    input: CompanyGmailShadowCompleteInput,
  ): Promise<CompanyGmailShadowStoreResult> {
    const snapshot = await this.get(input.snapshotId);
    if (snapshot.status === 'complete') {
      return { snapshot, applied: false, duplicate: true };
    }
    if (
      snapshot.status !== 'listed' ||
      snapshot.version !== input.expectedVersion
    ) {
      throw new CompanyGmailShadowError('wrong_status', 'not listed');
    }
    const updated = cloneSnapshot({
      ...snapshot,
      status: 'complete',
      version: snapshot.version + 1,
      completedAt: new Date(input.completedAt).toISOString(),
      finalHistoryId: input.finalHistoryId,
      reconciliationEvidenceSha256: input.reconciliationEvidenceSha256,
      proposedEventFingerprint: input.proposedEventFingerprint,
    });
    this.snapshots.set(updated.snapshotId, updated);
    return { snapshot: updated, applied: true, duplicate: false };
  }

  async invalidate(
    input: CompanyGmailShadowInvalidateInput,
  ): Promise<CompanyGmailShadowStoreResult> {
    const snapshot = await this.get(input.snapshotId);
    if (snapshot.status === 'invalidated') {
      return { snapshot, applied: false, duplicate: true };
    }
    const updated = cloneSnapshot({
      ...snapshot,
      status: 'invalidated',
      version: snapshot.version + 1,
      resumeToken: null,
      resumeTokenSha256: null,
      invalidReason: input.invalidReason,
    });
    this.snapshots.set(updated.snapshotId, updated);
    return { snapshot: updated, applied: true, duplicate: false };
  }
}

function port(input: {
  times: string[];
  heads?: string[];
  listMessages: CompanyGmailReconciliationPort['listMessages'];
  accountCandidate?: CompanyGmailReconciliationPort['accountCandidate'];
}): CompanyGmailReconciliationPort {
  const times = [...input.times];
  const heads = [...(input.heads ?? ['500'])];
  let currentTime = times[0] ?? STARTED_AT;
  return {
    now: () => {
      currentTime = times.shift() ?? currentTime;
      return currentTime;
    },
    getProfile: vi.fn(async () => ({
      historyId: heads.length > 1 ? heads.shift()! : heads[0],
    })),
    listMessages: input.listMessages,
    accountCandidate:
      input.accountCandidate ??
      vi.fn(async () => ({
        disposition: 'accepted' as const,
        reasonKey: 'durable_message',
        evidenceSha256: HASH_A,
      })),
  };
}

async function expectReconciliationError(
  run: () => Promise<unknown>,
  code: CompanyGmailReconciliationError['code'],
): Promise<void> {
  try {
    await run();
    throw new Error('expected reconciliation error');
  } catch (error) {
    expect(error).toBeInstanceOf(CompanyGmailReconciliationError);
    expect((error as CompanyGmailReconciliationError).code).toBe(code);
  }
}

describe('Company OS read-only Gmail wrapper', () => {
  it('calls only profile and unfiltered full-mailbox list with exact bounds', async () => {
    const getProfile = vi.fn(async () => ({ data: { historyId: '500' } }));
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        data: { messages: [{ id: 'msg-a' }], nextPageToken: 'page-2' },
      })
      .mockResolvedValueOnce({ data: { messages: [{ id: 'msg-b' }] } });
    const get = vi.fn();
    const modify = vi.fn();
    const send = vi.fn();
    const gmail = {
      users: { getProfile, messages: { list, get, modify, send } },
    } as unknown as gmail_v1.Gmail;
    const wrapper = createCompanyGmailReadOnlyPort(gmail, {
      now: () => STARTED_AT,
      accountCandidate: vi.fn(async () => ({
        disposition: 'accepted' as const,
        reasonKey: 'durable_message',
        evidenceSha256: HASH_A,
      })),
    });

    await expect(wrapper.getProfile()).resolves.toEqual({ historyId: '500' });
    await expect(
      wrapper.listMessages({
        pageToken: null,
        maxResults: 500,
        includeSpamTrash: true,
      }),
    ).resolves.toEqual({ messageIds: ['msg-a'], nextPageToken: 'page-2' });
    await wrapper.listMessages({
      pageToken: 'page-2',
      maxResults: 500,
      includeSpamTrash: true,
    });

    expect(getProfile).toHaveBeenCalledWith({ userId: 'me' });
    expect(list).toHaveBeenNthCalledWith(1, {
      userId: 'me',
      maxResults: 500,
      includeSpamTrash: true,
    });
    expect(list).toHaveBeenNthCalledWith(2, {
      userId: 'me',
      maxResults: 500,
      includeSpamTrash: true,
      pageToken: 'page-2',
    });
    expect(JSON.stringify(list.mock.calls)).not.toMatch(/\bq\b|labelIds/);
    expect(get).not.toHaveBeenCalled();
    expect(modify).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe('Company OS resumable Gmail shadow', () => {
  it('completes 10,001 candidates across bounded advances without weakening proof', async () => {
    const store = new MemoryShadowStore();
    const total = 10_001;
    const listMessages = vi.fn(
      async ({ pageToken }: { pageToken: string | null }) => {
        const pageIndex = pageToken === null ? 0 : Number(pageToken.slice(5));
        const start = pageIndex * 500;
        const end = Math.min(total, start + 500);
        const messageIds = Array.from(
          { length: end - start },
          (_, offset) => `msg-${String(start + offset).padStart(5, '0')}`,
        );
        return {
          messageIds,
          nextPageToken: end < total ? `page-${pageIndex + 1}` : null,
        };
      },
    );
    const adapter = port({
      times: [
        STARTED_AT,
        '2026-08-17T19:00:05.000Z',
        '2026-08-17T19:01:00.000Z',
        '2026-08-17T19:01:05.000Z',
      ],
      listMessages,
    });

    const begun = await beginCompanyGmailReconciliationShadow(
      reconciliation(),
      adapter,
      store,
    );
    const first = await advanceCompanyGmailReconciliationShadow(
      reconciliation(),
      begun.snapshotId,
      COMPANY_GMAIL_SHADOW_MAX_PAGES_PER_ADVANCE,
      adapter,
      store,
    );
    expect(first).toMatchObject({
      status: 'pending',
      pagesRead: 20,
      candidateCount: 10_000,
      reconciliation: null,
      actionAuthority: 'none',
    });
    expect(JSON.stringify(first)).not.toMatch(/page-|resumeToken/);

    const second = await advanceCompanyGmailReconciliationShadow(
      reconciliation(),
      begun.snapshotId,
      1,
      adapter,
      store,
    );
    expect(second).toMatchObject({
      status: 'complete',
      pagesRead: 21,
      candidateCount: total,
      acceptedCount: total,
      rejectedCount: 0,
      actionAuthority: 'none',
    });
    expect(second.reconciliation).toMatchObject({
      pagesRead: 21,
      candidateCount: total,
      stableHistoryId: '500',
      event: {
        eventType: 'gap_reconciled',
        previousCursor: '100',
        nextCursor: '500',
        resolvesEventId: '51',
        actionAuthority: 'none',
      },
    });
    expect(listMessages).toHaveBeenCalledTimes(21);

    const replay = await advanceCompanyGmailReconciliationShadow(
      reconciliation(),
      begun.snapshotId,
      1,
      adapter,
      store,
    );
    expect(replay.reconciliation).toEqual(second.reconciliation);
    expect(listMessages).toHaveBeenCalledTimes(21);
  });

  it('invalidates a resumed attempt when the mailbox head changes', async () => {
    const store = new MemoryShadowStore();
    const adapter = port({
      times: [STARTED_AT, '2026-08-17T19:00:05.000Z'],
      heads: ['500', '501'],
      listMessages: vi.fn(async () => ({
        messageIds: [],
        nextPageToken: null,
      })),
    });
    const begun = await beginCompanyGmailReconciliationShadow(
      reconciliation(),
      adapter,
      store,
    );

    await expectReconciliationError(
      () =>
        advanceCompanyGmailReconciliationShadow(
          reconciliation(),
          begun.snapshotId,
          1,
          adapter,
          store,
        ),
      'head_changed',
    );
    expect(await store.get(begun.snapshotId)).toMatchObject({
      status: 'invalidated',
      invalidReason: 'head_changed',
      resumeToken: null,
    });
  });

  it('keeps the page pending when durable accounting is still unknown', async () => {
    const store = new MemoryShadowStore();
    const adapter = port({
      times: [STARTED_AT, '2026-08-17T19:00:05.000Z'],
      listMessages: vi.fn(async () => ({
        messageIds: ['msg-a'],
        nextPageToken: null,
      })),
      accountCandidate: vi.fn(async () => ({
        disposition: 'unknown' as const,
        reasonKey: 'missing_durable_receipt',
        evidenceSha256: HASH_B,
      })),
    });
    const begun = await beginCompanyGmailReconciliationShadow(
      reconciliation(),
      adapter,
      store,
    );

    await expectReconciliationError(
      () =>
        advanceCompanyGmailReconciliationShadow(
          reconciliation(),
          begun.snapshotId,
          1,
          adapter,
          store,
        ),
      'candidate_unaccounted',
    );
    expect(await store.get(begun.snapshotId)).toMatchObject({
      status: 'pending',
      pagesRead: 0,
      candidateCount: 0,
    });
  });

  it('invalidates a pagination cycle without emitting reconciliation', async () => {
    const store = new MemoryShadowStore();
    const pages: CompanyGmailSnapshotListPage[] = [
      { messageIds: [], nextPageToken: 'again' },
      { messageIds: [], nextPageToken: 'again' },
    ];
    const adapter = port({
      times: [
        STARTED_AT,
        '2026-08-17T19:00:05.000Z',
        '2026-08-17T19:00:10.000Z',
      ],
      listMessages: vi.fn(async () => pages.shift()!),
    });
    const begun = await beginCompanyGmailReconciliationShadow(
      reconciliation(),
      adapter,
      store,
    );
    await expectReconciliationError(
      () =>
        advanceCompanyGmailReconciliationShadow(
          reconciliation(),
          begun.snapshotId,
          2,
          adapter,
          store,
        ),
      'pagination_cycle',
    );
    expect(await store.get(begun.snapshotId)).toMatchObject({
      status: 'invalidated',
      invalidReason: 'pagination_cycle',
      pagesRead: 1,
    });
  });

  it('invalidates a candidate repeated across resumed pages', async () => {
    const store = new MemoryShadowStore();
    const pages: CompanyGmailSnapshotListPage[] = [
      { messageIds: ['msg-a'], nextPageToken: 'page-1' },
      { messageIds: ['msg-a'], nextPageToken: null },
    ];
    const adapter = port({
      times: [
        STARTED_AT,
        '2026-08-17T19:00:05.000Z',
        '2026-08-17T19:00:10.000Z',
      ],
      listMessages: vi.fn(async () => pages.shift()!),
    });
    const begun = await beginCompanyGmailReconciliationShadow(
      reconciliation(),
      adapter,
      store,
    );
    const first = await advanceCompanyGmailReconciliationShadow(
      reconciliation(),
      begun.snapshotId,
      1,
      adapter,
      store,
    );
    expect(first.status).toBe('pending');
    await expectReconciliationError(
      () =>
        advanceCompanyGmailReconciliationShadow(
          reconciliation(),
          begun.snapshotId,
          1,
          adapter,
          store,
        ),
      'duplicate_candidate',
    );
    expect(await store.get(begun.snapshotId)).toMatchObject({
      status: 'invalidated',
      invalidReason: 'duplicate_candidate',
      pagesRead: 1,
      candidateCount: 1,
    });
  });

  it('invalidates an expired whole-attempt budget before another Gmail page', async () => {
    const store = new MemoryShadowStore();
    const listMessages = vi.fn(async () => ({
      messageIds: [],
      nextPageToken: null,
    }));
    const adapter = port({
      times: [STARTED_AT, '2026-08-17T19:21:00.000Z'],
      listMessages,
    });
    const begun = await beginCompanyGmailReconciliationShadow(
      reconciliation(),
      adapter,
      store,
    );
    await expectReconciliationError(
      () =>
        advanceCompanyGmailReconciliationShadow(
          reconciliation(),
          begun.snapshotId,
          1,
          adapter,
          store,
        ),
      'freshness_exceeded',
    );
    expect(listMessages).not.toHaveBeenCalled();
    expect(await store.get(begun.snapshotId)).toMatchObject({
      status: 'invalidated',
      invalidReason: 'freshness_exceeded',
    });
  });

  it('derives stable content-free identities and rejects an excessive chunk', async () => {
    const identity = deriveCompanyGmailShadowSnapshotIdentity({
      definitionId: source.definitionId,
      sourceFingerprint: source.sourceFingerprint,
      gapEventId: '51',
      expectedWatermarkVersion: 2,
      previousCursor: '100',
      cursorObservedAt: CURSOR_OBSERVED_AT,
      targetHistoryId: '400',
      startedAt: STARTED_AT,
      initialHistoryId: '500',
    });
    expect(identity).toEqual(
      deriveCompanyGmailShadowSnapshotIdentity({
        definitionId: source.definitionId,
        sourceFingerprint: source.sourceFingerprint,
        gapEventId: '51',
        expectedWatermarkVersion: 2,
        previousCursor: '100',
        cursorObservedAt: CURSOR_OBSERVED_AT,
        targetHistoryId: '400',
        startedAt: STARTED_AT,
        initialHistoryId: '500',
      }),
    );
    expect(JSON.stringify(identity)).not.toMatch(
      /subject|body|address|prompt|task|approval|send/i,
    );

    const store = new MemoryShadowStore();
    await expect(
      advanceCompanyGmailReconciliationShadow(
        reconciliation(),
        identity.snapshotId,
        21,
        port({ times: [STARTED_AT], listMessages: vi.fn() }),
        store,
      ),
    ).rejects.toMatchObject({ code: 'invalid_input' });
  });
});
