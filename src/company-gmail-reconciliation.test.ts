import { describe, expect, it, vi } from 'vitest';

import {
  COMPANY_GMAIL_RECONCILIATION_MAX_PAGES,
  COMPANY_GMAIL_RECONCILIATION_MAX_WINDOW_SECONDS,
  COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE,
  CompanyGmailReconciliationError,
  createCompanyGmailInboundSource,
  proposeCompanyGmailHistoryGap,
  reconcileCompanyGmailHistoryGap,
  type CompanyGmailCandidateAccounting,
  type CompanyGmailReconciliationPort,
  type CompanyGmailSnapshotListPage,
} from './company-gmail-reconciliation.js';
import type { CompanyTriggerWatermarkState } from './company-trigger-source.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const CURSOR_OBSERVED_AT = '2026-08-17T18:30:00.000Z';
const STARTED_AT = '2026-08-17T19:00:00.000Z';
const COMPLETED_AT = '2026-08-17T19:01:00.000Z';

const source = createCompanyGmailInboundSource({
  accountAlias: 'primary',
  ownerKey: 'core:gmail',
  alertRouteKey: 'group:chief',
});

function state(
  overrides: Partial<CompanyTriggerWatermarkState> = {},
): CompanyTriggerWatermarkState {
  return {
    definitionId: source.definitionId,
    version: 2,
    status: 'gap',
    cursorValue: '100',
    cursorObservedAt: CURSOR_OBSERVED_AT,
    openGapEventId: '51',
    lastEventId: '51',
    ...overrides,
  };
}

function currentState(): CompanyTriggerWatermarkState {
  return state({
    version: 1,
    status: 'current',
    openGapEventId: null,
    lastEventId: '50',
  });
}

function pages(...values: CompanyGmailSnapshotListPage[]) {
  const remaining = [...values];
  return vi.fn(async () => {
    const next = remaining.shift();
    if (!next) throw new Error('unexpected list page');
    return next;
  });
}

function accounting(
  dispositions: Record<string, CompanyGmailCandidateAccounting> = {},
) {
  return vi.fn(
    async (messageId: string) =>
      dispositions[messageId] ?? {
        disposition: 'accepted' as const,
        reasonKey: 'durable_message',
        evidenceSha256: HASH_A,
      },
  );
}

function port(
  overrides: Partial<CompanyGmailReconciliationPort> = {},
): CompanyGmailReconciliationPort {
  const times = [STARTED_AT, COMPLETED_AT];
  return {
    now: vi.fn(() => times.shift() ?? COMPLETED_AT),
    getProfile: vi.fn(async () => ({ historyId: '500' })),
    listMessages: pages({ messageIds: [], nextPageToken: null }),
    accountCandidate: accounting(),
    ...overrides,
  };
}

async function expectError(
  run: () => unknown | Promise<unknown>,
  code: CompanyGmailReconciliationError['code'],
): Promise<void> {
  try {
    await run();
    throw new Error('expected CompanyGmailReconciliationError');
  } catch (error) {
    expect(error).toBeInstanceOf(CompanyGmailReconciliationError);
    expect((error as CompanyGmailReconciliationError).code).toBe(code);
  }
}

