/**
 * Default-off host producer for one operator-reviewed outcome-quality receipt.
 *
 * This module never reads Gmail, Slack, SQLite, customer identity, or message
 * content. The operator supplies an already-reviewed bounded classification
 * plus opaque SHA-256 evidence/source/assessor keys. Dry-run derives the exact
 * current receipt-chain head and a short-lived plan fingerprint. Apply re-reads
 * the same state inside one transaction and refuses any changed plan.
 */

import { createHash } from 'node:crypto';

import type { QueryResult, QueryResultRow } from 'pg';

export const COMPANY_WORK_OUTCOME_ASSESSMENT_CONTRACT_VERSION = 1 as const;
export const COMPANY_WORK_OUTCOME_ASSESSMENT_TASK_ID =
  'NC-20260820-007' as const;
export const COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION =
  'NC-20260820-007-OUTCOME-QUALITY-ASSESSMENT' as const;
export const COMPANY_WORK_OUTCOME_ASSESSMENT_MAX_AGE_MS = 15 * 60 * 1000;
export const COMPANY_WORK_OUTCOME_ASSESSMENT_SOURCE_SYSTEM =
  'operator_review' as const;

export const COMPANY_WORK_OUTCOME_ASSESSMENTS = [
  'clean',
  'customer_visible_defect',
  'customer_visible_reversal',
  'customer_visible_defect_and_reversal',
] as const;

export type CompanyWorkOutcomeAssessment =
  (typeof COMPANY_WORK_OUTCOME_ASSESSMENTS)[number];
export type CompanyWorkOutcomeAssessmentMode = 'dry_run' | 'apply';

export type CompanyWorkOutcomeAssessmentErrorCode =
  | 'invalid_input'
  | 'stale_review'
  | 'ineligible_event'
  | 'ledger_quality_failed'
  | 'source_conflict'
  | 'plan_changed'
  | 'storage_unavailable';

export class CompanyWorkOutcomeAssessmentError extends Error {
  constructor(
    public readonly code: CompanyWorkOutcomeAssessmentErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CompanyWorkOutcomeAssessmentError';
  }
}

export interface CompanyWorkOutcomeAssessmentInput {
  mode: CompanyWorkOutcomeAssessmentMode;
  workItemId: string;
  deliveryEventVersion: number;
  assessment: CompanyWorkOutcomeAssessment;
  sourceKeySha256: string;
  evidenceSha256: string;
  assessorKeySha256: string;
  evidenceOccurredAt: string;
  assessedAt: string;
  expectedPlanSha256: string | null;
  confirmation: typeof COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION | null;
}

export interface CompanyWorkOutcomeAssessmentClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

export interface CompanyWorkOutcomeAssessmentDependencies {
  query: CompanyWorkOutcomeAssessmentClient['query'];
  withTransaction<T>(
    fn: (client: CompanyWorkOutcomeAssessmentClient) => Promise<T>,
  ): Promise<T>;
  now(): string;
}

interface TargetRow extends QueryResultRow {
  work_item_id: string;
  workflow_type: string;
  delivery_event_version: number;
  event_type: string;
  delivery_occurred_at: Date | string;
}

interface ReceiptRow extends QueryResultRow {
  id: string;
  work_item_id: string;
  delivery_event_version: number;
  receipt_version: number;
  assessment_revision: number;
  assessment: string;
  source_system: string;
  source_key_sha256: string;
  evidence_sha256: string;
  assessor_kind: string;
  assessor_key_sha256: string;
  evidence_occurred_at: Date | string;
  assessed_at: Date | string;
  supersedes_receipt_id: string | null;
}

export interface CompanyWorkOutcomeAssessmentPlan {
  contractVersion: typeof COMPANY_WORK_OUTCOME_ASSESSMENT_CONTRACT_VERSION;
  taskId: typeof COMPANY_WORK_OUTCOME_ASSESSMENT_TASK_ID;
  target: {
    workflow: 'sales_email';
    workItemId: string;
    deliveryEventVersion: number;
    deliveryOccurredAt: string;
  };
  assessment: {
    value: CompanyWorkOutcomeAssessment;
    sourceSystem: typeof COMPANY_WORK_OUTCOME_ASSESSMENT_SOURCE_SYSTEM;
    sourceKeySha256: string;
    evidenceSha256: string;
    assessorKind: 'operator';
    assessorKeySha256: string;
    evidenceOccurredAt: string;
    assessedAt: string;
  };
  chain: {
    disposition: 'insert' | 'duplicate';
    assessmentRevision: number;
    supersedesReceiptId: string | null;
    existingReceiptId: string | null;
  };
  authorization: {
    expiresAt: string;
    requiredConfirmation: typeof COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION;
  };
  safety: {
    gmailQueried: false;
    slackQueried: false;
    customerContentRead: false;
    daemonImported: false;
    agentAuthority: 'none';
    externalActionAuthority: 'none';
  };
  planSha256: string;
}

