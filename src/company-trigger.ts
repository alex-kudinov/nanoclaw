/**
 * Host-only Company OS trigger-occurrence foundation.
 *
 * NC-20260817-001 defines the durable identity and replay boundary without
 * wiring any scheduler, channel, webhook, reaper, task, skill, or action path.
 * Inputs are content-free: callers provide opaque source/work keys and a
 * SHA-256 evidence digest, never a raw message, webhook body, topic payload,
 * condition explanation, prompt, or agent prose.
 */

import { createHash } from 'crypto';
import type { QueryResult, QueryResultRow } from 'pg';

import { query } from './business-db.js';

export const COMPANY_TRIGGER_CONTRACT_VERSION = 1 as const;

export const COMPANY_TRIGGER_KINDS = [
  'time',
  'gmail',
  'webhook',
  'topic',
  'business_condition',
] as const;

export type CompanyTriggerKind = (typeof COMPANY_TRIGGER_KINDS)[number];

export const COMPANY_TRIGGER_OPERATIONS = ['create', 'resume'] as const;

export type CompanyTriggerOperation =
  (typeof COMPANY_TRIGGER_OPERATIONS)[number];

export interface CompanyTriggerWorkRequest {
  operation: CompanyTriggerOperation;
  workflowType: string;
  sourceSystem: string;
  sourceKey: string;
}

export interface CompanyTriggerOccurrence {
  contractVersion: typeof COMPANY_TRIGGER_CONTRACT_VERSION;
  definitionId: string;
  occurrenceId: string;
  semanticFingerprint: string;
  kind: CompanyTriggerKind;
  sourceSystem: string;
  sourceKey: string;
  occurrenceKey: string;
  observedAt: string;
  payloadSha256: string;
  workRequest: CompanyTriggerWorkRequest;
  actionAuthority: 'none';
}

export interface CompanyTriggerRecordResult {
  occurrence: CompanyTriggerOccurrence;
  applied: boolean;
  duplicate: boolean;
}

export type CompanyTriggerReplayDecision = 'new' | 'duplicate' | 'conflict';

export type CompanyTriggerErrorCode = 'invalid_input' | 'conflict';

export class CompanyTriggerError extends Error {
  constructor(
    public readonly code: CompanyTriggerErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CompanyTriggerError';
  }
}

export interface CompanyTriggerClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<T>>;
}

interface StoredTriggerIdentityRow extends QueryResultRow {
  occurrence_id: string;
  semantic_fingerprint: string;
}

const SOURCE_SYSTEM_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const OPAQUE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/;
const WORKFLOW_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function invalid(message: string): never {
  throw new CompanyTriggerError('invalid_input', message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) invalid(`${field} must be an object`);
  return value;
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    invalid(`${field} contains unsupported field ${unknown.sort()[0]}`);
  }
  const missing = allowed.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  if (missing.length > 0) {
    invalid(`${field} is missing required field ${missing[0]}`);
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') invalid(`${field} must be a string`);
  return value;
}

function requireEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    invalid(`${field} is invalid`);
  }
  return value as T;
}

function requirePattern(
  value: unknown,
  pattern: RegExp,
  field: string,
): string {
  const text = requireString(value, field);
  if (!pattern.test(text)) invalid(`${field} is invalid`);
  return text;
}

function normalizeTimestamp(value: unknown, field: string): string {
  const text = requireString(value, field);
  const match = ISO_TIMESTAMP_PATTERN.exec(text);
  if (!match) invalid(`${field} is invalid`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    invalid(`${field} is invalid`);
  }
  const milliseconds = Date.parse(text);
  if (!Number.isFinite(milliseconds)) invalid(`${field} is invalid`);
  return new Date(milliseconds).toISOString();
}

