import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const sql = (name: string) =>
  readFileSync(
    new URL(`../data/business/migrations/nanoclaw-v2/${name}`, import.meta.url),
    'utf8',
  );
const migration166 = sql('166_contador_adyen_payments.sql');
const migration168 = sql('168_contador_adyen_product_identity.sql');
const migration170 = sql('170_contador_adyen_refunds.sql');
const rollback170 = sql('rollback_170_contador_adyen_refunds.sql');
const releaseBuilder = readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);

const database = `nc_contador_adyen_170_${process.pid}_${randomUUID().replaceAll('-', '')}`;
if (!/^nc_contador_adyen_170_[0-9]+_[a-f0-9]{32}$/.test(database))
  throw new Error('unsafe database name');
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
const orderId = randomUUID();
const paymentPsp = 'PAYMENTPSP170';
const merchantReference = 'TCA-REFUND170';

beforeAll(async () => {
  expect(
    (await maintenance.query('SELECT inet_server_addr() AS address')).rows[0]
      .address,
  ).toBeNull();
  await maintenance.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
  created = true;
  pool = new Pool({ ...config, database });
  await pool.query('CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin');
  await pool.query(migration166);
  await pool.query(migration168);
  await pool.query(
    `INSERT INTO business_v2.contador_adyen_payments
      (delivery_id,order_id,psp_reference,merchant_reference,product_id,amount_cents,currency,event_date,evidence_sha256)
     VALUES ($1,$2,$3,$4,'mcq-program-a-foundations',100,'USD','2026-09-16T13:00:00Z',$5)`,
    [randomUUID(), orderId, paymentPsp, merchantReference, 'a'.repeat(64)],
  );
}, 15_000);

afterAll(async () => {
  await pool?.end();
  try {
    if (created) {
      const deadline = Date.now() + 5000;
      while (
        (
          await maintenance.query(
            'SELECT count(*) FROM pg_stat_activity WHERE datname=$1',
            [database],
          )
        ).rows[0].count !== '0'
      ) {
        if (Date.now() >= deadline)
          throw new Error('disposable connection drain failed');
        await delay(20);
      }
      await maintenance.query(`DROP DATABASE "${database}"`);
    }
  } finally {
    await maintenance.end();
  }
});

describe('migration 170 Adyen refund projection', () => {
  it('packages the additive migration and guarded empty-only rollback', () => {
    expect(releaseBuilder).toContain('170_contador_adyen_refunds.sql');
    expect(releaseBuilder).toContain('rollback_170_contador_adyen_refunds.sql');
    expect(migration170).toContain(
      'REFERENCES business_v2.contador_adyen_payments(psp_reference)',
    );
    expect(rollback170).toContain(
      'rollback 170 refused: retained Adyen refund evidence exists',
    );
    expect(rollback170).not.toMatch(/DELETE FROM/);
  });

  it('applies, links one refund to its original payment, and reapplies', async () => {
    await pool.query(migration170);
    const refundId = randomUUID();
    await pool.query(
      `INSERT INTO business_v2.contador_adyen_refunds
        (delivery_id,refund_id,order_id,refund_psp_reference,payment_psp_reference,request_reference,merchant_reference,amount_cents,cumulative_refunded_cents,remaining_paid_cents,currency,event_date,evidence_sha256)
       VALUES ($1,$2,$3,'REFUNDPSP170',$4,$5,$6,40,40,60,'USD','2026-09-16T13:01:00Z',$7)`,
      [
        randomUUID(),
        refundId,
        orderId,
        paymentPsp,
        `${merchantReference}-RF-01`,
        merchantReference,
        'b'.repeat(64),
      ],
    );
    await pool.query(migration170);
    const row = (
      await pool.query(
        'SELECT refund_id::text,payment_psp_reference,amount_cents,cumulative_refunded_cents,remaining_paid_cents FROM business_v2.contador_adyen_refunds',
      )
    ).rows[0];
    expect(row).toEqual({
      refund_id: refundId,
      payment_psp_reference: paymentPsp,
      amount_cents: '40',
      cumulative_refunded_cents: '40',
      remaining_paid_cents: '60',
    });
  });

  it('refuses populated rollback, then permits empty rollback and reapply', async () => {
    const client = await pool.connect();
    try {
      await expect(client.query(rollback170)).rejects.toThrow(
        'rollback 170 refused: retained Adyen refund evidence exists',
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    await pool.query('DELETE FROM business_v2.contador_adyen_refunds');
    await pool.query(rollback170);
    expect(
      (
        await pool.query(
          "SELECT to_regclass('business_v2.contador_adyen_refunds') AS table_name",
        )
      ).rows[0].table_name,
    ).toBeNull();
    await pool.query(migration170);
  });
});