export interface CompanyWorkOutcomeAssessmentReport {
  contractVersion: typeof COMPANY_WORK_OUTCOME_ASSESSMENT_CONTRACT_VERSION;
  taskId: typeof COMPANY_WORK_OUTCOME_ASSESSMENT_TASK_ID;
  mode: CompanyWorkOutcomeAssessmentMode;
  status: 'planned' | 'applied' | 'duplicate';
  plan: CompanyWorkOutcomeAssessmentPlan;
  receipt: {
    inserted: boolean;
    receiptId: string | null;
    assessmentRevision: number;
  };
}

const SHA256_RE = /^[0-9a-f]{64}$/;

const READ_TARGET_SQL = `
SELECT i.id::text AS work_item_id,
       i.workflow_type,
       e.work_item_version AS delivery_event_version,
       e.event_type,
       e.occurred_at AS delivery_occurred_at
  FROM business_v2.company_work_items i
  JOIN business_v2.company_work_events e ON e.work_item_id = i.id
 WHERE i.id = $1::bigint
   AND e.work_item_version = $2::integer
`;

const READ_RECEIPTS_SQL = `
SELECT id::text,
       work_item_id::text,
       delivery_event_version,
       receipt_version,
       assessment_revision,
       assessment,
       source_system,
       source_key_sha256,
       evidence_sha256,
       assessor_kind,
       assessor_key_sha256,
       evidence_occurred_at,
       assessed_at,
       supersedes_receipt_id::text
  FROM business_v2.company_work_outcome_quality_receipts
 WHERE work_item_id = $1::bigint
   AND delivery_event_version = $2::integer
 ORDER BY assessment_revision, id
`;

const READ_SOURCE_SQL = `
SELECT id::text,
       work_item_id::text,
       delivery_event_version,
       receipt_version,
       assessment_revision,
       assessment,
       source_system,
       source_key_sha256,
       evidence_sha256,
       assessor_kind,
       assessor_key_sha256,
       evidence_occurred_at,
       assessed_at,
       supersedes_receipt_id::text
  FROM business_v2.company_work_outcome_quality_receipts
 WHERE source_system = $1
   AND source_key_sha256 = $2
`;

const INSERT_RECEIPT_SQL = `
INSERT INTO business_v2.company_work_outcome_quality_receipts (
  work_item_id,
  delivery_event_version,
  receipt_version,
  assessment_revision,
  assessment,
  source_system,
  source_key_sha256,
  evidence_sha256,
  assessor_kind,
  assessor_key_sha256,
  evidence_occurred_at,
  assessed_at,
  supersedes_receipt_id
) VALUES (
  $1::bigint,
  $2::integer,
  1,
  $3::integer,
  $4,
  $5,
  $6,
  $7,
  'operator',
  $8,
  $9::timestamptz,
  $10::timestamptz,
  $11::bigint
)
RETURNING id::text,
          work_item_id::text,
          delivery_event_version,
          receipt_version,
          assessment_revision,
          assessment,
          source_system,
          source_key_sha256,
          evidence_sha256,
          assessor_kind,
          assessor_key_sha256,
          evidence_occurred_at,
          assessed_at,
          supersedes_receipt_id::text
`;

function fail(
  code: CompanyWorkOutcomeAssessmentErrorCode,
  message: string,
  cause?: unknown,
): never {
  throw new CompanyWorkOutcomeAssessmentError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(',')}}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

function canonicalTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string') fail('invalid_input', `${field} is invalid`);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    fail('invalid_input', `${field} is invalid`);
  }
  const normalized = new Date(milliseconds).toISOString();
  if (normalized !== value) {
    fail('invalid_input', `${field} must be a canonical UTC timestamp`);
  }
  return normalized;
}

