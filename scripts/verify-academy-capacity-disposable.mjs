#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  databaseExists,
  generatedDisposableDatabaseName,
  runStudentEnrollmentDisposableProof,
} from './verify-student-enrollment-disposable.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const MIGRATION = path.join(
  ROOT,
  'data/business/migrations/nanoclaw-v2/143_academy_capacity_dark.sql',
);
const ROLLBACK = path.join(
  ROOT,
  'data/business/migrations/nanoclaw-v2/rollback_143_academy_capacity_dark.sql',
);

function verifyCapacityShape(context) {
  context.expectScalar(
    `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='business_v2' AND c.relkind='r'
         AND c.relname LIKE 'academy_%'`,
    '7',
    'capacity table count',
  );
  context.expectScalar(
    `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='business_v2' AND c.relkind='v'
         AND c.relname='v_academy_seat_pool_occupancy'`,
    '1',
    'capacity view count',
  );
  context.expectScalar(
    `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='business_v2' AND c.relkind='S'
         AND c.relname LIKE 'academy_%_id_seq'`,
    '7',
    'capacity sequence count',
  );
  context.expectScalar(
    `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       JOIN pg_roles r ON r.oid=c.relowner
       WHERE n.nspname='business_v2'
         AND (c.relname LIKE 'academy_%' OR c.relname='v_academy_seat_pool_occupancy')
         AND r.rolname <> 'nanoclaw_admin'`,
    '0',
    'non-admin capacity object owners',
  );
  context.expectScalar(
    `SELECT count(*) FROM information_schema.role_table_grants
       WHERE table_schema='business_v2'
         AND (table_name LIKE 'academy_%' OR table_name='v_academy_seat_pool_occupancy')
         AND grantee <> 'nanoclaw_admin'`,
    '0',
    'non-admin capacity table grants',
  );
  context.expectScalar(
    `SELECT count(*) FROM information_schema.role_usage_grants
       WHERE object_schema='business_v2' AND object_type='SEQUENCE'
         AND object_name LIKE 'academy_%_id_seq'
         AND grantee <> 'nanoclaw_admin'`,
    '0',
    'non-admin capacity sequence grants',
  );
  context.expectScalar(
    `SELECT convalidated::text FROM pg_constraint
       WHERE conname='student_class_assignments_delivery_block_fk'`,
    'false',
    'assignment delivery-block constraint validation state',
  );
  context.expectScalar(
    `SELECT count(*) FROM business_v2.v_academy_seat_pool_occupancy`,
    '0',
    'empty capacity projection',
  );
}

