import { describe, expect, it, vi } from 'vitest';

import {
  COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION,
  COMPANY_WORK_OUTCOME_ASSESSMENT_MAX_AGE_MS,
  CompanyWorkOutcomeAssessmentError,
  runCompanyWorkOutcomeAssessment,
  type CompanyWorkOutcomeAssessmentClient,
  type CompanyWorkOutcomeAssessmentDependencies,
  type CompanyWorkOutcomeAssessmentInput,
} from './company-work-outcome-quality-assessment.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const NOW = '2026-08-20T12:05:00.000Z';
const DELIVERY_AT = '2026-08-20T11:00:00.000Z';
const EVIDENCE_AT = '2026-08-20T11:30:00.000Z';
const ASSESSED_AT = '2026-08-20T12:00:00.000Z';

function result<T>(rows: T[]) {
  return { rows, rowCount: rows.length } as never;
}

function target(overrides: Record<string, unknown> = {}) {
  return {
    work_item_id: '41',
    workflow_type: 'sales_email',
    delivery_event_version: 7,
    event_type: 'external_acknowledged',
    delivery_occurred_at: DELIVERY_AT,
    ...overrides,
  };
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    id: '80',
    work_item_id: '41',
    delivery_event_version: 7,
    receipt_version: 1,
    assessment_revision: 1,
    assessment: 'clean',
    source_system: 'operator_review',
    source_key_sha256: HASH_A,
    evidence_sha256: HASH_B,
    assessor_kind: 'operator',
    assessor_key_sha256: HASH_C,
    evidence_occurred_at: EVIDENCE_AT,
    assessed_at: ASSESSED_AT,
    supersedes_receipt_id: null,
    ...overrides,
  };
}

function input(
  overrides: Partial<CompanyWorkOutcomeAssessmentInput> = {},
): CompanyWorkOutcomeAssessmentInput {
  return {
    mode: 'dry_run',
    workItemId: '41',
    deliveryEventVersion: 7,
    assessment: 'clean',
    sourceKeySha256: HASH_A,
    evidenceSha256: HASH_B,
    assessorKeySha256: HASH_C,
    evidenceOccurredAt: EVIDENCE_AT,
    assessedAt: ASSESSED_AT,
    expectedPlanSha256: null,
    confirmation: null,
    ...overrides,
  };
}

function dryRunDependencies(
  responses: unknown[][] = [[target()], [], []],
): CompanyWorkOutcomeAssessmentDependencies & {
  query: ReturnType<typeof vi.fn>;
  withTransaction: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn();
  for (const rows of responses) query.mockResolvedValueOnce(result(rows));
  return {
    query,
    withTransaction: vi.fn(),
    now: () => NOW,
  } as unknown as CompanyWorkOutcomeAssessmentDependencies & {
    query: ReturnType<typeof vi.fn>;
    withTransaction: ReturnType<typeof vi.fn>;
  };
}

function applyDependencies(responses: unknown[][]): {
  deps: CompanyWorkOutcomeAssessmentDependencies;
  query: ReturnType<typeof vi.fn>;
  withTransaction: ReturnType<typeof vi.fn>;
} {
  const query = vi.fn();
  for (const rows of responses) query.mockResolvedValueOnce(result(rows));
  const client: CompanyWorkOutcomeAssessmentClient = { query };
  const withTransaction = vi.fn(
    async <T>(fn: (value: CompanyWorkOutcomeAssessmentClient) => Promise<T>) =>
      fn(client),
  );
  return {
    deps: {
      query: vi.fn(),
      withTransaction:
        withTransaction as unknown as CompanyWorkOutcomeAssessmentDependencies['withTransaction'],
      now: () => NOW,
    },
    query,
    withTransaction,
  };
}

async function initialPlanSha256(): Promise<string> {
  const deps = dryRunDependencies();
  return (await runCompanyWorkOutcomeAssessment(input(), deps)).plan.planSha256;
}

function errorCode(error: unknown): string | undefined {
  return error instanceof CompanyWorkOutcomeAssessmentError
    ? error.code
    : undefined;
}

