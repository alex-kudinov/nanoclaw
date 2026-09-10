import type { PoolClient } from 'pg';
import {
  bookkeeperContractHash as hash,
  type BookkeeperEnrollmentState,
} from './bookkeeper-enrollment-contract.js';
import { createEmptyEnrollmentFoundationState } from './student-enrollment-foundation.js';
import { createEmptyAcademyCapacityState } from './academy-capacity.js';

export function assertEnrollmentStoreDatabase(database: string): void {
  if (!/^nc_student_enrollment_store_[a-f0-9]{32}$/.test(database))
    throw new Error('store_non_disposable_database');
}
export async function guardEnrollmentStore(client: PoolClient): Promise<void> {
  const r = await client.query(
    'SELECT current_database() AS database, inet_server_addr() AS address',
  );
  assertEnrollmentStoreDatabase(r.rows[0].database);
  if (r.rows[0].address !== null) throw new Error('store_nonlocal_connection');
}

export type EnrollmentStoreGuard = (client: PoolClient) => Promise<void>;

type Row = Record<string, unknown>;
type Reference = { table: string; column: string };
interface Table {
  section: 'enrollment' | 'capacity';
  collection: string;
  table: string;
  key: string | ((row: Row) => string);
  fields: string[];
  refs: Record<string, Reference>;
  columns: Record<string, string>;
  appendOnly?: boolean;
  array?: boolean;
}
const audit = 'createdAt updatedAt updatedBy';
const sourceKey = (r: Row) =>
  `${r.sourceScope}:${r.sourceObjectType}:${r.sourceObjectId}`;
function table(
  section: Table['section'],
  collection: string,
  name: string,
  key: Table['key'],
  fields: string,
  refs: Table['refs'] = {},
  options: Partial<Table> = {},
): Table {
  return {
    section,
    collection,
    table: name,
    key,
    fields: fields.split(' '),
    refs,
    columns: {},
    ...options,
  };
}
const ref = (table: string, column: string): Reference => ({ table, column });

