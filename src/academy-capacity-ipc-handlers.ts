import {
  executeAcademyCapacityOperatorCommand,
  readAcademyCapacityEnrollment,
  readAcademyCapacityInventory,
  type CapacityEnrollmentReadback,
  type CapacityInventoryReadback,
  type CapacityOperatorCommand,
  type CapacityOperatorResult,
} from './academy-capacity-operator-store.js';
import { academyCapacityOperatorConfig } from './academy-capacity-operator-config.js';

export interface CapacityInventoryPayload {
  type: 'capacity_inventory';
  poolKey: string | null;
  source_container?: string;
}

export interface CapacityEnrollmentPayload {
  type: 'capacity_enrollment';
  enrollmentKey: string;
  source_container?: string;
}

export type AcademyCapacityIpcPayload =
  | CapacityInventoryPayload
  | CapacityEnrollmentPayload
  | (CapacityOperatorCommand & {
      source_container?: string;
    });

export interface AcademyCapacityIpcDeps {
  inventory(poolKey: string | null): Promise<CapacityInventoryReadback[]>;
  enrollment(enrollmentKey: string): Promise<CapacityEnrollmentReadback | null>;
  execute(
    sourceGroup: string,
    command: CapacityOperatorCommand,
  ): Promise<CapacityOperatorResult>;
  deliverSourceInput(
    groupFolder: string,
    containerName: string,
    text: string,
  ): boolean;
  mutationsEnabled(): boolean;
}

const defaultDeps: Omit<AcademyCapacityIpcDeps, 'deliverSourceInput'> = {
  inventory: readAcademyCapacityInventory,
  enrollment: readAcademyCapacityEnrollment,
  execute: executeAcademyCapacityOperatorCommand,
  mutationsEnabled: () => academyCapacityOperatorConfig().enabled,
};

const TYPES = new Set<AcademyCapacityIpcPayload['type']>([
  'capacity_inventory',
  'capacity_enrollment',
  'commit_seat',
  'reserve_manual',
  'release_reservation',
  'change_capacity',
  'transfer_commitment',
  'reconcile_commitment',
  'transfer_assignment',
  'withdraw_assignment',
  'reconcile_pool',
  'join_waitlist',
  'stage_waitlist_offer',
]);

const KEY = /^[a-z0-9][a-z0-9._:-]{0,249}$/;
const SCOPE = /^[a-z0-9][a-z0-9._:-]{0,199}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const LOWER_SNAKE = /^[a-z][a-z0-9_]{0,99}$/;
const SAFE_IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,499}$/;
const COMMITMENT_SCOPES = new Set([
  'website_stripe_sale',
  'invoice',
  'check',
  'sponsor',
  'manual_sale',
]);

function assertRecord(
  value: unknown,
): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Capacity request must be an object');
}

function exactKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
): void {
  const allowed = new Set([
    'type',
    'source_container',
    'groupFolder',
    'run_id',
    'timestamp',
    ...required,
    ...optional,
  ]);
  const missing = required.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (missing.length || unexpected.length)
    throw new Error(
      `Capacity request shape differs (missing=${missing.join(',') || 'none'} unexpected=${unexpected.join(',') || 'none'})`,
    );
}

function stringValue(value: unknown, field: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value))
    throw new Error(`${field} is invalid`);
  return value;
}

function integerValue(value: unknown, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum)
    throw new Error(`${field} is invalid`);
  return Number(value);
}

function nullableKey(value: unknown, field: string): string | null {
  if (value === null) return null;
  return stringValue(value, field, KEY);
}

function dateTime(value: unknown, field: string): string {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value)))
    throw new Error(`${field} must be an ISO date-time`);
  return value;
}

function reason(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 500 ||
    /[\u0000-\u001f\u007f]/.test(value)
  )
    throw new Error('reason must be one bounded line');
  return value;
}

function baseMutation(value: Record<string, unknown>): {
  caseKey: string;
  evidenceSha256: string;
} {
  return {
    caseKey: stringValue(value.caseKey, 'caseKey', KEY),
    evidenceSha256: stringValue(value.evidenceSha256, 'evidenceSha256', SHA256),
  };
}