describe('Company Work outcome-quality assessment producer', () => {
  it('dry-runs one content-free initial receipt plan without a transaction', async () => {
    const deps = dryRunDependencies();

    const report = await runCompanyWorkOutcomeAssessment(input(), deps);

    expect(report).toMatchObject({
      contractVersion: 1,
      taskId: 'NC-20260820-007',
      mode: 'dry_run',
      status: 'planned',
      plan: {
        target: {
          workflow: 'sales_email',
          workItemId: '41',
          deliveryEventVersion: 7,
          deliveryOccurredAt: DELIVERY_AT,
        },
        chain: {
          disposition: 'insert',
          assessmentRevision: 1,
          supersedesReceiptId: null,
          existingReceiptId: null,
        },
        safety: {
          gmailQueried: false,
          slackQueried: false,
          customerContentRead: false,
          daemonImported: false,
          agentAuthority: 'none',
          externalActionAuthority: 'none',
        },
      },
      receipt: { inserted: false, receiptId: null, assessmentRevision: 1 },
    });
    expect(report.plan.planSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.plan.authorization.expiresAt).toBe(
      new Date(
        Date.parse(ASSESSED_AT) + COMPANY_WORK_OUTCOME_ASSESSMENT_MAX_AGE_MS,
      ).toISOString(),
    );
    expect(deps.query).toHaveBeenCalledTimes(3);
    expect(deps.withTransaction).not.toHaveBeenCalled();
    const sql = deps.query.mock.calls.map(([text]) => text).join('\n');
    expect(sql).not.toMatch(
      /\bparties\b|pending_sends|\bmessages\b|gmail|slack/i,
    );
  });

  it('re-plans inside one transaction and inserts only the exact preview', async () => {
    const planSha256 = await initialPlanSha256();
    const inserted = receipt({ id: '81' });
    const { deps, query, withTransaction } = applyDependencies([
      [target()],
      [],
      [],
      [inserted],
    ]);

    const report = await runCompanyWorkOutcomeAssessment(
      input({
        mode: 'apply',
        expectedPlanSha256: planSha256,
        confirmation: COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION,
      }),
      deps,
    );

    expect(withTransaction).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls[3]?.[0]).toContain(
      'INSERT INTO business_v2.company_work_outcome_quality_receipts',
    );
    expect(report).toMatchObject({
      status: 'applied',
      receipt: { inserted: true, receiptId: '81', assessmentRevision: 1 },
    });
  });

  it('refuses a stale or changed preview before the insert', async () => {
    const { deps, query } = applyDependencies([[target()], [], []]);

    await expect(
      runCompanyWorkOutcomeAssessment(
        input({
          mode: 'apply',
          expectedPlanSha256: 'd'.repeat(64),
          confirmation: COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION,
        }),
        deps,
      ),
    ).rejects.toSatisfy(
      (error: unknown) => errorCode(error) === 'plan_changed',
    );
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('chains after a valid host-rule correction without granting host-rule input', async () => {
    const prior = receipt({
      id: '77',
      source_system: 'bounded_host_rule',
      source_key_sha256: 'd'.repeat(64),
      evidence_sha256: 'e'.repeat(64),
      assessor_kind: 'host_rule',
      assessor_key_sha256: 'f'.repeat(64),
    });
    const deps = dryRunDependencies([[target()], [prior], []]);

    const report = await runCompanyWorkOutcomeAssessment(
      input({ assessment: 'customer_visible_defect' }),
      deps,
    );

    expect(report.plan.chain).toEqual({
      disposition: 'insert',
      assessmentRevision: 2,
      supersedesReceiptId: '77',
      existingReceiptId: null,
    });
    expect(report.plan.assessment.assessorKind).toBe('operator');
  });

  it('returns exact-source replay as a duplicate without inserting', async () => {
    const existing = receipt();
    const originalPlanSha256 = await initialPlanSha256();

    const { deps, query } = applyDependencies([
      [target()],
      [existing],
      [existing],
    ]);
    const replay = await runCompanyWorkOutcomeAssessment(
      input({
        mode: 'apply',
        expectedPlanSha256: originalPlanSha256,
        confirmation: COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION,
      }),
      deps,
    );

    expect(replay).toMatchObject({
      status: 'duplicate',
      receipt: { inserted: false, receiptId: '80' },
    });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('fails closed on source reuse, malformed chains, and non-delivery targets', async () => {
    const conflict = receipt({ work_item_id: '99' });
    await expect(
      runCompanyWorkOutcomeAssessment(
        input(),
        dryRunDependencies([[target()], [], [conflict]]),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => errorCode(error) === 'source_conflict',
    );

    const malformed = receipt({ assessment_revision: 2 });
    await expect(
      runCompanyWorkOutcomeAssessment(
        input(),
        dryRunDependencies([[target()], [malformed], []]),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => errorCode(error) === 'ledger_quality_failed',
    );

    await expect(
      runCompanyWorkOutcomeAssessment(
        input(),
        dryRunDependencies([[target({ event_type: 'outcome_validated' })]]),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => errorCode(error) === 'ineligible_event',
    );
  });

  it('refuses stale reviews, missing apply authorization, and pre-delivery evidence', async () => {
    await expect(
      runCompanyWorkOutcomeAssessment(
        input({ assessedAt: '2026-08-20T11:49:00.000Z' }),
        dryRunDependencies(),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => errorCode(error) === 'stale_review',
    );

    await expect(
      runCompanyWorkOutcomeAssessment(
        input({ mode: 'apply' }),
        dryRunDependencies(),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => errorCode(error) === 'invalid_input',
    );

    await expect(
      runCompanyWorkOutcomeAssessment(
        input({ evidenceOccurredAt: '2026-08-20T10:59:59.000Z' }),
        dryRunDependencies(),
      ),
    ).rejects.toSatisfy(
      (error: unknown) => errorCode(error) === 'invalid_input',
    );
  });

  it('does not echo source evidence or operator identity because raw values are never inputs', async () => {
    const report = await runCompanyWorkOutcomeAssessment(
      input({ assessment: 'customer_visible_reversal' }),
      dryRunDependencies(),
    );
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('lead@example.com');
    expect(serialized).not.toContain('customer message');
    expect(serialized).not.toContain('operator@example.com');
    expect(serialized).toContain(HASH_A);
    expect(serialized).toContain(HASH_B);
    expect(serialized).toContain(HASH_C);
  });
});
