/**
 * Host-only durable projection for the pure follow-up policy.
 *
 * This store is intentionally unwired. It persists only opaque identities,
 * policy decisions, timestamps, and SHA-256 evidence. Existing source systems
 * and approved-email ledgers retain all source and action authority.
 */

import { createHash } from 'crypto';
import type { QueryResult, QueryResultRow } from 'pg';

import { withAgentContext } from './business-db.js';
import {
  evaluateFollowup,
  followupDecisionFingerprint,
  type FollowupCase,
  type FollowupDecision,
  type FollowupDisposition,
  type FollowupLane,
  type FollowupNextAction,
} from './followup-policy.js';

const ACTOR = 'followup-case-store:host';
const OPAQUE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

export interface FollowupCaseStoreClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

export interface ProjectFollowupCaseInput {
  sourceSystem: string;
  sourceEventKey: string;
  idempotencyKey: string;
  sourceFingerprint: string;
  actor: string;
  occurredAt: string;
  case: FollowupCase;
}

export interface DurableFollowupCase {
  id: string;
  lane: FollowupLane;
  sourceSystem: string;
  sourceKey: string;
  partyId: string | null;
  pipelineEntryId: string | null;
  ownerGroup: 'sales' | 'contador';
  policyVersion: string;
  sourceFingerprint: string;
  decisionFingerprint: string;
  disposition: FollowupDisposition;
  reasonCode: string;
  nextAction: FollowupNextAction;
  sequence: number | null;
  nextEligibleBusinessDate: string | null;
  confirmedAttemptCount: number;
  blockCode: string | null;
  terminalCode: string | null;
  version: number;
  lastObservedAt: string;
  lastChangedAt: string;
}

export interface ProjectFollowupCaseResult {
  item: DurableFollowupCase;
  decision: FollowupDecision;
  applied: boolean;
  duplicate: boolean;
}

interface CaseRow extends QueryResultRow {
  id: string;
  lane: FollowupLane;
  source_system: string;
  source_key: string;
  party_id: string | null;
  pipeline_entry_id: string | null;
  owner_group: 'sales' | 'contador';
  policy_version: string;
  source_fingerprint: string;
  decision_fingerprint: string;
  disposition: FollowupDisposition;
  reason_code: string;
  next_action: FollowupNextAction;
  sequence_no: number | null;
  next_eligible_business_date: string | null;
  confirmed_attempt_count: number;
  block_code: string | null;
  terminal_code: string | null;
  version: number;
  last_observed_at: string;
  last_changed_at: string;
}

interface ExistingEventRow extends QueryResultRow {
  case_id: string;
  event_fingerprint: string;
}

const CASE_COLUMNS = `
  id::text, lane, source_system, source_key, party_id::text,
  pipeline_entry_id::text, owner_group, policy_version, source_fingerprint,
  decision_fingerprint, disposition, reason_code, next_action, sequence_no,
  next_eligible_business_date::text, confirmed_attempt_count, block_code,
  terminal_code, version, last_observed_at::text, last_changed_at::text
`;

function opaque(value: string): boolean {
  return OPAQUE_ID_RE.test(value) && !value.includes('://');
}

function assertInput(input: ProjectFollowupCaseInput): void {
  for (const [label, value] of [
    ['sourceSystem', input.sourceSystem],
    ['sourceEventKey', input.sourceEventKey],
    ['idempotencyKey', input.idempotencyKey],
    ['case.sourceKey', input.case.sourceKey],
  ] as const) {
    if (!opaque(value)) {
      throw new Error(`followup-case-store: invalid opaque ${label}`);
    }
  }
  if (!SHA256_RE.test(input.sourceFingerprint)) {
    throw new Error('followup-case-store: invalid source fingerprint');
  }
  if (!input.actor.trim()) {
    throw new Error('followup-case-store: actor is required');
  }
  if (!Number.isFinite(Date.parse(input.occurredAt))) {
    throw new Error('followup-case-store: occurredAt must be ISO-8601');
  }
  if (Date.parse(input.occurredAt) !== Date.parse(input.case.observedAt)) {
    throw new Error(
      'followup-case-store: occurredAt must match the case observation',
    );
  }
  const ids = [input.case.partyId];
  if (input.case.lane === 'sales_conversation') {
    ids.push(input.case.pipelineEntryId);
  }
  if (ids.some((value) => value !== null && !/^[1-9][0-9]*$/.test(value))) {
    throw new Error('followup-case-store: invalid business identity');
  }
  if (
    !Number.isInteger(input.case.confirmedAttempts) ||
    input.case.confirmedAttempts < 0 ||
    input.case.confirmedAttempts > 100
  ) {
    throw new Error('followup-case-store: invalid confirmed attempt count');
  }
}