describe('Company OS inbound Gmail full-snapshot adapter', () => {
  it('creates a deterministic content-free source with no authority', () => {
    const replay = createCompanyGmailInboundSource({
      accountAlias: 'primary',
      ownerKey: 'core:gmail',
      alertRouteKey: 'group:chief',
    });

    expect(source).toEqual(replay);
    expect(source).toMatchObject({
      kind: 'gmail',
      sourceSystem: 'gmail',
      sourceKey: 'mailbox:primary:inbound-v1',
      adapterKey: 'gmail_inbound_full_snapshot',
      cursorKind: 'uint',
      reconciliationMode: 'full_snapshot',
      actionAuthority: 'none',
    });
    expect(source.maxReconciliationWindowSeconds).toBe(
      COMPANY_GMAIL_RECONCILIATION_MAX_WINDOW_SECONDS,
    );
    expect(JSON.stringify(source)).not.toMatch(
      /enabled|prompt|skill|capability|approval|send|action_id/i,
    );
  });

  it('rejects an address where only a stable account alias is allowed', async () => {
    await expectError(
      () =>
        createCompanyGmailInboundSource({
          accountAlias: 'person@example.com',
          ownerKey: 'core:gmail',
          alertRouteKey: 'group:chief',
        }),
      'invalid_input',
    );
  });

  it('proposes a deterministic history-expiry gap without moving the prior cursor', () => {
    const input = {
      source,
      state: currentState(),
      notificationHistoryId: '400',
      detectedAt: STARTED_AT,
    };
    const first = proposeCompanyGmailHistoryGap(input);
    const replay = proposeCompanyGmailHistoryGap(input);

    expect(first).toEqual(replay);
    expect(first).toMatchObject({
      definitionId: source.definitionId,
      eventType: 'gap_detected',
      expectedVersion: 1,
      previousCursor: '100',
      nextCursor: '400',
      observedFrom: CURSOR_OBSERVED_AT,
      observedThrough: STARTED_AT,
      observedCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
      gapReason: 'history_expired',
      resolvesEventId: null,
      actionAuthority: 'none',
    });
  });

  it('refuses a stale notification or a source that is already on a gap', async () => {
    await expectError(
      () =>
        proposeCompanyGmailHistoryGap({
          source,
          state: currentState(),
          notificationHistoryId: '100',
          detectedAt: STARTED_AT,
        }),
      'invalid_input',
    );
    await expectError(
      () =>
        proposeCompanyGmailHistoryGap({
          source,
          state: state(),
          notificationHistoryId: '400',
          detectedAt: STARTED_AT,
        }),
      'wrong_state',
    );
  });

  it('reconciles only a terminal, stable-head snapshot with exact accounting', async () => {
    const listMessages = pages(
      { messageIds: ['msg-b', 'msg-a'], nextPageToken: 'page-2' },
      { messageIds: ['msg-c'], nextPageToken: null },
    );
    const accountCandidate = accounting({
      'msg-a': {
        disposition: 'accepted',
        reasonKey: 'durable_message',
        evidenceSha256: HASH_A,
      },
      'msg-b': {
        disposition: 'rejected',
        reasonKey: 'sent_or_draft',
        evidenceSha256: HASH_B,
      },
      'msg-c': {
        disposition: 'accepted',
        reasonKey: 'durable_classification',
        evidenceSha256: HASH_A,
      },
    });
    const adapterPort = port({ listMessages, accountCandidate });

    const result = await reconcileCompanyGmailHistoryGap(
      {
        source,
        state: state(),
        gap: { eventId: '51', targetHistoryId: '400' },
      },
      adapterPort,
    );

    expect(result).toMatchObject({
      stableHistoryId: '500',
      pagesRead: 2,
      candidateCount: 3,
      acceptedCount: 2,
      rejectedCount: 1,
      actionAuthority: 'none',
    });
    expect(result.event).toMatchObject({
      eventType: 'gap_reconciled',
      expectedVersion: 2,
      previousCursor: '100',
      nextCursor: '500',
      observedCount: 3,
      acceptedCount: 2,
      rejectedCount: 1,
      resolvesEventId: '51',
      actionAuthority: 'none',
    });
    expect(listMessages).toHaveBeenNthCalledWith(1, {
      pageToken: null,
      maxResults: COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE,
      includeSpamTrash: true,
    });
    expect(listMessages).toHaveBeenNthCalledWith(2, {
      pageToken: 'page-2',
      maxResults: COMPANY_GMAIL_RECONCILIATION_PAGE_SIZE,
      includeSpamTrash: true,
    });
    expect(accountCandidate.mock.calls.map(([id]) => id)).toEqual([
      'msg-a',
      'msg-b',
      'msg-c',
    ]);
  });

  it('produces replay-stable evidence for the same closed snapshot', async () => {
    const makePort = () =>
      port({
        listMessages: pages({
          messageIds: ['msg-b', 'msg-a'],
          nextPageToken: null,
        }),
      });
    const input = {
      source,
      state: state(),
      gap: { eventId: '51', targetHistoryId: '400' },
    };

    const first = await reconcileCompanyGmailHistoryGap(input, makePort());
    const replay = await reconcileCompanyGmailHistoryGap(input, makePort());

    expect(first).toEqual(replay);
    expect(first.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('accepts a stable terminal empty mailbox as exactly accounted', async () => {
    const accountCandidate = accounting();
    const result = await reconcileCompanyGmailHistoryGap(
      {
        source,
        state: state(),
        gap: { eventId: '51', targetHistoryId: '400' },
      },
      port({ accountCandidate }),
    );

    expect(result).toMatchObject({
      pagesRead: 1,
      candidateCount: 0,
      acceptedCount: 0,
      rejectedCount: 0,
    });
    expect(accountCandidate).not.toHaveBeenCalled();
  });

  it('leaves the gap open when the mailbox head changes during the snapshot', async () => {
    const getProfile = vi
      .fn()
      .mockResolvedValueOnce({ historyId: '500' })
      .mockResolvedValueOnce({ historyId: '501' });

    await expectError(
      () =>
        reconcileCompanyGmailHistoryGap(
          {
            source,
            state: state(),
            gap: { eventId: '51', targetHistoryId: '400' },
          },
          port({ getProfile }),
        ),
      'head_changed',
    );
  });

  it('leaves the gap open when the profile head is behind the notification', async () => {
    await expectError(
      () =>
        reconcileCompanyGmailHistoryGap(
          {
            source,
            state: state(),
            gap: { eventId: '51', targetHistoryId: '600' },
          },
          port(),
        ),
      'head_behind_gap',
    );
  });

  it('leaves the gap open at the page cap instead of truncating', async () => {
    let call = 0;
    const listMessages = vi.fn(async () => ({
      messageIds: [],
      nextPageToken: `page-${++call}`,
    }));
    const accountCandidate = accounting();

    await expectError(
      () =>
        reconcileCompanyGmailHistoryGap(
          {
            source,
            state: state(),
            gap: { eventId: '51', targetHistoryId: '400' },
          },
          port({ listMessages, accountCandidate }),
        ),
      'page_limit',
    );
    expect(listMessages).toHaveBeenCalledTimes(
      COMPANY_GMAIL_RECONCILIATION_MAX_PAGES,
    );
    expect(accountCandidate).not.toHaveBeenCalled();
  });

  it('rejects a pagination cycle and repeated candidate IDs', async () => {
    await expectError(
      () =>
        reconcileCompanyGmailHistoryGap(
          {
            source,
            state: state(),
            gap: { eventId: '51', targetHistoryId: '400' },
          },
          port({
            listMessages: pages(
              { messageIds: [], nextPageToken: 'again' },
              { messageIds: [], nextPageToken: 'again' },
            ),
          }),
        ),
      'pagination_cycle',
    );

    await expectError(
      () =>
        reconcileCompanyGmailHistoryGap(
          {
            source,
            state: state(),
            gap: { eventId: '51', targetHistoryId: '400' },
          },
          port({
            listMessages: pages({
              messageIds: ['msg-a', 'msg-a'],
              nextPageToken: null,
            }),
          }),
        ),
      'duplicate_candidate',
    );
  });

  it('rejects invalid candidates and any unknown disposition', async () => {
    await expectError(
      () =>
        reconcileCompanyGmailHistoryGap(
          {
            source,
            state: state(),
            gap: { eventId: '51', targetHistoryId: '400' },
          },
          port({
            listMessages: pages({
              messageIds: ['bad id'],
              nextPageToken: null,
            }),
          }),
        ),
      'invalid_candidate',
    );

    await expectError(
      () =>
        reconcileCompanyGmailHistoryGap(
          {
            source,
            state: state(),
            gap: { eventId: '51', targetHistoryId: '400' },
          },
          port({
            listMessages: pages({
              messageIds: ['msg-a'],
              nextPageToken: null,
            }),
            accountCandidate: accounting({
              'msg-a': {
                disposition: 'unknown',
                reasonKey: 'missing_durable_receipt',
                evidenceSha256: HASH_A,
              },
            }),
          }),
        ),
      'candidate_unaccounted',
    );
  });

  it('refuses an over-budget gap before calling Gmail', async () => {
    const getProfile = vi.fn(async () => ({ historyId: '500' }));
    const tooOld = new Date(
      Date.parse(STARTED_AT) -
        (COMPANY_GMAIL_RECONCILIATION_MAX_WINDOW_SECONDS + 1) * 1000,
    ).toISOString();

    await expectError(
      () =>
        reconcileCompanyGmailHistoryGap(
          {
            source,
            state: state({ cursorObservedAt: tooOld }),
            gap: { eventId: '51', targetHistoryId: '400' },
          },
          port({ getProfile }),
        ),
      'window_exceeded',
    );
    expect(getProfile).not.toHaveBeenCalled();
  });

  it('refuses a stale snapshot and mismatched durable gap', async () => {
    const late = new Date(
      Date.parse(STARTED_AT) + 20 * 60 * 1000 + 1,
    ).toISOString();
    const times = [STARTED_AT, late];
    await expectError(
      () =>
        reconcileCompanyGmailHistoryGap(
          {
            source,
            state: state(),
            gap: { eventId: '51', targetHistoryId: '400' },
          },
          port({ now: vi.fn(() => times.shift() ?? late) }),
        ),
      'freshness_exceeded',
    );

    await expectError(
      () =>
        reconcileCompanyGmailHistoryGap(
          {
            source,
            state: state(),
            gap: { eventId: '52', targetHistoryId: '400' },
          },
          port(),
        ),
      'gap_mismatch',
    );
  });

  it('converts Gmail/list/accounting failures into a closed error code', async () => {
    await expectError(
      () =>
        reconcileCompanyGmailHistoryGap(
          {
            source,
            state: state(),
            gap: { eventId: '51', targetHistoryId: '400' },
          },
          port({
            listMessages: vi.fn(async () => {
              throw new Error('transport detail');
            }),
          }),
        ),
      'source_unavailable',
    );
  });
});
