import crypto from 'node:crypto';

import type { PoolClient, QueryResultRow } from 'pg';

import { enqueueAcademyCapacityPublications } from './academy-capacity-publication.js';
import { logger } from './logger.js';

import {
  CapacityCommandError,
  changeSeatPoolCapacity,
  createEmptyAcademyCapacityState,
  joinWaitlist,
  reconcileCommitment,
  reconcileSeatPool,
  releaseReservation,
  reserveCapacity,
  showInventory,
  stageWaitlistOffer,
  transferCommitment,
  transferClassAssignment,
  withdrawClassAssignment,
  type AcademyCapacityState,
  type InventorySnapshot,
} from './academy-capacity.js';
import { withTransaction } from './business-db.js';
import {
  createEmptyEnrollmentFoundationState,
  type EnrollmentFoundationState,
} from './student-enrollment-foundation.js';

export type CapacityOperatorCommand =
  | {
      type: 'commit_seat';
      caseKey: string;
      commitmentKey: string;
      poolKey: string;
      expectedPoolVersion: number;
      sourceScope:
        | 'website_stripe_sale'
        | 'invoice'
        | 'check'
        | 'sponsor'
        | 'manual_sale';
      idempotencyKey: string;
      offerKey: string;
      catalogRevision: number;
      orderKey: string | null;
      seatKey: string | null;
      expiresAt: string;
      reason: string;
      evidenceSha256: string;
    }
  | {
      type: 'reserve_manual';
      caseKey: string;
      reservationKey: string;
      poolKey: string;
      expectedPoolVersion: number;
      sourceScope: string;
      idempotencyKey: string;
      offerKey: string;
      catalogRevision: number;
      orderKey: string | null;
      seatKey: string | null;
      expiresAt: string;
      reason: string;
      evidenceSha256: string;
    }
  | {
      type: 'release_reservation';
      caseKey: string;
      reservationKey: string;
      expectedReservationVersion: number;
      expectedPoolVersion: number;
      outcome: 'released' | 'cancelled' | 'expired';
      evidenceSha256: string;
    }
  | {
      type: 'change_capacity';
      caseKey: string;
      poolKey: string;
      expectedPoolVersion: number;
      newCapacity: number;
      reason: string;
      evidenceSha256: string;
    }
  | {
      type: 'transfer_commitment';
      caseKey: string;
      commitmentKey: string;
      expectedCommitmentVersion: number;
      expectedOriginPoolVersion: number;
      destinationPoolKey: string;
      expectedDestinationPoolVersion: number;
      evidenceSha256: string;
    }
  | {
      type: 'reconcile_commitment';
      caseKey: string;
      commitmentKey: string;
      expectedCommitmentVersion: number;
      expectedPoolVersion: number;
      assignmentKey: string;
      expectedAssignmentVersion: number;
      evidenceSha256: string;
    }
  | {
      type: 'transfer_assignment';
      caseKey: string;
      originAssignmentKey: string;
      expectedOriginAssignmentVersion: number;
      expectedOriginPoolVersion: number;
      destinationPoolKey: string;
      expectedDestinationPoolVersion: number;
      newAssignmentKey: string;
      expectedEnrollmentVersion: number;
      evidenceSha256: string;
    }
  | {
      type: 'withdraw_assignment';
      caseKey: string;
      assignmentKey: string;
      expectedAssignmentVersion: number;
      expectedPoolVersion: number;
      reasonCode: string;
      evidenceSha256: string;
    }
  | {
      type: 'reconcile_pool';
      caseKey: string;
      poolKey: string;
      expectedPoolVersion: number;
      expectedOccupied: number;
      expectedReserved: number;
      expectedWaitlistCount: number;
      evidenceSha256: string;
    }
  | {
      type: 'join_waitlist';
      caseKey: string;
      entryKey: string;
      poolKey: string;
      expectedPoolVersion: number;
      offerKey: string;
      catalogRevision: number;
      participantPartyId: number | null;
      contactReferenceSha256: string;
      sequenceNumber: number;
      evidenceSha256: string;
    }
  | {
      type: 'stage_waitlist_offer';
      caseKey: string;
      poolKey: string;
      expectedPoolVersion: number;
      waitlistOfferKey: string;
      reservationKey: string;
      reservationIdempotencyKey: string;
      expiresAt: string;
      evidenceSha256: string;
    };

export interface CapacityOperatorResult {
  caseKey: string;
  commandType: CapacityOperatorCommand['type'];
  state: 'applied' | 'denied' | 'needs_review' | 'failed';
  code: string;
  replayed: boolean;
  resultSha256: string;
  summary: Record<string, unknown>;
}

export interface CapacityInventoryReadback extends InventorySnapshot {
  componentKey: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  openExceptions: Array<{ reasonCode: string; severity: string }>;
}

export interface CapacityEnrollmentReadback {
  enrollmentKey: string;
  offerKey: string;
  bundleKey: string;
  catalogRevision: number;
  state: string;
  version: number;
  assignments: Array<{
    assignmentKey: string;
    deliveryBlockKey: string;
    state: string;
    version: number;
  }>;
  openExceptions: Array<{ reasonCode: string; severity: string }>;
}

export interface CapacityOperatorStoreDeps {
  transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
  now(): string;
  enqueuePublication(): Promise<unknown>;
}

const defaultDeps: CapacityOperatorStoreDeps = {
  transaction: withTransaction,
  now: () => new Date().toISOString(),
  enqueuePublication: () => enqueueAcademyCapacityPublications('threshold'),
};

const REVIEW_CODES = new Set([
  'assignment_not_found',
  'capacity_below_commitments',
  'capacity_unavailable',
  'commitment_not_found',
  'commitment_assignment_conflict',
  'destination_not_found',
  'enrollment_blocked',
  'enrollment_not_found',
  'inventory_changed',
  'pool_not_found',
  'reconciliation_mismatch',
  'reservation_not_found',
  'stale_version',
  'waitlist_empty',
  'waitlist_offer_active',
  'pool_write_conflict',
  'reservation_insert_missing_reference',
  'reservation_write_conflict',
  'waitlist_entry_insert_missing_reference',
  'waitlist_entry_write_conflict',
  'waitlist_offer_insert_missing_reference',
  'enrollment_write_conflict',
  'assignment_insert_missing_reference',
  'assignment_write_conflict',
  'enrollment_history_insert_failed',
  'capacity_event_insert_failed',
]);

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function asIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function asNullableIso(value: unknown): string | null {
  return value == null ? null : asIso(value);
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error('unsafe database integer');
  return parsed;
}

function requestSummary(
  command: CapacityOperatorCommand,
): Record<string, unknown> {
  const shared = { commandType: command.type };
  switch (command.type) {
    case 'commit_seat':
      return {
        ...shared,
        commitmentKey: command.commitmentKey,
        poolKey: command.poolKey,
        expectedPoolVersion: command.expectedPoolVersion,
        sourceScope: command.sourceScope,
        idempotencyKeySha256: sha256(command.idempotencyKey),
        offerKey: command.offerKey,
        catalogRevision: command.catalogRevision,
        orderKey: command.orderKey,
        seatKey: command.seatKey,
        expiresAt: command.expiresAt,
        reasonSha256: sha256(command.reason),
        evidenceSha256: command.evidenceSha256,
      };
    case 'reserve_manual':
      return {
        ...shared,
        reservationKey: command.reservationKey,
        poolKey: command.poolKey,
        expectedPoolVersion: command.expectedPoolVersion,
        sourceScope: command.sourceScope,
        idempotencyKeySha256: sha256(command.idempotencyKey),
        offerKey: command.offerKey,
        catalogRevision: command.catalogRevision,
        orderKey: command.orderKey,
        seatKey: command.seatKey,
        expiresAt: command.expiresAt,
        reasonSha256: sha256(command.reason),
        evidenceSha256: command.evidenceSha256,
      };
    case 'release_reservation':
      return { ...shared, ...command };
    case 'change_capacity':
    case 'transfer_commitment':
    case 'reconcile_commitment':
      return { ...shared, ...command };
    case 'transfer_assignment':
      return { ...shared, ...command };
    case 'withdraw_assignment':
      return { ...shared, ...command };
    case 'reconcile_pool':
      return { ...shared, ...command };
    case 'join_waitlist':
      return { ...shared, ...command };
    case 'stage_waitlist_offer':
      return {
        ...shared,
        ...command,
        reservationIdempotencyKeySha256: sha256(
          command.reservationIdempotencyKey,
        ),
        reservationIdempotencyKey: undefined,
      };
  }
}