export function parseAcademyCapacityIpcPayload(
  value: unknown,
): AcademyCapacityIpcPayload {
  assertRecord(value);
  if (typeof value.type !== 'string' || !TYPES.has(value.type as never))
    throw new Error('Capacity request type is unsupported');
  const source_container =
    typeof value.source_container === 'string'
      ? value.source_container
      : undefined;
  switch (value.type) {
    case 'capacity_inventory':
      exactKeys(value, ['poolKey']);
      return {
        type: value.type,
        poolKey: nullableKey(value.poolKey, 'poolKey'),
        source_container,
      };
    case 'capacity_enrollment':
      exactKeys(value, ['enrollmentKey']);
      return {
        type: value.type,
        enrollmentKey: stringValue(value.enrollmentKey, 'enrollmentKey', KEY),
        source_container,
      };
    case 'commit_seat': {
      exactKeys(value, [
        'caseKey',
        'commitmentKey',
        'poolKey',
        'expectedPoolVersion',
        'sourceScope',
        'idempotencyKey',
        'offerKey',
        'catalogRevision',
        'orderKey',
        'seatKey',
        'expiresAt',
        'reason',
        'evidenceSha256',
      ]);
      const sourceScope = stringValue(value.sourceScope, 'sourceScope', SCOPE);
      if (!COMMITMENT_SCOPES.has(sourceScope))
        throw new Error('sourceScope is not a committed-seat source');
      return {
        type: value.type,
        ...baseMutation(value),
        commitmentKey: stringValue(value.commitmentKey, 'commitmentKey', KEY),
        poolKey: stringValue(value.poolKey, 'poolKey', KEY),
        expectedPoolVersion: integerValue(
          value.expectedPoolVersion,
          'expectedPoolVersion',
        ),
        sourceScope: sourceScope as Extract<
          CapacityOperatorCommand,
          { type: 'commit_seat' }
        >['sourceScope'],
        idempotencyKey: stringValue(
          value.idempotencyKey,
          'idempotencyKey',
          SAFE_IDEMPOTENCY,
        ),
        offerKey: stringValue(value.offerKey, 'offerKey', KEY),
        catalogRevision: integerValue(
          value.catalogRevision,
          'catalogRevision',
          1,
        ),
        orderKey: nullableKey(value.orderKey, 'orderKey'),
        seatKey: nullableKey(value.seatKey, 'seatKey'),
        expiresAt: dateTime(value.expiresAt, 'expiresAt'),
        reason: reason(value.reason),
        source_container,
      };
    }
    case 'reserve_manual':
      exactKeys(value, [
        'caseKey',
        'reservationKey',
        'poolKey',
        'expectedPoolVersion',
        'sourceScope',
        'idempotencyKey',
        'offerKey',
        'catalogRevision',
        'orderKey',
        'seatKey',
        'expiresAt',
        'reason',
        'evidenceSha256',
      ]);
      return {
        type: value.type,
        ...baseMutation(value),
        reservationKey: stringValue(
          value.reservationKey,
          'reservationKey',
          KEY,
        ),
        poolKey: stringValue(value.poolKey, 'poolKey', KEY),
        expectedPoolVersion: integerValue(
          value.expectedPoolVersion,
          'expectedPoolVersion',
        ),
        sourceScope: stringValue(value.sourceScope, 'sourceScope', SCOPE),
        idempotencyKey: stringValue(
          value.idempotencyKey,
          'idempotencyKey',
          SAFE_IDEMPOTENCY,
        ),
        offerKey: stringValue(value.offerKey, 'offerKey', KEY),
        catalogRevision: integerValue(
          value.catalogRevision,
          'catalogRevision',
          1,
        ),
        orderKey: nullableKey(value.orderKey, 'orderKey'),
        seatKey: nullableKey(value.seatKey, 'seatKey'),
        expiresAt: dateTime(value.expiresAt, 'expiresAt'),
        reason: reason(value.reason),
        source_container,
      };
    case 'release_reservation': {
      exactKeys(value, [
        'caseKey',
        'reservationKey',
        'expectedReservationVersion',
        'expectedPoolVersion',
        'outcome',
        'evidenceSha256',
      ]);
      if (!['released', 'cancelled', 'expired'].includes(String(value.outcome)))
        throw new Error('reservation outcome is invalid');
      return {
        type: value.type,
        ...baseMutation(value),
        reservationKey: stringValue(
          value.reservationKey,
          'reservationKey',
          KEY,
        ),
        expectedReservationVersion: integerValue(
          value.expectedReservationVersion,
          'expectedReservationVersion',
        ),
        expectedPoolVersion: integerValue(
          value.expectedPoolVersion,
          'expectedPoolVersion',
        ),
        outcome: value.outcome as 'released' | 'cancelled' | 'expired',
        source_container,
      };
    }
    case 'change_capacity':
      exactKeys(value, [
        'caseKey',
        'poolKey',
        'expectedPoolVersion',
        'newCapacity',
        'reason',
        'evidenceSha256',
      ]);
      return {
        type: value.type,
        ...baseMutation(value),
        poolKey: stringValue(value.poolKey, 'poolKey', KEY),
        expectedPoolVersion: integerValue(
          value.expectedPoolVersion,
          'expectedPoolVersion',
        ),
        newCapacity: integerValue(value.newCapacity, 'newCapacity', 1),
        reason: reason(value.reason),
        source_container,
      };
    case 'transfer_commitment':
      exactKeys(value, [
        'caseKey',
        'commitmentKey',
        'expectedCommitmentVersion',
        'expectedOriginPoolVersion',
        'destinationPoolKey',
        'expectedDestinationPoolVersion',
        'evidenceSha256',
      ]);
      return {
        type: value.type,
        ...baseMutation(value),
        commitmentKey: stringValue(value.commitmentKey, 'commitmentKey', KEY),
        expectedCommitmentVersion: integerValue(
          value.expectedCommitmentVersion,
          'expectedCommitmentVersion',
        ),
        expectedOriginPoolVersion: integerValue(
          value.expectedOriginPoolVersion,
          'expectedOriginPoolVersion',
        ),
        destinationPoolKey: stringValue(
          value.destinationPoolKey,
          'destinationPoolKey',
          KEY,
        ),
        expectedDestinationPoolVersion: integerValue(
          value.expectedDestinationPoolVersion,
          'expectedDestinationPoolVersion',
        ),
        source_container,
      };
    case 'reconcile_commitment':
      exactKeys(value, [
        'caseKey',
        'commitmentKey',
        'expectedCommitmentVersion',
        'expectedPoolVersion',
        'assignmentKey',
        'expectedAssignmentVersion',
        'evidenceSha256',
      ]);
      return {
        type: value.type,
        ...baseMutation(value),
        commitmentKey: stringValue(value.commitmentKey, 'commitmentKey', KEY),
        expectedCommitmentVersion: integerValue(
          value.expectedCommitmentVersion,
          'expectedCommitmentVersion',
        ),
        expectedPoolVersion: integerValue(
          value.expectedPoolVersion,
          'expectedPoolVersion',
        ),
        assignmentKey: stringValue(value.assignmentKey, 'assignmentKey', KEY),
        expectedAssignmentVersion: integerValue(
          value.expectedAssignmentVersion,
          'expectedAssignmentVersion',
        ),
        source_container,
      };
    case 'transfer_assignment':
      exactKeys(value, [
        'caseKey',
        'originAssignmentKey',
        'expectedOriginAssignmentVersion',
        'expectedOriginPoolVersion',
        'destinationPoolKey',
        'expectedDestinationPoolVersion',
        'newAssignmentKey',
        'expectedEnrollmentVersion',
        'evidenceSha256',
      ]);
      return {
        type: value.type,
        ...baseMutation(value),
        originAssignmentKey: stringValue(
          value.originAssignmentKey,
          'originAssignmentKey',
          KEY,
        ),
        expectedOriginAssignmentVersion: integerValue(
          value.expectedOriginAssignmentVersion,
          'expectedOriginAssignmentVersion',
        ),
        expectedOriginPoolVersion: integerValue(
          value.expectedOriginPoolVersion,
          'expectedOriginPoolVersion',
        ),
        destinationPoolKey: stringValue(
          value.destinationPoolKey,
          'destinationPoolKey',
          KEY,
        ),
        expectedDestinationPoolVersion: integerValue(
          value.expectedDestinationPoolVersion,
          'expectedDestinationPoolVersion',
        ),
        newAssignmentKey: stringValue(
          value.newAssignmentKey,
          'newAssignmentKey',
          KEY,
        ),
        expectedEnrollmentVersion: integerValue(
          value.expectedEnrollmentVersion,
          'expectedEnrollmentVersion',
        ),
        source_container,
      };
    case 'withdraw_assignment':
      exactKeys(value, [
        'caseKey',
        'assignmentKey',
        'expectedAssignmentVersion',
        'expectedPoolVersion',
        'reasonCode',
        'evidenceSha256',
      ]);
      return {
        type: value.type,
        ...baseMutation(value),
        assignmentKey: stringValue(value.assignmentKey, 'assignmentKey', KEY),
        expectedAssignmentVersion: integerValue(
          value.expectedAssignmentVersion,
          'expectedAssignmentVersion',
        ),
        expectedPoolVersion: integerValue(
          value.expectedPoolVersion,
          'expectedPoolVersion',
        ),
        reasonCode: stringValue(value.reasonCode, 'reasonCode', LOWER_SNAKE),
        source_container,
      };
    case 'reconcile_pool':
      exactKeys(value, [
        'caseKey',
        'poolKey',
        'expectedPoolVersion',
        'expectedOccupied',
        'expectedReserved',
        'expectedWaitlistCount',
        'evidenceSha256',
      ]);
      return {
        type: value.type,
        ...baseMutation(value),
        poolKey: stringValue(value.poolKey, 'poolKey', KEY),
        expectedPoolVersion: integerValue(
          value.expectedPoolVersion,
          'expectedPoolVersion',
        ),
        expectedOccupied: integerValue(
          value.expectedOccupied,
          'expectedOccupied',
        ),
        expectedReserved: integerValue(
          value.expectedReserved,
          'expectedReserved',
        ),
        expectedWaitlistCount: integerValue(
          value.expectedWaitlistCount,
          'expectedWaitlistCount',
        ),
        source_container,
      };
    case 'join_waitlist':
      exactKeys(value, [
        'caseKey',
        'entryKey',
        'poolKey',
        'expectedPoolVersion',
        'offerKey',
        'catalogRevision',
        'participantPartyId',
        'contactReferenceSha256',
        'sequenceNumber',
        'evidenceSha256',
      ]);
      return {
        type: value.type,
        ...baseMutation(value),
        entryKey: stringValue(value.entryKey, 'entryKey', KEY),
        poolKey: stringValue(value.poolKey, 'poolKey', KEY),
        expectedPoolVersion: integerValue(
          value.expectedPoolVersion,
          'expectedPoolVersion',
        ),
        offerKey: stringValue(value.offerKey, 'offerKey', KEY),
        catalogRevision: integerValue(
          value.catalogRevision,
          'catalogRevision',
          1,
        ),
        participantPartyId:
          value.participantPartyId === null
            ? null
            : integerValue(value.participantPartyId, 'participantPartyId', 1),
        contactReferenceSha256: stringValue(
          value.contactReferenceSha256,
          'contactReferenceSha256',
          SHA256,
        ),
        sequenceNumber: integerValue(value.sequenceNumber, 'sequenceNumber', 1),
        source_container,
      };
    case 'stage_waitlist_offer':
      exactKeys(value, [
        'caseKey',
        'poolKey',
        'expectedPoolVersion',
        'waitlistOfferKey',
        'reservationKey',
        'reservationIdempotencyKey',
        'expiresAt',
        'evidenceSha256',
      ]);
      return {
        type: value.type,
        ...baseMutation(value),
        poolKey: stringValue(value.poolKey, 'poolKey', KEY),
        expectedPoolVersion: integerValue(
          value.expectedPoolVersion,
          'expectedPoolVersion',
        ),
        waitlistOfferKey: stringValue(
          value.waitlistOfferKey,
          'waitlistOfferKey',
          KEY,
        ),
        reservationKey: stringValue(
          value.reservationKey,
          'reservationKey',
          KEY,
        ),
        reservationIdempotencyKey: stringValue(
          value.reservationIdempotencyKey,
          'reservationIdempotencyKey',
          SAFE_IDEMPOTENCY,
        ),
        expiresAt: dateTime(value.expiresAt, 'expiresAt'),
        source_container,
      };
  }
  throw new Error('Capacity request type is unsupported');
}

