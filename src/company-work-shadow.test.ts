import { describe, expect, it, vi } from 'vitest';

import { buildApprovedHandoff } from './approved-send-handoff.js';
import {
  fingerprintCompanyWorkTransition,
  planCompanyWorkTransition,
  type CompanyWorkEventIdentity,
  type CompanyWorkItem,
  type CompanyWorkMutationResult,
  type CreateCompanyWorkItemInput,
  type TransitionCompanyWorkItemInput,
} from './company-work-ledger.js';
import {
  CompanyWorkShadowService,
  resolveCompanyWorkShadowConfig,
  runCompanyWorkShadowProjection,
  type CompanyWorkShadowDeps,
} from './company-work-shadow.js';
import type { EmailSendProjectionRow, listEmailSendEvents } from './db.js';
import { hashApprovedEmailContent } from './email-action.js';

const CUSTOMER_EMAIL = 'private.customer@example.com';
const CUSTOMER_BODY = 'This sentence is private customer-facing email copy.';
const CUSTOMER_SUBJECT = 'A private customer subject';
const CHAT = 'slack:C_SALES';
const ROOT_TS = '1755300000.000100';
const DRAFT_TS = '1755300060.000200';
const NOW = '2026-08-14T12:00:00.000Z';

const CARD = `[SALES REVIEW] Lead #472 — bounded projection fixture
Category: followup
Email: ${CUSTOMER_EMAIL}

DRAFT RESPONSE TO LEAD:
---
Subject: ${CUSTOMER_SUBJECT}

${CUSTOMER_BODY}
---

Updated draft ready. Reply "Approved" to send, or reply with more changes.`;

const approved = buildApprovedHandoff(CARD)!;
const APPROVED_HASH = hashApprovedEmailContent(approved.subject, approved.body);

function action(
  overrides: Partial<EmailSendProjectionRow> = {},
): EmailSendProjectionRow {
  return {
    actionId: 'action-good',
    draftTs: DRAFT_TS,
    groupFolder: 'sales',
    chatJid: CHAT,
    threadTs: ROOT_TS,
    leadRef: 'Lead #472',
    approvedContentSha256: APPROVED_HASH,
    approvedAt: NOW,
    state: 'confirmed',
    gmailMessageId: 'gmail-message-1',
    gmailResultThreadId: 'gmail-thread-1',
    ...overrides,
  };
}

type SourceEvent = ReturnType<typeof listEmailSendEvents>[number];

function successEvents(actionId = 'action-good'): SourceEvent[] {
  return [
    { sequence: 1, stage: 'approved', occurredAt: NOW },
    {
      sequence: 2,
      stage: 'handoff_routed',
      occurredAt: '2026-08-14T12:00:01.000Z',
    },
    {
      sequence: 3,
      stage: 'mailman_started',
      occurredAt: '2026-08-14T12:00:02.000Z',
    },
    {
      sequence: 4,
      stage: 'executing',
      occurredAt: '2026-08-14T12:00:03.000Z',
    },
    {
      sequence: 5,
      stage: 'confirmed',
      occurredAt: '2026-08-14T12:00:04.000Z',
      gmailMessageId: `gmail-${actionId}`,
      gmailThreadId: `thread-${actionId}`,
    },
  ];
}

function workItem(
  input: CreateCompanyWorkItemInput,
  id: string,
): CompanyWorkItem {
  return {
    id,
    workflowType: 'sales_email',
    sourceSystem: input.sourceSystem,
    sourceKey: input.sourceKey,
    partyId: input.partyId,
    pipelineEntryId: input.pipelineEntryId,
    completionDefinition: 'gmail_ack_and_thread_close',
    stage: 'accepted',
    disposition: 'open',
    version: 0,
    blockCode: null,
    failureCode: null,
    deadlineAt: input.deadlineAt ?? null,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    lastTransitionAt: input.occurredAt,
    lastTransitionBy: input.actor,
  };
}

class MemoryLedger {
  readonly items = new Map<string, CompanyWorkItem>();
  readonly events = new Map<string, CompanyWorkEventIdentity>();
  readonly captured: unknown[] = [];