async function lockPool(client: PoolClient, poolKey: string): Promise<void> {
  const result = await client.query(
    `SELECT id
       FROM business_v2.academy_seat_pools
      WHERE pool_key=$1
      FOR UPDATE`,
    [poolKey],
  );
  if (result.rowCount !== 1)
    throw new CapacityCommandError('pool_not_found', 'seat pool not found');
}

async function lockReservationPool(
  client: PoolClient,
  reservationKey: string,
): Promise<void> {
  const found = await client.query<{ pool_key: string }>(
    `SELECT p.pool_key
       FROM business_v2.academy_capacity_reservations r
       JOIN business_v2.academy_seat_pools p ON p.id=r.pool_id
      WHERE r.reservation_key=$1`,
    [reservationKey],
  );
  if (!found.rows[0])
    throw new CapacityCommandError(
      'reservation_not_found',
      'reservation not found',
    );
  await lockPool(client, found.rows[0].pool_key);
  await client.query(
    `SELECT id FROM business_v2.academy_capacity_reservations
      WHERE reservation_key=$1 FOR UPDATE`,
    [reservationKey],
  );
}

async function lockCommitmentPools(
  client: PoolClient,
  commitmentKey: string,
  destinationPoolKey?: string,
): Promise<void> {
  const result = await client.query<{ id: string }>(
    `SELECT p.id::text
       FROM business_v2.academy_seat_pools p
      WHERE p.pool_key=$2
         OR p.id=(
              SELECT r.pool_id
                FROM business_v2.academy_capacity_reservations r
               WHERE r.reservation_key=$1 AND r.channel='commitment'
            )
      ORDER BY p.id`,
    [commitmentKey, destinationPoolKey ?? '__none__'],
  );
  const expected = destinationPoolKey ? 2 : 1;
  if (result.rows.length !== expected)
    throw new CapacityCommandError(
      destinationPoolKey ? 'destination_not_found' : 'commitment_not_found',
      'committed seat or destination pool was not found',
    );
  const ids = result.rows.map((row) => asNumber(row.id));
  await client.query(
    `SELECT id
       FROM business_v2.academy_seat_pools
      WHERE id=ANY($1::bigint[])
      ORDER BY id
      FOR UPDATE`,
    [ids],
  );
  await client.query(
    `SELECT id FROM business_v2.academy_capacity_reservations
      WHERE reservation_key=$1 AND channel='commitment' FOR UPDATE`,
    [commitmentKey],
  );
}

async function lockAssignmentPools(
  client: PoolClient,
  originAssignmentKey: string,
  destinationPoolKey: string,
): Promise<void> {
  const result = await client.query<{ id: string }>(
    `SELECT p.id::text
       FROM business_v2.academy_seat_pools p
      WHERE p.pool_key=$2
         OR p.delivery_block_id=(
              SELECT d.id
                FROM business_v2.student_class_assignments a
                JOIN business_v2.academy_delivery_blocks d
                  ON d.delivery_block_key=a.delivery_block_key
               WHERE a.assignment_key=$1
            )
      ORDER BY p.id`,
    [originAssignmentKey, destinationPoolKey],
  );
  if (result.rows.length !== 2)
    throw new CapacityCommandError(
      'destination_not_found',
      'origin assignment or destination pool not found',
    );
  const ids = result.rows.map((row) => asNumber(row.id));
  await client.query(
    `SELECT id
       FROM business_v2.academy_seat_pools
      WHERE id=ANY($1::bigint[])
      ORDER BY id
      FOR UPDATE`,
    [ids],
  );
}

async function lockAssignmentPool(
  client: PoolClient,
  assignmentKey: string,
): Promise<void> {
  const result = await client.query<{ pool_key: string }>(
    `SELECT p.pool_key
       FROM business_v2.student_class_assignments a
       JOIN business_v2.academy_delivery_blocks d
         ON d.delivery_block_key=a.delivery_block_key
       JOIN business_v2.academy_seat_pools p ON p.delivery_block_id=d.id
      WHERE a.assignment_key=$1`,
    [assignmentKey],
  );
  if (!result.rows[0])
    throw new CapacityCommandError(
      'assignment_not_found',
      'assignment was not found',
    );
  await lockPool(client, result.rows[0].pool_key);
  await client.query(
    `SELECT id FROM business_v2.student_class_assignments
      WHERE assignment_key=$1 FOR UPDATE`,
    [assignmentKey],
  );
}

async function lockForCommand(
  client: PoolClient,
  command: CapacityOperatorCommand,
): Promise<void> {
  switch (command.type) {
    case 'release_reservation':
      return lockReservationPool(client, command.reservationKey);
    case 'transfer_commitment':
      return lockCommitmentPools(
        client,
        command.commitmentKey,
        command.destinationPoolKey,
      );
    case 'reconcile_commitment':
      await lockCommitmentPools(client, command.commitmentKey);
      await client.query(
        `SELECT id FROM business_v2.student_class_assignments
          WHERE assignment_key=$1 FOR UPDATE`,
        [command.assignmentKey],
      );
      return;
    case 'transfer_assignment':
      return lockAssignmentPools(
        client,
        command.originAssignmentKey,
        command.destinationPoolKey,
      );
    case 'withdraw_assignment':
      return lockAssignmentPool(client, command.assignmentKey);
    default:
      return lockPool(client, command.poolKey);
  }
}