// Static schema allowlist, in foreign-key dependency order. No caller SQL names.
const tables: Table[] = [
  table(
    'capacity',
    'deliveryBlocks',
    'academy_delivery_blocks',
    'deliveryBlockKey',
    `deliveryBlockKey componentKey sourceScope sourceObjectId startsAt endsAt timezone sessionSetSha256 scheduleEvidenceSha256 state version ${audit}`,
  ),
  table(
    'capacity',
    'seatPools',
    'academy_seat_pools',
    'poolKey',
    `poolKey deliveryBlockKey capacity operationalState closeReason configurationEvidenceSha256 version ${audit}`,
    { deliveryBlockKey: ref('deliveryBlocks', 'delivery_block_id') },
  ),
  table(
    'capacity',
    'offerMappings',
    'academy_seat_pool_offers',
    'mappingKey',
    `mappingKey poolKey offerKey catalogRevision state version evidenceSha256 ${audit}`,
    { poolKey: ref('seatPools', 'pool_id') },
  ),
  table(
    'enrollment',
    'orders',
    'student_enrollment_orders',
    'orderKey',
    `orderKey sourceChannel offerKey bundleKey bundleVersion payerPartyId seatCount financialClassification state version policyRevision evidenceSha256 effectiveAt ${audit}`,
  ),
  table(
    'enrollment',
    'sourceReferences',
    'student_enrollment_order_source_refs',
    sourceKey,
    'orderKey sourceScope sourceObjectType sourceObjectId idempotencyKey evidenceSha256 observedAt recordedAt recordedBy',
    { orderKey: ref('orders', 'order_id') },
    { appendOnly: true },
  ),
  table(
    'enrollment',
    'seats',
    'student_enrollment_seats',
    'seatKey',
    `seatKey orderKey seatNumber participantPartyId participantEvidenceSha256 payerRelationship state version ${audit}`,
    { orderKey: ref('orders', 'order_id') },
  ),
  table(
    'enrollment',
    'agreements',
    'student_financial_agreements',
    'agreementKey',
    `agreementKey orderKey agreementType state version evidenceSha256 ${audit}`,
    { orderKey: ref('orders', 'order_id') },
  ),
  table(
    'enrollment',
    'obligations',
    'student_financial_obligations',
    'obligationKey',
    `obligationKey agreementKey sequenceNumber amountMinor currency dueAt state version evidenceSha256 ${audit}`,
    { agreementKey: ref('agreements', 'agreement_id') },
  ),
  table(
    'enrollment',
    'enrollments',
    'student_enrollments_v2',
    'enrollmentKey',
    `enrollmentKey orderKey seatKey participantPartyId offerKey bundleKey bundleVersion catalogRevision state version effectiveAt endedAt materializationSha256 ${audit}`,
    { orderKey: ref('orders', 'order_id'), seatKey: ref('seats', 'seat_id') },
  ),
  table(
    'enrollment',
    'entitlements',
    'student_component_entitlements',
    'entitlementKey',
    `entitlementKey enrollmentKey componentKey grantEpisode state version evidenceSha256 ${audit}`,
    { enrollmentKey: ref('enrollments', 'enrollment_id') },
  ),
  table(
    'enrollment',
    'assignments',
    'student_class_assignments',
    'assignmentKey',
    `assignmentKey enrollmentKey entitlementKey deliveryBlockKey state version scheduleEvidenceSha256 ${audit}`,
    {
      enrollmentKey: ref('enrollments', 'enrollment_id'),
      entitlementKey: ref('entitlements', 'entitlement_id'),
    },
  ),
  table(
    'capacity',
    'reservations',
    'academy_capacity_reservations',
    'reservationKey',
    `reservationKey poolKey channel sourceScope idempotencyKey offerKey catalogRevision orderKey seatKey state version expiresAt reason sourceEvidenceSha256 ${audit}`,
    {
      poolKey: ref('seatPools', 'pool_id'),
      orderKey: ref('orders', 'order_id'),
      seatKey: ref('seats', 'seat_id'),
    },
  ),
  table(
    'capacity',
    'waitlistEntries',
    'academy_waitlist_entries',
    'entryKey',
    'entryKey poolKey offerKey catalogRevision participantPartyId contactReferenceSha256 sequenceNumber state version joinedAt updatedAt updatedBy',
    { poolKey: ref('seatPools', 'pool_id') },
  ),
  table(
    'capacity',
    'waitlistOffers',
    'academy_waitlist_offers',
    'waitlistOfferKey',
    `waitlistOfferKey entryKey poolKey reservationKey state version expiresAt approvalEvidenceSha256 deliveryReceiptSha256 ${audit}`,
    {
      entryKey: ref('waitlistEntries', 'entry_id'),
      poolKey: ref('seatPools', 'pool_id'),
      reservationKey: ref('reservations', 'reservation_id'),
    },
  ),
  table(
    'enrollment',
    'projections',
    'student_projection_outbox',
    'projectionKey',
    'projectionKey target subjectType subjectKey subjectVersion payloadSha256 payload expectedReadbackSha256 state version createdAt updatedAt',
    {},
    { columns: { payload: 'payload_json' } },
  ),
  table(
    'enrollment',
    'receipts',
    'student_projection_receipts',
    'receiptKey',
    'receiptKey projectionKey subjectVersion stage outcome resultCode evidenceSha256 actor occurredAt recordedAt',
    { projectionKey: ref('projections', 'outbox_id') },
    { appendOnly: true },
  ),
  table(
    'enrollment',
    'exceptions',
    'student_enrollment_exceptions_v2',
    'exceptionKey',
    'exceptionKey subjectType subjectKey reasonCode state severity ownerRole version evidenceSha256 resolutionSha256 firstSeenAt lastSeenAt reviewAt resolvedAt occurrenceCount updatedBy',
  ),
  table(
    'enrollment',
    'evidence',
    'student_enrollment_evidence',
    'evidenceKey',
    'evidenceKey subjectType subjectKey evidenceType sourceReferenceKey evidenceSha256 observedAt recordedAt recordedBy',
    { sourceReferenceKey: ref('sourceReferences', 'source_reference_id') },
    { appendOnly: true },
  ),
  table(
    'enrollment',
    'history',
    'student_enrollment_history',
    (r) => JSON.stringify([r.subjectType, r.subjectKey, r.newVersion]),
    'subjectType subjectKey previousVersion newVersion commandKey reasonCode evidenceSha256 actor occurredAt recordedAt',
    {},
    { appendOnly: true, array: true },
  ),
  table(
    'capacity',
    'events',
    'academy_capacity_events',
    'eventKey',
    'eventKey subjectType subjectKey previousVersion newVersion eventType evidenceSha256 actor occurredAt recordedAt',
    {},
    { appendOnly: true, array: true },
  ),
];
export const ENROLLMENT_STORE_TABLES = Object.freeze(
  tables.map((t) => t.table),
);
const column = (t: Table, f: string) =>
  t.refs[f]?.column ??
  t.columns[f] ??
  f.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());
