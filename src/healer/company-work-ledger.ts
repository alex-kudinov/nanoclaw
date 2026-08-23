/**
 * Host-only healer-resolution Company Work writer.
 *
 * This is a dark adapter boundary: it stores opaque incident identity, hashes,
 * typed lifecycle state, and exact receipts only. It does not read raw healer
 * content, invoke an action, post to Slack, or wire itself into the daemon.
 */

import { createHash } from 'node:crypto';

import type { QueryResultRow } from 'pg';

import {
  CompanyWorkLedgerError,
  type CompanyWorkItem,
  type CompanyWorkLedgerClient,
  type CompanyWorkMutationResult,
  type CompanyWorkReceiptInput,
} from '../company-work-ledger.js';
import type {
  ExistingHealerWorkItem,
  HealerCompanyWorkPlanItem,
} from './company-work-projection.js';

export type HealerCompanyWorkEventType =
  | 'blocked'
  | 'reopened'
  | 'outcome_validated';

export interface HealerCompanyWorkTransitionInput {
  workItemId: string;
  expectedVersion: number;
  eventType: HealerCompanyWorkEventType;
  plan: HealerCompanyWorkPlanItem;
  receipt?: CompanyWorkReceiptInput | null;
}

interface HealerWorkItemRow extends QueryResultRow {
  id: string;
  workflow_type: 'healer_resolution';
  source_system: string;
  source_key: string;
  party_id: string | null;
  pipeline_entry_id: string | null;
  completion_definition: 'healer_resolution_receipt';
  stage: CompanyWorkItem['stage'];
  disposition: CompanyWorkItem['disposition'];
  version: number;
  block_code: string | null;
  failure_code: string | null;
  deadline_at: string | null;
  created_at: string;
  updated_at: string;
  last_transition_at: string;
  last_transition_by: string;
}

interface ExistingHealerWorkRow extends HealerWorkItemRow {
  resolution_fingerprint: string | null;
}

interface ExistingEventRow extends QueryResultRow {
  work_item_id: string;
  event_fingerprint: string;
}

interface ReceiptRow extends QueryResultRow {
  id: string;
  work_item_id: string;
  receipt_type: string;
  receipt_system: string;
  receipt_key: string;
  evidence_sha256: string;
  external_action_id: string | null;
  occurred_at: string;
}

interface ObservationRow extends QueryResultRow {
  observation_key: string;
  work_item_id: string;
  catalog_version: number;
  resolution_fingerprint: string;
  disposition: string;
  decision_code: string | null;
  decision_owner: string | null;
  decision_actor_sha256: string | null;
  evidence_sha256: string;
  observed_at: string;
}

interface PlannedState {
  stage: CompanyWorkItem['stage'];
  disposition: CompanyWorkItem['disposition'];
  blockCode: string | null;
}

const ACTOR = 'healer-resolution-work:host';
const ITEM_COLUMNS = `
  id::text, workflow_type, source_system, source_key, party_id::text,
  pipeline_entry_id::text, completion_definition, stage, disposition, version,
  block_code, failure_code, deadline_at::text, created_at::text,
  updated_at::text, last_transition_at::text, last_transition_by
`;
const SHA256_RE = /^[0-9a-f]{64}$/;
const OPAQUE_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/;

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function invalid(message: string): never {
  throw new CompanyWorkLedgerError('invalid_input', message);
}

function assertOpaque(value: string | null, label: string): void {
  if (!value || !OPAQUE_RE.test(value) || value.includes('://')) {
    invalid(`${label} must be an opaque identifier`);
  }
}

function assertHash(value: string | null, label: string): void {
  if (!value || !SHA256_RE.test(value)) {
    invalid(`${label} must be a lowercase SHA-256 digest`);
  }
}

function assertTimestamp(value: string): void {
  if (!Number.isFinite(Date.parse(value))) invalid('observedAt is invalid');
}