async function loadStates(client: PoolClient): Promise<{
  capacity: AcademyCapacityState;
  enrollment: EnrollmentFoundationState;
}> {
  const capacity = createEmptyAcademyCapacityState();
  const enrollment = createEmptyEnrollmentFoundationState();

  const blocks = await client.query(
    `SELECT delivery_block_key,component_key,source_scope,source_object_id,
            starts_at,ends_at,timezone,session_set_sha256,
            schedule_evidence_sha256,state,version,created_at,updated_at,updated_by
       FROM business_v2.academy_delivery_blocks`,
  );
  for (const row of blocks.rows as QueryResultRow[]) {
    capacity.deliveryBlocks[String(row.delivery_block_key)] = {
      deliveryBlockKey: String(row.delivery_block_key),
      componentKey: String(row.component_key),
      sourceScope: String(row.source_scope),
      sourceObjectId: String(row.source_object_id),
      startsAt: asIso(row.starts_at),
      endsAt: asIso(row.ends_at),
      timezone: String(row.timezone),
      sessionSetSha256: String(row.session_set_sha256),
      scheduleEvidenceSha256: String(row.schedule_evidence_sha256),
      state: row.state as never,
      version: asNumber(row.version),
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      updatedBy: String(row.updated_by),
    };
  }

  const pools = await client.query(
    `SELECT p.pool_key,d.delivery_block_key,p.capacity,p.operational_state,
            p.close_reason,p.configuration_evidence_sha256,p.version,
            p.created_at,p.updated_at,p.updated_by
       FROM business_v2.academy_seat_pools p
       JOIN business_v2.academy_delivery_blocks d ON d.id=p.delivery_block_id`,
  );
  for (const row of pools.rows as QueryResultRow[]) {
    capacity.seatPools[String(row.pool_key)] = {
      poolKey: String(row.pool_key),
      deliveryBlockKey: String(row.delivery_block_key),
      capacity: asNumber(row.capacity),
      operationalState: row.operational_state as never,
      closeReason: row.close_reason == null ? null : String(row.close_reason),
      configurationEvidenceSha256: String(row.configuration_evidence_sha256),
      version: asNumber(row.version),
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      updatedBy: String(row.updated_by),
    };
  }

  const mappings = await client.query(
    `SELECT m.mapping_key,p.pool_key,m.offer_key,m.catalog_revision,m.state,
            m.version,m.evidence_sha256,m.created_at,m.updated_at,m.updated_by
       FROM business_v2.academy_seat_pool_offers m
       JOIN business_v2.academy_seat_pools p ON p.id=m.pool_id`,
  );
  for (const row of mappings.rows as QueryResultRow[]) {
    capacity.offerMappings[String(row.mapping_key)] = {
      mappingKey: String(row.mapping_key),
      poolKey: String(row.pool_key),
      offerKey: String(row.offer_key),
      catalogRevision: asNumber(row.catalog_revision),
      state: row.state as never,
      version: asNumber(row.version),
      evidenceSha256: String(row.evidence_sha256),
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      updatedBy: String(row.updated_by),
    };
  }

  const reservations = await client.query(
    `SELECT r.reservation_key,p.pool_key,r.channel,r.source_scope,
            r.idempotency_key,r.offer_key,r.catalog_revision,o.order_key,
            s.seat_key,r.state,r.version,r.expires_at,r.reason,
            r.source_evidence_sha256,r.created_at,r.updated_at,r.updated_by
       FROM business_v2.academy_capacity_reservations r
       JOIN business_v2.academy_seat_pools p ON p.id=r.pool_id
       LEFT JOIN business_v2.student_enrollment_orders o ON o.id=r.order_id
       LEFT JOIN business_v2.student_enrollment_seats s ON s.id=r.seat_id`,
  );
  for (const row of reservations.rows as QueryResultRow[]) {
    const key = String(row.reservation_key);
    capacity.reservations[key] = {
      reservationKey: key,
      poolKey: String(row.pool_key),
      channel: row.channel as never,
      sourceScope: String(row.source_scope),
      idempotencyKey: String(row.idempotency_key),
      offerKey: String(row.offer_key),
      catalogRevision: asNumber(row.catalog_revision),
      orderKey: row.order_key == null ? null : String(row.order_key),
      seatKey: row.seat_key == null ? null : String(row.seat_key),
      state: row.state as never,
      version: asNumber(row.version),
      expiresAt: asIso(row.expires_at),
      reason: row.reason == null ? null : String(row.reason),
      sourceEvidenceSha256: String(row.source_evidence_sha256),
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      updatedBy: String(row.updated_by),
    };
    capacity.reservationIdempotency[
      `${String(row.channel)}:${String(row.idempotency_key)}`
    ] = key;
  }

  const entries = await client.query(
    `SELECT w.entry_key,p.pool_key,w.offer_key,w.catalog_revision,
            w.participant_party_id,w.contact_reference_sha256,
            w.sequence_number,w.state,w.version,w.joined_at,w.updated_at,w.updated_by
       FROM business_v2.academy_waitlist_entries w
       JOIN business_v2.academy_seat_pools p ON p.id=w.pool_id`,
  );
  for (const row of entries.rows as QueryResultRow[]) {
    capacity.waitlistEntries[String(row.entry_key)] = {
      entryKey: String(row.entry_key),
      poolKey: String(row.pool_key),
      offerKey: String(row.offer_key),
      catalogRevision: asNumber(row.catalog_revision),
      participantPartyId:
        row.participant_party_id == null
          ? null
          : asNumber(row.participant_party_id),
      contactReferenceSha256: String(row.contact_reference_sha256),
      sequenceNumber: asNumber(row.sequence_number),
      state: row.state as never,
      version: asNumber(row.version),
      joinedAt: asIso(row.joined_at),
      updatedAt: asIso(row.updated_at),
      updatedBy: String(row.updated_by),
    };
  }

  const offers = await client.query(
    `SELECT w.waitlist_offer_key,e.entry_key,p.pool_key,r.reservation_key,
            w.state,w.version,w.expires_at,w.approval_evidence_sha256,
            w.delivery_receipt_sha256,w.created_at,w.updated_at,w.updated_by
       FROM business_v2.academy_waitlist_offers w
       JOIN business_v2.academy_waitlist_entries e ON e.id=w.entry_id
       JOIN business_v2.academy_seat_pools p ON p.id=w.pool_id
       JOIN business_v2.academy_capacity_reservations r ON r.id=w.reservation_id`,
  );
  for (const row of offers.rows as QueryResultRow[]) {
    capacity.waitlistOffers[String(row.waitlist_offer_key)] = {
      waitlistOfferKey: String(row.waitlist_offer_key),
      entryKey: String(row.entry_key),
      poolKey: String(row.pool_key),
      reservationKey: String(row.reservation_key),
      state: row.state as never,
      version: asNumber(row.version),
      expiresAt: asIso(row.expires_at),
      approvalEvidenceSha256:
        row.approval_evidence_sha256 == null
          ? null
          : String(row.approval_evidence_sha256),
      deliveryReceiptSha256:
        row.delivery_receipt_sha256 == null
          ? null
          : String(row.delivery_receipt_sha256),
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      updatedBy: String(row.updated_by),
    };
  }

  const events = await client.query(
    `SELECT event_key,subject_type,subject_key,previous_version,new_version,
            event_type,evidence_sha256,actor,occurred_at,recorded_at
       FROM business_v2.academy_capacity_events ORDER BY id`,
  );
  capacity.events = (events.rows as QueryResultRow[]).map((row) => ({
    eventKey: String(row.event_key),
    subjectType: row.subject_type as never,
    subjectKey: String(row.subject_key),
    previousVersion:
      row.previous_version == null ? null : asNumber(row.previous_version),
    newVersion: asNumber(row.new_version),
    eventType: String(row.event_type),
    evidenceSha256: String(row.evidence_sha256),
    actor: String(row.actor),
    occurredAt: asIso(row.occurred_at),
    recordedAt: asIso(row.recorded_at),
  }));

  const orders = await client.query(
    `SELECT order_key,source_channel,offer_key,bundle_key,bundle_version,
            payer_party_id,seat_count,financial_classification,state,version,
            policy_revision,evidence_sha256,effective_at,created_at,updated_at,updated_by
       FROM business_v2.student_enrollment_orders`,
  );
  for (const row of orders.rows as QueryResultRow[]) {
    enrollment.orders[String(row.order_key)] = {
      orderKey: String(row.order_key),
      sourceChannel: row.source_channel as never,
      offerKey: row.offer_key == null ? null : String(row.offer_key),
      bundleKey: row.bundle_key == null ? null : String(row.bundle_key),
      bundleVersion:
        row.bundle_version == null ? null : asNumber(row.bundle_version),
      payerPartyId:
        row.payer_party_id == null ? null : asNumber(row.payer_party_id),
      seatCount: asNumber(row.seat_count),
      financialClassification: row.financial_classification as never,
      state: row.state as never,
      version: asNumber(row.version),
      policyRevision: asNumber(row.policy_revision),
      evidenceSha256: String(row.evidence_sha256),
      effectiveAt: asNullableIso(row.effective_at),
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      updatedBy: String(row.updated_by),
    };
  }

  const seats = await client.query(
    `SELECT s.seat_key,o.order_key,s.seat_number,s.participant_party_id,
            s.participant_evidence_sha256,s.payer_relationship,s.state,s.version,
            s.created_at,s.updated_at,s.updated_by
       FROM business_v2.student_enrollment_seats s
       JOIN business_v2.student_enrollment_orders o ON o.id=s.order_id`,
  );
  for (const row of seats.rows as QueryResultRow[]) {
    enrollment.seats[String(row.seat_key)] = {
      seatKey: String(row.seat_key),
      orderKey: String(row.order_key),
      seatNumber: asNumber(row.seat_number),
      participantPartyId:
        row.participant_party_id == null
          ? null
          : asNumber(row.participant_party_id),
      participantEvidenceSha256:
        row.participant_evidence_sha256 == null
          ? null
          : String(row.participant_evidence_sha256),
      payerRelationship: row.payer_relationship as never,
      state: row.state as never,
      version: asNumber(row.version),
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      updatedBy: String(row.updated_by),
    };
  }

  const enrollments = await client.query(
    `SELECT e.enrollment_key,o.order_key,s.seat_key,e.participant_party_id,
            e.offer_key,e.bundle_key,e.bundle_version,e.catalog_revision,e.state,
            e.version,e.effective_at,e.ended_at,e.materialization_sha256,
            e.created_at,e.updated_at,e.updated_by
       FROM business_v2.student_enrollments_v2 e
       JOIN business_v2.student_enrollment_orders o ON o.id=e.order_id
       JOIN business_v2.student_enrollment_seats s ON s.id=e.seat_id`,
  );
  for (const row of enrollments.rows as QueryResultRow[]) {
    enrollment.enrollments[String(row.enrollment_key)] = {
      enrollmentKey: String(row.enrollment_key),
      orderKey: String(row.order_key),
      seatKey: String(row.seat_key),
      participantPartyId: asNumber(row.participant_party_id),
      offerKey: String(row.offer_key),
      bundleKey: String(row.bundle_key),
      bundleVersion: asNumber(row.bundle_version),
      catalogRevision: asNumber(row.catalog_revision),
      state: row.state as never,
      version: asNumber(row.version),
      effectiveAt: asNullableIso(row.effective_at),
      endedAt: asNullableIso(row.ended_at),
      materializationSha256: String(row.materialization_sha256),
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      updatedBy: String(row.updated_by),
    };
  }

  const entitlements = await client.query(
    `SELECT t.entitlement_key,e.enrollment_key,t.component_key,t.grant_episode,
            t.state,t.version,t.evidence_sha256,t.created_at,t.updated_at,t.updated_by
       FROM business_v2.student_component_entitlements t
       JOIN business_v2.student_enrollments_v2 e ON e.id=t.enrollment_id`,
  );
  for (const row of entitlements.rows as QueryResultRow[]) {
    enrollment.entitlements[String(row.entitlement_key)] = {
      entitlementKey: String(row.entitlement_key),
      enrollmentKey: String(row.enrollment_key),
      componentKey: String(row.component_key),
      grantEpisode: asNumber(row.grant_episode),
      state: row.state as never,
      version: asNumber(row.version),
      evidenceSha256: String(row.evidence_sha256),
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      updatedBy: String(row.updated_by),
    };
  }

  const assignments = await client.query(
    `SELECT a.assignment_key,e.enrollment_key,t.entitlement_key,
            a.delivery_block_key,a.state,a.version,a.schedule_evidence_sha256,
            a.created_at,a.updated_at,a.updated_by
       FROM business_v2.student_class_assignments a
       JOIN business_v2.student_enrollments_v2 e ON e.id=a.enrollment_id
       JOIN business_v2.student_component_entitlements t ON t.id=a.entitlement_id`,
  );
  for (const row of assignments.rows as QueryResultRow[]) {
    enrollment.assignments[String(row.assignment_key)] = {
      assignmentKey: String(row.assignment_key),
      enrollmentKey: String(row.enrollment_key),
      entitlementKey: String(row.entitlement_key),
      deliveryBlockKey: String(row.delivery_block_key),
      state: row.state as never,
      version: asNumber(row.version),
      scheduleEvidenceSha256: String(row.schedule_evidence_sha256),
      createdAt: asIso(row.created_at),
      updatedAt: asIso(row.updated_at),
      updatedBy: String(row.updated_by),
    };
  }

  const exceptions = await client.query(
    `SELECT exception_key,subject_type,subject_key,reason_code,state,severity,
            owner_role,version,occurrence_count,evidence_sha256,first_seen_at,
            last_seen_at,review_at,resolved_at,resolution_sha256,updated_by
       FROM business_v2.student_enrollment_exceptions_v2`,
  );
  for (const row of exceptions.rows as QueryResultRow[]) {
    enrollment.exceptions[String(row.exception_key)] = {
      exceptionKey: String(row.exception_key),
      subjectType: String(row.subject_type),
      subjectKey: String(row.subject_key),
      reasonCode: String(row.reason_code),
      state: row.state as never,
      severity: row.severity as never,
      ownerRole: row.owner_role as never,
      version: asNumber(row.version),
      occurrenceCount: asNumber(row.occurrence_count),
      evidenceSha256: String(row.evidence_sha256),
      firstSeenAt: asIso(row.first_seen_at),
      lastSeenAt: asIso(row.last_seen_at),
      reviewAt: asIso(row.review_at),
      resolvedAt: asNullableIso(row.resolved_at),
      resolutionSha256:
        row.resolution_sha256 == null ? null : String(row.resolution_sha256),
      updatedBy: String(row.updated_by),
    };
  }

  const history = await client.query(
    `SELECT subject_type,subject_key,previous_version,new_version,command_key,
            reason_code,evidence_sha256,actor,occurred_at,recorded_at
       FROM business_v2.student_enrollment_history ORDER BY id`,
  );
  enrollment.history = (history.rows as QueryResultRow[]).map((row) => ({
    subjectType: String(row.subject_type),
    subjectKey: String(row.subject_key),
    previousVersion:
      row.previous_version == null ? null : asNumber(row.previous_version),
    newVersion: asNumber(row.new_version),
    commandKey: String(row.command_key),
    reasonCode: String(row.reason_code),
    evidenceSha256: String(row.evidence_sha256),
    actor: String(row.actor),
    occurredAt: asIso(row.occurred_at),
    recordedAt: asIso(row.recorded_at),
  }));

  return { capacity, enrollment };
}

