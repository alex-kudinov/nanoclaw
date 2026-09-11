import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const database = `nc_payment_retry_upgrade_${randomUUID().replaceAll('-', '')}`;
const config = {
  host: '/tmp',
  port: 5432,
  user: userInfo().username,
  password: 'unused-local-disposable',
  ssl: false as const,
  options: '-c search_path=pg_catalog',
  connectionTimeoutMillis: 2000,
  max: 4,
};
const maintenance = new Pool({ ...config, database: 'postgres' });
let pool: Pool;
let created = false;
const sql = (name: string) =>
  readFileSync(
    new URL(`../data/business/migrations/nanoclaw-v2/${name}`, import.meta.url),
    'utf8',
  );

const attemptIds = [randomUUID(), randomUUID()];
const operationIds = [randomUUID(), randomUUID()];
const resultIds = [randomUUID(), randomUUID()];
const quoteIds = [randomUUID(), randomUUID()];
const scopeHash = 'a'.repeat(64);

beforeAll(async () => {
  await maintenance.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
  created = true;
  pool = new Pool({ ...config, database });
  await pool.query('CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin');
  for (const migration of [
    '149_payment_attempt_store.sql',
    '150_payment_request_admission.sql',
    '151_payment_event_ledger.sql',
    '152_payment_method_reconciliation.sql',
  ])
    await pool.query(sql(migration));
  for (let index = 0; index < 2; index += 1) {
    const state = index === 0 ? 'verified' : 'conflict';
    const paymentReference = `LEGACYPSP000000${index}`;
    await pool.query(
      `INSERT INTO business_v2.payment_attempts
       (attempt_id,scope_sha256,quote_id,contract)
       VALUES($1,$2,$3,$4::jsonb)`,
      [
        attemptIds[index],
        scopeHash,
        quoteIds[index],
        JSON.stringify({ marker: `attempt-${state}`, retained: index }),
      ],
    );
    await pool.query(
      `INSERT INTO business_v2.payment_operations
       (operation_id,attempt_id,idempotency_key,contract,request_sha256,
        encrypted_request,encrypted_response,state,session_expires_at,version)
       VALUES($1,$2,$3,$4::jsonb,$5,$6,$7,'session_available',9999999999999,$8)`,
      [
        operationIds[index],
        attemptIds[index],
        `legacy-operation-${index}`,
        JSON.stringify({ marker: `operation-${state}`, retained: index }),
        `${index + 1}`.repeat(64),
        `encrypted-request-${index}`,
        `encrypted-response-${index}`,
        7 + index,
      ],
    );
    await pool.query(
      `INSERT INTO business_v2.payment_session_result_operations
       (operation_id,attempt_id,session_id_sha256,result_sha256,
        encrypted_result,retry_until,state,version)
       VALUES($1,$2,$3,$4,$5,9999999999999,$6,$7)`,
      [
        resultIds[index],
        attemptIds[index],
        `${index + 3}`.repeat(64),
        `${index + 5}`.repeat(64),
        `encrypted-result-${index}`,
        state,
        3 + index,
      ],
    );
    await pool.query(
      `INSERT INTO business_v2.payment_session_result_receipts
       (operation_id,version,kind) VALUES($1,$2,$3)`,
      [resultIds[index], 3 + index, state],
    );
    await pool.query(
      `INSERT INTO business_v2.payment_provider_references
       (scope_sha256,payment_reference,attempt_id) VALUES($1,$2,$3)`,
      [scopeHash, paymentReference, attemptIds[index]],
    );
    await pool.query(
      `INSERT INTO business_v2.payment_events
       (scope_sha256,event_id,payload_sha256,attempt_id,payment_reference,fact)
       VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
      [
        scopeHash,
        `legacy-event-${index}`,
        `${index + 7}`.repeat(64),
        attemptIds[index],
        paymentReference,
        JSON.stringify({ marker: `event-${state}`, retained: index }),
      ],
    );
  }
}, 15000);

afterAll(async () => {
  await pool?.end();
  if (created) await maintenance.query(`DROP DATABASE IF EXISTS "${database}"`);
  await maintenance.end();
});

describe('migration159 populated legacy upgrade', () => {
  it('backfills terminal legacy rows and event lineage without changing prior values, then restores guards', async () => {
    const before = {
      operations: (
        await pool.query(
          'SELECT to_jsonb(o) row FROM business_v2.payment_operations o ORDER BY operation_id',
        )
      ).rows.map(({ row }) => row),
      results: (
        await pool.query(
          'SELECT to_jsonb(r) row FROM business_v2.payment_session_result_operations r ORDER BY operation_id',
        )
      ).rows.map(({ row }) => row),
      references: (
        await pool.query(
          'SELECT to_jsonb(r) row FROM business_v2.payment_provider_references r ORDER BY payment_reference',
        )
      ).rows.map(({ row }) => row),
      events: (
        await pool.query(
          'SELECT to_jsonb(e) row FROM business_v2.payment_events e ORDER BY event_id',
        )
      ).rows.map(({ row }) => row),
    };

    await expect(
      pool.query(sql('159_payment_terminal_card_retry.sql')),
    ).resolves.toBeDefined();

    const after = {
      operations: (
        await pool.query(
          `SELECT to_jsonb(o)-ARRAY['session_sequence','predecessor_operation_id','predecessor_session_sequence','retry_terminal_receipt_sha256'] row
           FROM business_v2.payment_operations o ORDER BY operation_id`,
        )
      ).rows.map(({ row }) => row),
      results: (
        await pool.query(
          `SELECT to_jsonb(r)-ARRAY['payment_operation_id','session_sequence','terminal_status'] row
           FROM business_v2.payment_session_result_operations r ORDER BY operation_id`,
        )
      ).rows.map(({ row }) => row),
      references: (
        await pool.query(
          `SELECT to_jsonb(r)-ARRAY['payment_operation_id','session_sequence'] row
           FROM business_v2.payment_provider_references r ORDER BY payment_reference`,
        )
      ).rows.map(({ row }) => row),
      events: (
        await pool.query(
          `SELECT to_jsonb(e)-ARRAY['payment_operation_id','session_sequence'] row
           FROM business_v2.payment_events e ORDER BY event_id`,
        )
      ).rows.map(({ row }) => row),
    };
    expect(after).toEqual(before);

    const lineage = await pool.query(
      `SELECT r.attempt_id::text,r.payment_operation_id::text,r.session_sequence,
        o.operation_id::text expected_operation,r.state,r.version,
        pr.payment_operation_id::text reference_operation,
        e.payment_operation_id::text event_operation
       FROM business_v2.payment_session_result_operations r
       JOIN business_v2.payment_operations o ON o.attempt_id=r.attempt_id
       JOIN business_v2.payment_provider_references pr ON pr.attempt_id=r.attempt_id
       JOIN business_v2.payment_events e ON e.attempt_id=r.attempt_id
       ORDER BY r.attempt_id`,
    );
    expect(lineage.rows).toHaveLength(2);
    for (const row of lineage.rows) {
      expect(row).toMatchObject({
        payment_operation_id: row.expected_operation,
        reference_operation: row.expected_operation,
        event_operation: row.expected_operation,
        session_sequence: 1,
      });
    }
    expect(lineage.rows.map((row) => row.state).sort()).toEqual([
      'conflict',
      'verified',
    ]);
    expect(lineage.rows.map((row) => row.version).sort()).toEqual([3, 4]);

    const guards = await pool.query(
      `SELECT t.tgname,t.tgenabled FROM pg_trigger t
       JOIN pg_class c ON c.oid=t.tgrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='business_v2' AND t.tgname=ANY($1::text[])
       ORDER BY t.tgname`,
      [
        [
          'payment_event_immutable',
          'payment_reference_immutable',
          'payment_session_result_guard',
        ],
      ],
    );
    expect(guards.rows).toEqual([
      { tgname: 'payment_event_immutable', tgenabled: 'O' },
      { tgname: 'payment_reference_immutable', tgenabled: 'O' },
      { tgname: 'payment_session_result_guard', tgenabled: 'O' },
    ]);

    await expect(
      pool.query(
        "UPDATE business_v2.payment_session_result_operations SET encrypted_result='changed' WHERE operation_id=$1",
        [resultIds[0]],
      ),
    ).rejects.toThrow('payment session result immutable contract');
    await expect(
      pool.query(
        'UPDATE business_v2.payment_provider_references SET payment_reference=payment_reference WHERE attempt_id=$1',
        [attemptIds[0]],
      ),
    ).rejects.toThrow('payment store immutable evidence');
    await expect(
      pool.query(
        'UPDATE business_v2.payment_events SET fact=fact WHERE attempt_id=$1',
        [attemptIds[0]],
      ),
    ).rejects.toThrow('payment store immutable evidence');
  });

  it('rolls back and reapplies the populated upgrade without losing legacy rows', async () => {
    await expect(
      pool.query(sql('rollback_159_payment_terminal_card_retry.sql')),
    ).resolves.toBeDefined();
    expect(
      (
        await pool.query(
          `SELECT count(*)::int count FROM information_schema.columns
           WHERE table_schema='business_v2' AND table_name='payment_operations'
             AND column_name=ANY($1::text[])`,
          [
            [
              'session_sequence',
              'predecessor_operation_id',
              'predecessor_session_sequence',
              'retry_terminal_receipt_sha256',
            ],
          ],
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await pool.query(
          'SELECT count(*)::int count FROM business_v2.payment_operations',
        )
      ).rows[0].count,
    ).toBe(2);
    await expect(
      pool.query(sql('159_payment_terminal_card_retry.sql')),
    ).resolves.toBeDefined();
    expect(
      (
        await pool.query(
          `SELECT count(*)::int count FROM business_v2.payment_operations
           WHERE session_sequence=1 AND predecessor_operation_id IS NULL
             AND predecessor_session_sequence IS NULL
             AND retry_terminal_receipt_sha256 IS NULL`,
        )
      ).rows[0].count,
    ).toBe(2);
  });

  it('rejects cross-attempt, wrong-receipt and non-adjacent successor lineage while allowing a normal chain', async () => {
    const receiptA = '8'.repeat(64);
    const receiptA2 = '9'.repeat(64);
    const insertReceipt = async (
      attemptId: string,
      operationId: string,
      sequence: number,
      receipt: string,
    ) =>
      pool.query(
        `INSERT INTO business_v2.payment_session_terminal_nonpayment_receipts
         (receipt_sha256,scope_sha256,attempt_id,payment_operation_id,
          session_sequence,session_id_sha256,result_sha256,response_sha256,
          terminal_status,source)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'refused','authenticated_session_result')`,
        [
          receipt,
          scopeHash,
          attemptId,
          operationId,
          sequence,
          'a'.repeat(64),
          'b'.repeat(64),
          'c'.repeat(64),
        ],
      );
    const insertSuccessor = async (
      attemptId: string,
      sequence: number,
      predecessorId: string,
      receipt: string,
    ) =>
      pool.query(
        `INSERT INTO business_v2.payment_operations
         (operation_id,attempt_id,idempotency_key,contract,request_sha256,
          encrypted_request,state,session_sequence,predecessor_operation_id,
          retry_terminal_receipt_sha256)
         VALUES($1,$2,$3,$4::jsonb,$5,$6,'dispatching',$7,$8,$9)`,
        [
          randomUUID(),
          attemptId,
          `lineage-${randomUUID()}`,
          JSON.stringify({ marker: 'lineage-fixture' }),
          'd'.repeat(64),
          'encrypted-lineage-request',
          sequence,
          predecessorId,
          receipt,
        ],
      );

    await pool.query('BEGIN');
    try {
      await insertReceipt(attemptIds[0], operationIds[0], 1, receiptA);
      await expect(
        insertSuccessor(attemptIds[1], 2, operationIds[0], receiptA),
      ).rejects.toThrow();
    } finally {
      await pool.query('ROLLBACK');
    }

    await pool.query('BEGIN');
    try {
      await insertReceipt(attemptIds[0], operationIds[0], 1, receiptA);
      await expect(
        insertSuccessor(attemptIds[1], 2, operationIds[1], receiptA),
      ).rejects.toThrow();
    } finally {
      await pool.query('ROLLBACK');
    }

    await pool.query('BEGIN');
    try {
      await insertReceipt(attemptIds[0], operationIds[0], 1, receiptA);
      await expect(
        insertSuccessor(attemptIds[0], 3, operationIds[0], receiptA),
      ).rejects.toThrow();
    } finally {
      await pool.query('ROLLBACK');
    }

    await pool.query('BEGIN');
    try {
      await insertReceipt(attemptIds[0], operationIds[0], 1, receiptA);
      const second = await insertSuccessor(
        attemptIds[0],
        2,
        operationIds[0],
        receiptA,
      );
      const secondId = second.rows[0]?.operation_id;
      const storedSecond = await pool.query(
        `SELECT operation_id::text FROM business_v2.payment_operations
         WHERE attempt_id=$1 AND session_sequence=2`,
        [attemptIds[0]],
      );
      const operation2 = secondId ?? storedSecond.rows[0].operation_id;
      await insertReceipt(attemptIds[0], operation2, 2, receiptA2);
      await expect(
        insertSuccessor(attemptIds[0], 3, operation2, receiptA2),
      ).resolves.toBeDefined();
    } finally {
      await pool.query('ROLLBACK');
    }
  });

  it('refuses rollback after any new terminal receipt exists', async () => {
    await pool.query(
      `INSERT INTO business_v2.payment_session_terminal_nonpayment_receipts
       (receipt_sha256,scope_sha256,attempt_id,payment_operation_id,
        session_sequence,session_id_sha256,result_sha256,response_sha256,
        terminal_status,source)
       VALUES($1,$2,$3,$4,1,$5,$6,$7,'refused','authenticated_session_result')`,
      [
        'b'.repeat(64),
        scopeHash,
        attemptIds[0],
        operationIds[0],
        'c'.repeat(64),
        'd'.repeat(64),
        'e'.repeat(64),
      ],
    );
    await expect(
      pool.query(sql('rollback_159_payment_terminal_card_retry.sql')),
    ).rejects.toThrow('rollback refused: terminal retry evidence exists');
    await pool.query('ROLLBACK');
  });
});
