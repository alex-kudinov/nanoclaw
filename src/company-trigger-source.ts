/**
 * Host-only Company OS trigger-source inventory and watermark contract.
 *
 * NC-20260817-003 keeps this module dark and unwired. It stores only
 * content-free source identities, operating metadata, cursor values, counts,
 * and evidence hashes. Registration and cursor progress grant no task, skill,
 * capability, approval, message, or action authority.
 */

import { createHash } from 'crypto';
import type { QueryResult, QueryResultRow } from 'pg';

import { withTransaction } from './business-db.js';
import {
  COMPANY_TRIGGER_KINDS,
  deriveCompanyTriggerDefinitionId,
  type CompanyTriggerClient,
  type CompanyTriggerKind,
} from './company-trigger.js';

export const COMPANY_TRIGGER_SOURCE_REGISTRY_VERSION = 1 as const;

export const COMPANY_TRIGGER_CURSOR_KINDS = [
  'none',
  'uint',
  'utc_timestamp',
] as const;
export type CompanyTriggerCursorKind =
  (typeof COMPANY_TRIGGER_CURSOR_KINDS)[number];

export const COMPANY_TRIGGER_RECONCILIATION_MODES = [
  'not_applicable',
  'bounded_scan',
  'full_snapshot',
  'unsupported',
] as const;
export type CompanyTriggerReconciliationMode =
  (typeof COMPANY_TRIGGER_RECONCILIATION_MODES)[number];

export const COMPANY_TRIGGER_WATERMARK_EVENT_TYPES = [
  'bootstrap',
  'advance',
  'gap_detected',
  'gap_reconciled',
] as const;
export type CompanyTriggerWatermarkEventType =
  (typeof COMPANY_TRIGGER_WATERMARK_EVENT_TYPES)[number];

export const COMPANY_TRIGGER_GAP_REASONS = [
  'history_expired',
  'page_limit',
  'source_unavailable',
  'incomplete_range',
  'incomplete_terminal_state',
  'unknown',
] as const;
export type CompanyTriggerGapReason =
  (typeof COMPANY_TRIGGER_GAP_REASONS)[number];

export type CompanyTriggerSourceErrorCode =
  | 'invalid_input'
  | 'not_found'
  | 'conflict'
  | 'stale_version'
  | 'gap_open'
  | 'gap_mismatch'
  | 'not_reconcilable';

export class CompanyTriggerSourceError extends Error {
  constructor(
    public readonly code: CompanyTriggerSourceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CompanyTriggerSourceError';
  }
}

export interface CompanyTriggerSourceDefinition {
  registryVersion: typeof COMPANY_TRIGGER_SOURCE_REGISTRY_VERSION;
  definitionId: string;
  sourceFingerprint: string;
  kind: CompanyTriggerKind;
  sourceSystem: string;
  sourceKey: string;
  adapterKey: string;
  adapterVersion: string;
  cursorKind: CompanyTriggerCursorKind;
  reconciliationMode: CompanyTriggerReconciliationMode;
  maxReconciliationWindowSeconds: number | null;
  freshnessBudgetSeconds: number | null;
  ownerKey: string;
  alertRouteKey: string;
  actionAuthority: 'none';
}

export interface CompanyTriggerSourceRegistrationResult {
  source: CompanyTriggerSourceDefinition;
  applied: boolean;
  duplicate: boolean;
}

export interface CompanyTriggerWatermarkEvent {
  definitionId: string;
  eventKey: string;
  eventFingerprint: string;
  eventType: CompanyTriggerWatermarkEventType;
  expectedVersion: number;
  previousCursor: string | null;
  nextCursor: string;
  observedFrom: string;
  observedThrough: string;
  evidenceSha256: string;
  observedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  gapReason: CompanyTriggerGapReason | null;
  resolvesEventId: string | null;
  actionAuthority: 'none';
}

export type CompanyTriggerWatermarkStatus = 'uninitialized' | 'current' | 'gap';

export interface CompanyTriggerWatermarkState {
  definitionId: string;
  version: number;
  status: CompanyTriggerWatermarkStatus;
  cursorValue: string | null;
  cursorObservedAt: string | null;
  openGapEventId: string | null;
  lastEventId: string | null;
}