async function requireOne(
  result: { rowCount: number | null },
  code: string,
  message: string,
): Promise<void> {
  if (result.rowCount !== 1) throw new CapacityCommandError(code, message);
}

async function persistDelta(
  client: PoolClient,
  beforeCapacity: AcademyCapacityState,
  afterCapacity: AcademyCapacityState,
  beforeEnrollment: EnrollmentFoundationState,
  afterEnrollment: EnrollmentFoundationState,
): Promise<void> {
  for (const [key, after] of Object.entries(afterCapacity.seatPools)) {
    const before = beforeCapacity.seatPools[key];
    if (!before || stableJson(before) === stableJson(after)) continue;
    await requireOne(
      await client.query(
        `UPDATE business_v2.academy_seat_pools
            SET capacity=$1,operational_state=$2,close_reason=$3,version=$4,
                configuration_evidence_sha256=$5,updated_at=$6,updated_by=$7
          WHERE pool_key=$8 AND version=$9`,
        [
          after.capacity,
          after.operationalState,
          after.closeReason,
          after.version,
          after.configurationEvidenceSha256,
          after.updatedAt,
          after.updatedBy,
          key,
          before.version,
        ],
      ),
      'pool_write_conflict',
      'seat pool changed during command',
    );
  }

  for (const [key, after] of Object.entries(afterCapacity.reservations)) {
    const before = beforeCapacity.reservations[key];
    if (!before) {
      await requireOne(
        await client.query(
          `INSERT INTO business_v2.academy_capacity_reservations
             (reservation_key,pool_id,channel,source_scope,idempotency_key,
              offer_key,catalog_revision,order_id,seat_id,state,version,
              expires_at,reason,source_evidence_sha256,created_at,updated_at,updated_by)
           SELECT $1,p.id,$2,$3,$4,$5,$6,o.id,s.id,$7,$8,$9,$10,$11,$12,$13,$14
             FROM business_v2.academy_seat_pools p
             LEFT JOIN business_v2.student_enrollment_orders o ON o.order_key=$15
             LEFT JOIN business_v2.student_enrollment_seats s ON s.seat_key=$16
            WHERE p.pool_key=$17`,
          [
            after.reservationKey,
            after.channel,
            after.sourceScope,
            after.idempotencyKey,
            after.offerKey,
            after.catalogRevision,
            after.state,
            after.version,
            after.expiresAt,
            after.reason,
            after.sourceEvidenceSha256,
            after.createdAt,
            after.updatedAt,
            after.updatedBy,
            after.orderKey,
            after.seatKey,
            after.poolKey,
          ],
        ),
        'reservation_insert_missing_reference',
        'reservation insert did not resolve its pool/order/seat references',
      );
    } else if (stableJson(before) !== stableJson(after)) {
      await requireOne(
        await client.query(
          `UPDATE business_v2.academy_capacity_reservations
              SET pool_id=(SELECT id FROM business_v2.academy_seat_pools WHERE pool_key=$1),
                  state=$2,version=$3,expires_at=$4,updated_at=$5,updated_by=$6
            WHERE reservation_key=$7 AND version=$8`,
          [
            after.poolKey,
            after.state,
            after.version,
            after.expiresAt,
            after.updatedAt,
            after.updatedBy,
            key,
            before.version,
          ],
        ),
        'reservation_write_conflict',
        'reservation changed during command',
      );
    }
  }

  for (const [key, after] of Object.entries(afterCapacity.waitlistEntries)) {
    const before = beforeCapacity.waitlistEntries[key];
    if (!before) {
      await requireOne(
        await client.query(
          `INSERT INTO business_v2.academy_waitlist_entries
             (entry_key,pool_id,offer_key,catalog_revision,participant_party_id,
              contact_reference_sha256,sequence_number,state,version,
              joined_at,updated_at,updated_by)
           SELECT $1,p.id,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
             FROM business_v2.academy_seat_pools p WHERE p.pool_key=$12`,
          [
            after.entryKey,
            after.offerKey,
            after.catalogRevision,
            after.participantPartyId,
            after.contactReferenceSha256,
            after.sequenceNumber,
            after.state,
            after.version,
            after.joinedAt,
            after.updatedAt,
            after.updatedBy,
            after.poolKey,
          ],
        ),
        'waitlist_entry_insert_missing_reference',
        'waitlist entry insert did not resolve its pool reference',
      );
    } else if (stableJson(before) !== stableJson(after)) {
      await requireOne(
        await client.query(
          `UPDATE business_v2.academy_waitlist_entries
              SET state=$1,version=$2,updated_at=$3,updated_by=$4
            WHERE entry_key=$5 AND version=$6`,
          [
            after.state,
            after.version,
            after.updatedAt,
            after.updatedBy,
            key,
            before.version,
          ],
        ),
        'waitlist_entry_write_conflict',
        'waitlist entry changed during command',
      );
    }
  }

  for (const [key, after] of Object.entries(afterCapacity.waitlistOffers)) {
    if (beforeCapacity.waitlistOffers[key]) continue;
    await requireOne(
      await client.query(
        `INSERT INTO business_v2.academy_waitlist_offers
           (waitlist_offer_key,entry_id,pool_id,reservation_id,state,version,
            expires_at,approval_evidence_sha256,delivery_receipt_sha256,
            created_at,updated_at,updated_by)
         SELECT $1,e.id,p.id,r.id,$2,$3,$4,$5,$6,$7,$8,$9
           FROM business_v2.academy_waitlist_entries e
           JOIN business_v2.academy_seat_pools p ON p.pool_key=$10
           JOIN business_v2.academy_capacity_reservations r
             ON r.reservation_key=$11
          WHERE e.entry_key=$12 AND e.pool_id=p.id AND r.pool_id=p.id`,
        [
          after.waitlistOfferKey,
          after.state,
          after.version,
          after.expiresAt,
          after.approvalEvidenceSha256,
          after.deliveryReceiptSha256,
          after.createdAt,
          after.updatedAt,
          after.updatedBy,
          after.poolKey,
          after.reservationKey,
          after.entryKey,
        ],
      ),
      'waitlist_offer_insert_missing_reference',
      'waitlist offer insert did not resolve its entry/pool/reservation references',
    );
  }

  for (const [key, after] of Object.entries(afterEnrollment.enrollments)) {
    const before = beforeEnrollment.enrollments[key];
    if (!before || stableJson(before) === stableJson(after)) continue;
    await requireOne(
      await client.query(
        `UPDATE business_v2.student_enrollments_v2
            SET state=$1,version=$2,updated_at=$3,updated_by=$4
          WHERE enrollment_key=$5 AND version=$6`,
        [
          after.state,
          after.version,
          after.updatedAt,
          after.updatedBy,
          key,
          before.version,
        ],
      ),
      'enrollment_write_conflict',
      'enrollment changed during command',
    );
  }

  for (const [key, after] of Object.entries(afterEnrollment.assignments)) {
    const before = beforeEnrollment.assignments[key];
    if (!before) {
      await requireOne(
        await client.query(
          `INSERT INTO business_v2.student_class_assignments
             (assignment_key,enrollment_id,entitlement_id,delivery_block_key,
              state,version,schedule_evidence_sha256,starts_at,ends_at,
              created_at,updated_at,updated_by)
           SELECT $1,e.id,t.id,$2,$3,$4,$5,d.starts_at,d.ends_at,$6,$7,$8
             FROM business_v2.student_enrollments_v2 e
             JOIN business_v2.student_component_entitlements t
               ON t.entitlement_key=$9 AND t.enrollment_id=e.id
             JOIN business_v2.academy_delivery_blocks d
               ON d.delivery_block_key=$2
            WHERE e.enrollment_key=$10`,
          [
            after.assignmentKey,
            after.deliveryBlockKey,
            after.state,
            after.version,
            after.scheduleEvidenceSha256,
            after.createdAt,
            after.updatedAt,
            after.updatedBy,
            after.entitlementKey,
            after.enrollmentKey,
          ],
        ),
        'assignment_insert_missing_reference',
        'assignment insert did not resolve its enrollment/entitlement/block references',
      );
    } else if (stableJson(before) !== stableJson(after)) {
      await requireOne(
        await client.query(
          `UPDATE business_v2.student_class_assignments
              SET state=$1,version=$2,schedule_evidence_sha256=$3,
                  updated_at=$4,updated_by=$5
            WHERE assignment_key=$6 AND version=$7`,
          [
            after.state,
            after.version,
            after.scheduleEvidenceSha256,
            after.updatedAt,
            after.updatedBy,
            key,
            before.version,
          ],
        ),
        'assignment_write_conflict',
        'assignment changed during command',
      );
    }
  }

  for (const item of afterEnrollment.history.slice(
    beforeEnrollment.history.length,
  )) {
    await requireOne(
      await client.query(
        `INSERT INTO business_v2.student_enrollment_history
           (subject_type,subject_key,previous_version,new_version,command_key,
            reason_code,evidence_sha256,actor,occurred_at,recorded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          item.subjectType,
          item.subjectKey,
          item.previousVersion,
          item.newVersion,
          item.commandKey,
          item.reasonCode,
          item.evidenceSha256,
          item.actor,
          item.occurredAt,
          item.recordedAt,
        ],
      ),
      'enrollment_history_insert_failed',
      'enrollment history insert returned no row',
    );
  }

  const beforeEvents = new Set(
    beforeCapacity.events.map((item) => item.eventKey),
  );
  for (const item of afterCapacity.events) {
    if (beforeEvents.has(item.eventKey)) continue;
    await requireOne(
      await client.query(
        `INSERT INTO business_v2.academy_capacity_events
           (event_key,subject_type,subject_key,previous_version,new_version,
            event_type,evidence_sha256,actor,occurred_at,recorded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          item.eventKey,
          item.subjectType,
          item.subjectKey,
          item.previousVersion,
          item.newVersion,
          item.eventType,
          item.evidenceSha256,
          item.actor,
          item.occurredAt,
          item.recordedAt,
        ],
      ),
      'capacity_event_insert_failed',
      'capacity event insert returned no row',
    );
  }
}