  create = async (
    input: CreateCompanyWorkItemInput,
  ): Promise<CompanyWorkMutationResult> => {
    this.captured.push(input);
    const existing = this.items.get(input.sourceKey);
    if (existing) return { item: existing, applied: false, duplicate: true };
    const item = workItem(input, `work-${this.items.size + 1}`);
    this.items.set(input.sourceKey, item);
    return { item, applied: true, duplicate: false };
  };

  transition = async (
    input: TransitionCompanyWorkItemInput,
  ): Promise<CompanyWorkMutationResult> => {
    this.captured.push(input);
    const current = [...this.items.values()].find(
      (candidate) => candidate.id === input.workItemId,
    );
    if (!current) throw new Error('fake_work_item_missing');
    expect(input.expectedVersion).toBe(current.version);
    const planned = planCompanyWorkTransition(current, input.eventType, input);
    const next: CompanyWorkItem = {
      ...current,
      stage: planned.stage,
      disposition: planned.disposition,
      blockCode: planned.blockCode,
      failureCode: planned.failureCode,
      version: current.version + 1,
      updatedAt: input.occurredAt,
      lastTransitionAt: input.occurredAt,
      lastTransitionBy: input.actor,
    };
    this.items.set(current.sourceKey, next);
    this.events.set(`${input.sourceSystem}:${input.sourceEventKey}`, {
      workItemId: current.id,
      workItemVersion: next.version,
      eventFingerprint: fingerprintCompanyWorkTransition(input),
    });
    return { item: next, applied: true, duplicate: false };
  };

  getBySource = async (
    _sourceSystem: string,
    sourceKey: string,
  ): Promise<CompanyWorkItem | null> => this.items.get(sourceKey) ?? null;

  getEvent = async (
    sourceSystem: string,
    sourceEventKey: string,
  ): Promise<CompanyWorkEventIdentity | null> =>
    this.events.get(`${sourceSystem}:${sourceEventKey}`) ?? null;
}

function fixture(
  actions: EmailSendProjectionRow[] = [action()],
  eventOverrides: Record<string, SourceEvent[]> = {},
): { deps: CompanyWorkShadowDeps; ledger: MemoryLedger } {
  const ledger = new MemoryLedger();
  const events = Object.fromEntries(
    actions.map((candidate) => [
      candidate.actionId!,
      eventOverrides[candidate.actionId!] ?? successEvents(candidate.actionId),
    ]),
  );
  const messages = new Map([
    [
      `${CHAT}:${ROOT_TS}`,
      {
        id: ROOT_TS,
        chat_jid: CHAT,
        content: `[HANDOFF: mailman → sales]\nLead ID: 472\nFrom: ${CUSTOMER_EMAIL}`,
        timestamp: '2026-08-14T11:59:00.000Z',
        from_group: 'mailman',
      },
    ],
    [
      `${CHAT}:${DRAFT_TS}`,
      {
        id: DRAFT_TS,
        chat_jid: CHAT,
        content: CARD,
        timestamp: NOW,
        from_group: 'sales',
        thread_ts: ROOT_TS,
      },
    ],
  ]);
  const deps = {
    listActions: vi.fn(() => actions),
    listEvents: vi.fn((actionId: string) => events[actionId] ?? []),
    getMessage: vi.fn((id: string, chatJid: string) =>
      messages.get(`${chatJid}:${id}`),
    ),
    findOutcomeReceipt: vi.fn((actionId: string) => ({
      receipt: {
        messageId: `slack-close-${actionId}`,
        occurredAt: '2026-08-14T12:00:05.000Z',
      },
      ambiguous: false,
    })),
    resolvePipelineIdentity: vi.fn(async (entryId: string) => ({
      pipelineEntryId: entryId,
      partyId: 'party-10136',
    })),
    createWorkItem: ledger.create,
    transitionWorkItem: ledger.transition,
    getWorkItemBySource: ledger.getBySource,
    getEventIdentity: ledger.getEvent,
  } as unknown as CompanyWorkShadowDeps;
  return { deps, ledger };
}

const CONFIG = { since: '2026-08-14T00:00:00.000Z', batchLimit: 100 };