export interface CompanyTriggerWatermarkRecordResult {
  event: CompanyTriggerWatermarkEvent;
  eventId: string;
  state: CompanyTriggerWatermarkState;
  applied: boolean;
  duplicate: boolean;
}

interface StoredSourceIdentityRow extends QueryResultRow {
  definition_id: string;
  source_fingerprint: string;
}

interface StoredSourceContractRow extends QueryResultRow {
  definition_id: string;
  cursor_kind: CompanyTriggerCursorKind;
  reconciliation_mode: CompanyTriggerReconciliationMode;
}

interface StoredWatermarkEventRow extends QueryResultRow {
  id: string;
  event_fingerprint: string;
}

interface StoredWatermarkStateRow extends QueryResultRow {
  definition_id: string;
  version: string;
  status: CompanyTriggerWatermarkStatus;
  cursor_value: string | null;
  cursor_observed_at: string | Date | null;
  open_gap_event_id: string | null;
  last_event_id: string | null;
}

const SOURCE_SYSTEM_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const OPAQUE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,255}$/;
const ADAPTER_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const UINT_PATTERN = /^(0|[1-9][0-9]*)$/;
const POSITIVE_UINT_PATTERN = /^[1-9][0-9]*$/;
const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function fail(code: CompanyTriggerSourceErrorCode, message: string): never {
  throw new CompanyTriggerSourceError(code, message);
}

function invalid(message: string): never {
  return fail('invalid_input', message);
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

function requireNullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requireString(value, field);
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

function requireNullableEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T | null {
  if (value === null) return null;
  return requireEnum(value, allowed, field);
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

function requireSafeInteger(
  value: unknown,
  field: string,
  minimum: number,
): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    invalid(`${field} is invalid`);
  }
  return value as number;
}