function inventorySummary(
  capacity: AcademyCapacityState,
  enrollment: EnrollmentFoundationState,
  poolKey: string,
  at: string,
): Record<string, unknown> {
  const value = showInventory(capacity, enrollment, poolKey, at);
  return {
    poolKey: value.poolKey,
    deliveryBlockKey: value.deliveryBlockKey,
    capacity: value.capacity,
    occupied: value.occupied,
    reserved: value.reserved,
    committed: value.committed,
    available: value.available,
    waitlistCount: value.waitlistCount,
    publicState: value.publicState,
    poolVersion: value.poolVersion,
  };
}

function resultSummary(
  command: CapacityOperatorCommand,
  capacity: AcademyCapacityState,
  enrollment: EnrollmentFoundationState,
  at: string,
): Record<string, unknown> {
  switch (command.type) {
    case 'commit_seat': {
      const commitment = capacity.reservations[command.commitmentKey];
      return {
        commitmentKey: commitment.reservationKey,
        commitmentState: commitment.state,
        commitmentVersion: commitment.version,
        sourceScope: commitment.sourceScope,
        inventory: inventorySummary(capacity, enrollment, command.poolKey, at),
      };
    }
    case 'reserve_manual': {
      const reservation = capacity.reservations[command.reservationKey];
      return {
        reservationKey: reservation.reservationKey,
        reservationState: reservation.state,
        reservationVersion: reservation.version,
        expiresAt: reservation.expiresAt,
        inventory: inventorySummary(capacity, enrollment, command.poolKey, at),
      };
    }
    case 'release_reservation': {
      const reservation = capacity.reservations[command.reservationKey];
      return {
        reservationKey: reservation.reservationKey,
        reservationState: reservation.state,
        reservationVersion: reservation.version,
        inventory: inventorySummary(
          capacity,
          enrollment,
          reservation.poolKey,
          at,
        ),
      };
    }
    case 'change_capacity':
      return {
        newCapacity: command.newCapacity,
        inventory: inventorySummary(capacity, enrollment, command.poolKey, at),
      };
    case 'transfer_commitment': {
      const commitment = capacity.reservations[command.commitmentKey];
      return {
        commitmentKey: commitment.reservationKey,
        commitmentState: commitment.state,
        commitmentVersion: commitment.version,
        destinationInventory: inventorySummary(
          capacity,
          enrollment,
          command.destinationPoolKey,
          at,
        ),
      };
    }
    case 'reconcile_commitment': {
      const commitment = capacity.reservations[command.commitmentKey];
      return {
        commitmentKey: commitment.reservationKey,
        commitmentState: commitment.state,
        commitmentVersion: commitment.version,
        assignmentKey: command.assignmentKey,
        inventory: inventorySummary(
          capacity,
          enrollment,
          commitment.poolKey,
          at,
        ),
      };
    }
    case 'transfer_assignment': {
      const origin = enrollment.assignments[command.originAssignmentKey];
      const destination = enrollment.assignments[command.newAssignmentKey];
      const originPool = Object.values(capacity.seatPools).find(
        (pool) => pool.deliveryBlockKey === origin.deliveryBlockKey,
      )!;
      return {
        originAssignmentKey: origin.assignmentKey,
        originState: origin.state,
        originVersion: origin.version,
        destinationAssignmentKey: destination.assignmentKey,
        destinationState: destination.state,
        destinationVersion: destination.version,
        originInventory: inventorySummary(
          capacity,
          enrollment,
          originPool.poolKey,
          at,
        ),
        destinationInventory: inventorySummary(
          capacity,
          enrollment,
          command.destinationPoolKey,
          at,
        ),
      };
    }
    case 'withdraw_assignment': {
      const assignment = enrollment.assignments[command.assignmentKey];
      const pool = Object.values(capacity.seatPools).find(
        (value) => value.deliveryBlockKey === assignment.deliveryBlockKey,
      )!;
      return {
        assignmentKey: assignment.assignmentKey,
        assignmentState: assignment.state,
        assignmentVersion: assignment.version,
        inventory: inventorySummary(capacity, enrollment, pool.poolKey, at),
      };
    }
    case 'reconcile_pool':
      return {
        inventory: inventorySummary(capacity, enrollment, command.poolKey, at),
      };
    case 'join_waitlist': {
      const entry = capacity.waitlistEntries[command.entryKey];
      return {
        entryKey: entry.entryKey,
        entryState: entry.state,
        entryVersion: entry.version,
        sequenceNumber: entry.sequenceNumber,
        inventory: inventorySummary(capacity, enrollment, command.poolKey, at),
      };
    }
    case 'stage_waitlist_offer': {
      const offer = capacity.waitlistOffers[command.waitlistOfferKey];
      const entry = capacity.waitlistEntries[offer.entryKey];
      const reservation = capacity.reservations[command.reservationKey];
      return {
        waitlistOfferKey: offer.waitlistOfferKey,
        offerState: offer.state,
        offerVersion: offer.version,
        entryKey: entry.entryKey,
        entryState: entry.state,
        reservationKey: reservation.reservationKey,
        reservationState: reservation.state,
        expiresAt: offer.expiresAt,
        approvalRequired: true,
        messageSent: false,
        inventory: inventorySummary(capacity, enrollment, command.poolKey, at),
      };
    }
  }
}

