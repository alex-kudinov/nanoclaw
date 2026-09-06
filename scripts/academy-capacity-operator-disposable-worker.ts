import crypto from 'node:crypto';
import { Pool, type PoolClient } from 'pg';

import {
  executeAcademyCapacityOperatorCommand,
  readAcademyCapacityEnrollment,
  readAcademyCapacityInventory,
  type CapacityOperatorCommand,
} from '../src/academy-capacity-operator-store.js';

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1])
    throw new Error(`missing ${name}`);
  return process.argv[index + 1];
}

const database = argument('--database');
if (!/^nc_academy_capacity_shadow_[a-z0-9_]{8,80}$/.test(database))
  throw new Error('refusing non-disposable database');

const pool = new Pool({
  host: '/tmp',
  port: 5432,
  database,
  max: 8,
});
let now = '2026-09-06T19:30:00.000Z';
const deps = {
  now: () => now,
  transaction: async <T>(fn: (client: PoolClient) => Promise<T>) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  },
};
const hash = (value: string) =>
  crypto.createHash('sha256').update(value).digest('hex');
const poolKey = (block: string) =>
  `academy-capacity-shadow-2026-09-06:pool:${block}`;

async function execute(command: CapacityOperatorCommand) {
  return executeAcademyCapacityOperatorCommand('capacity', command, deps);
}

