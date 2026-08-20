/**
 * Atomic detector-to-Company-Work adapter for program-facts drift.
 *
 * The detector is deterministic and content-bearing; the durable control
 * plane is deliberately content-minimized. PostgreSQL receives only opaque
 * run/work identities, counts, and SHA-256 evidence. Drift is routed as a
 * blocked owner decision because no automated component is allowed to decide
 * which compared source is authoritative. Only an exact clean rerun closes
 * the item.
 */

import type { QueryResultRow } from 'pg';

import { withAgentContext } from './business-db.js';
import {
  ensureCompanyConditionWorkItemWithClient,
  getCompanyConditionWorkItemBySourceWithClient,
  transitionCompanyConditionWorkItemWithClient,
  type CompanyWorkItem,
  type CompanyWorkLedgerClient,
} from './company-work-ledger.js';
import { recordCompanyTriggerWithClient } from './company-trigger.js';
import type {
  DriftResult,
  ProgramFactsDetectorEvidence,
} from './program-facts-drift.js';

const SOURCE_SYSTEM = 'program_facts_detector';
const SOURCE_KEY = 'program-facts-v1';
const ACTOR = 'program-facts-work:host';
const BLOCK_CODE = 'fact_authority:owner_review_required';
const DEFAULT_DEADLINE_HOURS = 48;
const RUN_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,180}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

interface ObservationRow extends QueryResultRow {
  occurrence_id: string;
  work_item_id: string;
  detector_version: number;
  outcome: 'drift' | 'clean';
  finding_fingerprint: string;
  facts_sha256: string;
  sales_kb_sha256: string;
  products_sha256: string | null;
  products_available: boolean;
  finding_count: number;
  checked_programs: number;
  observed_at: string;
}

interface LastFindingRow extends QueryResultRow {
  finding_fingerprint: string;
}

export interface ProgramFactsCompanyWorkRun {
  runKey: string;
  observedAt: string;
  result: DriftResult;
  evidence: ProgramFactsDetectorEvidence;
}

export interface ProgramFactsCompanyWorkResult {
  outcome:
    | 'clean_no_work'
    | 'opened'
    | 'updated'
    | 'unchanged'
    | 'closed'
    | 'reopened';
  workItem: CompanyWorkItem | null;
  triggerApplied: boolean;
  observationApplied: boolean;
  shouldNotify: boolean;
}

function assertRun(input: ProgramFactsCompanyWorkRun): void {
  if (!RUN_KEY_PATTERN.test(input.runKey)) {
    throw new Error('program-facts-work: invalid opaque runKey');
  }
  if (!Number.isFinite(Date.parse(input.observedAt))) {
    throw new Error('program-facts-work: invalid observedAt');
  }
  if (!Number.isInteger(input.result.checked) || input.result.checked < 0) {
    throw new Error('program-facts-work: invalid checked program count');
  }
  const hashes = [
    input.evidence.factsSha256,
    input.evidence.salesKbSha256,
    input.evidence.findingFingerprint,
    input.evidence.payloadSha256,
  ];
  if (input.evidence.productsSha256) hashes.push(input.evidence.productsSha256);
  if (hashes.some((value) => !SHA256_PATTERN.test(value))) {
    throw new Error('program-facts-work: invalid detector evidence digest');
  }
  if (
    input.evidence.productsAvailable !==
    (input.evidence.productsSha256 !== null)
  ) {
    throw new Error('program-facts-work: inconsistent products evidence');
  }
}

function occurrenceKey(runKey: string): string {
  return `job-run:${runKey}`;
}

function eventKey(runKey: string, event: string): string {
  return `program-facts:${runKey}:${event}`;
}

function deadlineFrom(observedAt: string): string {
  return new Date(
    Date.parse(observedAt) + DEFAULT_DEADLINE_HOURS * 60 * 60_000,
  ).toISOString();
}

async function lastDriftFingerprint(
  client: CompanyWorkLedgerClient,
  workItemId: string,
): Promise<string | null> {
  const result = await client.query<LastFindingRow>(
    `SELECT finding_fingerprint
       FROM business_v2.company_program_fact_observations
      WHERE work_item_id = $1 AND outcome = 'drift'
      ORDER BY observed_at DESC, id DESC
      LIMIT 1`,
    [workItemId],
  );
  return result.rows[0]?.finding_fingerprint ?? null;
}