async function applyCommand(
  client: PoolClient,
  command: CapacityOperatorCommand,
  actor: string,
  occurredAt: string,
): Promise<Record<string, unknown>> {
  await lockForCommand(client, command);
  const before = await loadStates(client);
  let afterCapacity = before.capacity;
  let afterEnrollment = before.enrollment;
  switch (command.type) {
    case 'commit_seat':
      afterCapacity = reserveCapacity(before.capacity, before.enrollment, {
        reservationKey: command.commitmentKey,
        poolKey: command.poolKey,
        expectedPoolVersion: command.expectedPoolVersion,
        channel: 'commitment',
        sourceScope: command.sourceScope,
        idempotencyKey: command.idempotencyKey,
        offerKey: command.offerKey,
        catalogRevision: command.catalogRevision,
        orderKey: command.orderKey,
        seatKey: command.seatKey,
        expiresAt: command.expiresAt,
        reason: command.reason,
        sourceEvidenceSha256: command.evidenceSha256,
        actor,
        occurredAt,
      });
      break;
    case 'reserve_manual':
      afterCapacity = reserveCapacity(before.capacity, before.enrollment, {
        reservationKey: command.reservationKey,
        poolKey: command.poolKey,
        expectedPoolVersion: command.expectedPoolVersion,
        channel: 'manual',
        sourceScope: command.sourceScope,
        idempotencyKey: command.idempotencyKey,
        offerKey: command.offerKey,
        catalogRevision: command.catalogRevision,
        orderKey: command.orderKey,
        seatKey: command.seatKey,
        expiresAt: command.expiresAt,
        reason: command.reason,
        sourceEvidenceSha256: command.evidenceSha256,
        actor,
        occurredAt,
      });
      break;
    case 'release_reservation':
      afterCapacity = releaseReservation(before.capacity, {
        reservationKey: command.reservationKey,
        expectedReservationVersion: command.expectedReservationVersion,
        expectedPoolVersion: command.expectedPoolVersion,
        outcome: command.outcome,
        evidenceSha256: command.evidenceSha256,
        actor,
        occurredAt,
      });
      break;
    case 'change_capacity':
      afterCapacity = changeSeatPoolCapacity(
        before.capacity,
        before.enrollment,
        {
          poolKey: command.poolKey,
          expectedPoolVersion: command.expectedPoolVersion,
          newCapacity: command.newCapacity,
          reason: command.reason,
          evidenceSha256: command.evidenceSha256,
          actor,
          occurredAt,
        },
      );
      break;
    case 'transfer_commitment':
      afterCapacity = transferCommitment(before.capacity, before.enrollment, {
        commitmentKey: command.commitmentKey,
        expectedCommitmentVersion: command.expectedCommitmentVersion,
        expectedOriginPoolVersion: command.expectedOriginPoolVersion,
        destinationPoolKey: command.destinationPoolKey,
        expectedDestinationPoolVersion: command.expectedDestinationPoolVersion,
        evidenceSha256: command.evidenceSha256,
        actor,
        occurredAt,
      });
      break;
    case 'reconcile_commitment':
      afterCapacity = reconcileCommitment(before.capacity, before.enrollment, {
        commitmentKey: command.commitmentKey,
        expectedCommitmentVersion: command.expectedCommitmentVersion,
        expectedPoolVersion: command.expectedPoolVersion,
        assignmentKey: command.assignmentKey,
        expectedAssignmentVersion: command.expectedAssignmentVersion,
        evidenceSha256: command.evidenceSha256,
        actor,
        occurredAt,
      });
      break;
    case 'transfer_assignment': {
      const result = transferClassAssignment(
        before.capacity,
        before.enrollment,
        {
          originAssignmentKey: command.originAssignmentKey,
          expectedOriginAssignmentVersion:
            command.expectedOriginAssignmentVersion,
          expectedOriginPoolVersion: command.expectedOriginPoolVersion,
          destinationPoolKey: command.destinationPoolKey,
          expectedDestinationPoolVersion:
            command.expectedDestinationPoolVersion,
          newAssignmentKey: command.newAssignmentKey,
          expectedEnrollmentVersion: command.expectedEnrollmentVersion,
          evidenceSha256: command.evidenceSha256,
          actor,
          occurredAt,
        },
      );
      afterCapacity = result.capacity;
      afterEnrollment = result.enrollment;
      break;
    }
    case 'withdraw_assignment': {
      const result = withdrawClassAssignment(
        before.capacity,
        before.enrollment,
        {
          assignmentKey: command.assignmentKey,
          expectedAssignmentVersion: command.expectedAssignmentVersion,
          expectedPoolVersion: command.expectedPoolVersion,
          reasonCode: command.reasonCode,
          evidenceSha256: command.evidenceSha256,
          actor,
          occurredAt,
        },
      );
      afterCapacity = result.capacity;
      afterEnrollment = result.enrollment;
      break;
    }
    case 'reconcile_pool':
      afterCapacity = reconcileSeatPool(before.capacity, before.enrollment, {
        poolKey: command.poolKey,
        expectedPoolVersion: command.expectedPoolVersion,
        expectedOccupied: command.expectedOccupied,
        expectedReserved: command.expectedReserved,
        expectedWaitlistCount: command.expectedWaitlistCount,
        evidenceSha256: command.evidenceSha256,
        actor,
        occurredAt,
      });
      break;
    case 'join_waitlist':
      afterCapacity = joinWaitlist(before.capacity, {
        entryKey: command.entryKey,
        poolKey: command.poolKey,
        expectedPoolVersion: command.expectedPoolVersion,
        offerKey: command.offerKey,
        catalogRevision: command.catalogRevision,
        participantPartyId: command.participantPartyId,
        contactReferenceSha256: command.contactReferenceSha256,
        sequenceNumber: command.sequenceNumber,
        actor,
        joinedAt: occurredAt,
      });
      break;
    case 'stage_waitlist_offer':
      afterCapacity = stageWaitlistOffer(before.capacity, before.enrollment, {
        poolKey: command.poolKey,
        expectedPoolVersion: command.expectedPoolVersion,
        waitlistOfferKey: command.waitlistOfferKey,
        reservationKey: command.reservationKey,
        reservationIdempotencyKey: command.reservationIdempotencyKey,
        expiresAt: command.expiresAt,
        evidenceSha256: command.evidenceSha256,
        actor,
        occurredAt,
      });
      break;
  }
  await persistDelta(
    client,
    before.capacity,
    afterCapacity,
    before.enrollment,
    afterEnrollment,
  );
  const readback = await loadStates(client);
  return resultSummary(
    command,
    readback.capacity,
    readback.enrollment,
    occurredAt,
  );
}