export function isAcademyCapacityIpcType(
  type: string,
): type is AcademyCapacityIpcPayload['type'] {
  return TYPES.has(type as AcademyCapacityIpcPayload['type']);
}

function inventoryText(rows: CapacityInventoryReadback[]): string {
  if (rows.length === 0) return '[CAPACITY INVENTORY] No matching pool.';
  return rows
    .map(
      (row) =>
        `[CAPACITY INVENTORY] ${row.poolKey} v${row.poolVersion} | ${row.deliveryBlockKey} | ${row.publicState} | capacity ${row.capacity}, occupied ${row.occupied}, committed ${row.committed}, temporary holds ${row.reserved}, available ${row.available}, waitlist ${row.waitlistCount} | exceptions ${row.openExceptions.map((item) => `${item.reasonCode}/${item.severity}`).join('; ') || 'none'} | ${row.startsAt} to ${row.endsAt} ${row.timezone}`,
    )
    .join('\n');
}

function enrollmentText(value: CapacityEnrollmentReadback | null): string {
  if (!value) return '[CAPACITY ENROLLMENT] Exact enrollment key not found.';
  return [
    `[CAPACITY ENROLLMENT] ${value.enrollmentKey} v${value.version} | ${value.state} | offer ${value.offerKey} | bundle ${value.bundleKey} | catalog ${value.catalogRevision}`,
    `Assignments: ${value.assignments.map((item) => `${item.assignmentKey} v${item.version} ${item.state} ${item.deliveryBlockKey}`).join('; ') || 'none'}`,
    `Open exceptions: ${value.openExceptions.map((item) => `${item.reasonCode}/${item.severity}`).join('; ') || 'none'}`,
  ].join('\n');
}