function seedCapacityFoundation(context) {
  context.execute(`
    INSERT INTO business_v2.academy_delivery_blocks
      (delivery_block_key,component_key,source_scope,source_object_id,
       starts_at,ends_at,timezone,session_set_sha256,
       schedule_evidence_sha256,state,version,created_at,updated_at,updated_by)
    VALUES
      ('class:fixture:m1','acc.module-1','calendar:fixture','event:sep',
       '2026-09-07T15:00:00Z','2026-09-28T17:00:00Z','America/New_York',
       repeat('a',64),repeat('b',64),'scheduled',0,now(),now(),'fixture'),
      ('class:fixture:m1:next','acc.module-1','calendar:fixture','event:oct',
       '2026-10-07T15:00:00Z','2026-10-28T17:00:00Z','America/New_York',
       repeat('c',64),repeat('d',64),'scheduled',0,now(),now(),'fixture');

    INSERT INTO business_v2.academy_seat_pools
      (pool_key,delivery_block_id,capacity,operational_state,close_reason,
       configuration_evidence_sha256,version,created_at,updated_at,updated_by)
    SELECT 'pool:fixture:sep',id,4,'open',NULL,repeat('e',64),0,now(),now(),'fixture'
      FROM business_v2.academy_delivery_blocks
     WHERE delivery_block_key='class:fixture:m1';
    INSERT INTO business_v2.academy_seat_pools
      (pool_key,delivery_block_id,capacity,operational_state,close_reason,
       configuration_evidence_sha256,version,created_at,updated_at,updated_by)
    SELECT 'pool:fixture:oct',id,2,'open',NULL,repeat('f',64),0,now(),now(),'fixture'
      FROM business_v2.academy_delivery_blocks
     WHERE delivery_block_key='class:fixture:m1:next';

    INSERT INTO business_v2.academy_seat_pool_offers
      (mapping_key,pool_id,offer_key,catalog_revision,state,version,
       evidence_sha256,created_at,updated_at,updated_by)
    SELECT 'mapping:fixture:acc',id,'acc-full',1,'active',0,
           repeat('1',64),now(),now(),'fixture'
      FROM business_v2.academy_seat_pools WHERE pool_key='pool:fixture:sep';
    INSERT INTO business_v2.academy_seat_pool_offers
      (mapping_key,pool_id,offer_key,catalog_revision,state,version,
       evidence_sha256,created_at,updated_at,updated_by)
    SELECT 'mapping:fixture:professional',id,'acc-pcc-full',1,'active',0,
           repeat('2',64),now(),now(),'fixture'
      FROM business_v2.academy_seat_pools WHERE pool_key='pool:fixture:sep';
    INSERT INTO business_v2.academy_seat_pool_offers
      (mapping_key,pool_id,offer_key,catalog_revision,state,version,
       evidence_sha256,created_at,updated_at,updated_by)
    SELECT 'mapping:fixture:next',id,'acc-full',1,'active',0,
           repeat('3',64),now(),now(),'fixture'
      FROM business_v2.academy_seat_pools WHERE pool_key='pool:fixture:oct';

    INSERT INTO business_v2.academy_capacity_reservations
      (reservation_key,pool_id,channel,source_scope,idempotency_key,offer_key,
       catalog_revision,state,version,expires_at,reason,source_evidence_sha256,
       created_at,updated_at,updated_by)
    SELECT 'reservation:fixture:checkout',id,'checkout','tandemweb','checkout:1',
           'acc-full',1,'held',0,now()+interval '20 minutes',NULL,repeat('4',64),
           now(),now(),'fixture'
      FROM business_v2.academy_seat_pools WHERE pool_key='pool:fixture:sep';
    INSERT INTO business_v2.academy_capacity_reservations
      (reservation_key,pool_id,channel,source_scope,idempotency_key,offer_key,
       catalog_revision,state,version,expires_at,reason,source_evidence_sha256,
       created_at,updated_at,updated_by)
    SELECT 'reservation:fixture:waitlist',id,'waitlist_offer','academy_waitlist',
           'waitlist:1','acc-full',1,'held',0,now()+interval '1 day',
           'waitlist_offer',repeat('5',64),now(),now(),'fixture'
      FROM business_v2.academy_seat_pools WHERE pool_key='pool:fixture:sep';
    INSERT INTO business_v2.academy_capacity_reservations
      (reservation_key,pool_id,channel,source_scope,idempotency_key,offer_key,
       catalog_revision,state,version,expires_at,reason,source_evidence_sha256,
       created_at,updated_at,updated_by)
    SELECT 'reservation:fixture:expired',id,'manual','operator','expired:1',
           'acc-full',1,'held',0,now()-interval '1 hour','expired fixture',
           repeat('6',64),now()-interval '2 hours',now()-interval '1 hour','fixture'
      FROM business_v2.academy_seat_pools WHERE pool_key='pool:fixture:sep';

    INSERT INTO business_v2.academy_waitlist_entries
      (entry_key,pool_id,offer_key,catalog_revision,contact_reference_sha256,
       sequence_number,state,version,joined_at,updated_at,updated_by)
    SELECT 'waitlist:fixture:1',id,'acc-full',1,repeat('7',64),1,'offered',1,
           now()-interval '1 day',now(),'fixture'
      FROM business_v2.academy_seat_pools WHERE pool_key='pool:fixture:sep';
    INSERT INTO business_v2.academy_waitlist_offers
      (waitlist_offer_key,entry_id,pool_id,reservation_id,state,version,
       expires_at,created_at,updated_at,updated_by)
    SELECT 'waitlist-offer:fixture:1',we.id,we.pool_id,r.id,'staged',0,
           r.expires_at,now(),now(),'fixture'
      FROM business_v2.academy_waitlist_entries we
      JOIN business_v2.academy_capacity_reservations r
        ON r.reservation_key='reservation:fixture:waitlist'
     WHERE we.entry_key='waitlist:fixture:1';
  `);
  context.expectScalar(
    `SELECT occupied||'|'||reserved||'|'||available||'|'||waitlist_count||'|'||public_state
       FROM business_v2.v_academy_seat_pool_occupancy
      WHERE pool_key='pool:fixture:sep'`,
    '0|2|2|1|open',
    'pre-assignment capacity projection',
  );
}