function finalState(error: unknown): {
  state: CapacityOperatorResult['state'];
  code: string;
} {
  if (error instanceof CapacityCommandError) {
    return {
      state: REVIEW_CODES.has(error.code) ? 'needs_review' : 'denied',
      code: error.code,
    };
  }
  return { state: 'failed', code: 'operator_command_failed' };
}

export async function executeAcademyCapacityOperatorCommand(
  sourceGroup: string,
  command: CapacityOperatorCommand,
  deps: Partial<CapacityOperatorStoreDeps> = {},
): Promise<CapacityOperatorResult> {
  if (sourceGroup !== 'capacity')
    throw new Error('Academy Capacity commands are restricted to capacity');
  const runtime = { ...defaultDeps, ...deps };
  const occurredAt = runtime.now();
  const actor = 'capacity:host';
  const summary = requestSummary(command);
  const requestSha256 = sha256(summary);

  const outcome = await runtime.transaction<CapacityOperatorResult>(
    async (client) => {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
        [command.caseKey],
      );
      const existing = await client.query<{
        command_type: CapacityOperatorCommand['type'];
        request_sha256: string;
        state: CapacityOperatorResult['state'];
        result_code: string;
        result_sha256: string;
        result_summary: Record<string, unknown>;
      }>(
        `SELECT command_type,request_sha256,state,result_code,result_sha256,result_summary
         FROM business_v2.academy_capacity_operator_cases
        WHERE case_key=$1`,
        [command.caseKey],
      );
      if (existing.rows[0]) {
        const prior = existing.rows[0];
        if (
          prior.request_sha256 !== requestSha256 ||
          prior.command_type !== command.type
        ) {
          const deniedSummary = { caseKey: command.caseKey };
          return {
            caseKey: command.caseKey,
            commandType: command.type,
            state: 'denied',
            code: 'idempotency_conflict',
            replayed: true,
            resultSha256: sha256(deniedSummary),
            summary: deniedSummary,
          };
        }
        return {
          caseKey: command.caseKey,
          commandType: prior.command_type,
          state: prior.state,
          code: prior.result_code,
          replayed: true,
          resultSha256: prior.result_sha256,
          summary: prior.result_summary,
        };
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO business_v2.academy_capacity_operator_cases
         (case_key,source_group,command_type,request_sha256,request_summary,
          state,version,created_at,updated_at,updated_by)
       VALUES ($1,'capacity',$2,$3,$4::jsonb,'processing',0,$5,$5,$6)
       RETURNING id::text`,
        [
          command.caseKey,
          command.type,
          requestSha256,
          summary,
          occurredAt,
          actor,
        ],
      );
      const caseId = asNumber(inserted.rows[0].id);
      await client.query(
        `INSERT INTO business_v2.academy_capacity_operator_receipts
         (receipt_key,case_id,case_version,stage,outcome,result_code,
          evidence_sha256,summary_json,actor,occurred_at,recorded_at)
       VALUES ($1,$2,0,'requested','accepted','command_accepted',$3,$4::jsonb,$5,$6,$6)`,
        [
          `${command.caseKey}:receipt:requested:v0`,
          caseId,
          requestSha256,
          summary,
          actor,
          occurredAt,
        ],
      );

      await client.query('SAVEPOINT academy_capacity_operator_command');
      let state: CapacityOperatorResult['state'] = 'applied';
      let code = 'command_applied';
      let result: Record<string, unknown>;
      try {
        result = await applyCommand(client, command, actor, occurredAt);
        await client.query(
          'RELEASE SAVEPOINT academy_capacity_operator_command',
        );
      } catch (error) {
        await client.query(
          'ROLLBACK TO SAVEPOINT academy_capacity_operator_command',
        );
        const final = finalState(error);
        state = final.state;
        code = final.code;
        result = {
          caseKey: command.caseKey,
          commandType: command.type,
          refused: true,
        };
      }
      const resultSha256 = sha256({ state, code, result });
      const finalized = await client.query(
        `UPDATE business_v2.academy_capacity_operator_cases
            SET state=$1,result_code=$2,result_sha256=$3,result_summary=$4::jsonb,
                completed_at=$5,updated_at=$5,updated_by=$6
          WHERE id=$7 AND state='processing' AND version=0`,
        [state, code, resultSha256, result, occurredAt, actor, caseId],
      );
      if (finalized.rowCount !== 1)
        throw new Error('operator_case_finalization_conflict');
      await client.query(
        `INSERT INTO business_v2.academy_capacity_operator_receipts
         (receipt_key,case_id,case_version,stage,outcome,result_code,
          evidence_sha256,summary_json,actor,occurred_at,recorded_at)
       VALUES ($1,$2,0,'final',$3,$4,$5,$6::jsonb,$7,$8,$8)`,
        [
          `${command.caseKey}:receipt:final:v0`,
          caseId,
          state === 'applied' ? 'verified' : state,
          code,
          resultSha256,
          result,
          actor,
          occurredAt,
        ],
      );
      const readback = await client.query<{ receipt_count: string }>(
        `SELECT count(*)::text AS receipt_count
         FROM business_v2.academy_capacity_operator_receipts
        WHERE case_id=$1 AND case_version=0`,
        [caseId],
      );
      if (readback.rows[0]?.receipt_count !== '2')
        throw new Error('Academy Capacity receipt readback failed');
      return {
        caseKey: command.caseKey,
        commandType: command.type,
        state,
        code,
        replayed: false,
        resultSha256,
        summary: result,
      };
    },
  );
  if (outcome.state === 'applied' && !outcome.replayed) {
    if (!deps.transaction || deps.enqueuePublication) {
      await runtime
        .enqueuePublication()
        .catch((error) =>
          logger.warn(
            { err: error, commandType: command.type, caseKey: command.caseKey },
            'Academy capacity threshold publication enqueue failed',
          ),
        );
    }
  }
  return outcome;
}

export async function readAcademyCapacityInventory(
  poolKey: string | null,
  client?: Pick<PoolClient, 'query'>,
): Promise<CapacityInventoryReadback[]> {
  const run = async (queryable: Pick<PoolClient, 'query'>) => {
    const result = await queryable.query(
      `SELECT v.pool_key,v.delivery_block_key,v.capacity,v.occupied,v.reserved,v.committed,
              v.available,v.waitlist_count,v.public_state,v.pool_version,
              d.component_key,d.starts_at,d.ends_at,d.timezone,
              COALESCE(x.open_exceptions,'[]'::jsonb) AS open_exceptions
         FROM business_v2.v_academy_seat_pool_occupancy v
         JOIN business_v2.academy_delivery_blocks d
           ON d.delivery_block_key=v.delivery_block_key
         LEFT JOIN LATERAL (
           SELECT jsonb_agg(
                    jsonb_build_object(
                      'reasonCode',e.reason_code,
                      'severity',e.severity
                    ) ORDER BY e.severity,e.reason_code
                  ) AS open_exceptions
             FROM business_v2.student_enrollment_exceptions_v2 e
            WHERE e.state IN ('open','acknowledged')
              AND e.subject_key IN (v.pool_key,v.delivery_block_key)
         ) x ON true
        WHERE ($1::text IS NULL OR v.pool_key=$1)
        ORDER BY d.starts_at,v.pool_key
        LIMIT 50`,
      [poolKey],
    );
    return (result.rows as QueryResultRow[]).map((row) => ({
      poolKey: String(row.pool_key),
      deliveryBlockKey: String(row.delivery_block_key),
      capacity: asNumber(row.capacity),
      occupied: asNumber(row.occupied),
      reserved: asNumber(row.reserved),
      committed: asNumber(row.committed),
      available: asNumber(row.available),
      waitlistCount: asNumber(row.waitlist_count),
      publicState: row.public_state as never,
      poolVersion: asNumber(row.pool_version),
      calculatedAt: new Date().toISOString(),
      componentKey: String(row.component_key),
      startsAt: asIso(row.starts_at),
      endsAt: asIso(row.ends_at),
      timezone: String(row.timezone),
      openExceptions: Array.isArray(row.open_exceptions)
        ? (row.open_exceptions as Array<{
            reasonCode: string;
            severity: string;
          }>)
        : [],
    }));
  };
  if (client) return run(client);
  return defaultDeps.transaction(run);
}

export async function readAcademyCapacityEnrollment(
  enrollmentKey: string,
  client?: Pick<PoolClient, 'query'>,
): Promise<CapacityEnrollmentReadback | null> {
  const run = async (queryable: Pick<PoolClient, 'query'>) => {
    const enrollment = await queryable.query(
      `SELECT enrollment_key,offer_key,bundle_key,catalog_revision,state,version
         FROM business_v2.student_enrollments_v2
        WHERE enrollment_key=$1`,
      [enrollmentKey],
    );
    if (!enrollment.rows[0]) return null;
    const assignments = await queryable.query(
      `SELECT a.assignment_key,a.delivery_block_key,a.state,a.version
         FROM business_v2.student_class_assignments a
         JOIN business_v2.student_enrollments_v2 e ON e.id=a.enrollment_id
        WHERE e.enrollment_key=$1 ORDER BY a.created_at,a.id`,
      [enrollmentKey],
    );
    const exceptions = await queryable.query(
      `WITH target AS (
         SELECT e.id,e.enrollment_key,o.order_key,s.seat_key
           FROM business_v2.student_enrollments_v2 e
           JOIN business_v2.student_enrollment_orders o ON o.id=e.order_id
           JOIN business_v2.student_enrollment_seats s ON s.id=e.seat_id
          WHERE e.enrollment_key=$1
       ), subject_keys AS (
         SELECT enrollment_key AS subject_key FROM target
         UNION SELECT order_key FROM target
         UNION SELECT seat_key FROM target
         UNION
         SELECT t.entitlement_key
           FROM business_v2.student_component_entitlements t
           JOIN target ON target.id=t.enrollment_id
         UNION
         SELECT a.assignment_key
           FROM business_v2.student_class_assignments a
           JOIN target ON target.id=a.enrollment_id
         UNION
         SELECT a.delivery_block_key
           FROM business_v2.student_class_assignments a
           JOIN target ON target.id=a.enrollment_id
       )
       SELECT x.reason_code,x.severity
         FROM business_v2.student_enrollment_exceptions_v2 x
        WHERE x.state IN ('open','acknowledged')
          AND x.subject_key IN (SELECT subject_key FROM subject_keys)
        ORDER BY x.severity,x.reason_code`,
      [enrollmentKey],
    );
    const row = enrollment.rows[0] as QueryResultRow;
    return {
      enrollmentKey: String(row.enrollment_key),
      offerKey: String(row.offer_key),
      bundleKey: String(row.bundle_key),
      catalogRevision: asNumber(row.catalog_revision),
      state: String(row.state),
      version: asNumber(row.version),
      assignments: (assignments.rows as QueryResultRow[]).map((assignment) => ({
        assignmentKey: String(assignment.assignment_key),
        deliveryBlockKey: String(assignment.delivery_block_key),
        state: String(assignment.state),
        version: asNumber(assignment.version),
      })),
      openExceptions: (exceptions.rows as QueryResultRow[]).map(
        (exception) => ({
          reasonCode: String(exception.reason_code),
          severity: String(exception.severity),
        }),
      ),
    };
  };
  if (client) return run(client);
  return defaultDeps.transaction(run);
}