function resultText(result: CapacityOperatorResult): string {
  return [
    `[CAPACITY RESULT] ${result.caseKey} | ${result.commandType} | ${result.state} | ${result.code} | replayed ${result.replayed ? 'yes' : 'no'}`,
    `Receipt-SHA256: ${result.resultSha256}`,
    `Readback: ${JSON.stringify(result.summary)}`,
    result.replayed
      ? 'Returned the original immutable command receipt. Refresh inventory or enrollment state before relying on current availability.'
      : result.state === 'applied'
        ? 'The host transaction and exact readback completed.'
        : 'Do not retry with altered IDs or versions. Refresh exact inventory/enrollment state and escalate the held case.',
  ].join('\n');
}

export async function dispatchAcademyCapacityIpc(
  sourceGroup: string,
  rawPayload: unknown,
  deps: Pick<AcademyCapacityIpcDeps, 'deliverSourceInput'> &
    Partial<Omit<AcademyCapacityIpcDeps, 'deliverSourceInput'>>,
): Promise<void> {
  if (sourceGroup !== 'capacity')
    throw new Error('Academy Capacity IPC is restricted to capacity');
  const runtime = { ...defaultDeps, ...deps } as AcademyCapacityIpcDeps;
  const payload = parseAcademyCapacityIpcPayload(rawPayload);
  if (!payload.source_container)
    throw new Error('Capacity request requires host-bound source_container');
  let text: string;
  if (payload.type === 'capacity_inventory') {
    text = inventoryText(await runtime.inventory(payload.poolKey));
  } else if (payload.type === 'capacity_enrollment') {
    text = enrollmentText(await runtime.enrollment(payload.enrollmentKey));
  } else {
    if (!runtime.mutationsEnabled())
      throw new Error('Academy Capacity operator mutations are disabled');
    const { source_container: _sourceContainer, ...command } = payload;
    text = resultText(
      await runtime.execute(sourceGroup, command as CapacityOperatorCommand),
    );
  }
  if (!runtime.deliverSourceInput(sourceGroup, payload.source_container, text))
    throw new Error('Capacity result delivery was not accepted by host queue');
}