describe('Company OS email shadow projection', () => {
  it('defaults off and fails closed on an enabled configuration without a bound', () => {
    expect(resolveCompanyWorkShadowConfig({})).toMatchObject({
      enabled: false,
      active: false,
      configurationError: null,
    });
    expect(
      resolveCompanyWorkShadowConfig({ COMPANY_WORK_SHADOW_ENABLED: '1' }),
    ).toMatchObject({
      enabled: true,
      active: false,
      configurationError: 'enabled_without_valid_since',
    });
    expect(
      resolveCompanyWorkShadowConfig({
        COMPANY_WORK_SHADOW_ENABLED: '1',
        COMPANY_WORK_SHADOW_SINCE: '2026-08-14T00:00:00Z',
        COMPANY_WORK_SHADOW_INTERVAL_MS: '1',
        COMPANY_WORK_SHADOW_BATCH_LIMIT: '999',
      }),
    ).toMatchObject({
      active: true,
      since: '2026-08-14T00:00:00.000Z',
      intervalMs: 10_000,
      batchLimit: 250,
    });
  });

  it('projects every exact success fact once, then converges on replay', async () => {
    const { deps, ledger } = fixture();
    const first = await runCompanyWorkShadowProjection(deps, CONFIG);
    expect(first).toEqual({
      scanned: 1,
      eligible: 1,
      projected: 1,
      transitionsApplied: 8,
      duplicateFacts: 0,
      completed: 1,
      truncated: false,
      skipped: {},
      errors: {},
    });
    expect(ledger.items.get('action-good')).toMatchObject({
      stage: 'outcome_validated',
      disposition: 'completed',
      version: 7,
    });

    const second = await runCompanyWorkShadowProjection(deps, CONFIG);
    expect(second).toMatchObject({
      transitionsApplied: 0,
      duplicateFacts: 8,
      completed: 1,
      errors: {},
    });

    const captured = JSON.stringify(ledger.captured);
    expect(captured).not.toContain(CUSTOMER_EMAIL);
    expect(captured).not.toContain(CUSTOMER_SUBJECT);
    expect(captured).not.toContain(CUSTOMER_BODY);
  });

  it('preserves exceptions and resumes explicitly before later source facts', async () => {
    const events: SourceEvent[] = [
      { sequence: 1, stage: 'approved', occurredAt: NOW },
      {
        sequence: 2,
        stage: 'blocked',
        code: 'handoff-timeout',
        occurredAt: '2026-08-14T12:00:01.000Z',
      },
      {
        sequence: 3,
        stage: 'handoff_routed',
        occurredAt: '2026-08-14T12:00:02.000Z',
      },
      {
        sequence: 4,
        stage: 'executing',
        occurredAt: '2026-08-14T12:00:03.000Z',
      },
      {
        sequence: 5,
        stage: 'attention_required',
        code: 'uncertain-send',
        occurredAt: '2026-08-14T12:00:04.000Z',
      },
      {
        sequence: 6,
        stage: 'confirmed',
        occurredAt: '2026-08-14T12:00:05.000Z',
        gmailMessageId: 'gmail-action-good',
        gmailThreadId: 'thread-action-good',
      },
    ];
    const { deps, ledger } = fixture([action()], { 'action-good': events });
    const result = await runCompanyWorkShadowProjection(deps, CONFIG);
    expect(result).toMatchObject({
      transitionsApplied: 12,
      completed: 1,
      errors: {},
    });
    expect(
      ledger.captured
        .filter((value): value is TransitionCompanyWorkItemInput =>
          Object.hasOwn(value as object, 'eventType'),
        )
        .map((value) => value.eventType),
    ).toEqual([
      'sales_dispatched',
      'approval_requested',
      'approved',
      'blocked',
      'resumed',
      'mailman_dispatched',
      'action_claimed',
      'failed',
      'resumed',
      'external_acknowledged',
      'outcome_validated',
    ]);
  });

  it('does not clear a terminal source exception when the same history replays', async () => {
    const events: SourceEvent[] = [
      { sequence: 1, stage: 'approved', occurredAt: NOW },
      {
        sequence: 2,
        stage: 'handoff_routed',
        occurredAt: '2026-08-14T12:00:01.000Z',
      },
      {
        sequence: 3,
        stage: 'executing',
        occurredAt: '2026-08-14T12:00:02.000Z',
      },
      {
        sequence: 4,
        stage: 'attention_required',
        code: 'receipt-uncertain',
        occurredAt: '2026-08-14T12:00:03.000Z',
      },
    ];
    const { deps, ledger } = fixture([action()], { 'action-good': events });
    const first = await runCompanyWorkShadowProjection(deps, CONFIG);
    expect(first).toMatchObject({ transitionsApplied: 7, completed: 0 });
    expect(ledger.items.get('action-good')).toMatchObject({
      stage: 'action_claimed',
      disposition: 'failed',
      failureCode: 'attention_required:receipt-uncertain',
    });

    const second = await runCompanyWorkShadowProjection(deps, CONFIG);
    expect(second).toMatchObject({
      transitionsApplied: 0,
      duplicateFacts: 7,
      completed: 0,
      errors: {},
    });
    expect(ledger.items.get('action-good')).toMatchObject({
      stage: 'action_claimed',
      disposition: 'failed',
    });
  });

  it('records a historical source gap without inventing Mailman progress', async () => {
    const events: SourceEvent[] = [
      { sequence: 1, stage: 'approved', occurredAt: NOW },
      {
        sequence: 2,
        stage: 'executing',
        occurredAt: '2026-08-14T12:00:01.000Z',
      },
      {
        sequence: 3,
        stage: 'confirmed',
        occurredAt: '2026-08-14T12:00:02.000Z',
        gmailMessageId: 'gmail-action-good',
        gmailThreadId: 'thread-action-good',
      },
    ];
    const { deps, ledger } = fixture([action()], { 'action-good': events });
    const first = await runCompanyWorkShadowProjection(deps, CONFIG);
    expect(first).toMatchObject({
      eligible: 1,
      projected: 1,
      transitionsApplied: 5,
      completed: 0,
      errors: {},
    });
    expect(ledger.items.get('action-good')).toMatchObject({
      stage: 'approved',
      disposition: 'failed',
      failureCode: 'source_gap:mailman_dispatch_missing',
      version: 4,
    });

    expect(await runCompanyWorkShadowProjection(deps, CONFIG)).toMatchObject({
      transitionsApplied: 0,
      duplicateFacts: 5,
      completed: 0,
      errors: {},
    });
    expect(ledger.items.get('action-good')).toMatchObject({
      stage: 'approved',
      disposition: 'failed',
    });
  });

  it('skips an untrusted origin and isolates one broken action from the next', async () => {
    const badOrigin = action({ actionId: 'bad-origin' });
    const broken = action({ actionId: 'broken' });
    const good = action({ actionId: 'good' });
    const originOnly = fixture([badOrigin]);
    originOnly.deps.getMessage = vi.fn(() => undefined);
    expect(
      await runCompanyWorkShadowProjection(originOnly.deps, CONFIG),
    ).toMatchObject({
      skipped: { not_mailman_sales_origin: 1 },
      projected: 0,
    });

    const isolated = fixture([broken, good], {
      broken: successEvents('broken').map((event) =>
        event.stage === 'confirmed'
          ? { ...event, gmailMessageId: undefined }
          : event,
      ),
    });
    expect(
      await runCompanyWorkShadowProjection(isolated.deps, CONFIG),
    ).toMatchObject({
      scanned: 2,
      projected: 1,
      completed: 1,
      errors: { confirmed_event_missing_gmail_receipt: 1 },
    });
  });

  it('surfaces bounded aggregate status without throwing into the daemon', async () => {
    const { deps } = fixture();
    deps.listActions = vi.fn(() => {
      throw new Error('source_unavailable');
    });
    const service = new CompanyWorkShadowService(deps, {
      enabled: true,
      active: true,
      since: CONFIG.since,
      intervalMs: 60_000,
      batchLimit: 100,
      configurationError: null,
    });
    await expect(service.tick()).resolves.toBeUndefined();
    expect(service.getStatus()).toMatchObject({
      mode: 'shadow',
      running: false,
      totalRuns: 1,
      consecutiveFailures: 1,
      lastErrorCode: 'tick_failed',
    });
    service.stop();
  });
});
