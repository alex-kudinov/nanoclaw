import {
  assignClass,
  type ClassAssignment,
  type EnrollmentFoundationState,
  type EnrollmentHistory,
} from './student-enrollment-foundation.js';

export type DeliveryBlockState = 'scheduled' | 'cancelled' | 'completed';
export type SeatPoolOperationalState = 'open' | 'closed';
export type PublicInventoryState = 'open' | 'sold_out' | 'closed';
export type ReservationChannel = 'checkout' | 'manual' | 'waitlist_offer';
export type ReservationState =
  | 'held'
  | 'consumed'
  | 'released'
  | 'expired'
  | 'cancelled';
export type WaitlistEntryState =
  | 'waiting'
  | 'offered'
  | 'accepted'
  | 'enrolled'
  | 'withdrawn'
  | 'ineligible'
  | 'expired';
export type WaitlistOfferState =
  | 'staged'
  | 'approved'
  | 'sent'
  | 'accepted'
  | 'converted'
  | 'declined'
  | 'expired'
  | 'cancelled';

export interface AcademyDeliveryBlock {
  deliveryBlockKey: string;
  componentKey: string;
  sourceScope: string;
  sourceObjectId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  sessionSetSha256: string;
  scheduleEvidenceSha256: string;
  state: DeliveryBlockState;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AcademySeatPool {
  poolKey: string;
  deliveryBlockKey: string;
  capacity: number;
  operationalState: SeatPoolOperationalState;
  closeReason: string | null;
  configurationEvidenceSha256: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AcademySeatPoolOffer {
  mappingKey: string;
  poolKey: string;
  offerKey: string;
  catalogRevision: number;
  state: 'active' | 'inactive';
  version: number;
  evidenceSha256: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AcademyCapacityReservation {
  reservationKey: string;
  poolKey: string;
  channel: ReservationChannel;
  sourceScope: string;
  idempotencyKey: string;
  offerKey: string;
  catalogRevision: number;
  orderKey: string | null;
  seatKey: string | null;
  state: ReservationState;
  version: number;
  expiresAt: string;
  reason: string | null;
  sourceEvidenceSha256: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AcademyWaitlistEntry {
  entryKey: string;
  poolKey: string;
  offerKey: string;
  catalogRevision: number;
  participantPartyId: number | null;
  contactReferenceSha256: string;
  sequenceNumber: number;
  state: WaitlistEntryState;
  version: number;
  joinedAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AcademyWaitlistOffer {
  waitlistOfferKey: string;
  entryKey: string;
  poolKey: string;
  reservationKey: string;
  state: WaitlistOfferState;
  version: number;
  expiresAt: string;
  approvalEvidenceSha256: string | null;
  deliveryReceiptSha256: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AcademyCapacityEvent {
  eventKey: string;
  subjectType:
    | 'delivery_block'
    | 'seat_pool'
    | 'offer_mapping'
    | 'reservation'
    | 'assignment'
    | 'waitlist_entry'
    | 'waitlist_offer';
  subjectKey: string;
  previousVersion: number | null;
  newVersion: number;
  eventType: string;
  evidenceSha256: string;
  actor: string;
  occurredAt: string;
  recordedAt: string;
}

export interface AcademyCapacityState {
  deliveryBlocks: Record<string, AcademyDeliveryBlock>;
  seatPools: Record<string, AcademySeatPool>;
  offerMappings: Record<string, AcademySeatPoolOffer>;
  reservations: Record<string, AcademyCapacityReservation>;
  reservationIdempotency: Record<string, string>;
  waitlistEntries: Record<string, AcademyWaitlistEntry>;
  waitlistOffers: Record<string, AcademyWaitlistOffer>;
  events: AcademyCapacityEvent[];
}

export interface InventorySnapshot {
  poolKey: string;
  deliveryBlockKey: string;
  capacity: number;
  occupied: number;
  reserved: number;
  available: number;
  waitlistCount: number;
  publicState: PublicInventoryState;
  poolVersion: number;
  calculatedAt: string;
}

export interface CapacityAndEnrollmentState {
  capacity: AcademyCapacityState;
  enrollment: EnrollmentFoundationState;
}

export class CapacityCommandError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const DELIVERY_BLOCK_STATES = new Set<DeliveryBlockState>([
  'scheduled',
  'cancelled',
  'completed',
]);
const RESERVATION_CHANNELS = new Set<ReservationChannel>([
  'checkout',
  'manual',
  'waitlist_offer',
]);
const RESERVATION_RELEASE_OUTCOMES = new Set<
  'released' | 'cancelled' | 'expired'
>(['released', 'cancelled', 'expired']);
const ACTIVE_ASSIGNMENT_STATES = new Set<ClassAssignment['state']>([
  'pending',
  'active',
]);
const ACTIVE_WAITLIST_OFFER_STATES = new Set<WaitlistOfferState>([
  'staged',
  'approved',
  'sent',
  'accepted',
]);
const TERMINAL_WAITLIST_OFFER_STATES = new Set<WaitlistOfferState>([
  'converted',
  'declined',
  'expired',
  'cancelled',
]);

export function createEmptyAcademyCapacityState(): AcademyCapacityState {
  return {
    deliveryBlocks: {},
    seatPools: {},
    offerMappings: {},
    reservations: {},
    reservationIdempotency: {},
    waitlistEntries: {},
    waitlistOffers: {},
    events: [],
  };
}

function copyCapacity(state: AcademyCapacityState): AcademyCapacityState {
  return structuredClone(state);
}

function copyEnrollment(
  state: EnrollmentFoundationState,
): EnrollmentFoundationState {
  return structuredClone(state);
}

function assertKey(value: string, field: string, maxLength = 250): void {
  if (value.length > maxLength || !/^[a-z0-9][a-z0-9._:-]*$/.test(value))
    throw new CapacityCommandError('invalid_key', `${field} is invalid`);
}

function assertLowerSnake(value: string, field: string): void {
  if (value.length > 100 || !/^[a-z][a-z0-9_]*$/.test(value))
    throw new CapacityCommandError('invalid_code', `${field} is invalid`);
}

function assertText(value: string, field: string, maxLength: number): void {
  if (!value.trim() || value.length > maxLength)
    throw new CapacityCommandError('invalid_text', `${field} is invalid`);
}

function assertSha(value: string, field: string): void {
  if (!/^[0-9a-f]{64}$/.test(value))
    throw new CapacityCommandError('invalid_hash', `${field} must be sha256`);
}

function assertTime(value: string, field: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed))
    throw new CapacityCommandError(
      'invalid_time',
      `${field} must be ISO date-time`,
    );
  return parsed;
}

function assertActor(value: string): void {
  assertText(value, 'actor', 200);
}

function assertVersion(
  actual: number,
  expected: number,
  subject: string,
): void {
  if (!Number.isInteger(expected) || actual !== expected)
    throw new CapacityCommandError(
      'stale_version',
      `${subject} version changed`,
    );
}

function assertPositiveInteger(
  value: number,
  field: string,
  max = 10_000,
): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    throw new CapacityCommandError('invalid_number', `${field} is invalid`);
}

function event(input: {
  subjectType: AcademyCapacityEvent['subjectType'];
  subjectKey: string;
  previousVersion: number | null;
  eventType: string;
  evidenceSha256: string;
  actor: string;
  occurredAt: string;
}): AcademyCapacityEvent {
  assertLowerSnake(input.eventType, 'eventType');
  const newVersion =
    input.previousVersion === null ? 0 : input.previousVersion + 1;
  return {
    eventKey: `capacity_event:${input.subjectType}:${input.subjectKey}:v${newVersion}`,
    subjectType: input.subjectType,
    subjectKey: input.subjectKey,
    previousVersion: input.previousVersion,
    newVersion,
    eventType: input.eventType,
    evidenceSha256: input.evidenceSha256,
    actor: input.actor,
    occurredAt: input.occurredAt,
    recordedAt: input.occurredAt,
  };
}

function appendEvent(
  state: AcademyCapacityState,
  input: Parameters<typeof event>[0],
): void {
  const next = event(input);
  if (state.events.some((value) => value.eventKey === next.eventKey))
    throw new CapacityCommandError(
      'duplicate_event',
      'capacity event already exists',
    );
  state.events.push(next);
}

function enrollmentHistory(input: {
  assignmentKey: string;
  previousVersion: number;
  reasonCode: string;
  evidenceSha256: string;
  actor: string;
  occurredAt: string;
}): EnrollmentHistory {
  return {
    subjectType: 'assignment',
    subjectKey: input.assignmentKey,
    previousVersion: input.previousVersion,
    newVersion: input.previousVersion + 1,
    commandKey: 'correct_or_transfer',
    reasonCode: input.reasonCode,
    evidenceSha256: input.evidenceSha256,
    actor: input.actor,
    occurredAt: input.occurredAt,
    recordedAt: input.occurredAt,
  };
}

export function registerDeliveryBlock(
  state: AcademyCapacityState,
  input: Omit<AcademyDeliveryBlock, 'createdAt' | 'updatedAt' | 'updatedBy'> & {
    actor: string;
    occurredAt: string;
  },
): AcademyCapacityState {
  assertKey(input.deliveryBlockKey, 'deliveryBlockKey');
  assertKey(input.componentKey, 'componentKey', 200);
  assertKey(input.sourceScope, 'sourceScope', 200);
  assertText(input.sourceObjectId, 'sourceObjectId', 300);
  const startsAt = assertTime(input.startsAt, 'startsAt');
  const endsAt = assertTime(input.endsAt, 'endsAt');
  if (endsAt <= startsAt)
    throw new CapacityCommandError(
      'invalid_schedule',
      'delivery block must end after it starts',
    );
  assertText(input.timezone, 'timezone', 100);
  assertSha(input.sessionSetSha256, 'sessionSetSha256');
  assertSha(input.scheduleEvidenceSha256, 'scheduleEvidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  if (!DELIVERY_BLOCK_STATES.has(input.state))
    throw new CapacityCommandError(
      'invalid_state',
      'delivery block state is invalid',
    );
  if (input.version !== 0)
    throw new CapacityCommandError(
      'invalid_initial_version',
      'delivery block version must start at zero',
    );
  const existing = state.deliveryBlocks[input.deliveryBlockKey];
  if (existing) {
    if (
      existing.componentKey === input.componentKey &&
      existing.sourceScope === input.sourceScope &&
      existing.sourceObjectId === input.sourceObjectId &&
      existing.startsAt === input.startsAt &&
      existing.endsAt === input.endsAt &&
      existing.timezone === input.timezone &&
      existing.sessionSetSha256 === input.sessionSetSha256 &&
      existing.scheduleEvidenceSha256 === input.scheduleEvidenceSha256 &&
      existing.state === input.state
    )
      return copyCapacity(state);
    throw new CapacityCommandError(
      'delivery_block_conflict',
      'delivery block key already has different facts',
    );
  }
  if (
    Object.values(state.deliveryBlocks).some(
      (value) =>
        value.sourceScope === input.sourceScope &&
        value.sourceObjectId === input.sourceObjectId,
    )
  )
    throw new CapacityCommandError(
      'schedule_source_conflict',
      'schedule source already belongs to another delivery block',
    );
  const next = copyCapacity(state);
  const { actor: _actor, occurredAt: _occurredAt, ...block } = input;
  next.deliveryBlocks[input.deliveryBlockKey] = {
    ...block,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  appendEvent(next, {
    subjectType: 'delivery_block',
    subjectKey: input.deliveryBlockKey,
    previousVersion: null,
    eventType: 'delivery_block_registered',
    evidenceSha256: input.scheduleEvidenceSha256,
    actor: input.actor,
    occurredAt: input.occurredAt,
  });
  return next;
}

export function configureSeatPool(
  state: AcademyCapacityState,
  input: {
    poolKey: string;
    deliveryBlockKey: string;
    capacity: number;
    operationalState: SeatPoolOperationalState;
    closeReason: string | null;
    version: number;
    evidenceSha256: string;
    actor: string;
    occurredAt: string;
  },
): AcademyCapacityState {
  assertKey(input.poolKey, 'poolKey');
  assertKey(input.deliveryBlockKey, 'deliveryBlockKey');
  assertPositiveInteger(input.capacity, 'capacity');
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  if (!['open', 'closed'].includes(input.operationalState))
    throw new CapacityCommandError('invalid_state', 'pool state is invalid');
  if (
    input.operationalState === 'closed' &&
    (!input.closeReason || !input.closeReason.trim())
  )
    throw new CapacityCommandError(
      'close_reason_required',
      'closed pool requires a reason',
    );
  if (input.operationalState === 'open' && input.closeReason !== null)
    throw new CapacityCommandError(
      'unexpected_close_reason',
      'open pool cannot retain a close reason',
    );
  if (input.closeReason !== null)
    assertText(input.closeReason, 'closeReason', 500);
  if (input.version !== 0)
    throw new CapacityCommandError(
      'invalid_initial_version',
      'pool version must start at zero',
    );
  const block = state.deliveryBlocks[input.deliveryBlockKey];
  if (!block || block.state !== 'scheduled')
    throw new CapacityCommandError(
      'delivery_block_unavailable',
      'scheduled delivery block is required',
    );
  const existing = state.seatPools[input.poolKey];
  if (existing) {
    if (
      existing.deliveryBlockKey === input.deliveryBlockKey &&
      existing.capacity === input.capacity &&
      existing.operationalState === input.operationalState &&
      existing.closeReason === input.closeReason &&
      existing.configurationEvidenceSha256 === input.evidenceSha256
    )
      return copyCapacity(state);
    throw new CapacityCommandError(
      'pool_configuration_conflict',
      'pool key already has different facts',
    );
  }
  if (
    Object.values(state.seatPools).some(
      (value) => value.deliveryBlockKey === input.deliveryBlockKey,
    )
  )
    throw new CapacityCommandError(
      'delivery_block_pool_conflict',
      'v1 allows exactly one pool per delivery block',
    );
  const next = copyCapacity(state);
  next.seatPools[input.poolKey] = {
    poolKey: input.poolKey,
    deliveryBlockKey: input.deliveryBlockKey,
    capacity: input.capacity,
    operationalState: input.operationalState,
    closeReason: input.closeReason,
    configurationEvidenceSha256: input.evidenceSha256,
    version: 0,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  appendEvent(next, {
    subjectType: 'seat_pool',
    subjectKey: input.poolKey,
    previousVersion: null,
    eventType: 'seat_pool_configured',
    evidenceSha256: input.evidenceSha256,
    actor: input.actor,
    occurredAt: input.occurredAt,
  });
  return next;
}

export function mapOfferToSeatPool(
  state: AcademyCapacityState,
  input: Omit<AcademySeatPoolOffer, 'createdAt' | 'updatedAt' | 'updatedBy'> & {
    expectedPoolVersion: number;
    actor: string;
    occurredAt: string;
  },
): AcademyCapacityState {
  const pool = state.seatPools[input.poolKey];
  if (!pool)
    throw new CapacityCommandError('pool_not_found', 'seat pool not found');
  assertKey(input.mappingKey, 'mappingKey');
  assertKey(input.offerKey, 'offerKey', 200);
  assertPositiveInteger(input.catalogRevision, 'catalogRevision', 1_000_000);
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  if (!['active', 'inactive'].includes(input.state))
    throw new CapacityCommandError('invalid_state', 'mapping state is invalid');
  if (input.version !== 0)
    throw new CapacityCommandError(
      'invalid_initial_version',
      'mapping version must start at zero',
    );
  const existing = state.offerMappings[input.mappingKey];
  if (existing) {
    if (
      existing.poolKey === input.poolKey &&
      existing.offerKey === input.offerKey &&
      existing.catalogRevision === input.catalogRevision &&
      existing.state === input.state &&
      existing.evidenceSha256 === input.evidenceSha256
    )
      return copyCapacity(state);
    throw new CapacityCommandError(
      'mapping_conflict',
      'mapping key already has different facts',
    );
  }
  assertVersion(pool.version, input.expectedPoolVersion, 'seat pool');
  if (
    Object.values(state.offerMappings).some(
      (value) =>
        value.poolKey === input.poolKey &&
        value.offerKey === input.offerKey &&
        value.catalogRevision === input.catalogRevision,
    )
  )
    throw new CapacityCommandError(
      'duplicate_mapping',
      'offer is already mapped to the pool',
    );
  const next = copyCapacity(state);
  const {
    expectedPoolVersion: _expected,
    actor: _actor,
    occurredAt: _occurredAt,
    ...mapping
  } = input;
  next.offerMappings[input.mappingKey] = {
    ...mapping,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  next.seatPools[input.poolKey] = {
    ...pool,
    version: pool.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  appendEvent(next, {
    subjectType: 'offer_mapping',
    subjectKey: input.mappingKey,
    previousVersion: null,
    eventType: 'offer_mapped',
    evidenceSha256: input.evidenceSha256,
    actor: input.actor,
    occurredAt: input.occurredAt,
  });
  return next;
}

function requireActiveMapping(
  state: AcademyCapacityState,
  poolKey: string,
  offerKey: string,
  catalogRevision: number,
): AcademySeatPoolOffer {
  const mapping = Object.values(state.offerMappings).find(
    (value) =>
      value.poolKey === poolKey &&
      value.offerKey === offerKey &&
      value.catalogRevision === catalogRevision &&
      value.state === 'active',
  );
  if (!mapping)
    throw new CapacityCommandError(
      'offer_not_mapped',
      'active offer mapping is required',
    );
  return mapping;
}

function hasBlockingEnrollmentException(
  state: EnrollmentFoundationState,
  subjectKeys: Array<string | null>,
): boolean {
  const keys = new Set(
    subjectKeys.filter((value): value is string => value !== null),
  );
  return Object.values(state.exceptions).some(
    (value) =>
      keys.has(value.subjectKey) &&
      ['open', 'acknowledged'].includes(value.state),
  );
}

function reservationIsLive(
  reservation: AcademyCapacityReservation,
  atMs: number,
): boolean {
  return (
    reservation.state === 'held' && Date.parse(reservation.expiresAt) > atMs
  );
}

export function showInventory(
  state: AcademyCapacityState,
  enrollment: EnrollmentFoundationState,
  poolKey: string,
  calculatedAt: string,
): InventorySnapshot {
  const pool = state.seatPools[poolKey];
  if (!pool)
    throw new CapacityCommandError('pool_not_found', 'seat pool not found');
  const atMs = assertTime(calculatedAt, 'calculatedAt');
  const occupied = Object.values(enrollment.assignments).filter(
    (value) =>
      value.deliveryBlockKey === pool.deliveryBlockKey &&
      ACTIVE_ASSIGNMENT_STATES.has(value.state),
  ).length;
  const reserved = Object.values(state.reservations).filter(
    (value) => value.poolKey === poolKey && reservationIsLive(value, atMs),
  ).length;
  const waitlistCount = Object.values(state.waitlistEntries).filter(
    (value) =>
      value.poolKey === poolKey &&
      ['waiting', 'offered', 'accepted'].includes(value.state),
  ).length;
  const available = Math.max(0, pool.capacity - occupied - reserved);
  return {
    poolKey,
    deliveryBlockKey: pool.deliveryBlockKey,
    capacity: pool.capacity,
    occupied,
    reserved,
    available,
    waitlistCount,
    publicState:
      pool.operationalState === 'closed'
        ? 'closed'
        : available === 0
          ? 'sold_out'
          : 'open',
    poolVersion: pool.version,
    calculatedAt,
  };
}

function assertReservationTtl(
  channel: ReservationChannel,
  occurredAt: string,
  expiresAt: string,
): void {
  const start = assertTime(occurredAt, 'occurredAt');
  const end = assertTime(expiresAt, 'expiresAt');
  if (end <= start)
    throw new CapacityCommandError(
      'invalid_reservation_ttl',
      'reservation must expire after it starts',
    );
  const maxMs = channel === 'checkout' ? 30 * 60_000 : 7 * 24 * 60 * 60_000;
  if (end - start > maxMs)
    throw new CapacityCommandError(
      'invalid_reservation_ttl',
      'reservation exceeds the channel TTL',
    );
}

export function reserveCapacity(
  state: AcademyCapacityState,
  enrollment: EnrollmentFoundationState,
  input: {
    reservationKey: string;
    poolKey: string;
    expectedPoolVersion: number;
    channel: ReservationChannel;
    sourceScope: string;
    idempotencyKey: string;
    offerKey: string;
    catalogRevision: number;
    orderKey: string | null;
    seatKey: string | null;
    expiresAt: string;
    reason: string | null;
    sourceEvidenceSha256: string;
    actor: string;
    occurredAt: string;
  },
): AcademyCapacityState {
  const pool = state.seatPools[input.poolKey];
  if (!pool)
    throw new CapacityCommandError('pool_not_found', 'seat pool not found');
  assertKey(input.reservationKey, 'reservationKey');
  assertKey(input.sourceScope, 'sourceScope', 200);
  assertText(input.idempotencyKey, 'idempotencyKey', 500);
  assertKey(input.offerKey, 'offerKey', 200);
  assertPositiveInteger(input.catalogRevision, 'catalogRevision', 1_000_000);
  assertSha(input.sourceEvidenceSha256, 'sourceEvidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  if (!RESERVATION_CHANNELS.has(input.channel))
    throw new CapacityCommandError(
      'invalid_channel',
      'reservation channel is invalid',
    );
  assertReservationTtl(input.channel, input.occurredAt, input.expiresAt);
  if (input.channel === 'manual') {
    if (!input.reason)
      throw new CapacityCommandError(
        'manual_reason_required',
        'manual hold requires a reason',
      );
    assertText(input.reason, 'reason', 500);
  }
  if (input.channel === 'waitlist_offer' && input.reason !== 'waitlist_offer')
    throw new CapacityCommandError(
      'waitlist_reason_required',
      'waitlist hold requires the waitlist_offer reason',
    );
  if (input.reason !== null) assertText(input.reason, 'reason', 500);
  if (input.orderKey !== null) assertKey(input.orderKey, 'orderKey', 200);
  if (input.seatKey !== null) {
    assertKey(input.seatKey, 'seatKey', 200);
    if (input.orderKey === null)
      throw new CapacityCommandError(
        'order_binding_required',
        'seat-bound reservation requires an order',
      );
  }
  if (input.orderKey !== null && !enrollment.orders[input.orderKey])
    throw new CapacityCommandError(
      'order_not_found',
      'reservation order was not found',
    );
  if (input.seatKey !== null) {
    const seat = enrollment.seats[input.seatKey];
    if (!seat || seat.orderKey !== input.orderKey)
      throw new CapacityCommandError(
        'seat_binding_conflict',
        'reservation seat does not belong to the order',
      );
  }
  const replayKey = `${input.channel}:${input.idempotencyKey}`;
  const priorKey = state.reservationIdempotency[replayKey];
  if (priorKey) {
    const prior = state.reservations[priorKey];
    if (
      prior &&
      prior.reservationKey === input.reservationKey &&
      prior.poolKey === input.poolKey &&
      prior.sourceScope === input.sourceScope &&
      prior.offerKey === input.offerKey &&
      prior.catalogRevision === input.catalogRevision &&
      prior.orderKey === input.orderKey &&
      prior.seatKey === input.seatKey &&
      prior.expiresAt === input.expiresAt &&
      prior.reason === input.reason &&
      prior.sourceEvidenceSha256 === input.sourceEvidenceSha256
    )
      return copyCapacity(state);
    throw new CapacityCommandError(
      'idempotency_conflict',
      'reservation idempotency key has different facts',
    );
  }
  assertVersion(pool.version, input.expectedPoolVersion, 'seat pool');
  if (pool.operationalState !== 'open')
    throw new CapacityCommandError('pool_closed', 'seat pool is closed');
  const block = state.deliveryBlocks[pool.deliveryBlockKey];
  if (!block || block.state !== 'scheduled')
    throw new CapacityCommandError(
      'delivery_block_unavailable',
      'scheduled delivery block is required',
    );
  requireActiveMapping(
    state,
    input.poolKey,
    input.offerKey,
    input.catalogRevision,
  );
  if (state.reservations[input.reservationKey])
    throw new CapacityCommandError(
      'duplicate_reservation',
      'reservation key already exists',
    );
  const snapshot = showInventory(
    state,
    enrollment,
    input.poolKey,
    input.occurredAt,
  );
  if (snapshot.available < 1)
    throw new CapacityCommandError(
      'capacity_unavailable',
      'no seat is available',
    );
  const next = copyCapacity(state);
  const atMs = Date.parse(input.occurredAt);
  for (const reservation of Object.values(next.reservations))
    if (
      reservation.poolKey === input.poolKey &&
      reservation.state === 'held' &&
      Date.parse(reservation.expiresAt) <= atMs
    ) {
      const previousVersion = reservation.version;
      reservation.state = 'expired';
      reservation.version += 1;
      reservation.updatedAt = input.occurredAt;
      reservation.updatedBy = input.actor;
      appendEvent(next, {
        subjectType: 'reservation',
        subjectKey: reservation.reservationKey,
        previousVersion,
        eventType: 'reservation_expired',
        evidenceSha256: input.sourceEvidenceSha256,
        actor: input.actor,
        occurredAt: input.occurredAt,
      });
    }
  next.reservations[input.reservationKey] = {
    reservationKey: input.reservationKey,
    poolKey: input.poolKey,
    channel: input.channel,
    sourceScope: input.sourceScope,
    idempotencyKey: input.idempotencyKey,
    offerKey: input.offerKey,
    catalogRevision: input.catalogRevision,
    orderKey: input.orderKey,
    seatKey: input.seatKey,
    state: 'held',
    version: 0,
    expiresAt: input.expiresAt,
    reason: input.reason,
    sourceEvidenceSha256: input.sourceEvidenceSha256,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  next.reservationIdempotency[replayKey] = input.reservationKey;
  next.seatPools[input.poolKey] = {
    ...pool,
    version: pool.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  appendEvent(next, {
    subjectType: 'reservation',
    subjectKey: input.reservationKey,
    previousVersion: null,
    eventType: 'capacity_reserved',
    evidenceSha256: input.sourceEvidenceSha256,
    actor: input.actor,
    occurredAt: input.occurredAt,
  });
  return next;
}

export function releaseReservation(
  state: AcademyCapacityState,
  input: {
    reservationKey: string;
    expectedReservationVersion: number;
    expectedPoolVersion: number;
    outcome: 'released' | 'cancelled' | 'expired';
    evidenceSha256: string;
    actor: string;
    occurredAt: string;
  },
): AcademyCapacityState {
  const reservation = state.reservations[input.reservationKey];
  if (!reservation)
    throw new CapacityCommandError(
      'reservation_not_found',
      'reservation not found',
    );
  const pool = state.seatPools[reservation.poolKey];
  if (!pool)
    throw new CapacityCommandError('pool_not_found', 'seat pool not found');
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  if (!RESERVATION_RELEASE_OUTCOMES.has(input.outcome))
    throw new CapacityCommandError(
      'invalid_state',
      'reservation release outcome is invalid',
    );
  if (reservation.state === input.outcome) {
    const receipt = [...state.events]
      .reverse()
      .find(
        (value) =>
          value.subjectType === 'reservation' &&
          value.subjectKey === input.reservationKey &&
          value.eventType === `reservation_${input.outcome}`,
      );
    if (receipt?.evidenceSha256 === input.evidenceSha256)
      return copyCapacity(state);
    throw new CapacityCommandError(
      'idempotency_conflict',
      'reservation outcome already has different evidence',
    );
  }
  assertVersion(
    reservation.version,
    input.expectedReservationVersion,
    'reservation',
  );
  assertVersion(pool.version, input.expectedPoolVersion, 'seat pool');
  if (reservation.state !== 'held')
    throw new CapacityCommandError(
      'reservation_terminal',
      'only a held reservation can be released',
    );
  const next = copyCapacity(state);
  next.reservations[input.reservationKey] = {
    ...reservation,
    state: input.outcome,
    version: reservation.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  next.seatPools[pool.poolKey] = {
    ...pool,
    version: pool.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  appendEvent(next, {
    subjectType: 'reservation',
    subjectKey: input.reservationKey,
    previousVersion: reservation.version,
    eventType: `reservation_${input.outcome}`,
    evidenceSha256: input.evidenceSha256,
    actor: input.actor,
    occurredAt: input.occurredAt,
  });
  return next;
}

export function commitClassAssignment(
  state: AcademyCapacityState,
  enrollmentState: EnrollmentFoundationState,
  input: {
    reservationKey: string;
    expectedReservationVersion: number;
    expectedPoolVersion: number;
    enrollmentKey: string;
    expectedEnrollmentVersion: number;
    entitlementKey: string;
    assignmentKey: string;
    assignmentState: 'pending' | 'active';
    evidenceSha256: string;
    actor: string;
    occurredAt: string;
  },
): CapacityAndEnrollmentState {
  const reservation = state.reservations[input.reservationKey];
  if (!reservation)
    throw new CapacityCommandError(
      'reservation_not_found',
      'reservation not found',
    );
  const pool = state.seatPools[reservation.poolKey];
  const block = pool && state.deliveryBlocks[pool.deliveryBlockKey];
  if (!pool || !block)
    throw new CapacityCommandError(
      'pool_not_found',
      'reservation pool or delivery block not found',
    );
  assertKey(input.assignmentKey, 'assignmentKey');
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  if (reservation.state === 'consumed') {
    const assignment = enrollmentState.assignments[input.assignmentKey];
    const receipt = [...state.events]
      .reverse()
      .find(
        (value) =>
          value.subjectType === 'assignment' &&
          value.subjectKey === input.assignmentKey &&
          value.eventType === 'assignment_committed',
      );
    if (
      assignment?.enrollmentKey === input.enrollmentKey &&
      assignment.entitlementKey === input.entitlementKey &&
      assignment.deliveryBlockKey === block.deliveryBlockKey &&
      assignment.state === input.assignmentState &&
      assignment.scheduleEvidenceSha256 === input.evidenceSha256 &&
      receipt?.evidenceSha256 === input.evidenceSha256
    )
      return {
        capacity: copyCapacity(state),
        enrollment: copyEnrollment(enrollmentState),
      };
    throw new CapacityCommandError(
      'idempotency_conflict',
      'consumed reservation has different assignment facts',
    );
  }
  assertVersion(
    reservation.version,
    input.expectedReservationVersion,
    'reservation',
  );
  assertVersion(pool.version, input.expectedPoolVersion, 'seat pool');
  if (
    reservation.state !== 'held' ||
    Date.parse(reservation.expiresAt) <=
      assertTime(input.occurredAt, 'occurredAt')
  )
    throw new CapacityCommandError(
      'reservation_unavailable',
      'reservation is not a live hold',
    );
  if (pool.operationalState !== 'open' || block.state !== 'scheduled')
    throw new CapacityCommandError(
      'pool_closed',
      'pool and delivery block must be open and scheduled',
    );
  const enrollment = enrollmentState.enrollments[input.enrollmentKey];
  const entitlement = enrollmentState.entitlements[input.entitlementKey];
  if (!enrollment || !entitlement)
    throw new CapacityCommandError(
      'enrollment_not_found',
      'enrollment and entitlement are required',
    );
  if (
    reservation.offerKey !== enrollment.offerKey ||
    reservation.catalogRevision !== enrollment.catalogRevision ||
    entitlement.enrollmentKey !== enrollment.enrollmentKey ||
    entitlement.componentKey !== block.componentKey
  )
    throw new CapacityCommandError(
      'reservation_assignment_conflict',
      'reservation, enrollment, entitlement, and block do not agree',
    );
  if (
    reservation.orderKey !== null &&
    reservation.orderKey !== enrollment.orderKey
  )
    throw new CapacityCommandError(
      'reservation_order_conflict',
      'reservation belongs to a different order',
    );
  if (
    reservation.seatKey !== null &&
    reservation.seatKey !== enrollment.seatKey
  )
    throw new CapacityCommandError(
      'reservation_seat_conflict',
      'reservation belongs to a different seat',
    );
  if (
    hasBlockingEnrollmentException(enrollmentState, [
      enrollment.orderKey,
      enrollment.seatKey,
      enrollment.enrollmentKey,
      entitlement.entitlementKey,
    ])
  )
    throw new CapacityCommandError(
      'enrollment_blocked',
      'an open enrollment exception blocks assignment',
    );
  if (
    Object.values(enrollmentState.assignments).some(
      (value) =>
        value.enrollmentKey === enrollment.enrollmentKey &&
        value.deliveryBlockKey === block.deliveryBlockKey &&
        ACTIVE_ASSIGNMENT_STATES.has(value.state),
    )
  )
    throw new CapacityCommandError(
      'duplicate_assignment',
      'enrollment already occupies this delivery block',
    );
  requireActiveMapping(
    state,
    pool.poolKey,
    enrollment.offerKey,
    enrollment.catalogRevision,
  );
  if (reservation.channel === 'waitlist_offer') {
    const waitlistOffer = Object.values(state.waitlistOffers).find(
      (value) => value.reservationKey === reservation.reservationKey,
    );
    if (!waitlistOffer || waitlistOffer.state !== 'accepted')
      throw new CapacityCommandError(
        'waitlist_acceptance_required',
        'waitlist reservation requires an accepted offer',
      );
  }
  let nextEnrollment: EnrollmentFoundationState;
  try {
    nextEnrollment = assignClass(enrollmentState, {
      assignmentKey: input.assignmentKey,
      enrollmentKey: input.enrollmentKey,
      entitlementKey: input.entitlementKey,
      deliveryBlockKey: block.deliveryBlockKey,
      state: input.assignmentState,
      version: 0,
      scheduleEvidenceSha256: input.evidenceSha256,
      expectedEnrollmentVersion: input.expectedEnrollmentVersion,
      actor: input.actor,
      occurredAt: input.occurredAt,
    });
  } catch (error) {
    throw new CapacityCommandError(
      'assignment_rejected',
      error instanceof Error ? error.message : 'assignment was rejected',
    );
  }
  const next = copyCapacity(state);
  next.reservations[input.reservationKey] = {
    ...reservation,
    state: 'consumed',
    version: reservation.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  next.seatPools[pool.poolKey] = {
    ...pool,
    version: pool.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  appendEvent(next, {
    subjectType: 'assignment',
    subjectKey: input.assignmentKey,
    previousVersion: null,
    eventType: 'assignment_committed',
    evidenceSha256: input.evidenceSha256,
    actor: input.actor,
    occurredAt: input.occurredAt,
  });
  if (reservation.channel === 'waitlist_offer') {
    const waitlistOffer = Object.values(next.waitlistOffers).find(
      (value) => value.reservationKey === reservation.reservationKey,
    )!;
    const entry = next.waitlistEntries[waitlistOffer.entryKey];
    const previousOfferVersion = waitlistOffer.version;
    waitlistOffer.state = 'converted';
    waitlistOffer.version += 1;
    waitlistOffer.updatedAt = input.occurredAt;
    waitlistOffer.updatedBy = input.actor;
    entry.state = 'enrolled';
    entry.version += 1;
    entry.updatedAt = input.occurredAt;
    entry.updatedBy = input.actor;
    appendEvent(next, {
      subjectType: 'waitlist_offer',
      subjectKey: waitlistOffer.waitlistOfferKey,
      previousVersion: previousOfferVersion,
      eventType: 'waitlist_offer_converted',
      evidenceSha256: input.evidenceSha256,
      actor: input.actor,
      occurredAt: input.occurredAt,
    });
  }
  return { capacity: next, enrollment: nextEnrollment };
}

function findPoolByDeliveryBlock(
  state: AcademyCapacityState,
  deliveryBlockKey: string,
): AcademySeatPool {
  const pool = Object.values(state.seatPools).find(
    (value) => value.deliveryBlockKey === deliveryBlockKey,
  );
  if (!pool)
    throw new CapacityCommandError(
      'pool_not_found',
      'assignment delivery block has no seat pool',
    );
  return pool;
}

export function transferClassAssignment(
  state: AcademyCapacityState,
  enrollmentState: EnrollmentFoundationState,
  input: {
    originAssignmentKey: string;
    expectedOriginAssignmentVersion: number;
    expectedOriginPoolVersion: number;
    destinationPoolKey: string;
    expectedDestinationPoolVersion: number;
    newAssignmentKey: string;
    expectedEnrollmentVersion: number;
    evidenceSha256: string;
    actor: string;
    occurredAt: string;
  },
): CapacityAndEnrollmentState {
  const origin = enrollmentState.assignments[input.originAssignmentKey];
  if (!origin)
    throw new CapacityCommandError(
      'assignment_not_found',
      'origin assignment was not found',
    );
  assertKey(input.newAssignmentKey, 'newAssignmentKey');
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  if (origin.state === 'transferred') {
    const destination = enrollmentState.assignments[input.newAssignmentKey];
    const destinationPool =
      destination &&
      Object.values(state.seatPools).find(
        (value) => value.deliveryBlockKey === destination.deliveryBlockKey,
      );
    const receipt = [...state.events]
      .reverse()
      .find(
        (value) =>
          value.subjectType === 'assignment' &&
          value.subjectKey === input.newAssignmentKey &&
          value.eventType === 'assignment_transferred',
      );
    if (
      destination?.enrollmentKey === origin.enrollmentKey &&
      destination.entitlementKey === origin.entitlementKey &&
      destinationPool?.poolKey === input.destinationPoolKey &&
      destination.scheduleEvidenceSha256 === input.evidenceSha256 &&
      receipt?.evidenceSha256 === input.evidenceSha256
    )
      return {
        capacity: copyCapacity(state),
        enrollment: copyEnrollment(enrollmentState),
      };
    throw new CapacityCommandError(
      'idempotency_conflict',
      'transferred assignment has different destination facts',
    );
  }
  if (!ACTIVE_ASSIGNMENT_STATES.has(origin.state))
    throw new CapacityCommandError(
      'assignment_not_transferable',
      'active or pending origin assignment is required',
    );
  assertVersion(
    origin.version,
    input.expectedOriginAssignmentVersion,
    'origin assignment',
  );
  const originPool = findPoolByDeliveryBlock(state, origin.deliveryBlockKey);
  const destinationPool = state.seatPools[input.destinationPoolKey];
  const destinationBlock =
    destinationPool && state.deliveryBlocks[destinationPool.deliveryBlockKey];
  if (!destinationPool || !destinationBlock)
    throw new CapacityCommandError(
      'destination_not_found',
      'destination pool or delivery block not found',
    );
  if (originPool.poolKey === destinationPool.poolKey)
    throw new CapacityCommandError(
      'same_pool_transfer',
      'origin and destination pools must differ',
    );
  assertVersion(
    originPool.version,
    input.expectedOriginPoolVersion,
    'origin pool',
  );
  assertVersion(
    destinationPool.version,
    input.expectedDestinationPoolVersion,
    'destination pool',
  );
  if (
    destinationPool.operationalState !== 'open' ||
    destinationBlock.state !== 'scheduled'
  )
    throw new CapacityCommandError(
      'destination_closed',
      'destination pool must be open and scheduled',
    );
  const enrollment = enrollmentState.enrollments[origin.enrollmentKey];
  const entitlement = enrollmentState.entitlements[origin.entitlementKey];
  if (!enrollment || !entitlement)
    throw new CapacityCommandError(
      'enrollment_not_found',
      'origin enrollment or entitlement not found',
    );
  assertVersion(
    enrollment.version,
    input.expectedEnrollmentVersion,
    'enrollment',
  );
  if (entitlement.componentKey !== destinationBlock.componentKey)
    throw new CapacityCommandError(
      'component_conflict',
      'destination block is for a different component',
    );
  if (
    hasBlockingEnrollmentException(enrollmentState, [
      enrollment.orderKey,
      enrollment.seatKey,
      enrollment.enrollmentKey,
      entitlement.entitlementKey,
    ])
  )
    throw new CapacityCommandError(
      'enrollment_blocked',
      'an open enrollment exception blocks transfer',
    );
  requireActiveMapping(
    state,
    destinationPool.poolKey,
    enrollment.offerKey,
    enrollment.catalogRevision,
  );
  const inventory = showInventory(
    state,
    enrollmentState,
    destinationPool.poolKey,
    input.occurredAt,
  );
  if (inventory.available < 1)
    throw new CapacityCommandError(
      'capacity_unavailable',
      'destination has no available seat',
    );
  const intermediate = copyEnrollment(enrollmentState);
  intermediate.assignments[input.originAssignmentKey] = {
    ...origin,
    state: 'transferred',
    version: origin.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  intermediate.history.push(
    enrollmentHistory({
      assignmentKey: input.originAssignmentKey,
      previousVersion: origin.version,
      reasonCode: 'transferred_to_new_delivery_block',
      evidenceSha256: input.evidenceSha256,
      actor: input.actor,
      occurredAt: input.occurredAt,
    }),
  );
  let nextEnrollment: EnrollmentFoundationState;
  try {
    nextEnrollment = assignClass(intermediate, {
      assignmentKey: input.newAssignmentKey,
      enrollmentKey: origin.enrollmentKey,
      entitlementKey: origin.entitlementKey,
      deliveryBlockKey: destinationBlock.deliveryBlockKey,
      state: origin.state,
      version: 0,
      scheduleEvidenceSha256: input.evidenceSha256,
      expectedEnrollmentVersion: input.expectedEnrollmentVersion,
      actor: input.actor,
      occurredAt: input.occurredAt,
    });
  } catch (error) {
    throw new CapacityCommandError(
      'assignment_rejected',
      error instanceof Error ? error.message : 'assignment was rejected',
    );
  }
  const next = copyCapacity(state);
  next.seatPools[originPool.poolKey] = {
    ...originPool,
    version: originPool.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  next.seatPools[destinationPool.poolKey] = {
    ...destinationPool,
    version: destinationPool.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  appendEvent(next, {
    subjectType: 'assignment',
    subjectKey: input.newAssignmentKey,
    previousVersion: null,
    eventType: 'assignment_transferred',
    evidenceSha256: input.evidenceSha256,
    actor: input.actor,
    occurredAt: input.occurredAt,
  });
  return { capacity: next, enrollment: nextEnrollment };
}

export function withdrawClassAssignment(
  state: AcademyCapacityState,
  enrollmentState: EnrollmentFoundationState,
  input: {
    assignmentKey: string;
    expectedAssignmentVersion: number;
    expectedPoolVersion: number;
    reasonCode: string;
    evidenceSha256: string;
    actor: string;
    occurredAt: string;
  },
): CapacityAndEnrollmentState {
  const assignment = enrollmentState.assignments[input.assignmentKey];
  if (!assignment)
    throw new CapacityCommandError(
      'assignment_not_found',
      'assignment was not found',
    );
  assertLowerSnake(input.reasonCode, 'reasonCode');
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  if (assignment.state === 'cancelled') {
    const history = [...enrollmentState.history]
      .reverse()
      .find(
        (value) =>
          value.subjectType === 'assignment' &&
          value.subjectKey === input.assignmentKey &&
          value.reasonCode === input.reasonCode,
      );
    const receipt = [...state.events]
      .reverse()
      .find(
        (value) =>
          value.subjectType === 'assignment' &&
          value.subjectKey === input.assignmentKey &&
          value.eventType === 'assignment_withdrawn',
      );
    if (
      history?.evidenceSha256 === input.evidenceSha256 &&
      receipt?.evidenceSha256 === input.evidenceSha256
    )
      return {
        capacity: copyCapacity(state),
        enrollment: copyEnrollment(enrollmentState),
      };
    throw new CapacityCommandError(
      'idempotency_conflict',
      'cancelled assignment has different withdrawal evidence',
    );
  }
  if (!ACTIVE_ASSIGNMENT_STATES.has(assignment.state))
    throw new CapacityCommandError(
      'assignment_not_withdrawable',
      'active or pending assignment is required',
    );
  assertVersion(
    assignment.version,
    input.expectedAssignmentVersion,
    'assignment',
  );
  const pool = findPoolByDeliveryBlock(state, assignment.deliveryBlockKey);
  assertVersion(pool.version, input.expectedPoolVersion, 'seat pool');
  const nextEnrollment = copyEnrollment(enrollmentState);
  nextEnrollment.assignments[input.assignmentKey] = {
    ...assignment,
    state: 'cancelled',
    version: assignment.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  nextEnrollment.history.push(
    enrollmentHistory({
      assignmentKey: input.assignmentKey,
      previousVersion: assignment.version,
      reasonCode: input.reasonCode,
      evidenceSha256: input.evidenceSha256,
      actor: input.actor,
      occurredAt: input.occurredAt,
    }),
  );
  const next = copyCapacity(state);
  next.seatPools[pool.poolKey] = {
    ...pool,
    version: pool.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  appendEvent(next, {
    subjectType: 'assignment',
    subjectKey: input.assignmentKey,
    previousVersion: assignment.version,
    eventType: 'assignment_withdrawn',
    evidenceSha256: input.evidenceSha256,
    actor: input.actor,
    occurredAt: input.occurredAt,
  });
  return { capacity: next, enrollment: nextEnrollment };
}

export function closeSeatPool(
  state: AcademyCapacityState,
  input: {
    poolKey: string;
    expectedPoolVersion: number;
    reason: string;
    evidenceSha256: string;
    actor: string;
    occurredAt: string;
  },
): AcademyCapacityState {
  const pool = state.seatPools[input.poolKey];
  if (!pool)
    throw new CapacityCommandError('pool_not_found', 'seat pool not found');
  assertText(input.reason, 'reason', 500);
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  if (pool.operationalState === 'closed') {
    const receipt = [...state.events]
      .reverse()
      .find(
        (value) =>
          value.subjectType === 'seat_pool' &&
          value.subjectKey === input.poolKey &&
          value.eventType === 'seat_pool_closed',
      );
    if (
      pool.closeReason === input.reason &&
      receipt?.evidenceSha256 === input.evidenceSha256
    )
      return copyCapacity(state);
    throw new CapacityCommandError(
      'idempotency_conflict',
      'closed pool has different closure evidence',
    );
  }
  assertVersion(pool.version, input.expectedPoolVersion, 'seat pool');
  const next = copyCapacity(state);
  next.seatPools[input.poolKey] = {
    ...pool,
    operationalState: 'closed',
    closeReason: input.reason,
    version: pool.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  appendEvent(next, {
    subjectType: 'seat_pool',
    subjectKey: input.poolKey,
    previousVersion: pool.version,
    eventType: 'seat_pool_closed',
    evidenceSha256: input.evidenceSha256,
    actor: input.actor,
    occurredAt: input.occurredAt,
  });
  return next;
}

export function reopenSeatPool(
  state: AcademyCapacityState,
  enrollment: EnrollmentFoundationState,
  input: {
    poolKey: string;
    expectedPoolVersion: number;
    expectedOccupied: number;
    expectedReserved: number;
    evidenceSha256: string;
    actor: string;
    occurredAt: string;
  },
): AcademyCapacityState {
  const pool = state.seatPools[input.poolKey];
  if (!pool)
    throw new CapacityCommandError('pool_not_found', 'seat pool not found');
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  const snapshot = showInventory(
    state,
    enrollment,
    input.poolKey,
    input.occurredAt,
  );
  if (pool.operationalState === 'open') {
    const receipt = [...state.events]
      .reverse()
      .find(
        (value) =>
          value.subjectType === 'seat_pool' &&
          value.subjectKey === input.poolKey &&
          value.eventType === 'seat_pool_reopened',
      );
    if (
      receipt?.evidenceSha256 === input.evidenceSha256 &&
      snapshot.occupied === input.expectedOccupied &&
      snapshot.reserved === input.expectedReserved
    )
      return copyCapacity(state);
    throw new CapacityCommandError('pool_already_open', 'pool is already open');
  }
  assertVersion(pool.version, input.expectedPoolVersion, 'seat pool');
  if (
    snapshot.occupied !== input.expectedOccupied ||
    snapshot.reserved !== input.expectedReserved
  )
    throw new CapacityCommandError(
      'inventory_changed',
      'inventory changed before reopen',
    );
  const next = copyCapacity(state);
  next.seatPools[input.poolKey] = {
    ...pool,
    operationalState: 'open',
    closeReason: null,
    version: pool.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  appendEvent(next, {
    subjectType: 'seat_pool',
    subjectKey: input.poolKey,
    previousVersion: pool.version,
    eventType: 'seat_pool_reopened',
    evidenceSha256: input.evidenceSha256,
    actor: input.actor,
    occurredAt: input.occurredAt,
  });
  return next;
}

export function joinWaitlist(
  state: AcademyCapacityState,
  input: {
    entryKey: string;
    poolKey: string;
    expectedPoolVersion: number;
    offerKey: string;
    catalogRevision: number;
    participantPartyId: number | null;
    contactReferenceSha256: string;
    sequenceNumber: number;
    actor: string;
    joinedAt: string;
  },
): AcademyCapacityState {
  const pool = state.seatPools[input.poolKey];
  if (!pool)
    throw new CapacityCommandError('pool_not_found', 'seat pool not found');
  assertVersion(pool.version, input.expectedPoolVersion, 'seat pool');
  assertKey(input.entryKey, 'entryKey');
  assertKey(input.offerKey, 'offerKey', 200);
  assertPositiveInteger(input.catalogRevision, 'catalogRevision', 1_000_000);
  assertPositiveInteger(input.sequenceNumber, 'sequenceNumber', 2_147_483_647);
  assertSha(input.contactReferenceSha256, 'contactReferenceSha256');
  assertActor(input.actor);
  assertTime(input.joinedAt, 'joinedAt');
  if (
    input.participantPartyId !== null &&
    (!Number.isSafeInteger(input.participantPartyId) ||
      input.participantPartyId < 1)
  )
    throw new CapacityCommandError(
      'invalid_participant',
      'participant Party id is invalid',
    );
  requireActiveMapping(
    state,
    input.poolKey,
    input.offerKey,
    input.catalogRevision,
  );
  const existing = state.waitlistEntries[input.entryKey];
  if (existing) {
    if (
      existing.poolKey === input.poolKey &&
      existing.offerKey === input.offerKey &&
      existing.catalogRevision === input.catalogRevision &&
      existing.participantPartyId === input.participantPartyId &&
      existing.contactReferenceSha256 === input.contactReferenceSha256 &&
      existing.sequenceNumber === input.sequenceNumber &&
      existing.joinedAt === input.joinedAt
    )
      return copyCapacity(state);
    throw new CapacityCommandError(
      'waitlist_entry_conflict',
      'waitlist entry key has different facts',
    );
  }
  if (
    Object.values(state.waitlistEntries).some(
      (value) =>
        value.poolKey === input.poolKey &&
        (value.sequenceNumber === input.sequenceNumber ||
          (value.contactReferenceSha256 === input.contactReferenceSha256 &&
            ['waiting', 'offered', 'accepted'].includes(value.state))),
    )
  )
    throw new CapacityCommandError(
      'waitlist_duplicate',
      'waitlist sequence or active contact already exists',
    );
  const next = copyCapacity(state);
  next.waitlistEntries[input.entryKey] = {
    entryKey: input.entryKey,
    poolKey: input.poolKey,
    offerKey: input.offerKey,
    catalogRevision: input.catalogRevision,
    participantPartyId: input.participantPartyId,
    contactReferenceSha256: input.contactReferenceSha256,
    sequenceNumber: input.sequenceNumber,
    state: 'waiting',
    version: 0,
    joinedAt: input.joinedAt,
    updatedAt: input.joinedAt,
    updatedBy: input.actor,
  };
  next.seatPools[input.poolKey] = {
    ...pool,
    version: pool.version + 1,
    updatedAt: input.joinedAt,
    updatedBy: input.actor,
  };
  appendEvent(next, {
    subjectType: 'waitlist_entry',
    subjectKey: input.entryKey,
    previousVersion: null,
    eventType: 'waitlist_joined',
    evidenceSha256: input.contactReferenceSha256,
    actor: input.actor,
    occurredAt: input.joinedAt,
  });
  return next;
}

export function stageWaitlistOffer(
  state: AcademyCapacityState,
  enrollment: EnrollmentFoundationState,
  input: {
    poolKey: string;
    expectedPoolVersion: number;
    waitlistOfferKey: string;
    reservationKey: string;
    reservationIdempotencyKey: string;
    expiresAt: string;
    evidenceSha256: string;
    actor: string;
    occurredAt: string;
  },
): AcademyCapacityState {
  const pool = state.seatPools[input.poolKey];
  if (!pool)
    throw new CapacityCommandError('pool_not_found', 'seat pool not found');
  assertKey(input.waitlistOfferKey, 'waitlistOfferKey');
  assertKey(input.reservationKey, 'reservationKey');
  assertText(input.reservationIdempotencyKey, 'reservationIdempotencyKey', 500);
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  assertReservationTtl('waitlist_offer', input.occurredAt, input.expiresAt);
  const existingOffer = state.waitlistOffers[input.waitlistOfferKey];
  if (existingOffer) {
    const existingReservation =
      state.reservations[existingOffer.reservationKey];
    if (
      existingOffer.poolKey === input.poolKey &&
      existingOffer.reservationKey === input.reservationKey &&
      existingOffer.expiresAt === input.expiresAt &&
      existingReservation &&
      existingReservation.idempotencyKey === input.reservationIdempotencyKey &&
      existingReservation.sourceEvidenceSha256 === input.evidenceSha256
    )
      return copyCapacity(state);
    throw new CapacityCommandError(
      'idempotency_conflict',
      'waitlist offer key already has different facts',
    );
  }
  assertVersion(pool.version, input.expectedPoolVersion, 'seat pool');
  if (
    Object.values(state.waitlistOffers).some(
      (value) =>
        value.poolKey === input.poolKey &&
        ACTIVE_WAITLIST_OFFER_STATES.has(value.state),
    )
  )
    throw new CapacityCommandError(
      'waitlist_offer_active',
      'pool already has an active waitlist offer',
    );
  const entry = Object.values(state.waitlistEntries)
    .filter(
      (value) => value.poolKey === input.poolKey && value.state === 'waiting',
    )
    .sort(
      (a, b) =>
        Date.parse(a.joinedAt) - Date.parse(b.joinedAt) ||
        a.sequenceNumber - b.sequenceNumber ||
        a.entryKey.localeCompare(b.entryKey),
    )[0];
  if (!entry)
    throw new CapacityCommandError(
      'waitlist_empty',
      'no eligible waitlist entry exists',
    );
  const reserved = reserveCapacity(state, enrollment, {
    reservationKey: input.reservationKey,
    poolKey: input.poolKey,
    expectedPoolVersion: input.expectedPoolVersion,
    channel: 'waitlist_offer',
    sourceScope: 'academy_waitlist',
    idempotencyKey: input.reservationIdempotencyKey,
    offerKey: entry.offerKey,
    catalogRevision: entry.catalogRevision,
    orderKey: null,
    seatKey: null,
    expiresAt: input.expiresAt,
    reason: 'waitlist_offer',
    sourceEvidenceSha256: input.evidenceSha256,
    actor: input.actor,
    occurredAt: input.occurredAt,
  });
  const next = copyCapacity(reserved);
  next.waitlistEntries[entry.entryKey] = {
    ...entry,
    state: 'offered',
    version: entry.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  next.waitlistOffers[input.waitlistOfferKey] = {
    waitlistOfferKey: input.waitlistOfferKey,
    entryKey: entry.entryKey,
    poolKey: input.poolKey,
    reservationKey: input.reservationKey,
    state: 'staged',
    version: 0,
    expiresAt: input.expiresAt,
    approvalEvidenceSha256: null,
    deliveryReceiptSha256: null,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  appendEvent(next, {
    subjectType: 'waitlist_offer',
    subjectKey: input.waitlistOfferKey,
    previousVersion: null,
    eventType: 'waitlist_offer_staged',
    evidenceSha256: input.evidenceSha256,
    actor: input.actor,
    occurredAt: input.occurredAt,
  });
  return next;
}

export function resolveWaitlistOffer(
  state: AcademyCapacityState,
  input: {
    waitlistOfferKey: string;
    expectedOfferVersion: number;
    expectedReservationVersion: number;
    expectedPoolVersion: number;
    outcome:
      | 'approved'
      | 'sent'
      | 'accepted'
      | 'declined'
      | 'expired'
      | 'cancelled';
    approvalEvidenceSha256: string | null;
    deliveryReceiptSha256: string | null;
    evidenceSha256: string;
    actor: string;
    occurredAt: string;
  },
): AcademyCapacityState {
  const offer = state.waitlistOffers[input.waitlistOfferKey];
  if (!offer)
    throw new CapacityCommandError(
      'waitlist_offer_not_found',
      'waitlist offer not found',
    );
  const entry = state.waitlistEntries[offer.entryKey];
  const reservation = state.reservations[offer.reservationKey];
  const pool = state.seatPools[offer.poolKey];
  if (!entry || !reservation || !pool)
    throw new CapacityCommandError(
      'waitlist_offer_corrupt',
      'waitlist offer references missing state',
    );
  if (offer.state === input.outcome) {
    const receipt = [...state.events]
      .reverse()
      .find(
        (value) =>
          value.subjectType === 'waitlist_offer' &&
          value.subjectKey === input.waitlistOfferKey &&
          value.eventType === `waitlist_offer_${input.outcome}`,
      );
    if (
      receipt?.evidenceSha256 === input.evidenceSha256 &&
      offer.approvalEvidenceSha256 === input.approvalEvidenceSha256 &&
      offer.deliveryReceiptSha256 === input.deliveryReceiptSha256
    )
      return copyCapacity(state);
    throw new CapacityCommandError(
      'idempotency_conflict',
      'waitlist outcome already has different evidence',
    );
  }
  assertVersion(offer.version, input.expectedOfferVersion, 'waitlist offer');
  assertVersion(
    reservation.version,
    input.expectedReservationVersion,
    'reservation',
  );
  assertVersion(pool.version, input.expectedPoolVersion, 'seat pool');
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  if (TERMINAL_WAITLIST_OFFER_STATES.has(offer.state))
    throw new CapacityCommandError(
      'waitlist_offer_terminal',
      'waitlist offer is terminal',
    );
  const allowed: Record<AcademyWaitlistOffer['state'], string[]> = {
    staged: ['approved', 'declined', 'expired', 'cancelled'],
    approved: ['sent', 'accepted', 'declined', 'expired', 'cancelled'],
    sent: ['accepted', 'declined', 'expired', 'cancelled'],
    accepted: [],
    converted: [],
    declined: [],
    expired: [],
    cancelled: [],
  };
  if (!allowed[offer.state].includes(input.outcome))
    throw new CapacityCommandError(
      'invalid_waitlist_transition',
      'waitlist offer transition is invalid',
    );
  if (
    ['approved', 'sent', 'accepted'].includes(input.outcome) &&
    (reservation.state !== 'held' ||
      Date.parse(reservation.expiresAt) <=
        assertTime(input.occurredAt, 'occurredAt'))
  )
    throw new CapacityCommandError(
      'waitlist_offer_expired',
      'waitlist offer no longer has a live reservation',
    );
  if (
    ['approved', 'sent', 'accepted'].includes(input.outcome) &&
    !input.approvalEvidenceSha256
  )
    throw new CapacityCommandError(
      'approval_required',
      'human approval evidence is required before outreach or acceptance',
    );
  if (input.approvalEvidenceSha256)
    assertSha(input.approvalEvidenceSha256, 'approvalEvidenceSha256');
  if (input.outcome === 'sent' && !input.deliveryReceiptSha256)
    throw new CapacityCommandError(
      'delivery_receipt_required',
      'sent state requires a delivery receipt',
    );
  if (input.deliveryReceiptSha256)
    assertSha(input.deliveryReceiptSha256, 'deliveryReceiptSha256');
  const next = copyCapacity(state);
  const nextOffer = next.waitlistOffers[input.waitlistOfferKey];
  nextOffer.state = input.outcome;
  nextOffer.version += 1;
  nextOffer.approvalEvidenceSha256 =
    input.approvalEvidenceSha256 ?? offer.approvalEvidenceSha256;
  nextOffer.deliveryReceiptSha256 =
    input.deliveryReceiptSha256 ?? offer.deliveryReceiptSha256;
  nextOffer.updatedAt = input.occurredAt;
  nextOffer.updatedBy = input.actor;
  const nextEntry = next.waitlistEntries[offer.entryKey];
  if (input.outcome === 'accepted') nextEntry.state = 'accepted';
  else if (input.outcome === 'declined') nextEntry.state = 'withdrawn';
  else if (input.outcome === 'expired') nextEntry.state = 'expired';
  else if (input.outcome === 'cancelled') nextEntry.state = 'waiting';
  nextEntry.version += 1;
  nextEntry.updatedAt = input.occurredAt;
  nextEntry.updatedBy = input.actor;
  if (['declined', 'expired', 'cancelled'].includes(input.outcome)) {
    const reservationOutcome: ReservationState =
      input.outcome === 'declined'
        ? 'released'
        : input.outcome === 'expired'
          ? 'expired'
          : 'cancelled';
    next.reservations[reservation.reservationKey] = {
      ...reservation,
      state: reservationOutcome,
      version: reservation.version + 1,
      updatedAt: input.occurredAt,
      updatedBy: input.actor,
    };
    next.seatPools[pool.poolKey] = {
      ...pool,
      version: pool.version + 1,
      updatedAt: input.occurredAt,
      updatedBy: input.actor,
    };
  }
  appendEvent(next, {
    subjectType: 'waitlist_offer',
    subjectKey: input.waitlistOfferKey,
    previousVersion: offer.version,
    eventType: `waitlist_offer_${input.outcome}`,
    evidenceSha256: input.evidenceSha256,
    actor: input.actor,
    occurredAt: input.occurredAt,
  });
  return next;
}

export function reconcileSeatPool(
  state: AcademyCapacityState,
  enrollment: EnrollmentFoundationState,
  input: {
    poolKey: string;
    expectedPoolVersion: number;
    expectedOccupied: number;
    expectedReserved: number;
    expectedWaitlistCount: number;
    evidenceSha256: string;
    actor: string;
    occurredAt: string;
  },
): AcademyCapacityState {
  const pool = state.seatPools[input.poolKey];
  if (!pool)
    throw new CapacityCommandError('pool_not_found', 'seat pool not found');
  assertVersion(pool.version, input.expectedPoolVersion, 'seat pool');
  const snapshot = showInventory(
    state,
    enrollment,
    input.poolKey,
    input.occurredAt,
  );
  if (
    snapshot.occupied !== input.expectedOccupied ||
    snapshot.reserved !== input.expectedReserved ||
    snapshot.waitlistCount !== input.expectedWaitlistCount
  )
    throw new CapacityCommandError(
      'reconciliation_mismatch',
      'observed inventory does not match expected counts',
    );
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  const next = copyCapacity(state);
  next.seatPools[input.poolKey] = {
    ...pool,
    version: pool.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  appendEvent(next, {
    subjectType: 'seat_pool',
    subjectKey: input.poolKey,
    previousVersion: pool.version,
    eventType: 'seat_pool_reconciled',
    evidenceSha256: input.evidenceSha256,
    actor: input.actor,
    occurredAt: input.occurredAt,
  });
  return next;
}