function validatePlan(plan: HealerCompanyWorkPlanItem): void {
  assertOpaque(plan.sourceSystem, 'sourceSystem');
  assertOpaque(plan.sourceKey, 'sourceKey');
  assertHash(plan.resolutionFingerprint, 'resolutionFingerprint');
  assertHash(plan.evidenceSha256, 'evidenceSha256');
  assertTimestamp(plan.observedAt);
  if (plan.blockCode) assertOpaque(plan.blockCode, 'blockCode');
  if (plan.decisionCode) assertOpaque(plan.decisionCode, 'decisionCode');
  if (plan.decisionOwner) assertOpaque(plan.decisionOwner, 'decisionOwner');
  if (plan.decisionActorSha256) {
    assertHash(plan.decisionActorSha256, 'decisionActorSha256');
  }
  if (plan.workflowType !== 'healer_resolution') {
    invalid('workflowType must be healer_resolution');
  }
  if (plan.completionDefinition !== 'healer_resolution_receipt') {
    invalid('completionDefinition must be healer_resolution_receipt');
  }
  const pending = plan.decisionCode !== null;
  if (pending !== (plan.resolutionDisposition === 'pending_decision')) {
    invalid('resolutionDisposition and pending decision fields disagree');
  }
  if (
    pending !== (plan.decisionOwner !== null) ||
    pending !== Boolean(plan.blockCode)
  ) {
    invalid(
      'pending healer decisions require code, owner, and blockCode together',
    );
  }
  if (
    (plan.resolutionDisposition === 'decided_no_action') !==
    Boolean(plan.decisionActorSha256)
  ) {
    invalid('named no-action state and decisionActorSha256 must agree');
  }
}

function toItem(row: HealerWorkItemRow): CompanyWorkItem {
  return {
    id: row.id,
    workflowType: row.workflow_type,
    sourceSystem: row.source_system,
    sourceKey: row.source_key,
    partyId: row.party_id,
    pipelineEntryId: row.pipeline_entry_id,
    completionDefinition: row.completion_definition,
    stage: row.stage,
    disposition: row.disposition,
    version: row.version,
    blockCode: row.block_code,
    failureCode: row.failure_code,
    deadlineAt: row.deadline_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastTransitionAt: row.last_transition_at,
    lastTransitionBy: row.last_transition_by,
  };
}

function validateItem(item: CompanyWorkItem): void {
  if (
    item.workflowType !== 'healer_resolution' ||
    item.partyId !== null ||
    item.pipelineEntryId !== null ||
    item.completionDefinition !== 'healer_resolution_receipt'
  ) {
    throw new CompanyWorkLedgerError(
      'conflict',
      'healer source identity resolved to incompatible work',
    );
  }
}

function identity(
  plan: HealerCompanyWorkPlanItem,
  eventType: HealerCompanyWorkEventType | 'accepted',
  expectedVersion: number,
): { sourceEventKey: string; idempotencyKey: string; fingerprint: string } {
  const hash = digest([
    'healer-resolution-event-v1',
    plan.sourceKey,
    plan.resolutionFingerprint,
    plan.evidenceSha256,
    plan.observedAt,
    eventType,
    expectedVersion,
    plan.blockCode,
    plan.decisionActorSha256,
  ]);
  return {
    sourceEventKey: `healer-resolution:${hash}:${eventType}`,
    idempotencyKey: `healer-resolution:${hash}:${eventType}:transition`,
    fingerprint: hash,
  };
}

async function loadById(
  client: CompanyWorkLedgerClient,
  id: string,
  forUpdate: boolean,
): Promise<CompanyWorkItem> {
  const result = await client.query<HealerWorkItemRow>(
    `SELECT ${ITEM_COLUMNS}
       FROM business_v2.company_work_items
      WHERE id = $1${forUpdate ? ' FOR UPDATE' : ''}`,
    [id],
  );
  if (!result.rows[0]) {
    throw new CompanyWorkLedgerError('not_found', `work item ${id} not found`);
  }
  const item = toItem(result.rows[0]);
  validateItem(item);
  return item;
}

