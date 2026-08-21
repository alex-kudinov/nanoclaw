import { readFileSync } from 'node:fs';

import type { PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { hashApprovedEmailContent } from './email-action.js';
import {
  CompanyWorkOutcomeReviewService,
  PostgresCompanyWorkOutcomeReviewStore,
  assembleCompanyWorkOutcomeReviewEvidence,
  renderCompanyWorkOutcomeReviewPacket,
  resolveCompanyWorkOutcomeReviewConfig,
  runCompanyWorkOutcomeReview,
  type CompanyWorkOutcomeReviewConfig,
  type CompanyWorkOutcomeReviewDeps,
  type CompanyWorkOutcomeReviewPacketBinding,
  type CompanyWorkOutcomeReviewStore,
  type CompanyWorkOutcomeReviewStoreDb,
  type CompanyWorkOutcomeReviewTarget,
} from './company-work-outcome-review.js';

const DELIVERY_AT = '2026-08-20T11:00:00.000Z';
const OUTCOME_AT = '2026-08-20T11:30:00.000Z';
const NOW = '2026-08-20T12:00:00.000Z';
const ACTION_ID = 'action-1';
const APPROVED_SUBJECT = 'Re: Question';
const APPROVED_BODY = 'Hello Pat,\n\nHere is the exact answer.';

function target(
  overrides: Partial<CompanyWorkOutcomeReviewTarget> = {},
): CompanyWorkOutcomeReviewTarget {
  return {
    workItemId: '41',
    sourceSystem: 'sqlite_email_action',
    sourceKey: ACTION_ID,
    deliveryEventVersion: 7,
    deliveryOccurredAt: DELIVERY_AT,
    deliveryReceiptSystem: 'gmail',
    deliveryReceiptKey: 'gmail-receipt-1',
    outcomeEventVersion: 8,
    outcomeOccurredAt: OUTCOME_AT,
    outcomeReceiptSystem: 'sqlite_messages',
    outcomeReceiptKey: 'slack-outcome-1',
    ...overrides,
  };
}

function evidence(overrides: Partial<CompanyWorkOutcomeReviewTarget> = {}) {
  const value = assembleCompanyWorkOutcomeReviewEvidence(target(overrides), {
    resolveSourceContext: vi.fn().mockReturnValue({
      status: 'attached',
      code: 'exact_source_attached',
      bodyComplete: true,
      gmailMessageId: 'source-message-1',
      gmailThreadId: 'gmail-thread-1',
      sourceText:
        '[HANDOFF: mailman→sales]\nParty ID: 10\nName: Pat Person\nEmail: pat@example.com\nMessage:\nPlease explain the program.',
    }),
    getAction: vi.fn().mockReturnValue({
      actionId: ACTION_ID,
      draftTs: '1800000000.000010',
      groupFolder: 'sales',
      chatJid: 'slack:C_SALES',
      threadTs: '1800000000.000001',
      approvedSubject: APPROVED_SUBJECT,
      approvedContentSha256: hashApprovedEmailContent(
        APPROVED_SUBJECT,
        APPROVED_BODY,
      ),
      approvedAt: '2026-08-20T10:00:00.000Z',
      state: 'confirmed',
      gmailMessageId: 'gmail-receipt-1',
      completedAt: DELIVERY_AT,
    }),
    getMessage: vi.fn().mockReturnValue({
      id: '1800000000.000010',
      chat_jid: 'slack:C_SALES',
      sender: 'bot',
      sender_name: 'Mr Gru',
      timestamp: '2026-08-20T10:00:00.000Z',
      is_from_me: true,
      is_bot_message: true,
      from_group: 'sales',
      thread_ts: '1800000000.000001',
      content: `[SALES REVIEW] Lead #20\nEmail: pat@example.com\nDRAFT RESPONSE TO LEAD:\n---\nSubject: ${APPROVED_SUBJECT}\n\n${APPROVED_BODY}\n---`,
    }),
    listEvents: vi.fn().mockReturnValue([
      {
        sequence: 7,
        stage: 'confirmed',
        occurredAt: DELIVERY_AT,
        gmailMessageId: 'gmail-receipt-1',
      },
    ]),
    findOutcomeReceipt: vi.fn().mockReturnValue({
      ambiguous: false,
      receipt: { messageId: 'slack-outcome-1', occurredAt: OUTCOME_AT },
    }),
  });
  if (!value) throw new Error('fixture evidence failed');
  return value;
}

function config(
  overrides: Partial<CompanyWorkOutcomeReviewConfig> = {},
): CompanyWorkOutcomeReviewConfig {
  return {
    enabled: true,
    active: true,
    operatorUids: ['U1234567'],
    intervalMs: 86_400_000,
    windowDays: 30,
    candidateLimit: 25,
    targetFolder: 'chief',
    configurationError: null,
    ...overrides,
  };
}

function binding(
  overrides: Partial<CompanyWorkOutcomeReviewPacketBinding> = {},
): CompanyWorkOutcomeReviewPacketBinding {
  const value = evidence();
  return {
    id: '9',
    workItemId: '41',
    deliveryEventVersion: 7,
    packetFingerprint: value.packetFingerprint,
    sourceKeySha256: value.sourceKeySha256,
    evidenceSha256: value.evidenceSha256,
    evidenceOccurredAt: value.evidenceOccurredAt,
    status: 'posted',
    channelJid: 'slack:C_CHIEF',
    messageTs: '1800000000.000001',
    decisionAssessment: null,
    decisionActorSha256: null,
    decisionReaction: null,
    decidedAt: null,
    assessmentReceiptId: null,
    decisionReceiptStatus: 'none',
    ...overrides,
  };
}

function store(
  overrides: Partial<CompanyWorkOutcomeReviewStore> = {},
): CompanyWorkOutcomeReviewStore {
  const value = evidence();
  return {
    listCandidates: vi.fn().mockResolvedValue([value.target]),
    claimPacket: vi.fn().mockResolvedValue({
      id: '9',
      workItemId: '41',
      deliveryEventVersion: 7,
      packetFingerprint: value.packetFingerprint,
      sourceKeySha256: value.sourceKeySha256,
      evidenceSha256: value.evidenceSha256,
      evidenceOccurredAt: value.evidenceOccurredAt,
    }),
    markPacketPosted: vi.fn().mockResolvedValue(undefined),
    markPacketDeliveryUncertain: vi.fn().mockResolvedValue(undefined),
    findPacket: vi.fn().mockResolvedValue(binding()),
    findOpenPacket: vi.fn().mockResolvedValue(null),
    recordDecision: vi.fn().mockResolvedValue(undefined),
    markDecisionReceipt: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function deps(
  overrides: Partial<CompanyWorkOutcomeReviewDeps> = {},
): CompanyWorkOutcomeReviewDeps {
  return {
    store: store(),
    resolveTargetJid: vi.fn().mockReturnValue('slack:C_CHIEF'),
    assembleEvidence: vi.fn().mockReturnValue(evidence()),
    postPacket: vi.fn().mockResolvedValue('1800000000.000001'),
    postThread: vi.fn().mockResolvedValue('1800000000.000002'),
    listMessageReactions: vi.fn().mockResolvedValue([]),
    assess: vi.fn().mockResolvedValue({ receiptId: '80', duplicate: false }),
    now: () => NOW,
    ...overrides,
  };
}

describe('Company Work outcome review configuration', () => {
  it('defaults off and fails closed without a named operator', () => {
    expect(resolveCompanyWorkOutcomeReviewConfig({})).toMatchObject({
      enabled: false,
      active: false,
      configurationError: null,
    });
    expect(
      resolveCompanyWorkOutcomeReviewConfig({
        COMPANY_WORK_OUTCOME_REVIEW_ENABLED: '1',
      }),
    ).toMatchObject({
      active: false,
      configurationError: 'operator_uid_required',
    });
    expect(
      resolveCompanyWorkOutcomeReviewConfig({
        COMPANY_WORK_OUTCOME_REVIEW_ENABLED: '1',
        COMPANY_WORK_OUTCOME_REVIEW_OPERATOR_UIDS: 'U1234567',
      }),
    ).toMatchObject({ active: true, operatorUids: ['U1234567'] });
  });

  it('rejects malformed identities and invalid bounds', () => {
    expect(
      resolveCompanyWorkOutcomeReviewConfig({
        COMPANY_WORK_OUTCOME_REVIEW_ENABLED: '1',
        COMPANY_WORK_OUTCOME_REVIEW_OPERATOR_UIDS: 'alex',
      }).configurationError,
    ).toBe('invalid_operator_uid');
    expect(
      resolveCompanyWorkOutcomeReviewConfig({
        COMPANY_WORK_OUTCOME_REVIEW_ENABLED: '1',
        COMPANY_WORK_OUTCOME_REVIEW_OPERATOR_UIDS: 'U1234567',
        COMPANY_WORK_OUTCOME_REVIEW_WINDOW_DAYS: '0',
      }).configurationError,
    ).toBe('invalid_window_days');
  });
});

describe('Company Work exact outcome evidence', () => {
  it('binds exact source/draft/delivery/outcome evidence and minimizes identity', () => {
    const value = evidence();
    expect(value.sourceText).toContain('Please explain the program.');
    expect(value.sourceText).not.toMatch(/pat@example\.com|Party ID|Name:/i);
    expect(value.approvedSubject).toBe(APPROVED_SUBJECT);
    expect(value.approvedBody).toBe(APPROVED_BODY);
    expect(value.evidenceSha256).toMatch(/^[0-9a-f]{64}$/);
    const packet = renderCompanyWorkOutcomeReviewPacket(value, '9');
    expect(packet).toContain('Gmail was not searched');
    expect(packet).toContain('React exactly once');
    expect(packet).not.toContain('pat@example.com');
  });

  it('fails closed when a durable receipt disagrees', () => {
    expect(() => evidence({ deliveryReceiptKey: 'different' })).toThrow(
      'fixture evidence failed',
    );
  });

  it('has no Gmail, IPC, container, or agent execution capability', () => {
    const source = readFileSync(
      new URL('./company-work-outcome-review.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(
      /from ['"].*(?:gmail-ipc|ipc\.js|container-runner|agent-runner)/,
    );
    expect(source).not.toMatch(
      /gmail_(?:search|get|send|reply)|runContainerAgent|writeHostMessage/,
    );
  });
});

describe('Company Work outcome packet delivery and decisions', () => {
  it('posts at most one exact packet per run', async () => {
    const dependencies = deps();
    const result = await runCompanyWorkOutcomeReview(config(), dependencies);
    expect(result).toMatchObject({
      outcome: 'posted',
      scanned: 1,
      packetId: '9',
      messageTs: '1800000000.000001',
    });
    expect(dependencies.postPacket).toHaveBeenCalledOnce();
    expect(dependencies.store.markPacketPosted).toHaveBeenCalledOnce();
  });

  it('closes delivery as uncertain when Slack returns no receipt', async () => {
    const dependencies = deps({
      postPacket: vi.fn().mockResolvedValue(undefined),
    });
    await expect(
      runCompanyWorkOutcomeReview(config(), dependencies),
    ).resolves.toMatchObject({
      outcome: 'delivery_uncertain',
      errorCode: 'slack_delivery_unconfirmed',
    });
    expect(
      dependencies.store.markPacketDeliveryUncertain,
    ).toHaveBeenCalledOnce();
  });

  it('refuses an incomplete Slack packet instead of letting transport truncate it', async () => {
    const tooLarge = evidence();
    tooLarge.approvedBody = 'x'.repeat(4_000);
    const dependencies = deps({
      assembleEvidence: vi.fn().mockReturnValue(tooLarge),
    });
    await expect(
      runCompanyWorkOutcomeReview(config(), dependencies),
    ).resolves.toMatchObject({
      outcome: 'no_reviewable_evidence',
      sourceUnavailable: 1,
    });
    expect(dependencies.store.claimPacket).not.toHaveBeenCalled();
    expect(dependencies.postPacket).not.toHaveBeenCalled();
  });

  it('maps an authorized reaction to one durable assessment and receipt reply', async () => {
    const dependencies = deps();
    const service = new CompanyWorkOutcomeReviewService(config(), dependencies);
    await expect(
      service.handleReaction('1800000000.000001', {
        jid: 'slack:C_CHIEF',
        reactorUid: 'U1234567',
        reaction: 'bug',
        occurredAt: NOW,
      }),
    ).resolves.toBe(true);
    expect(dependencies.assess).toHaveBeenCalledWith(
      expect.objectContaining({
        assessment: 'customer_visible_defect',
        assessedAt: NOW,
      }),
    );
    expect(dependencies.store.recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        assessment: 'customer_visible_defect',
        reaction: 'bug',
        assessmentReceiptId: '80',
      }),
    );
    expect(dependencies.store.markDecisionReceipt).toHaveBeenCalledWith(
      '9',
      'posted',
      NOW,
      '1800000000.000002',
    );
  });

  it('treats Slack +1 as an explicit clean reaction', async () => {
    const dependencies = deps();
    const service = new CompanyWorkOutcomeReviewService(config(), dependencies);
    await expect(
      service.handleReaction('1800000000.000001', {
        jid: 'slack:C_CHIEF',
        reactorUid: 'U1234567',
        reaction: '+1',
        occurredAt: NOW,
      }),
    ).resolves.toBe(true);
    expect(dependencies.assess).toHaveBeenCalledWith(
      expect.objectContaining({ assessment: 'clean', assessedAt: NOW }),
    );
    expect(dependencies.store.recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({ assessment: 'clean', reaction: '+1' }),
    );
  });

  it('reconciles one supported configured-operator reaction on the exact open packet', async () => {
    const decided = binding({
      status: 'decided',
      decisionAssessment: 'clean',
      decisionActorSha256: 'a'.repeat(64),
      decisionReaction: '+1',
      decidedAt: NOW,
      assessmentReceiptId: '80',
      decisionReceiptStatus: 'posted',
    });
    const reviewStore = store({
      findOpenPacket: vi.fn().mockResolvedValue(binding()),
      findPacket: vi
        .fn()
        .mockResolvedValueOnce(binding())
        .mockResolvedValueOnce(decided),
    });
    const dependencies = deps({
      store: reviewStore,
      listMessageReactions: vi
        .fn()
        .mockResolvedValue([{ name: '+1', reactorUids: ['U1234567'] }]),
    });
    const service = new CompanyWorkOutcomeReviewService(config(), dependencies);

    await expect(service.runOnce()).resolves.toMatchObject({
      outcome: 'decision_reconciled',
      packetId: '9',
      messageTs: '1800000000.000001',
    });
    expect(dependencies.assess).toHaveBeenCalledWith(
      expect.objectContaining({ assessment: 'clean', assessedAt: NOW }),
    );
    expect(reviewStore.recordDecision).toHaveBeenCalledWith(
      expect.objectContaining({ assessment: 'clean', reaction: '+1' }),
    );
    expect(reviewStore.listCandidates).not.toHaveBeenCalled();
  });

  it('fails closed when the configured operator leaves multiple supported reactions', async () => {
    const reviewStore = store({
      findOpenPacket: vi.fn().mockResolvedValue(binding()),
    });
    const dependencies = deps({
      store: reviewStore,
      listMessageReactions: vi.fn().mockResolvedValue([
        { name: '+1', reactorUids: ['U1234567'] },
        { name: 'bug', reactorUids: ['U1234567'] },
      ]),
    });
    const service = new CompanyWorkOutcomeReviewService(config(), dependencies);

    await expect(service.runOnce()).rejects.toThrow(
      'ambiguous_operator_outcome_review_reactions',
    );
    expect(dependencies.assess).not.toHaveBeenCalled();
    expect(reviewStore.listCandidates).not.toHaveBeenCalled();
  });

  it('claims but refuses an unauthorized reaction without assessing', async () => {
    const dependencies = deps();
    const service = new CompanyWorkOutcomeReviewService(config(), dependencies);
    await expect(
      service.handleReaction('1800000000.000001', {
        jid: 'slack:C_CHIEF',
        reactorUid: 'U7654321',
        reaction: 'rotating_light',
        occurredAt: NOW,
      }),
    ).resolves.toBe(true);
    expect(dependencies.assess).not.toHaveBeenCalled();
    expect(dependencies.postThread).toHaveBeenCalledWith(
      'slack:C_CHIEF',
      '1800000000.000001',
      expect.stringContaining('configured operator'),
    );
  });

  it('does not claim unrelated reactions or messages', async () => {
    const dependencies = deps();
    const service = new CompanyWorkOutcomeReviewService(config(), dependencies);
    await expect(
      service.handleReaction('other', {
        jid: 'slack:C_CHIEF',
        reactorUid: 'U1234567',
        reaction: 'eyes',
        occurredAt: NOW,
      }),
    ).resolves.toBe(false);
    expect(dependencies.store.findPacket).not.toHaveBeenCalled();
  });

  it('claims an exact packet reaction even when assessment fails closed', async () => {
    const dependencies = deps({
      assess: vi.fn().mockRejectedValue(new Error('database unavailable')),
    });
    const service = new CompanyWorkOutcomeReviewService(config(), dependencies);
    await expect(
      service.handleReaction('1800000000.000001', {
        jid: 'slack:C_CHIEF',
        reactorUid: 'U1234567',
        reaction: 'white_check_mark',
        occurredAt: NOW,
      }),
    ).resolves.toBe(true);
    expect(dependencies.store.recordDecision).not.toHaveBeenCalled();
    expect(dependencies.postThread).toHaveBeenCalledWith(
      'slack:C_CHIEF',
      '1800000000.000001',
      expect.stringContaining('could not be durably recorded'),
    );
  });
});

describe('Company Work one-outstanding-packet store gate', () => {
  it('does not list another candidate while any packet awaits a decision', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const reviewStore = new PostgresCompanyWorkOutcomeReviewStore({
      query,
      withAgentContext: vi.fn(),
    } as unknown as CompanyWorkOutcomeReviewStoreDb);

    await expect(
      reviewStore.listCandidates('2026-08-19T00:00:00.000Z', 25),
    ).resolves.toEqual([]);
    expect(query).toHaveBeenCalledOnce();
    expect(query.mock.calls[0][0]).toContain("WHERE p.status <> 'decided'");
  });

  it('serializes claims and refuses a second open packet', async () => {
    const client = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ open: 1 }] }),
    };
    const reviewStore = new PostgresCompanyWorkOutcomeReviewStore({
      query: vi.fn(),
      withAgentContext: async <T>(fn: (client: PoolClient) => Promise<T>) =>
        fn(client as never),
    } as unknown as CompanyWorkOutcomeReviewStoreDb);

    await expect(reviewStore.claimPacket(evidence(), NOW)).resolves.toBeNull();
    expect(client.query).toHaveBeenCalledTimes(2);
    expect(client.query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(client.query.mock.calls[1][0]).toContain("status <> 'decided'");
  });
});
