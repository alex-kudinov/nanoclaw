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
const migration171 = sql('171_finite_billing_contracts.sql');
const migration172 = sql('172_custom_invoice_billing_cadence.sql');
const rollback172 = sql('rollback_172_custom_invoice_billing_cadence.sql');
const releaseBuilder = readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);

const database = `nc_custom_invoice_172_${process.pid}_${randomUUID().replaceAll('-', '')}`;
if (!/^nc_custom_invoice_172_[0-9]+_[a-f0-9]{32}$/.test(database))
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

beforeAll(async () => {
  expect(
    (await maintenance.query('SELECT inet_server_addr() AS address')).rows[0]
      .address,
  ).toBeNull();
  await maintenance.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
  created = true;
  pool = new Pool({ ...config, database });
  await pool.query('CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin');
  await pool.query(migration171);
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

async function insertCustomContract(): Promise<void> {
  await pool.query(
    `INSERT INTO business_v2.finite_billing_contracts
      (contract_id,environment,billing_principal_id,commerce_binding_id,product_id,cadence,timezone,obligation_count,total_cents,currency,schedule_sha256,consent_sha256,binding_evidence_sha256,first_submission_id,first_order_id,first_psp_reference,state,activated_at)
     VALUES ($1,'test',$2,$3,'invoice-0713aac48f0eba63d80d7a71','custom','America/Chicago',2,200,'USD',$4,$5,$6,$7,$8,'PSP-INVOICE-FIRST','active','2026-09-19T18:00:00Z')`,
    [
      randomUUID(),
      randomUUID(),
      randomUUID(),
      'a'.repeat(64),
      'b'.repeat(64),
      'c'.repeat(64),
      randomUUID(),
      randomUUID(),
    ],
  );
}

describe('migration 172 custom invoice billing cadence', () => {
  it('packages only the CHECK widening and its guarded rollback', () => {
    expect(releaseBuilder).toContain('172_custom_invoice_billing_cadence.sql');
    expect(releaseBuilder).toContain(
      'rollback_172_custom_invoice_billing_cadence.sql',
    );
    expect(migration172).toContain(
      "CHECK (cadence IN ('monthly','quarterly','annual','custom'))",
    );
    expect(rollback172).toContain(
      'rollback 172 refused: custom invoice billing contracts exist',
    );
    expect(migration172).not.toMatch(/CREATE TABLE|ADD COLUMN|CREATE INDEX/);
    expect(rollback172).not.toMatch(/DELETE FROM|DROP TABLE|DROP COLUMN/);
  });

  it('reapplies without changing rows, ownership, or grants', async () => {
    const before = (
      await pool.query(
        `SELECT c.relowner::regrole::text AS owner,
                (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='business_v2' AND table_name='finite_billing_contracts' AND grantee<>'nanoclaw_admin')::int AS non_owner_grants,
                (SELECT count(*) FROM business_v2.finite_billing_contracts)::int AS rows
           FROM pg_class c WHERE c.oid='business_v2.finite_billing_contracts'::regclass`,
      )
    ).rows[0];
    await pool.query(migration172);
    await pool.query(migration172);
    const after = (
      await pool.query(
        `SELECT c.relowner::regrole::text AS owner,
                (SELECT count(*) FROM information_schema.role_table_grants WHERE table_schema='business_v2' AND table_name='finite_billing_contracts' AND grantee<>'nanoclaw_admin')::int AS non_owner_grants,
                (SELECT count(*) FROM business_v2.finite_billing_contracts)::int AS rows
           FROM pg_class c WHERE c.oid='business_v2.finite_billing_contracts'::regclass`,
      )
    ).rows[0];
    expect(after).toEqual(before);
  });

  it('admits custom, refuses populated rollback, and restores the old gate only when empty', async () => {
    await insertCustomContract();
    const client = await pool.connect();
    try {
      await expect(client.query(rollback172)).rejects.toThrow(
        'rollback 172 refused: custom invoice billing contracts exist',
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    await pool.query('DELETE FROM business_v2.finite_billing_contracts');
    await pool.query(rollback172);
    await expect(insertCustomContract()).rejects.toThrow();
    await pool.query(migration172);
    await insertCustomContract();
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS count FROM business_v2.finite_billing_contracts WHERE cadence='custom'",
        )
      ).rows[0].count,
    ).toBe(1);
  });
});