export function planHealerCompanyWorkTransition(
  current: Pick<CompanyWorkItem, 'stage' | 'disposition'>,
  eventType: HealerCompanyWorkEventType,
  options: {
    blockCode?: string | null;
    receipt?: CompanyWorkReceiptInput | null;
    evidenceSha256?: string | null;
  } = {},
): PlannedState {
  if (eventType === 'blocked') {
    if (
      current.stage !== 'accepted' ||
      !['open', 'blocked'].includes(current.disposition) ||
      !options.blockCode ||
      options.receipt
    ) {
      throw new CompanyWorkLedgerError(
        'invalid_transition',
        `invalid ${current.stage}/${current.disposition} -> blocked transition`,
      );
    }
    return {
      stage: 'accepted',
      disposition: 'blocked',
      blockCode: options.blockCode,
    };
  }
  if (eventType === 'reopened') {
    if (
      !['completed', 'cancelled'].includes(current.disposition) ||
      options.blockCode ||
      options.receipt
    ) {
      throw new CompanyWorkLedgerError(
        'invalid_transition',
        `invalid ${current.stage}/${current.disposition} -> reopened transition`,
      );
    }
    return { stage: 'accepted', disposition: 'open', blockCode: null };
  }
  if (
    current.stage !== 'accepted' ||
    current.disposition !== 'blocked' ||
    options.blockCode ||
    !options.evidenceSha256 ||
    !options.receipt ||
    options.receipt.type !== 'outcome_validation' ||
    !options.receipt.externalActionId ||
    options.receipt.evidenceSha256 !== options.evidenceSha256
  ) {
    throw new CompanyWorkLedgerError(
      'invalid_transition',
      `invalid ${current.stage}/${current.disposition} -> outcome_validated transition`,
    );
  }
  return {
    stage: 'outcome_validated',
    disposition: 'completed',
    blockCode: null,
  };
}

export async function readExistingHealerWorkItemsWithClient(
  client: CompanyWorkLedgerClient,
): Promise<Array<ExistingHealerWorkItem & { item: CompanyWorkItem }>> {
  const result = await client.query<ExistingHealerWorkRow>(
    `SELECT ${ITEM_COLUMNS}, o.resolution_fingerprint
       FROM business_v2.company_work_items i
       LEFT JOIN LATERAL (
         SELECT resolution_fingerprint
           FROM business_v2.company_healer_resolution_observations
          WHERE work_item_id = i.id
          ORDER BY observed_at DESC, id DESC
          LIMIT 1
       ) o ON true
      WHERE i.workflow_type = 'healer_resolution'
      ORDER BY i.id
      FOR UPDATE OF i`,
  );
  return result.rows.map((row) => {
    const item = toItem(row);
    validateItem(item);
    if (
      !['open', 'blocked', 'completed', 'cancelled'].includes(item.disposition)
    ) {
      throw new CompanyWorkLedgerError(
        'conflict',
        `healer work item ${item.id} has unsupported disposition ${item.disposition}`,
      );
    }
    return {
      item,
      sourceKey: item.sourceKey,
      disposition: item.disposition as ExistingHealerWorkItem['disposition'],
      version: item.version,
      resolutionFingerprint: row.resolution_fingerprint ?? '',
      blockCode: item.blockCode,
    };
  });
}

export async function ensureHealerWorkItemWithClient(
  client: CompanyWorkLedgerClient,
  plan: HealerCompanyWorkPlanItem,
): Promise<CompanyWorkMutationResult> {
  validatePlan(plan);
  const accepted = identity(plan, 'accepted', 0);
  const inserted = await client.query<HealerWorkItemRow>(
    `INSERT INTO business_v2.company_work_items
       (workflow_type, source_system, source_key, party_id,
        pipeline_entry_id, completion_definition, deadline_at,
        last_transition_at, last_transition_by)
     VALUES ('healer_resolution', $1, $2, NULL, NULL,
             'healer_resolution_receipt', NULL, $3, $4)
     ON CONFLICT (workflow_type, source_system, source_key) DO NOTHING
     RETURNING ${ITEM_COLUMNS}`,
    [plan.sourceSystem, plan.sourceKey, plan.observedAt, ACTOR],
  );
  if (!inserted.rows[0]) {
    const existing = await client.query<HealerWorkItemRow>(
      `SELECT ${ITEM_COLUMNS}
         FROM business_v2.company_work_items
        WHERE workflow_type = 'healer_resolution'
          AND source_system = $1 AND source_key = $2
        FOR UPDATE`,
      [plan.sourceSystem, plan.sourceKey],
    );
    if (!existing.rows[0]) {
      throw new CompanyWorkLedgerError(
        'conflict',
        'healer create lost its uniqueness race without a durable row',
      );
    }
    const item = toItem(existing.rows[0]);
    validateItem(item);
    return { item, applied: false, duplicate: true };
  }
  const item = toItem(inserted.rows[0]);
  await client.query(
    `INSERT INTO business_v2.company_work_events
       (work_item_id, work_item_version, event_type, from_stage, to_stage,
        from_disposition, to_disposition, actor, source_system,
        source_event_key, idempotency_key, event_fingerprint,
        evidence_sha256, occurred_at)
     VALUES ($1, 0, 'accepted', NULL, 'accepted', NULL, 'open', $2, $3, $4,
             $5, $6, $7, $8)`,
    [
      item.id,
      ACTOR,
      plan.sourceSystem,
      accepted.sourceEventKey,
      accepted.idempotencyKey,
      accepted.fingerprint,
      plan.resolutionFingerprint,
      plan.observedAt,
    ],
  );
  return { item, applied: true, duplicate: false };
}