function observationMatches(
  row: ObservationRow,
  input: ProgramFactsCompanyWorkRun,
  triggerOccurrenceId: string,
  workItemId: string,
  outcome: 'drift' | 'clean',
): boolean {
  return (
    row.occurrence_id === triggerOccurrenceId &&
    row.work_item_id === workItemId &&
    row.detector_version === input.evidence.detectorVersion &&
    row.outcome === outcome &&
    row.finding_fingerprint === input.evidence.findingFingerprint &&
    row.facts_sha256 === input.evidence.factsSha256 &&
    row.sales_kb_sha256 === input.evidence.salesKbSha256 &&
    row.products_sha256 === input.evidence.productsSha256 &&
    row.products_available === input.evidence.productsAvailable &&
    row.finding_count === input.result.findings.length &&
    row.checked_programs === input.result.checked &&
    Date.parse(row.observed_at) === Date.parse(input.observedAt)
  );
}

async function recordObservation(
  client: CompanyWorkLedgerClient,
  input: ProgramFactsCompanyWorkRun,
  triggerOccurrenceId: string,
  workItemId: string,
  outcome: 'drift' | 'clean',
): Promise<boolean> {
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO business_v2.company_program_fact_observations
       (occurrence_id, work_item_id, detector_version, outcome,
        finding_fingerprint, facts_sha256, sales_kb_sha256, products_sha256,
        products_available, finding_count, checked_programs, observed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (occurrence_id) DO NOTHING
     RETURNING id::text`,
    [
      triggerOccurrenceId,
      workItemId,
      input.evidence.detectorVersion,
      outcome,
      input.evidence.findingFingerprint,
      input.evidence.factsSha256,
      input.evidence.salesKbSha256,
      input.evidence.productsSha256,
      input.evidence.productsAvailable,
      input.result.findings.length,
      input.result.checked,
      input.observedAt,
    ],
  );
  if (inserted.rows[0]) return true;

  const existing = await client.query<ObservationRow>(
    `SELECT occurrence_id, work_item_id::text, detector_version, outcome,
            finding_fingerprint, facts_sha256, sales_kb_sha256,
            products_sha256, products_available, finding_count,
            checked_programs, observed_at::text
       FROM business_v2.company_program_fact_observations
      WHERE occurrence_id = $1`,
    [triggerOccurrenceId],
  );
  if (
    !existing.rows[0] ||
    !observationMatches(
      existing.rows[0],
      input,
      triggerOccurrenceId,
      workItemId,
      outcome,
    )
  ) {
    throw new Error(
      'program-facts-work: occurrence observation conflicts with durable evidence',
    );
  }
  return false;
}

export async function applyProgramFactsCompanyWorkWithClient(
  client: CompanyWorkLedgerClient,
  input: ProgramFactsCompanyWorkRun,
): Promise<ProgramFactsCompanyWorkResult> {
  assertRun(input);
  const drift = input.result.findings.length > 0;
  let item = await getCompanyConditionWorkItemBySourceWithClient(
    client,
    SOURCE_SYSTEM,
    SOURCE_KEY,
    true,
  );

  if (!drift && (!item || item.disposition === 'completed')) {
    return {
      outcome: 'clean_no_work',
      workItem: item,
      triggerApplied: false,
      observationApplied: false,
      shouldNotify: false,
    };
  }

  const trigger = await recordCompanyTriggerWithClient(client, {
    kind: 'business_condition',
    sourceSystem: SOURCE_SYSTEM,
    sourceKey: SOURCE_KEY,
    occurrenceKey: occurrenceKey(input.runKey),
    observedAt: input.observedAt,
    payloadSha256: input.evidence.payloadSha256,
    workRequest: {
      // A condition occurrence always requests that its one stable source work
      // item exist. Keeping this intent independent of current projection
      // state makes an exact scheduled-run replay semantically identical.
      operation: 'create',
      workflowType: 'program_facts_drift',
      sourceSystem: SOURCE_SYSTEM,
      sourceKey: SOURCE_KEY,
    },
  });

  if (!drift) {
    if (!item)
      throw new Error('program-facts-work: clean close lost work item');
    if (item.stage !== 'accepted') {
      throw new Error('program-facts-work: clean close found invalid stage');
    }
    const closed = await transitionCompanyConditionWorkItemWithClient(client, {
      workItemId: item.id,
      expectedVersion: item.version,
      eventType: 'outcome_validated',
      actor: ACTOR,
      sourceSystem: SOURCE_SYSTEM,
      sourceEventKey: eventKey(input.runKey, 'clean'),
      idempotencyKey: eventKey(input.runKey, 'clean:transition'),
      occurredAt: input.observedAt,
      evidenceSha256: input.evidence.payloadSha256,
      receipt: {
        type: 'outcome_validation',
        system: SOURCE_SYSTEM,
        key: eventKey(input.runKey, 'clean:receipt'),
        evidenceSha256: input.evidence.payloadSha256,
        externalActionId: input.runKey,
        occurredAt: input.observedAt,
      },
    });
    const observationApplied = await recordObservation(
      client,
      input,
      trigger.occurrence.occurrenceId,
      closed.item.id,
      'clean',
    );
    return {
      outcome: 'closed',
      workItem: closed.item,
      triggerApplied: trigger.applied,
      observationApplied,
      shouldNotify: closed.applied,
    };
  }

  const previousFingerprint = item
    ? await lastDriftFingerprint(client, item.id)
    : null;
  let opened = false;
  let reopened = false;
  let routed = false;
  if (!item) {
    const ensured = await ensureCompanyConditionWorkItemWithClient(client, {
      sourceSystem: SOURCE_SYSTEM,
      sourceKey: SOURCE_KEY,
      sourceEventKey: eventKey(input.runKey, 'accepted'),
      idempotencyKey: eventKey(input.runKey, 'accepted:create'),
      actor: ACTOR,
      evidenceSha256: input.evidence.payloadSha256,
      occurredAt: input.observedAt,
      deadlineAt: deadlineFrom(input.observedAt),
    });
    item = ensured.item;
    opened = ensured.applied;
  } else if (item.disposition === 'completed') {
    const result = await transitionCompanyConditionWorkItemWithClient(client, {
      workItemId: item.id,
      expectedVersion: item.version,
      eventType: 'reopened',
      actor: ACTOR,
      sourceSystem: SOURCE_SYSTEM,
      sourceEventKey: eventKey(input.runKey, 'reopened'),
      idempotencyKey: eventKey(input.runKey, 'reopened:transition'),
      occurredAt: input.observedAt,
      evidenceSha256: input.evidence.payloadSha256,
      deadlineAt: deadlineFrom(input.observedAt),
    });
    item = result.item;
    reopened = result.applied;
  }

  if (item.stage !== 'accepted') {
    throw new Error('program-facts-work: drift found invalid work stage');
  }
  if (item.disposition === 'open') {
    const blocked = await transitionCompanyConditionWorkItemWithClient(client, {
      workItemId: item.id,
      expectedVersion: item.version,
      eventType: 'blocked',
      actor: ACTOR,
      sourceSystem: SOURCE_SYSTEM,
      sourceEventKey: eventKey(input.runKey, 'owner-review'),
      idempotencyKey: eventKey(input.runKey, 'owner-review:transition'),
      occurredAt: input.observedAt,
      evidenceSha256: input.evidence.payloadSha256,
      exceptionCode: BLOCK_CODE,
    });
    item = blocked.item;
    routed = blocked.applied;
  } else if (item.disposition !== 'blocked') {
    throw new Error(
      `program-facts-work: drift found invalid ${item.disposition} disposition`,
    );
  }

  const observationApplied = await recordObservation(
    client,
    input,
    trigger.occurrence.occurrenceId,
    item.id,
    'drift',
  );
  const changed =
    previousFingerprint !== null &&
    previousFingerprint !== input.evidence.findingFingerprint;
  return {
    outcome: reopened
      ? 'reopened'
      : opened
        ? 'opened'
        : routed || changed
          ? 'updated'
          : 'unchanged',
    workItem: item,
    triggerApplied: trigger.applied,
    observationApplied,
    shouldNotify:
      observationApplied && (opened || reopened || routed || changed),
  };
}

export async function applyProgramFactsCompanyWork(
  input: ProgramFactsCompanyWorkRun,
): Promise<ProgramFactsCompanyWorkResult> {
  return withAgentContext('program-facts-work:host', (client) =>
    applyProgramFactsCompanyWorkWithClient(client, input),
  );
}