function verifyCapacityBehavior(context) {
  context.expectScalar(
    `SELECT occupied||'|'||reserved||'|'||available||'|'||waitlist_count||'|'||public_state
       FROM business_v2.v_academy_seat_pool_occupancy
      WHERE pool_key='pool:fixture:sep'`,
    '1|2|1|1|open',
    'assignment plus live reservations projection',
  );
  context.execute(`
    INSERT INTO business_v2.academy_capacity_reservations
      (reservation_key,pool_id,channel,source_scope,idempotency_key,offer_key,
       catalog_revision,order_id,seat_id,state,version,expires_at,reason,
       source_evidence_sha256,created_at,updated_at,updated_by)
    SELECT 'reservation:fixture:consumed',sp.id,'manual','operator','consumed:1',
           'acc-full',1,o.id,s.id,'consumed',1,now()+interval '1 day',
           'consumed fixture',repeat('8',64),now(),now(),'fixture'
      FROM business_v2.academy_seat_pools sp
      JOIN business_v2.student_enrollment_orders o ON o.order_key='order:fixture'
      JOIN business_v2.student_enrollment_seats s ON s.order_id=o.id
     WHERE sp.pool_key='pool:fixture:sep';
  `);
  context.expectScalar(
    `SELECT occupied||'|'||reserved||'|'||available
       FROM business_v2.v_academy_seat_pool_occupancy
      WHERE pool_key='pool:fixture:sep'`,
    '1|2|1',
    'consumed reservation not double counted',
  );

  context.expectFailure(
    `INSERT INTO business_v2.academy_seat_pools
       (pool_key,delivery_block_id,capacity,operational_state,close_reason,
        configuration_evidence_sha256,version,created_at,updated_at,updated_by)
     SELECT 'pool:fixture:duplicate',delivery_block_id,4,'open',NULL,
            repeat('9',64),0,now(),now(),'fixture'
       FROM business_v2.academy_seat_pools WHERE pool_key='pool:fixture:sep'`,
    /Key \(delivery_block_id\)=.*already exists/i,
  );
  context.expectFailure(
    `INSERT INTO business_v2.student_class_assignments
       (assignment_key,enrollment_id,entitlement_id,delivery_block_key,state,
        version,schedule_evidence_sha256,created_at,updated_at,updated_by)
     SELECT 'assignment:fixture:duplicate',enrollment_id,entitlement_id,
            delivery_block_key,'active',0,repeat('a',64),now(),now(),'fixture'
       FROM business_v2.student_class_assignments
      WHERE assignment_key='assignment:fixture:m1'`,
    /Key \(enrollment_id, delivery_block_key\)=.*already exists/i,
  );
  context.execute(`
    INSERT INTO business_v2.student_enrollment_orders
      (order_key,source_channel,offer_key,bundle_key,bundle_version,seat_count,
       financial_classification,state,version,policy_revision,evidence_sha256,
       created_at,updated_at,updated_by)
    VALUES ('order:fixture:other','scholarship','acc-full','acc-full:v1',1,1,
            'not_applicable','needs_participants',0,1,repeat('b',64),
            now(),now(),'fixture');
  `);
  context.expectFailure(
    `INSERT INTO business_v2.academy_capacity_reservations
       (reservation_key,pool_id,channel,source_scope,idempotency_key,offer_key,
        catalog_revision,order_id,seat_id,state,version,expires_at,reason,
        source_evidence_sha256,created_at,updated_at,updated_by)
     SELECT 'reservation:fixture:mismatch',sp.id,'manual','operator','mismatch:1',
            'acc-full',1,o.id,s.id,'held',0,now()+interval '1 day','mismatch',
            repeat('c',64),now(),now(),'fixture'
       FROM business_v2.academy_seat_pools sp
       JOIN business_v2.student_enrollment_orders o
         ON o.order_key='order:fixture:other'
       JOIN business_v2.student_enrollment_seats s
         ON s.seat_key='seat:fixture:1'
      WHERE sp.pool_key='pool:fixture:sep'`,
    /Key \(order_id, seat_id\)=.*is not present in table "student_enrollment_seats"/i,
  );
  context.expectFailure(
    `UPDATE business_v2.academy_waitlist_offers
        SET state='sent'
      WHERE waitlist_offer_key='waitlist-offer:fixture:1'`,
    /violates check constraint "academy_waitlist_offers_/i,
  );

  context.expectFileFailure(
    ROLLBACK,
    /migration 143 rollback refused: Academy capacity evidence exists/i,
  );
  context.expectScalar(
    `SELECT count(*) FROM business_v2.academy_seat_pools`,
    '2',
    'capacity evidence retained after rollback refusal',
  );

  // Migration 143 couples class assignments to capacity delivery blocks. Make
  // removal of those coupled 142 rows explicit before clearing the capacity
  // evidence; never let implicit cascading hide that cross-migration effect.
  context.execute(`
    DELETE FROM business_v2.student_class_assignments
     WHERE delivery_block_key IN (
       SELECT delivery_block_key
         FROM business_v2.academy_delivery_blocks
     );
    DELETE FROM business_v2.academy_capacity_events;
    DELETE FROM business_v2.academy_waitlist_offers;
    DELETE FROM business_v2.academy_waitlist_entries;
    DELETE FROM business_v2.academy_capacity_reservations;
    DELETE FROM business_v2.academy_seat_pool_offers;
    DELETE FROM business_v2.academy_seat_pools;
    DELETE FROM business_v2.academy_delivery_blocks;
  `);
  context.expectScalar(
    `SELECT count(*) FROM business_v2.student_class_assignments`,
    '0',
    'capacity-coupled class assignment explicitly removed before capacity rollback',
  );
  context.executeFile(ROLLBACK);
  context.expectScalar(
    `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='business_v2' AND c.relname LIKE 'academy_%'`,
    '0',
    'capacity objects removed before enrollment rollback',
  );
  context.expectScalar(
    `SELECT count(*) FROM business_v2.student_enrollment_orders`,
    '2',
    'enrollment order foundation retained after capacity rollback',
  );
  context.execute(
    `DELETE FROM business_v2.student_enrollment_orders
      WHERE order_key='order:fixture:other'`,
  );
  context.expectScalar(
    `SELECT count(*) FROM business_v2.student_enrollment_orders`,
    '1',
    'auxiliary mismatch order removed before enrollment proof resumes',
  );
}