function validateReceipt(receipt: CompanyWorkReceiptInput): void {
  assertOpaque(receipt.system, 'receipt.system');
  assertOpaque(receipt.key, 'receipt.key');
  assertHash(receipt.evidenceSha256, 'receipt.evidenceSha256');
  assertTimestamp(receipt.occurredAt);
  if (receipt.externalActionId) {
    assertOpaque(receipt.externalActionId, 'receipt.externalActionId');
  }
}

async function insertReceipt(
  client: CompanyWorkLedgerClient,
  workItemId: string,
  receipt: CompanyWorkReceiptInput,
): Promise<string> {
  validateReceipt(receipt);
  const inserted = await client.query<ReceiptRow>(
    `INSERT INTO business_v2.company_work_receipts
       (work_item_id, receipt_type, receipt_system, receipt_key,
        evidence_sha256, external_action_id, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (receipt_system, receipt_key) DO NOTHING
     RETURNING id::text, work_item_id::text, receipt_type, receipt_system,
               receipt_key, evidence_sha256, external_action_id,
               occurred_at::text`,
    [
      workItemId,
      receipt.type,
      receipt.system,
      receipt.key,
      receipt.evidenceSha256,
      receipt.externalActionId ?? null,
      receipt.occurredAt,
    ],
  );
  let row = inserted.rows[0];
  if (!row) {
    const existing = await client.query<ReceiptRow>(
      `SELECT id::text, work_item_id::text, receipt_type, receipt_system,
              receipt_key, evidence_sha256, external_action_id,
              occurred_at::text
         FROM business_v2.company_work_receipts
        WHERE receipt_system = $1 AND receipt_key = $2
        FOR UPDATE`,
      [receipt.system, receipt.key],
    );
    row = existing.rows[0];
  }
  if (
    !row ||
    row.work_item_id !== workItemId ||
    row.receipt_type !== receipt.type ||
    row.receipt_system !== receipt.system ||
    row.receipt_key !== receipt.key ||
    row.evidence_sha256 !== receipt.evidenceSha256 ||
    row.external_action_id !== (receipt.externalActionId ?? null) ||
    Date.parse(row.occurred_at) !== Date.parse(receipt.occurredAt)
  ) {
    throw new CompanyWorkLedgerError(
      'conflict',
      'healer receipt identity was reused with different evidence',
    );
  }
  return row.id;
}