function databaseTimestamp(value: Date | string, field: string): string {
  const normalized = value instanceof Date ? value.toISOString() : value;
  const milliseconds = Date.parse(normalized);
  if (!Number.isFinite(milliseconds)) {
    fail('ledger_quality_failed', `${field} is invalid`);
  }
  return new Date(milliseconds).toISOString();
}

function normalizeWorkItemId(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    fail('invalid_input', 'workItemId is invalid');
  }
  try {
    return BigInt(value).toString();
  } catch {
    return fail('invalid_input', 'workItemId is invalid');
  }
}

function normalizeDatabaseId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    fail('ledger_quality_failed', `${field} is invalid`);
  }
  try {
    return BigInt(value).toString();
  } catch {
    return fail('ledger_quality_failed', `${field} is invalid`);
  }
}

function normalizeVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail('invalid_input', 'deliveryEventVersion is invalid');
  }
  return Number(value);
}

function normalizeHash(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    fail('invalid_input', `${field} must be lowercase SHA-256`);
  }
  return value;
}

function normalizeAssessment(value: unknown): CompanyWorkOutcomeAssessment {
  if (
    typeof value !== 'string' ||
    !COMPANY_WORK_OUTCOME_ASSESSMENTS.includes(
      value as CompanyWorkOutcomeAssessment,
    )
  ) {
    fail('invalid_input', 'assessment is invalid');
  }
  return value as CompanyWorkOutcomeAssessment;
}

function normalizeStoredAssessment(
  value: unknown,
): CompanyWorkOutcomeAssessment {
  if (
    typeof value !== 'string' ||
    !COMPANY_WORK_OUTCOME_ASSESSMENTS.includes(
      value as CompanyWorkOutcomeAssessment,
    )
  ) {
    fail('ledger_quality_failed', 'stored assessment is invalid');
  }
  return value as CompanyWorkOutcomeAssessment;
}

function normalizeStoredHash(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SHA256_RE.test(value)) {
    fail('ledger_quality_failed', `${field} is invalid`);
  }
  return value;
}

function normalizeInput(input: CompanyWorkOutcomeAssessmentInput): {
  mode: CompanyWorkOutcomeAssessmentMode;
  workItemId: string;
  deliveryEventVersion: number;
  assessment: CompanyWorkOutcomeAssessment;
  sourceKeySha256: string;
  evidenceSha256: string;
  assessorKeySha256: string;
  evidenceOccurredAt: string;
  assessedAt: string;
  expectedPlanSha256: string | null;
} {
  if (input.mode !== 'dry_run' && input.mode !== 'apply') {
    fail('invalid_input', 'mode is invalid');
  }
  const expectedPlanSha256 =
    input.expectedPlanSha256 === null
      ? null
      : normalizeHash(input.expectedPlanSha256, 'expectedPlanSha256');
  if (input.mode === 'dry_run') {
    if (expectedPlanSha256 !== null || input.confirmation !== null) {
      fail('invalid_input', 'dry-run cannot carry apply authorization');
    }
  } else {
    if (expectedPlanSha256 === null) {
      fail('invalid_input', 'apply requires expectedPlanSha256');
    }
    if (input.confirmation !== COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION) {
      fail('invalid_input', 'apply confirmation is invalid');
    }
  }
  const evidenceOccurredAt = canonicalTimestamp(
    input.evidenceOccurredAt,
    'evidenceOccurredAt',
  );
  const assessedAt = canonicalTimestamp(input.assessedAt, 'assessedAt');
  if (Date.parse(evidenceOccurredAt) > Date.parse(assessedAt)) {
    fail('invalid_input', 'evidence cannot occur after assessment');
  }
  return {
    mode: input.mode,
    workItemId: normalizeWorkItemId(input.workItemId),
    deliveryEventVersion: normalizeVersion(input.deliveryEventVersion),
    assessment: normalizeAssessment(input.assessment),
    sourceKeySha256: normalizeHash(input.sourceKeySha256, 'sourceKeySha256'),
    evidenceSha256: normalizeHash(input.evidenceSha256, 'evidenceSha256'),
    assessorKeySha256: normalizeHash(
      input.assessorKeySha256,
      'assessorKeySha256',
    ),
    evidenceOccurredAt,
    assessedAt,
    expectedPlanSha256,
  };
}