function rows(state: BookkeeperEnrollmentState, t: Table): Row[] {
  const values = (state[t.section] as unknown as Record<string, unknown>)[
    t.collection
  ];
  return Array.isArray(values)
    ? values
    : Object.values(values as Record<string, Row>);
}
function identity(t: Table, row: Row): string {
  const key = typeof t.key === 'function' ? t.key(row) : row[t.key];
  if (
    typeof key !== 'string' ||
    ['__proto__', 'constructor', 'prototype'].includes(key)
  )
    throw new Error('store_invalid_identity');
  return key;
}
function normalize(field: string, value: unknown): unknown {
  if (value === null) return null;
  if (field.endsWith('At')) {
    const d = value instanceof Date ? value : new Date(String(value));
    if (!Number.isFinite(d.getTime()))
      throw new Error('store_invalid_timestamp');
    return d.toISOString();
  }
  if (
    /(Version|Count|Number|Revision|PartyId)$/.test(field) ||
    ['version', 'capacity', 'amountMinor', 'grantEpisode'].includes(field)
  ) {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new Error('store_unsafe_integer');
    return number;
  }
  return value;
}
function canonical(
  state: BookkeeperEnrollmentState,
): BookkeeperEnrollmentState {
  const result = structuredClone({
    enrollment: state.enrollment,
    capacity: state.capacity,
  });
  for (const t of tables)
    for (const row of rows(result, t))
      for (const f of t.fields) row[f] = normalize(f, row[f]);
  return result;
}
type Indexes = Map<string, Map<string, string>>;
export interface EnrollmentStoreSnapshot {
  state: BookkeeperEnrollmentState;
  ids: Indexes;
}