function requireNullablePositiveInteger(
  value: unknown,
  field: string,
): number | null {
  if (value === null) return null;
  return requireSafeInteger(value, field, 1);
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

function normalizeNullableEventId(
  value: unknown,
  field: string,
): string | null {
  if (value === null) return null;
  const text = requireString(value, field);
  if (!POSITIVE_UINT_PATTERN.test(text)) invalid(`${field} is invalid`);
  return BigInt(text).toString();
}

function hash(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function normalizeCompanyTriggerSource(
  input: unknown,
): CompanyTriggerSourceDefinition {
  const source = requireRecord(input, 'source');
  assertExactKeys(
    source,
    [
      'kind',
      'sourceSystem',
      'sourceKey',
      'adapterKey',
      'adapterVersion',
      'cursorKind',
      'reconciliationMode',
      'maxReconciliationWindowSeconds',
      'freshnessBudgetSeconds',
      'ownerKey',
      'alertRouteKey',
    ],
    'source',
  );

  const kind = requireEnum(source.kind, COMPANY_TRIGGER_KINDS, 'kind');
  const sourceSystem = requirePattern(
    source.sourceSystem,
    SOURCE_SYSTEM_PATTERN,
    'sourceSystem',
  );
  const sourceKey = requirePattern(
    source.sourceKey,
    OPAQUE_KEY_PATTERN,
    'sourceKey',
  );
  const adapterKey = requirePattern(
    source.adapterKey,
    SOURCE_SYSTEM_PATTERN,
    'adapterKey',
  );
  const adapterVersion = requirePattern(
    source.adapterVersion,
    ADAPTER_VERSION_PATTERN,
    'adapterVersion',
  );
  const cursorKind = requireEnum(
    source.cursorKind,
    COMPANY_TRIGGER_CURSOR_KINDS,
    'cursorKind',
  );
  const reconciliationMode = requireEnum(
    source.reconciliationMode,
    COMPANY_TRIGGER_RECONCILIATION_MODES,
    'reconciliationMode',
  );
  const maxReconciliationWindowSeconds = requireNullablePositiveInteger(
    source.maxReconciliationWindowSeconds,
    'maxReconciliationWindowSeconds',
  );
  const freshnessBudgetSeconds = requireNullablePositiveInteger(
    source.freshnessBudgetSeconds,
    'freshnessBudgetSeconds',
  );
  const ownerKey = requirePattern(
    source.ownerKey,
    OPAQUE_KEY_PATTERN,
    'ownerKey',
  );
  const alertRouteKey = requirePattern(
    source.alertRouteKey,
    OPAQUE_KEY_PATTERN,
    'alertRouteKey',
  );

  const hasDurableCursor = cursorKind !== 'none';
  const hasReconciliation =
    reconciliationMode === 'bounded_scan' ||
    reconciliationMode === 'full_snapshot';
  if (
    hasDurableCursor !== hasReconciliation ||
    (hasDurableCursor &&
      (maxReconciliationWindowSeconds === null ||
        freshnessBudgetSeconds === null)) ||
    (!hasDurableCursor &&
      (maxReconciliationWindowSeconds !== null ||
        freshnessBudgetSeconds !== null))
  ) {
    invalid('source cursor and reconciliation settings are inconsistent');
  }

  const definitionId = deriveCompanyTriggerDefinitionId(
    kind,
    sourceSystem,
    sourceKey,
  );
  const sourceFingerprint = hash([
    'company-trigger-source:v1',
    COMPANY_TRIGGER_SOURCE_REGISTRY_VERSION,
    definitionId,
    kind,
    sourceSystem,
    sourceKey,
    adapterKey,
    adapterVersion,
    cursorKind,
    reconciliationMode,
    maxReconciliationWindowSeconds,
    freshnessBudgetSeconds,
    ownerKey,
    alertRouteKey,
  ]);

  return Object.freeze({
    registryVersion: COMPANY_TRIGGER_SOURCE_REGISTRY_VERSION,
    definitionId,
    sourceFingerprint,
    kind,
    sourceSystem,
    sourceKey,
    adapterKey,
    adapterVersion,
    cursorKind,
    reconciliationMode,
    maxReconciliationWindowSeconds,
    freshnessBudgetSeconds,
    ownerKey,
    alertRouteKey,
    actionAuthority: 'none' as const,
  });
}

/** @internal The caller must supply a transaction-scoped client. */
export async function registerCompanyTriggerSourceWithClient(
  client: CompanyTriggerClient,
  input: unknown,
): Promise<CompanyTriggerSourceRegistrationResult> {
  const source = normalizeCompanyTriggerSource(input);
  const inserted = await client.query<{ definition_id: string }>(
    `INSERT INTO business_v2.company_trigger_sources
       (registry_version, definition_id, source_fingerprint, trigger_kind,
        source_system, source_key, adapter_key, adapter_version, cursor_kind,
        reconciliation_mode, max_reconciliation_window_seconds,
        freshness_budget_seconds, owner_key, alert_route_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT DO NOTHING
     RETURNING definition_id`,
    [
      source.registryVersion,
      source.definitionId,
      source.sourceFingerprint,
      source.kind,
      source.sourceSystem,
      source.sourceKey,
      source.adapterKey,
      source.adapterVersion,
      source.cursorKind,
      source.reconciliationMode,
      source.maxReconciliationWindowSeconds,
      source.freshnessBudgetSeconds,
      source.ownerKey,
      source.alertRouteKey,
    ],
  );

  let applied = Boolean(inserted.rows[0]);
  if (!applied) {
    const existing = await client.query<StoredSourceIdentityRow>(
      `SELECT definition_id, source_fingerprint
         FROM business_v2.company_trigger_sources
        WHERE definition_id = $1
           OR (trigger_kind = $2 AND source_system = $3 AND source_key = $4)
        ORDER BY definition_id`,
      [source.definitionId, source.kind, source.sourceSystem, source.sourceKey],
    );
    if (
      existing.rows.length !== 1 ||
      existing.rows[0].definition_id !== source.definitionId ||
      existing.rows[0].source_fingerprint !== source.sourceFingerprint
    ) {
      fail(
        'conflict',
        'trigger source identity was reused with different operating facts',
      );
    }
  }

  const state = await client.query(
    `INSERT INTO business_v2.company_trigger_watermark_state (definition_id)
     VALUES ($1)
     ON CONFLICT DO NOTHING`,
    [source.definitionId],
  );
  if (applied && state.rowCount !== 1) {
    fail('conflict', 'new trigger source has an unexpected watermark state');
  }

  return { source, applied, duplicate: !applied };
}

export async function registerCompanyTriggerSource(
  input: unknown,
): Promise<CompanyTriggerSourceRegistrationResult> {
  return withTransaction((client) =>
    registerCompanyTriggerSourceWithClient(client, input),
  );
}

function normalizeCursor(
  kind: CompanyTriggerCursorKind,
  value: unknown,
  field: string,
  nullable: boolean,
): string | null {
  const text = requireNullableString(value, field);
  if (text === null) {
    if (nullable) return null;
    invalid(`${field} is required`);
  }
  if (kind === 'none') invalid('source has no durable cursor');
  if (kind === 'uint') {
    if (!UINT_PATTERN.test(text)) invalid(`${field} is invalid`);
    return BigInt(text).toString();
  }
  return normalizeTimestamp(text, field);
}

function compareCursors(
  kind: Exclude<CompanyTriggerCursorKind, 'none'>,
  left: string,
  right: string,
): number {
  if (kind === 'uint') {
    const a = BigInt(left);
    const b = BigInt(right);
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const a = Date.parse(left);
  const b = Date.parse(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function normalizeCompanyTriggerWatermarkEvent(
  cursorKind: CompanyTriggerCursorKind,
  input: unknown,
): CompanyTriggerWatermarkEvent {
  const event = requireRecord(input, 'watermarkEvent');
  assertExactKeys(
    event,
    [
      'definitionId',
      'eventKey',
      'eventType',
      'expectedVersion',
      'previousCursor',
      'nextCursor',
      'observedFrom',
      'observedThrough',
      'evidenceSha256',
      'observedCount',
      'acceptedCount',
      'rejectedCount',
      'gapReason',
      'resolvesEventId',
    ],
    'watermarkEvent',
  );

  const definitionId = requirePattern(
    event.definitionId,
    SHA256_PATTERN,
    'definitionId',
  );
  const eventKey = requirePattern(
    event.eventKey,
    OPAQUE_KEY_PATTERN,
    'eventKey',
  );
  const eventType = requireEnum(
    event.eventType,
    COMPANY_TRIGGER_WATERMARK_EVENT_TYPES,
    'eventType',
  );
  const expectedVersion = requireSafeInteger(
    event.expectedVersion,
    'expectedVersion',
    0,
  );
  const previousCursor = normalizeCursor(
    cursorKind,
    event.previousCursor,
    'previousCursor',
    true,
  );
  const nextCursor = normalizeCursor(
    cursorKind,
    event.nextCursor,
    'nextCursor',
    false,
  );
  if (nextCursor === null) invalid('nextCursor is required');
  const observedFrom = normalizeTimestamp(event.observedFrom, 'observedFrom');
  const observedThrough = normalizeTimestamp(
    event.observedThrough,
    'observedThrough',
  );
  if (Date.parse(observedFrom) > Date.parse(observedThrough)) {
    invalid('watermarkEvent observation window is reversed');
  }
  const evidenceSha256 = requirePattern(
    event.evidenceSha256,
    SHA256_PATTERN,
    'evidenceSha256',
  );
  const observedCount = requireSafeInteger(
    event.observedCount,
    'observedCount',
    0,
  );
  const acceptedCount = requireSafeInteger(
    event.acceptedCount,
    'acceptedCount',
    0,
  );
  const rejectedCount = requireSafeInteger(
    event.rejectedCount,
    'rejectedCount',
    0,
  );
  if (observedCount !== acceptedCount + rejectedCount) {
    invalid('observedCount must equal acceptedCount plus rejectedCount');
  }
  const gapReason = requireNullableEnum(
    event.gapReason,
    COMPANY_TRIGGER_GAP_REASONS,
    'gapReason',
  );
  const resolvesEventId = normalizeNullableEventId(
    event.resolvesEventId,
    'resolvesEventId',
  );

  if (eventType === 'bootstrap') {
    if (
      expectedVersion !== 0 ||
      previousCursor !== null ||
      gapReason !== null ||
      resolvesEventId !== null
    ) {
      invalid('bootstrap watermark event has invalid state fields');
    }
  } else if (eventType === 'advance') {
    if (
      expectedVersion === 0 ||
      previousCursor === null ||
      gapReason !== null ||
      resolvesEventId !== null
    ) {
      invalid('advance watermark event has invalid state fields');
    }
  } else if (eventType === 'gap_detected') {
    if (
      expectedVersion === 0 ||
      previousCursor === null ||
      gapReason === null ||
      resolvesEventId !== null
    ) {
      invalid('gap_detected watermark event has invalid state fields');
    }
  } else if (
    expectedVersion === 0 ||
    previousCursor === null ||
    gapReason !== null ||
    resolvesEventId === null
  ) {
    invalid('gap_reconciled watermark event has invalid state fields');
  }

  if (
    previousCursor !== null &&
    cursorKind !== 'none' &&
    compareCursors(cursorKind, previousCursor, nextCursor) >= 0
  ) {
    invalid('nextCursor must be strictly greater than previousCursor');
  }

  const eventFingerprint = hash([
    'company-trigger-watermark-event:v1',
    definitionId,
    eventKey,
    eventType,
    expectedVersion,
    previousCursor,
    nextCursor,
    observedFrom,
    observedThrough,
    evidenceSha256,
    observedCount,
    acceptedCount,
    rejectedCount,
    gapReason,
    resolvesEventId,
  ]);

  return Object.freeze({
    definitionId,
    eventKey,
    eventFingerprint,
    eventType,
    expectedVersion,
    previousCursor,
    nextCursor,
    observedFrom,
    observedThrough,
    evidenceSha256,
    observedCount,
    acceptedCount,
    rejectedCount,
    gapReason,
    resolvesEventId,
    actionAuthority: 'none' as const,
  });
}

function mapWatermarkState(
  row: StoredWatermarkStateRow,
): CompanyTriggerWatermarkState {
  const version = Number(row.version);
  if (!Number.isSafeInteger(version) || version < 0) {
    fail('conflict', 'stored watermark version is invalid');
  }
  const cursorObservedAt =
    row.cursor_observed_at === null
      ? null
      : new Date(row.cursor_observed_at).toISOString();
  return Object.freeze({
    definitionId: row.definition_id,
    version,
    status: row.status,
    cursorValue: row.cursor_value,
    cursorObservedAt,
    openGapEventId: row.open_gap_event_id,
    lastEventId: row.last_event_id,
  });
}

function validateEventAgainstState(
  event: CompanyTriggerWatermarkEvent,
  state: CompanyTriggerWatermarkState,
): void {
  if (state.version !== event.expectedVersion) {
    fail('stale_version', 'watermark state version changed');
  }
  if (state.cursorValue !== event.previousCursor) {
    fail('conflict', 'watermark previous cursor does not match durable state');
  }

  if (event.eventType === 'bootstrap') {
    if (state.status !== 'uninitialized') {
      fail('conflict', 'watermark source is already initialized');
    }
    return;
  }
  if (event.eventType === 'gap_reconciled') {
    if (state.status !== 'gap') {
      fail('gap_mismatch', 'watermark source has no open gap');
    }
    if (state.openGapEventId !== event.resolvesEventId) {
      fail(
        'gap_mismatch',
        'watermark reconciliation does not bind the open gap',
      );
    }
    return;
  }
  if (state.status === 'gap') {
    fail('gap_open', 'watermark source is frozen on an open gap');
  }
  if (state.status !== 'current') {
    fail('conflict', 'watermark source is not initialized');
  }
}

/** @internal The caller must supply a transaction-scoped client. */
export async function recordCompanyTriggerWatermarkWithClient(
  client: CompanyTriggerClient,
  input: unknown,
): Promise<CompanyTriggerWatermarkRecordResult> {
  const inputRecord = requireRecord(input, 'watermarkEvent');
  const definitionId = requirePattern(
    inputRecord.definitionId,
    SHA256_PATTERN,
    'definitionId',
  );
  const sourceResult = await client.query<StoredSourceContractRow>(
    `SELECT definition_id, cursor_kind, reconciliation_mode
       FROM business_v2.company_trigger_sources
      WHERE definition_id = $1`,
    [definitionId],
  );
  const source = sourceResult.rows[0];
  if (!source) fail('not_found', 'trigger source is not registered');
  if (
    source.cursor_kind === 'none' ||
    source.reconciliation_mode === 'not_applicable' ||
    source.reconciliation_mode === 'unsupported'
  ) {
    fail(
      'not_reconcilable',
      'trigger source has no bounded watermark contract',
    );
  }

  const event = normalizeCompanyTriggerWatermarkEvent(
    source.cursor_kind,
    input,
  );
  const stateResult = await client.query<StoredWatermarkStateRow>(
    `SELECT definition_id, version::text, status, cursor_value,
            cursor_observed_at, open_gap_event_id::text, last_event_id::text
       FROM business_v2.company_trigger_watermark_state
      WHERE definition_id = $1
      FOR UPDATE`,
    [event.definitionId],
  );
  const storedState = stateResult.rows[0];
  if (!storedState)
    fail('conflict', 'trigger source watermark state is missing');
  const state = mapWatermarkState(storedState);

  const existingResult = await client.query<StoredWatermarkEventRow>(
    `SELECT id::text, event_fingerprint
       FROM business_v2.company_trigger_watermark_events
      WHERE definition_id = $1 AND event_key = $2`,
    [event.definitionId, event.eventKey],
  );
  const existing = existingResult.rows[0];
  if (existing) {
    if (existing.event_fingerprint !== event.eventFingerprint) {
      fail('conflict', 'watermark event key was reused with different facts');
    }
    return {
      event,
      eventId: existing.id,
      state,
      applied: false,
      duplicate: true,
    };
  }

  validateEventAgainstState(event, state);

  const inserted = await client.query<{ id: string }>(
    `INSERT INTO business_v2.company_trigger_watermark_events
       (definition_id, event_key, event_fingerprint, event_type,
        expected_version, previous_cursor, next_cursor, observed_from,
        observed_through, evidence_sha256, observed_count, accepted_count,
        rejected_count, gap_reason, resolves_event_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING id::text`,
    [
      event.definitionId,
      event.eventKey,
      event.eventFingerprint,
      event.eventType,
      event.expectedVersion,
      event.previousCursor,
      event.nextCursor,
      event.observedFrom,
      event.observedThrough,
      event.evidenceSha256,
      event.observedCount,
      event.acceptedCount,
      event.rejectedCount,
      event.gapReason,
      event.resolvesEventId,
    ],
  );
  const eventId = inserted.rows[0]?.id;
  if (!eventId) fail('conflict', 'watermark event was not inserted');

  const isGap = event.eventType === 'gap_detected';
  const updated = await client.query<StoredWatermarkStateRow>(
    isGap
      ? `UPDATE business_v2.company_trigger_watermark_state
            SET version = version + 1,
                status = 'gap',
                open_gap_event_id = $3,
                last_event_id = $3,
                updated_at = now()
          WHERE definition_id = $1 AND version = $2
          RETURNING definition_id, version::text, status, cursor_value,
                    cursor_observed_at, open_gap_event_id::text,
                    last_event_id::text`
      : `UPDATE business_v2.company_trigger_watermark_state
            SET version = version + 1,
                status = 'current',
                cursor_value = $4,
                cursor_observed_at = $5,
                open_gap_event_id = NULL,
                last_event_id = $3,
                updated_at = now()
          WHERE definition_id = $1 AND version = $2
          RETURNING definition_id, version::text, status, cursor_value,
                    cursor_observed_at, open_gap_event_id::text,
                    last_event_id::text`,
    isGap
      ? [event.definitionId, event.expectedVersion, eventId]
      : [
          event.definitionId,
          event.expectedVersion,
          eventId,
          event.nextCursor,
          event.observedThrough,
        ],
  );
  const nextState = updated.rows[0];
  if (!nextState) fail('stale_version', 'watermark state version changed');

  return {
    event,
    eventId,
    state: mapWatermarkState(nextState),
    applied: true,
    duplicate: false,
  };
}

export async function recordCompanyTriggerWatermark(
  input: unknown,
): Promise<CompanyTriggerWatermarkRecordResult> {
  return withTransaction((client) =>
    recordCompanyTriggerWatermarkWithClient(client, input),
  );
}