export async function transitionHealerWorkItemWithClient(
  client: CompanyWorkLedgerClient,
  input: HealerCompanyWorkTransitionInput,
): Promise<CompanyWorkMutationResult> {
  validatePlan(input.plan);
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 0) {
    invalid('expectedVersion must be a non-negative integer');
  }
  const event = identity(input.plan, input.eventType, input.expectedVersion);
  const duplicate = await client.query<ExistingEventRow>(
    `SELECT work_item_id::text, event_fingerprint
       FROM business_v2.company_work_events
      WHERE idempotency_key = $1
         OR (source_system = $2 AND source_event_key = $3)
      ORDER BY id`,
    [event.idempotencyKey, input.plan.sourceSystem, event.sourceEventKey],
  );
  if (duplicate.rows.length > 1) {
    throw new CompanyWorkLedgerError(
      'conflict',
      'healer transition identities resolve differently',
    );
  }
  if (duplicate.rows[0]) {
    if (
      duplicate.rows[0].work_item_id !== input.workItemId ||
      duplicate.rows[0].event_fingerprint !== event.fingerprint
    ) {
      throw new CompanyWorkLedgerError(
        'conflict',
        'healer transition identity was reused with different facts',
      );
    }
    return {
      item: await loadById(client, input.workItemId, false),
      applied: false,
      duplicate: true,
    };
  }

  const current = await loadById(client, input.workItemId, true);
  if (current.version !== input.expectedVersion) {
    throw new CompanyWorkLedgerError(
      'stale_version',
      `work item ${current.id} is version ${current.version}, not ${input.expectedVersion}`,
    );
  }
  const next = planHealerCompanyWorkTransition(current, input.eventType, {
    blockCode: input.eventType === 'blocked' ? input.plan.blockCode : null,
    receipt: input.receipt,
    evidenceSha256: input.plan.resolutionFingerprint,
  });
  const receiptId = input.receipt
    ? await insertReceipt(client, current.id, input.receipt)
    : null;
  const updated = await client.query<HealerWorkItemRow>(
    `UPDATE business_v2.company_work_items
        SET stage = $2, disposition = $3, version = version + 1,
            block_code = $4, failure_code = NULL,
            updated_at = now(), last_transition_at = $5,
            last_transition_by = $6
      WHERE id = $1 AND version = $7
      RETURNING ${ITEM_COLUMNS}`,
    [
      current.id,
      next.stage,
      next.disposition,
      next.blockCode,
      input.plan.observedAt,
      ACTOR,
      input.expectedVersion,
    ],
  );
  if (!updated.rows[0]) {
    throw new CompanyWorkLedgerError(
      'stale_version',
      `work item ${current.id} changed during healer transition`,
    );
  }
  const item = toItem(updated.rows[0]);
  await client.query(
    `INSERT INTO business_v2.company_work_events
       (work_item_id, work_item_version, event_type, from_stage, to_stage,
        from_disposition, to_disposition, actor, source_system,
        source_event_key, idempotency_key, event_fingerprint,
        evidence_sha256, exception_code, receipt_id, occurred_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
             $14, $15, $16)`,
    [
      current.id,
      item.version,
      input.eventType,
      current.stage,
      item.stage,
      current.disposition,
      item.disposition,
      ACTOR,
      input.plan.sourceSystem,
      event.sourceEventKey,
      event.idempotencyKey,
      event.fingerprint,
      input.plan.resolutionFingerprint,
      input.eventType === 'blocked' ? input.plan.blockCode : null,
      receiptId,
      input.plan.observedAt,
    ],
  );
  return { item, applied: true, duplicate: false };
}

function observationKey(plan: HealerCompanyWorkPlanItem): string {
  return `healer-observation:${digest([
    plan.sourceKey,
    plan.resolutionFingerprint,
    plan.observedAt,
  ])}`;
}

function observationMatches(
  row: ObservationRow,
  item: CompanyWorkItem,
  plan: HealerCompanyWorkPlanItem,
): boolean {
  return (
    row.observation_key === observationKey(plan) &&
    row.work_item_id === item.id &&
    row.catalog_version === plan.contractVersion &&
    row.resolution_fingerprint === plan.resolutionFingerprint &&
    row.disposition === plan.resolutionDisposition &&
    row.decision_code === plan.decisionCode &&
    row.decision_owner === plan.decisionOwner &&
    row.decision_actor_sha256 === plan.decisionActorSha256 &&
    row.evidence_sha256 === plan.evidenceSha256 &&
    Date.parse(row.observed_at) === Date.parse(plan.observedAt)
  );
}

export async function recordHealerObservationWithClient(
  client: CompanyWorkLedgerClient,
  item: CompanyWorkItem,
  plan: HealerCompanyWorkPlanItem,
): Promise<boolean> {
  validatePlan(plan);
  validateItem(item);
  const key = observationKey(plan);
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO business_v2.company_healer_resolution_observations
       (observation_key, work_item_id, catalog_version,
        resolution_fingerprint, disposition, decision_code, decision_owner,
        decision_actor_sha256, evidence_sha256, observed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (observation_key) DO NOTHING
     RETURNING id::text`,
    [
      key,
      item.id,
      plan.contractVersion,
      plan.resolutionFingerprint,
      plan.resolutionDisposition,
      plan.decisionCode,
      plan.decisionOwner,
      plan.decisionActorSha256,
      plan.evidenceSha256,
      plan.observedAt,
    ],
  );
  if (inserted.rows[0]) return true;
  const existing = await client.query<ObservationRow>(
    `SELECT observation_key, work_item_id::text, catalog_version,
            resolution_fingerprint, disposition, decision_code,
            decision_owner, decision_actor_sha256, evidence_sha256,
            observed_at::text
       FROM business_v2.company_healer_resolution_observations
      WHERE observation_key = $1`,
    [key],
  );
  if (!existing.rows[0] || !observationMatches(existing.rows[0], item, plan)) {
    throw new CompanyWorkLedgerError(
      'conflict',
      'healer observation identity was reused with different evidence',
    );
  }
  return false;
}