function verifyCapacityReapply(context) {
  context.executeFile(MIGRATION);
  verifyCapacityShape(context);
  context.executeFile(ROLLBACK);
  context.expectScalar(
    `SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='business_v2' AND c.relname LIKE 'academy_%'`,
    '0',
    'capacity reapply rollback residue',
  );
}

export function runAcademyCapacityDisposableProof({ database }) {
  const enrollmentResult = runStudentEnrollmentDisposableProof({
    database,
    extension: {
      afterEnrollmentMigration(context) {
        context.executeFile(MIGRATION);
        verifyCapacityShape(context);
        seedCapacityFoundation(context);
      },
      afterSyntheticChain(context) {
        verifyCapacityBehavior(context);
      },
      afterEnrollmentReapply(context) {
        verifyCapacityReapply(context);
      },
    },
  });
  return {
    ...enrollmentResult,
    capacityTables: 7,
    capacityViews: 1,
    capacitySequences: 7,
    capacityConstraintRefusals: 5,
    assignmentPlusReservationProjection: true,
    consumedReservationExcluded: true,
    capacityPopulatedRollbackRefused: true,
    capacityEmptyRollbackPassed: true,
    capacityReapplyPassed: true,
  };
}

function main() {
  const database = generatedDisposableDatabaseName();
  const result = runAcademyCapacityDisposableProof({
    database,
  });
  if (databaseExists(database))
    throw new Error('disposable database residue detected after cleanup');
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