function toItem(row: CaseRow): DurableFollowupCase {
  return {
    id: row.id,
    lane: row.lane,
    sourceSystem: row.source_system,
    sourceKey: row.source_key,
    partyId: row.party_id,
    pipelineEntryId: row.pipeline_entry_id,
    ownerGroup: row.owner_group,
    policyVersion: row.policy_version,
    sourceFingerprint: row.source_fingerprint,
    decisionFingerprint: row.decision_fingerprint,
    disposition: row.disposition,
    reasonCode: row.reason_code,
    nextAction: row.next_action,
    sequence: row.sequence_no,
    nextEligibleBusinessDate: row.next_eligible_business_date,
    confirmedAttemptCount: row.confirmed_attempt_count,
    blockCode: row.block_code,
    terminalCode: row.terminal_code,
    version: row.version,
    lastObservedAt: row.last_observed_at,
    lastChangedAt: row.last_changed_at,
  };
}

function partyId(input: FollowupCase): string | null {
  return input.partyId;
}

function pipelineEntryId(input: FollowupCase): string | null {
  return input.lane === 'sales_conversation' ? input.pipelineEntryId : null;
}

function confirmedAttempts(input: FollowupCase): number {
  return input.confirmedAttempts;
}

function eventFingerprint(parts: unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

async function currentCase(
  client: FollowupCaseStoreClient,
  lane: FollowupLane,
  sourceSystem: string,
  sourceKey: string,
  lock = false,
): Promise<CaseRow | null> {
  const result = await client.query<CaseRow>(
    `SELECT ${CASE_COLUMNS}
       FROM business_v2.company_followup_cases
      WHERE lane = $1 AND source_system = $2 AND source_key = $3
      ${lock ? 'FOR UPDATE' : ''}`,
    [lane, sourceSystem, sourceKey],
  );
  return result.rows[0] ?? null;
}

async function existingEvent(
  client: FollowupCaseStoreClient,
  idempotencyKey: string,
): Promise<ExistingEventRow | null> {
  const result = await client.query<ExistingEventRow>(
    `SELECT case_id::text, event_fingerprint
       FROM business_v2.company_followup_events
      WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
  return result.rows[0] ?? null;
}

function projectionValues(
  input: ProjectFollowupCaseInput,
  output: FollowupDecision,
  decisionFingerprint: string,
): unknown[] {
  return [
    input.case.lane,
    input.sourceSystem,
    input.case.sourceKey,
    partyId(input.case),
    pipelineEntryId(input.case),
    output.ownerGroup,
    output.policyVersion,
    input.sourceFingerprint,
    decisionFingerprint,
    output.disposition,
    output.reason,
    output.nextAction,
    output.sequence,
    output.nextEligibleBusinessDate,
    confirmedAttempts(input.case),
    output.disposition === 'blocked' ? output.reason : null,
    ['completed', 'cancelled'].includes(output.disposition)
      ? output.reason
      : null,
    input.occurredAt,
  ];
}

export async function projectFollowupCaseWithClient(
  client: FollowupCaseStoreClient,
  input: ProjectFollowupCaseInput,
): Promise<ProjectFollowupCaseResult> {
  assertInput(input);
  const output = evaluateFollowup(input.case);
  const decisionFingerprint = followupDecisionFingerprint(input.case, output);
  let existing = await currentCase(
    client,
    input.case.lane,
    input.sourceSystem,
    input.case.sourceKey,
    true,
  );
  const eventType = existing ? 'projection_changed' : 'observed';
  const fingerprint = eventFingerprint([
    input.case.lane,
    input.sourceSystem,
    input.case.sourceKey,
    input.sourceEventKey,
    input.idempotencyKey,
    input.sourceFingerprint,
    decisionFingerprint,
    input.actor,
    input.occurredAt,
  ]);

  const priorEvent = await existingEvent(client, input.idempotencyKey);
  if (priorEvent) {
    if (!existing || priorEvent.case_id !== existing.id) {
      throw new Error(
        'followup-case-store: idempotency identity belongs to another case',
      );
    }
    if (priorEvent.event_fingerprint !== fingerprint) {
      throw new Error(
        'followup-case-store: idempotency identity conflicts with durable evidence',
      );
    }
    return {
      item: toItem(existing),
      decision: output,
      applied: false,
      duplicate: true,
    };
  }

  if (
    existing &&
    existing.source_fingerprint === input.sourceFingerprint &&
    existing.decision_fingerprint === decisionFingerprint
  ) {
    const refreshed = await client.query<CaseRow>(
      `UPDATE business_v2.company_followup_cases
          SET last_observed_at = GREATEST(last_observed_at, $2::timestamptz),
              updated_at = now()
        WHERE id = $1
        RETURNING ${CASE_COLUMNS}`,
      [existing.id, input.occurredAt],
    );
    return {
      item: toItem(refreshed.rows[0]),
      decision: output,
      applied: false,
      duplicate: true,
    };
  }

  if (
    existing &&
    Date.parse(input.occurredAt) <= Date.parse(existing.last_observed_at)
  ) {
    throw new Error(
      'followup-case-store: stale or conflicting observation cannot change projection',
    );
  }

  const values = projectionValues(input, output, decisionFingerprint);
  let row: CaseRow;
  if (!existing) {
    const inserted = await client.query<CaseRow>(
      `INSERT INTO business_v2.company_followup_cases
         (lane, source_system, source_key, party_id, pipeline_entry_id,
          owner_group, policy_version, source_fingerprint,
          decision_fingerprint, disposition, reason_code, next_action,
          sequence_no, next_eligible_business_date, confirmed_attempt_count,
          block_code, terminal_code, version, last_observed_at,
          last_changed_at)
       VALUES
         ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
          0,$18,$18)
       RETURNING ${CASE_COLUMNS}`,
      values,
    );
    row = inserted.rows[0];
  } else {
    const updated = await client.query<CaseRow>(
      `UPDATE business_v2.company_followup_cases
          SET party_id = $1,
              pipeline_entry_id = $2,
              owner_group = $3,
              policy_version = $4,
              source_fingerprint = $5,
              decision_fingerprint = $6,
              disposition = $7,
              reason_code = $8,
              next_action = $9,
              sequence_no = $10,
              next_eligible_business_date = $11,
              confirmed_attempt_count = $12,
              block_code = $13,
              terminal_code = $14,
              version = version + 1,
              last_observed_at = $15,
              last_changed_at = $15,
              updated_at = now()
        WHERE id = $16 AND version = $17
        RETURNING ${CASE_COLUMNS}`,
      [...values.slice(3), existing.id, existing.version],
    );
    if (!updated.rows[0]) {
      throw new Error('followup-case-store: optimistic version conflict');
    }
    row = updated.rows[0];
  }

  await client.query(
    `INSERT INTO business_v2.company_followup_events
       (case_id, case_version, event_type, from_disposition, to_disposition,
        reason_code, actor, source_system, source_event_key, idempotency_key,
        source_fingerprint, decision_fingerprint, event_fingerprint,
        occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [
      row.id,
      row.version,
      eventType,
      existing?.disposition ?? null,
      output.disposition,
      output.reason,
      input.actor,
      input.sourceSystem,
      input.sourceEventKey,
      input.idempotencyKey,
      input.sourceFingerprint,
      decisionFingerprint,
      fingerprint,
      input.occurredAt,
    ],
  );

  existing = row;
  return {
    item: toItem(existing),
    decision: output,
    applied: true,
    duplicate: false,
  };
}

export async function projectFollowupCase(
  input: ProjectFollowupCaseInput,
): Promise<ProjectFollowupCaseResult> {
  return withAgentContext(ACTOR, (client) =>
    projectFollowupCaseWithClient(client, input),
  );
}