function requireFreshAssessment(assessedAt: string, now: string): string {
  const nowAt = canonicalTimestamp(now, 'now');
  const age = Date.parse(nowAt) - Date.parse(assessedAt);
  if (age < 0 || age > COMPANY_WORK_OUTCOME_ASSESSMENT_MAX_AGE_MS) {
    fail('stale_review', 'assessment is outside the live apply window');
  }
  return new Date(
    Date.parse(assessedAt) + COMPANY_WORK_OUTCOME_ASSESSMENT_MAX_AGE_MS,
  ).toISOString();
}

function normalizeReceiptRow(row: ReceiptRow): ReceiptRow & {
  evidence_occurred_at: string;
  assessed_at: string;
} {
  const id = normalizeDatabaseId(row.id, 'stored receipt ID');
  const workItemId = normalizeDatabaseId(
    row.work_item_id,
    'stored work-item ID',
  );
  const supersedes =
    row.supersedes_receipt_id === null
      ? null
      : normalizeDatabaseId(row.supersedes_receipt_id, 'stored predecessor ID');
  if (
    !Number.isSafeInteger(row.receipt_version) ||
    row.receipt_version !== 1 ||
    !Number.isSafeInteger(row.assessment_revision) ||
    row.assessment_revision < 1 ||
    !Number.isSafeInteger(row.delivery_event_version) ||
    row.delivery_event_version < 0 ||
    typeof row.source_system !== 'string' ||
    !/^[a-z0-9][a-z0-9:_-]{0,63}$/.test(row.source_system) ||
    (row.assessor_kind !== 'operator' && row.assessor_kind !== 'host_rule')
  ) {
    fail('ledger_quality_failed', 'receipt contract is inconsistent');
  }
  return {
    ...row,
    id,
    work_item_id: workItemId,
    supersedes_receipt_id: supersedes,
    assessment: normalizeStoredAssessment(row.assessment),
    source_key_sha256: normalizeStoredHash(
      row.source_key_sha256,
      'stored source key',
    ),
    evidence_sha256: normalizeStoredHash(
      row.evidence_sha256,
      'stored evidence',
    ),
    assessor_key_sha256: normalizeStoredHash(
      row.assessor_key_sha256,
      'stored assessor key',
    ),
    evidence_occurred_at: databaseTimestamp(
      row.evidence_occurred_at,
      'stored evidence timestamp',
    ),
    assessed_at: databaseTimestamp(
      row.assessed_at,
      'stored assessed timestamp',
    ),
  };
}

function validateChain(
  rows: ReceiptRow[],
  workItemId: string,
  deliveryEventVersion: number,
): ReturnType<typeof normalizeReceiptRow> | null {
  const normalized = rows.map(normalizeReceiptRow);
  for (let index = 0; index < normalized.length; index++) {
    const row = normalized[index];
    const previous = normalized[index - 1];
    if (
      row.work_item_id !== workItemId ||
      row.delivery_event_version !== deliveryEventVersion ||
      row.assessment_revision !== index + 1 ||
      (index === 0
        ? row.supersedes_receipt_id !== null
        : row.supersedes_receipt_id !== previous.id) ||
      (previous &&
        Date.parse(row.assessed_at) < Date.parse(previous.assessed_at))
    ) {
      fail('ledger_quality_failed', 'receipt chain is inconsistent');
    }
  }
  return normalized.at(-1) ?? null;
}

function exactDuplicate(
  row: ReturnType<typeof normalizeReceiptRow>,
  input: ReturnType<typeof normalizeInput>,
): boolean {
  return (
    row.work_item_id === input.workItemId &&
    row.delivery_event_version === input.deliveryEventVersion &&
    row.assessment === input.assessment &&
    row.source_system === COMPANY_WORK_OUTCOME_ASSESSMENT_SOURCE_SYSTEM &&
    row.source_key_sha256 === input.sourceKeySha256 &&
    row.evidence_sha256 === input.evidenceSha256 &&
    row.assessor_kind === 'operator' &&
    row.assessor_key_sha256 === input.assessorKeySha256 &&
    row.evidence_occurred_at === input.evidenceOccurredAt &&
    row.assessed_at === input.assessedAt
  );
}