async function main() {
  const thursday = poolKey('mcs-practicum:2026-09-24');
  const januaryThursday = poolKey('mcs-practicum:2027-01-07');
  const januaryFriday = poolKey('mcs-practicum:2027-01-08');
  await pool.query(
    `UPDATE business_v2.academy_seat_pools p
        SET capacity=6
       FROM business_v2.academy_delivery_blocks d
      WHERE p.delivery_block_id=d.id
        AND d.delivery_block_key='mcs-practicum:2026-09-24'`,
  );

  const race = [1, 2].map((ordinal) =>
    execute({
      type: 'reserve_manual',
      caseKey: `case:race:${ordinal}`,
      reservationKey: `reservation:race:${ordinal}`,
      poolKey: thursday,
      expectedPoolVersion: 0,
      sourceScope: 'operator.disposable',
      idempotencyKey: `race-${ordinal}`,
      offerKey: 'mcs-full',
      catalogRevision: 1,
      orderKey: null,
      seatKey: null,
      expiresAt: '2026-09-07T19:30:00.000Z',
      reason: 'Disposable last-seat race',
      evidenceSha256: hash(`race:${ordinal}`),
    }),
  );
  const raceResults = await Promise.all(race);
  const raceApplied = raceResults.filter((result) => result.state === 'applied');
  const raceHeld = raceResults.filter(
    (result) => result.state === 'needs_review',
  );
  if (raceApplied.length !== 1 || raceHeld.length !== 1)
    throw new Error('last-seat race did not serialize one apply and one hold');
  const raceWinner = raceApplied[0].summary.reservationKey as string;
  now = '2026-09-06T19:30:01.000Z';
  const raceRelease = await execute({
    type: 'release_reservation',
    caseKey: 'case:race:release',
    reservationKey: raceWinner,
    expectedReservationVersion: 0,
    expectedPoolVersion: 1,
    outcome: 'released',
    evidenceSha256: hash('race:release'),
  });

  now = '2026-09-06T19:31:00.000Z';
  const reserveCommand: CapacityOperatorCommand = {
    type: 'reserve_manual',
    caseKey: 'case:january:manual',
    reservationKey: 'reservation:january:manual',
    poolKey: januaryFriday,
    expectedPoolVersion: 0,
    sourceScope: 'operator.disposable',
    idempotencyKey: 'january-manual-1',
    offerKey: 'mcs-full',
    catalogRevision: 1,
    orderKey: null,
    seatKey: null,
    expiresAt: '2026-09-07T19:31:00.000Z',
    reason: 'Disposable manual hold',
    evidenceSha256: hash('january:manual'),
  };
  const reserved = await execute(reserveCommand);
  const replay = await execute(reserveCommand);
  const conflict = await execute({
    ...reserveCommand,
    reason: 'Different request under same case key',
  });

  now = '2026-09-06T19:31:01.000Z';
  const stale = await execute({
    ...reserveCommand,
    caseKey: 'case:january:stale',
    reservationKey: 'reservation:january:stale',
    idempotencyKey: 'january-stale-1',
    evidenceSha256: hash('january:stale'),
  });
  const released = await execute({
    type: 'release_reservation',
    caseKey: 'case:january:release',
    reservationKey: reserveCommand.reservationKey,
    expectedReservationVersion: 0,
    expectedPoolVersion: 1,
    outcome: 'released',
    evidenceSha256: hash('january:release'),
  });

  now = '2026-09-06T19:32:00.000Z';
  const joined = await execute({
    type: 'join_waitlist',
    caseKey: 'case:january:waitlist:1',
    entryKey: 'waitlist:january:1',
    poolKey: januaryFriday,
    expectedPoolVersion: 2,
    offerKey: 'mcs-full',
    catalogRevision: 1,
    participantPartyId: null,
    contactReferenceSha256: hash('contact:1'),
    sequenceNumber: 1,
    evidenceSha256: hash('waitlist:1'),
  });
  now = '2026-09-06T19:32:01.000Z';
  const staged = await execute({
    type: 'stage_waitlist_offer',
    caseKey: 'case:january:stage:1',
    poolKey: januaryFriday,
    expectedPoolVersion: 3,
    waitlistOfferKey: 'waitlist-offer:january:1',
    reservationKey: 'reservation:waitlist:january:1',
    reservationIdempotencyKey: 'waitlist-january-1',
    expiresAt: '2026-09-07T19:32:01.000Z',
    evidenceSha256: hash('stage:1'),
  });
  now = '2026-09-06T19:32:02.000Z';
  const joinedSecond = await execute({
    type: 'join_waitlist',
    caseKey: 'case:january:waitlist:2',
    entryKey: 'waitlist:january:2',
    poolKey: januaryFriday,
    expectedPoolVersion: 4,
    offerKey: 'mcs-full',
    catalogRevision: 1,
    participantPartyId: null,
    contactReferenceSha256: hash('contact:2'),
    sequenceNumber: 2,
    evidenceSha256: hash('waitlist:2'),
  });
  now = '2026-09-06T19:32:03.000Z';
  const secondStage = await execute({
    type: 'stage_waitlist_offer',
    caseKey: 'case:january:stage:2',
    poolKey: januaryFriday,
    expectedPoolVersion: 5,
    waitlistOfferKey: 'waitlist-offer:january:2',
    reservationKey: 'reservation:waitlist:january:2',
    reservationIdempotencyKey: 'waitlist-january-2',
    expiresAt: '2026-09-07T19:32:03.000Z',
    evidenceSha256: hash('stage:2'),
  });

  const origin = await pool.query<{
    assignment_key: string;
    enrollment_key: string;
    enrollment_version: number;
  }>(
    `SELECT a.assignment_key,e.enrollment_key,e.version AS enrollment_version
       FROM business_v2.student_class_assignments a
       JOIN business_v2.student_enrollments_v2 e ON e.id=a.enrollment_id
      WHERE a.delivery_block_key='mcs-practicum:2027-01-07'
        AND a.state='active'`,
  );
  if (origin.rowCount !== 1) throw new Error('expected one January origin');
  await pool.query(`
    CREATE FUNCTION business_v2.suppress_gate_d_assignment()
      RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.assignment_key='assignment:january:suppressed' THEN RETURN NULL; END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER suppress_gate_d_assignment
      BEFORE INSERT ON business_v2.student_class_assignments
      FOR EACH ROW EXECUTE FUNCTION business_v2.suppress_gate_d_assignment()
  `);
  now = '2026-09-06T19:32:30.000Z';
  const persistenceRefusal = await execute({
    type: 'transfer_assignment',
    caseKey: 'case:january:transfer:suppressed',
    originAssignmentKey: origin.rows[0].assignment_key,
    expectedOriginAssignmentVersion: 0,
    expectedOriginPoolVersion: 0,
    destinationPoolKey: januaryFriday,
    expectedDestinationPoolVersion: 5,
    newAssignmentKey: 'assignment:january:suppressed',
    expectedEnrollmentVersion: Number(origin.rows[0].enrollment_version),
    evidenceSha256: hash('january:transfer:suppressed'),
  });
  const persistenceReadback = await pool.query<{
    origin_state: string;
    enrollment_version: number;
    destination_count: string;
    origin_pool_version: number;
    destination_pool_version: number;
  }>(
    `SELECT
       (SELECT state FROM business_v2.student_class_assignments
         WHERE assignment_key=$1) AS origin_state,
       (SELECT version FROM business_v2.student_enrollments_v2
         WHERE enrollment_key=$2) AS enrollment_version,
       (SELECT count(*)::text FROM business_v2.student_class_assignments
         WHERE assignment_key='assignment:january:suppressed') AS destination_count,
       (SELECT p.version FROM business_v2.academy_seat_pools p
         JOIN business_v2.academy_delivery_blocks d ON d.id=p.delivery_block_id
        WHERE d.delivery_block_key='mcs-practicum:2027-01-07') AS origin_pool_version,
       (SELECT version FROM business_v2.academy_seat_pools
         WHERE pool_key=$3) AS destination_pool_version`,
    [origin.rows[0].assignment_key, origin.rows[0].enrollment_key, januaryFriday],
  );
  await pool.query(`
    DROP TRIGGER suppress_gate_d_assignment
      ON business_v2.student_class_assignments;
    DROP FUNCTION business_v2.suppress_gate_d_assignment()
  `);
  now = '2026-09-06T19:33:00.000Z';
  const transferred = await execute({
    type: 'transfer_assignment',
    caseKey: 'case:january:transfer',
    originAssignmentKey: origin.rows[0].assignment_key,
    expectedOriginAssignmentVersion: 0,
    expectedOriginPoolVersion: 0,
    destinationPoolKey: januaryFriday,
    expectedDestinationPoolVersion: 5,
    newAssignmentKey: 'assignment:january:transferred',
    expectedEnrollmentVersion: Number(origin.rows[0].enrollment_version),
    evidenceSha256: hash('january:transfer'),
  });
  now = '2026-09-06T19:33:01.000Z';
  const withdrawn = await execute({
    type: 'withdraw_assignment',
    caseKey: 'case:january:withdraw',
    assignmentKey: 'assignment:january:transferred',
    expectedAssignmentVersion: 0,
    expectedPoolVersion: 6,
    reasonCode: 'operator_test_withdrawal',
    evidenceSha256: hash('january:withdraw'),
  });
  now = '2026-09-06T19:33:02.000Z';
  const reconciled = await execute({
    type: 'reconcile_pool',
    caseKey: 'case:january:reconcile',
    poolKey: januaryFriday,
    expectedPoolVersion: 7,
    expectedOccupied: 0,
    expectedReserved: 1,
    expectedWaitlistCount: 2,
    evidenceSha256: hash('january:reconcile'),
  });

  const januaryFridayEnd = await pool.query<{ ends_at: Date }>(
    `SELECT d.ends_at
       FROM business_v2.academy_delivery_blocks d
      WHERE d.delivery_block_key='mcs-practicum:2027-01-08'`,
  );
  now = '2026-09-06T19:34:00.000Z';
  const commitment = await execute({
    type: 'commit_seat',
    caseKey: 'case:january:commitment',
    commitmentKey: 'commitment:january:invoice:1',
    poolKey: januaryFriday,
    expectedPoolVersion: 8,
    sourceScope: 'invoice',
    idempotencyKey: 'invoice-january-seat-1',
    offerKey: 'mcs-full',
    catalogRevision: 1,
    orderKey: null,
    seatKey: null,
    expiresAt: januaryFridayEnd.rows[0].ends_at.toISOString(),
    reason: 'Disposable issued invoice seat',
    evidenceSha256: hash('january:commitment'),
  });
  now = '2026-09-06T19:34:01.000Z';
  const capacityChanged = await execute({
    type: 'change_capacity',
    caseKey: 'case:january:capacity-change',
    poolKey: januaryFriday,
    expectedPoolVersion: 9,
    newCapacity: 13,
    reason: 'Disposable added facilitator seat',
    evidenceSha256: hash('january:capacity-change'),
  });
  now = '2026-09-06T19:34:02.000Z';
  const commitmentTransferred = await execute({
    type: 'transfer_commitment',
    caseKey: 'case:january:commitment-transfer',
    commitmentKey: 'commitment:january:invoice:1',
    expectedCommitmentVersion: 0,
    expectedOriginPoolVersion: 10,
    destinationPoolKey: januaryThursday,
    expectedDestinationPoolVersion: 1,
    evidenceSha256: hash('january:commitment-transfer'),
  });

  const inventory = await readAcademyCapacityInventory(januaryFriday, {
    query: (text, params) => pool.query(text, params),
  });
  const enrollment = await readAcademyCapacityEnrollment(
    origin.rows[0].enrollment_key,
    { query: (text, params) => pool.query(text, params) },
  );
  const fridayEnrollmentKey = await pool.query<{ enrollment_key: string }>(
    `SELECT e.enrollment_key
       FROM business_v2.student_enrollments_v2 e
       JOIN business_v2.student_class_assignments a ON a.enrollment_id=e.id
      WHERE a.delivery_block_key='mcs-practicum:2026-09-25'
      ORDER BY e.id LIMIT 1`,
  );
  const fridayEnrollment = await readAcademyCapacityEnrollment(
    fridayEnrollmentKey.rows[0].enrollment_key,
    { query: (text, params) => pool.query(text, params) },
  );
  const fridayInventory = await readAcademyCapacityInventory(
    poolKey('mcs-practicum:2026-09-25'),
    { query: (text, params) => pool.query(text, params) },
  );
  const ledger = await pool.query<{
    cases: string;
    receipts: string;
    review_cases: string;
    pii_summaries: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM business_v2.academy_capacity_operator_cases) AS cases,
       (SELECT count(*)::text FROM business_v2.academy_capacity_operator_receipts) AS receipts,
       (SELECT count(*)::text FROM business_v2.academy_capacity_operator_cases
         WHERE state='needs_review') AS review_cases,
       (SELECT count(*)::text FROM business_v2.academy_capacity_operator_cases
         WHERE request_summary::text LIKE '%@%' OR result_summary::text LIKE '%@%') AS pii_summaries`,
  );
  const output = {
    ok: true,
    race: {
      applied: raceApplied.length,
      needsReview: raceHeld.length,
      release: raceRelease.state,
    },
    idempotency: {
      first: reserved.state,
      replayed: replay.replayed,
      replayState: replay.state,
      conflict: conflict.code,
      stale: stale.code,
    },
    manualRelease: released.state,
    waitlist: {
      join: joined.state,
      stage: staged.state,
      secondJoin: joinedSecond.state,
      secondStage: secondStage.code,
      messageSent: staged.summary.messageSent,
      approvalRequired: staged.summary.approvalRequired,
    },
    assignment: {
      persistenceRefusal: {
        state: persistenceRefusal.state,
        code: persistenceRefusal.code,
        readback: persistenceReadback.rows[0],
      },
      transfer: transferred.state,
      withdraw: withdrawn.state,
      reconcile: reconciled.state,
      originState: enrollment?.assignments.find(
        (item) => item.assignmentKey === origin.rows[0].assignment_key,
      )?.state,
      destinationState: enrollment?.assignments.find(
        (item) => item.assignmentKey === 'assignment:january:transferred',
      )?.state,
    },
    simpleSync: {
      commitment: commitment.state,
      capacityChanged: capacityChanged.state,
      commitmentTransferred: commitmentTransferred.state,
      destinationCommitment:
        commitmentTransferred.summary.destinationInventory,
    },
    inventory: inventory[0],
    exceptionReadback: {
      inventory: fridayInventory[0].openExceptions,
      enrollment: fridayEnrollment?.openExceptions,
    },
    ledger: ledger.rows[0],
    pools: { januaryThursday, januaryFriday },
  };
  process.stdout.write(`${JSON.stringify(output)}\n`);
}

main()
  .catch((error) => {
    process.stderr.write(
      `ERROR: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