/** Must be called inside the store transaction after all canonical table locks. */
export async function loadEnrollmentStore(
  client: PoolClient,
  guard: EnrollmentStoreGuard = guardEnrollmentStore,
): Promise<EnrollmentStoreSnapshot> {
  await guard(client);
  const state = {
    enrollment: createEmptyEnrollmentFoundationState(),
    capacity: createEmptyAcademyCapacityState(),
  };
  const ids: Indexes = new Map();
  const keys: Indexes = new Map();
  for (const t of tables) {
    ids.set(t.collection, new Map());
    keys.set(t.collection, new Map());
    const bucket: Row[] | Record<string, Row> = t.array
      ? []
      : Object.create(null);
    const data = await client.query(
      `SELECT * FROM business_v2.${t.table} ORDER BY id`,
    );
    for (const raw of data.rows as Row[]) {
      if (
        t.collection === 'projections' &&
        (raw.state === 'claimed' ||
          raw.lease_token !== null ||
          raw.lease_expires_at !== null)
      )
        throw new Error('store_projection_lease_active');
      const row: Row = {};
      for (const f of t.fields) {
        const value = raw[column(t, f)];
        if (value === undefined)
          throw new Error(`store_missing_column:${t.table}:${column(t, f)}`);
        const r = t.refs[f];
        row[f] =
          r && value !== null
            ? keys.get(r.table)?.get(String(value))
            : normalize(f, value);
        if (row[f] === undefined) throw new Error('store_missing_reference');
      }
      const k = identity(t, row);
      if (ids.get(t.collection)!.has(k))
        throw new Error('store_identity_collision');
      ids.get(t.collection)!.set(k, String(raw.id));
      keys.get(t.collection)!.set(String(raw.id), k);
      if (Array.isArray(bucket)) bucket.push(row);
      else bucket[k] = row;
    }
    (state[t.section] as unknown as Record<string, unknown>)[t.collection] =
      bucket;
  }
  for (const [key, r] of Object.entries(state.enrollment.sourceReferences))
    state.enrollment.sourceIdempotency[r.idempotencyKey] = key;
  for (const [key, r] of Object.entries(state.capacity.reservations))
    state.capacity.reservationIdempotency[`${r.channel}:${r.idempotencyKey}`] =
      key;
  return { state, ids };
}

/** Relational deltas only: no deletes, whole-state JSON store or blind upserts. */
export async function persistEnrollmentStore(
  client: PoolClient,
  before: EnrollmentStoreSnapshot,
  after: BookkeeperEnrollmentState,
  guard: EnrollmentStoreGuard = guardEnrollmentStore,
): Promise<void> {
  await guard(client);
  const normalized = canonical(after);
  const prior = canonical(before.state);
  const ids: Indexes = new Map(
    [...before.ids].map(([k, v]) => [k, new Map(v)]),
  );
  for (const t of tables) {
    const oldRows = rows(prior, t),
      newRows = rows(normalized, t);
    const oldMap = new Map(oldRows.map((r) => [identity(t, r), r]));
    const newKeys = new Set(newRows.map((r) => identity(t, r)));
    if (
      newKeys.size !== newRows.length ||
      oldRows.some((r) => !newKeys.has(identity(t, r)))
    )
      throw new Error(`store_deletion_or_duplicate_refused:${t.collection}`);
    if (t.array && hash(oldRows) !== hash(newRows.slice(0, oldRows.length)))
      throw new Error('store_history_rewrite_refused');
    for (const row of newRows) {
      const k = identity(t, row),
        old = oldMap.get(k);
      if (old && hash(old) === hash(row)) continue;
      if (old && t.appendOnly) throw new Error('store_append_only_conflict');
      if (old && !(Number(row.version) > Number(old.version)))
        throw new Error('store_version_not_advanced');
      const values = t.fields.map((f) => {
        const r = t.refs[f];
        if (!r || row[f] === null) return row[f];
        const id = ids.get(r.table)?.get(String(row[f]));
        if (!id) throw new Error('store_missing_reference');
        return id;
      });
      let result;
      if (!old)
        result = await client.query(
          `INSERT INTO business_v2.${t.table} (${t.fields.map((f) => column(t, f)).join(',')})
        VALUES (${values.map((_, i) => '$' + (i + 1)).join(',')}) RETURNING id`,
          values,
        );
      else
        result = await client.query(
          `UPDATE business_v2.${t.table} SET ${t.fields.map((f, i) => `${column(t, f)}=$${i + 1}`).join(',')}
        WHERE id=$${values.length + 1} AND version=$${values.length + 2} RETURNING id`,
          [...values, ids.get(t.collection)!.get(k), old.version],
        );
      if (result.rowCount !== 1)
        throw new Error('store_compare_and_swap_failed');
      ids.get(t.collection)!.set(k, String(result.rows[0].id));
    }
  }
  const readback = await loadEnrollmentStore(client, guard);
  if (hash(canonical(readback.state)) !== hash(normalized))
    throw new Error('store_readback_mismatch');
}