function planFingerprint(
  plan: Omit<CompanyWorkOutcomeAssessmentPlan, 'planSha256'>,
): string {
  // Whether the exact reviewed receipt is not-yet-inserted or already present
  // is an execution result, not a different authorization. Excluding only
  // those two result fields lets a lost-response retry prove duplicate-only
  // idempotency while revision/predecessor and every assessment field remain
  // bound by the fingerprint.
  const {
    disposition: _disposition,
    existingReceiptId: _existing,
    ...chain
  } = plan.chain;
  return sha256([
    'company-work-outcome-assessment-plan:v1',
    { ...plan, chain },
  ]);
}

async function queryRows<T extends QueryResultRow>(
  client: CompanyWorkOutcomeAssessmentClient,
  sql: string,
  values: unknown[],
): Promise<T[]> {
  try {
    return (await client.query<T>(sql, values)).rows;
  } catch (error) {
    if (error instanceof CompanyWorkOutcomeAssessmentError) throw error;
    fail(
      'storage_unavailable',
      'outcome-quality storage is unavailable',
      error,
    );
  }
}

async function buildPlan(
  client: CompanyWorkOutcomeAssessmentClient,
  input: ReturnType<typeof normalizeInput>,
  expiresAt: string,
): Promise<CompanyWorkOutcomeAssessmentPlan> {
  const targets = await queryRows<TargetRow>(client, READ_TARGET_SQL, [
    input.workItemId,
    input.deliveryEventVersion,
  ]);
  if (targets.length !== 1) {
    fail('ineligible_event', 'exact delivery event is unavailable');
  }
  const target = targets[0];
  if (
    normalizeDatabaseId(target.work_item_id, 'target work-item ID') !==
      input.workItemId ||
    target.workflow_type !== 'sales_email' ||
    target.event_type !== 'external_acknowledged' ||
    target.delivery_event_version !== input.deliveryEventVersion
  ) {
    fail('ineligible_event', 'target is not a Sales external acknowledgement');
  }
  const deliveryOccurredAt = databaseTimestamp(
    target.delivery_occurred_at,
    'delivery timestamp',
  );
  if (
    Date.parse(input.evidenceOccurredAt) < Date.parse(deliveryOccurredAt) ||
    Date.parse(input.assessedAt) < Date.parse(deliveryOccurredAt)
  ) {
    fail('invalid_input', 'evidence and assessment cannot precede delivery');
  }

  const receiptRows = await queryRows<ReceiptRow>(client, READ_RECEIPTS_SQL, [
    input.workItemId,
    input.deliveryEventVersion,
  ]);
  const head = validateChain(
    receiptRows,
    input.workItemId,
    input.deliveryEventVersion,
  );
  const sourceRows = await queryRows<ReceiptRow>(client, READ_SOURCE_SQL, [
    COMPANY_WORK_OUTCOME_ASSESSMENT_SOURCE_SYSTEM,
    input.sourceKeySha256,
  ]);
  if (sourceRows.length > 1) {
    fail('ledger_quality_failed', 'review source is not unique');
  }
  const existingSource = sourceRows[0]
    ? normalizeReceiptRow(sourceRows[0])
    : null;
  if (existingSource && !exactDuplicate(existingSource, input)) {
    fail('source_conflict', 'review source already binds a different receipt');
  }
  if (
    existingSource &&
    !receiptRows.some(
      (row) =>
        normalizeDatabaseId(row.id, 'stored receipt ID') === existingSource.id,
    )
  ) {
    fail('ledger_quality_failed', 'review source chain is inconsistent');
  }

  const disposition = existingSource ? 'duplicate' : 'insert';
  const assessmentRevision = existingSource
    ? existingSource.assessment_revision
    : (head?.assessment_revision ?? 0) + 1;
  const supersedesReceiptId = existingSource
    ? existingSource.supersedes_receipt_id
    : (head?.id ?? null);
  const body: Omit<CompanyWorkOutcomeAssessmentPlan, 'planSha256'> = {
    contractVersion: COMPANY_WORK_OUTCOME_ASSESSMENT_CONTRACT_VERSION,
    taskId: COMPANY_WORK_OUTCOME_ASSESSMENT_TASK_ID,
    target: {
      workflow: 'sales_email',
      workItemId: input.workItemId,
      deliveryEventVersion: input.deliveryEventVersion,
      deliveryOccurredAt,
    },
    assessment: {
      value: input.assessment,
      sourceSystem: COMPANY_WORK_OUTCOME_ASSESSMENT_SOURCE_SYSTEM,
      sourceKeySha256: input.sourceKeySha256,
      evidenceSha256: input.evidenceSha256,
      assessorKind: 'operator',
      assessorKeySha256: input.assessorKeySha256,
      evidenceOccurredAt: input.evidenceOccurredAt,
      assessedAt: input.assessedAt,
    },
    chain: {
      disposition,
      assessmentRevision,
      supersedesReceiptId,
      existingReceiptId: existingSource?.id ?? null,
    },
    authorization: {
      expiresAt,
      requiredConfirmation: COMPANY_WORK_OUTCOME_ASSESSMENT_CONFIRMATION,
    },
    safety: {
      gmailQueried: false,
      slackQueried: false,
      customerContentRead: false,
      daemonImported: false,
      agentAuthority: 'none',
      externalActionAuthority: 'none',
    },
  };
  return { ...body, planSha256: planFingerprint(body) };
}