function hash(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

function freezeOccurrence(
  occurrence: Omit<
    CompanyTriggerOccurrence,
    'definitionId' | 'occurrenceId' | 'semanticFingerprint'
  >,
): CompanyTriggerOccurrence {
  const definitionId = hash([
    'company-trigger-definition:v1',
    occurrence.kind,
    occurrence.sourceSystem,
    occurrence.sourceKey,
  ]);
  const occurrenceId = hash([
    'company-trigger-occurrence:v1',
    definitionId,
    occurrence.occurrenceKey,
  ]);
  const semanticFingerprint = hash([
    'company-trigger-semantic:v1',
    COMPANY_TRIGGER_CONTRACT_VERSION,
    definitionId,
    occurrenceId,
    occurrence.kind,
    occurrence.sourceSystem,
    occurrence.sourceKey,
    occurrence.occurrenceKey,
    occurrence.observedAt,
    occurrence.payloadSha256,
    occurrence.workRequest.operation,
    occurrence.workRequest.workflowType,
    occurrence.workRequest.sourceSystem,
    occurrence.workRequest.sourceKey,
  ]);

  const workRequest = Object.freeze({ ...occurrence.workRequest });
  return Object.freeze({
    ...occurrence,
    workRequest,
    definitionId,
    occurrenceId,
    semanticFingerprint,
  });
}

/**
 * Normalize an untrusted content-free trigger envelope.
 *
 * Unknown fields are rejected so a caller cannot smuggle raw payloads or an
 * authority/skill selection through this contract.
 */
export function normalizeCompanyTrigger(
  input: unknown,
): CompanyTriggerOccurrence {
  const envelope = requireRecord(input, 'trigger');
  assertExactKeys(
    envelope,
    [
      'kind',
      'sourceSystem',
      'sourceKey',
      'occurrenceKey',
      'observedAt',
      'payloadSha256',
      'workRequest',
    ],
    'trigger',
  );

  const work = requireRecord(envelope.workRequest, 'workRequest');
  assertExactKeys(
    work,
    ['operation', 'workflowType', 'sourceSystem', 'sourceKey'],
    'workRequest',
  );

  return freezeOccurrence({
    contractVersion: COMPANY_TRIGGER_CONTRACT_VERSION,
    kind: requireEnum(envelope.kind, COMPANY_TRIGGER_KINDS, 'kind'),
    sourceSystem: requirePattern(
      envelope.sourceSystem,
      SOURCE_SYSTEM_PATTERN,
      'sourceSystem',
    ),
    sourceKey: requirePattern(
      envelope.sourceKey,
      OPAQUE_KEY_PATTERN,
      'sourceKey',
    ),
    occurrenceKey: requirePattern(
      envelope.occurrenceKey,
      OPAQUE_KEY_PATTERN,
      'occurrenceKey',
    ),
    observedAt: normalizeTimestamp(envelope.observedAt, 'observedAt'),
    payloadSha256: requirePattern(
      envelope.payloadSha256,
      SHA256_PATTERN,
      'payloadSha256',
    ),
    workRequest: {
      operation: requireEnum(
        work.operation,
        COMPANY_TRIGGER_OPERATIONS,
        'workRequest.operation',
      ),
      workflowType: requirePattern(
        work.workflowType,
        WORKFLOW_PATTERN,
        'workRequest.workflowType',
      ),
      sourceSystem: requirePattern(
        work.sourceSystem,
        SOURCE_SYSTEM_PATTERN,
        'workRequest.sourceSystem',
      ),
      sourceKey: requirePattern(
        work.sourceKey,
        OPAQUE_KEY_PATTERN,
        'workRequest.sourceKey',
      ),
    },
    actionAuthority: 'none',
  });
}

export function classifyCompanyTriggerReplay(
  existing: CompanyTriggerOccurrence,
  candidate: CompanyTriggerOccurrence,
): CompanyTriggerReplayDecision {
  if (existing.occurrenceId !== candidate.occurrenceId) return 'new';
  return existing.semanticFingerprint === candidate.semanticFingerprint
    ? 'duplicate'
    : 'conflict';
}

/** @internal The caller may inject a transaction-scoped PostgreSQL client. */
export async function recordCompanyTriggerWithClient(
  client: CompanyTriggerClient,
  input: unknown,
): Promise<CompanyTriggerRecordResult> {
  const occurrence = normalizeCompanyTrigger(input);
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO business_v2.company_trigger_occurrences
       (contract_version, definition_id, occurrence_id,
        semantic_fingerprint, trigger_kind, source_system, source_key,
        occurrence_key, observed_at, payload_sha256, requested_operation,
        workflow_type, work_source_system, work_source_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT DO NOTHING
     RETURNING id::text`,
    [
      occurrence.contractVersion,
      occurrence.definitionId,
      occurrence.occurrenceId,
      occurrence.semanticFingerprint,
      occurrence.kind,
      occurrence.sourceSystem,
      occurrence.sourceKey,
      occurrence.occurrenceKey,
      occurrence.observedAt,
      occurrence.payloadSha256,
      occurrence.workRequest.operation,
      occurrence.workRequest.workflowType,
      occurrence.workRequest.sourceSystem,
      occurrence.workRequest.sourceKey,
    ],
  );
  if (inserted.rows[0]) {
    return { occurrence, applied: true, duplicate: false };
  }

  const existing = await client.query<StoredTriggerIdentityRow>(
    `SELECT occurrence_id, semantic_fingerprint
       FROM business_v2.company_trigger_occurrences
      WHERE occurrence_id = $1
         OR (trigger_kind = $2 AND source_system = $3 AND source_key = $4
             AND occurrence_key = $5)
      ORDER BY id ASC`,
    [
      occurrence.occurrenceId,
      occurrence.kind,
      occurrence.sourceSystem,
      occurrence.sourceKey,
      occurrence.occurrenceKey,
    ],
  );
  if (
    existing.rows.length !== 1 ||
    existing.rows[0].occurrence_id !== occurrence.occurrenceId ||
    existing.rows[0].semantic_fingerprint !== occurrence.semanticFingerprint
  ) {
    throw new CompanyTriggerError(
      'conflict',
      'trigger occurrence identity was reused with different facts',
    );
  }
  return { occurrence, applied: false, duplicate: true };
}

export async function recordCompanyTrigger(
  input: unknown,
): Promise<CompanyTriggerRecordResult> {
  return recordCompanyTriggerWithClient({ query }, input);
}