function insertValues(plan: CompanyWorkOutcomeAssessmentPlan): unknown[] {
  return [
    plan.target.workItemId,
    plan.target.deliveryEventVersion,
    plan.chain.assessmentRevision,
    plan.assessment.value,
    plan.assessment.sourceSystem,
    plan.assessment.sourceKeySha256,
    plan.assessment.evidenceSha256,
    plan.assessment.assessorKeySha256,
    plan.assessment.evidenceOccurredAt,
    plan.assessment.assessedAt,
    plan.chain.supersedesReceiptId,
  ];
}

function report(
  mode: CompanyWorkOutcomeAssessmentMode,
  plan: CompanyWorkOutcomeAssessmentPlan,
  receiptId: string | null,
  inserted: boolean,
): CompanyWorkOutcomeAssessmentReport {
  return {
    contractVersion: COMPANY_WORK_OUTCOME_ASSESSMENT_CONTRACT_VERSION,
    taskId: COMPANY_WORK_OUTCOME_ASSESSMENT_TASK_ID,
    mode,
    status: mode === 'dry_run' ? 'planned' : inserted ? 'applied' : 'duplicate',
    plan,
    receipt: {
      inserted,
      receiptId,
      assessmentRevision: plan.chain.assessmentRevision,
    },
  };
}

export async function runCompanyWorkOutcomeAssessment(
  rawInput: CompanyWorkOutcomeAssessmentInput,
  deps: CompanyWorkOutcomeAssessmentDependencies,
): Promise<CompanyWorkOutcomeAssessmentReport> {
  const input = normalizeInput(rawInput);
  const expiresAt = requireFreshAssessment(input.assessedAt, deps.now());
  if (input.mode === 'dry_run') {
    const plan = await buildPlan({ query: deps.query }, input, expiresAt);
    return report(input.mode, plan, plan.chain.existingReceiptId, false);
  }

  return deps.withTransaction(async (client) => {
    const applyExpiresAt = requireFreshAssessment(input.assessedAt, deps.now());
    const plan = await buildPlan(client, input, applyExpiresAt);
    if (plan.planSha256 !== input.expectedPlanSha256) {
      fail('plan_changed', 'review plan changed before apply');
    }
    if (plan.chain.disposition === 'duplicate') {
      return report(input.mode, plan, plan.chain.existingReceiptId, false);
    }
    let insertedRows: ReceiptRow[];
    try {
      insertedRows = (
        await client.query<ReceiptRow>(INSERT_RECEIPT_SQL, insertValues(plan))
      ).rows;
    } catch (error) {
      fail(
        'storage_unavailable',
        'outcome-quality receipt insert failed',
        error,
      );
    }
    if (insertedRows.length !== 1) {
      fail(
        'storage_unavailable',
        'outcome-quality receipt insert was ambiguous',
      );
    }
    const inserted = normalizeReceiptRow(insertedRows[0]);
    if (!exactDuplicate(inserted, input)) {
      fail(
        'storage_unavailable',
        'inserted receipt does not match review plan',
      );
    }
    if (
      inserted.assessment_revision !== plan.chain.assessmentRevision ||
      inserted.supersedes_receipt_id !== plan.chain.supersedesReceiptId
    ) {
      fail('storage_unavailable', 'inserted receipt chain does not match plan');
    }
    return report(input.mode, plan, inserted.id, true);
  });
}
