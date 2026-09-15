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
const rollback168 = sql('rollback_168_contador_adyen_product_identity.sql');
const receiver = readFileSync(
  new URL('./commerce-bookkeeper.ts', import.meta.url),
  'utf8',
);
const releaseBuilder = readFileSync(
  new URL('../scripts/build-release.mjs', import.meta.url),
  'utf8',
);

const database = `nc_contador_adyen_168_${process.pid}_${randomUUID().replaceAll('-', '')}`;
if (!/^nc_contador_adyen_168_[0-9]+_[a-f0-9]{32}$/.test(database))
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

function payment(productId: string) {
  return [
    randomUUID(),
    randomUUID(),
    `PSP${randomUUID().replaceAll('-', '').slice(0, 20)}`,
    `TCA-${randomUUID().replaceAll('-', '').slice(0, 12)}`,
    productId,
    100,
    'USD',
    '2026-09-15T21:00:00Z',
    'a'.repeat(64),
  ];
}

async function insertProduct(productId: string) {
  await pool.query(
    `INSERT INTO business_v2.contador_adyen_payments
      (delivery_id,order_id,psp_reference,merchant_reference,product_id,amount_cents,currency,event_date,evidence_sha256)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    payment(productId),
  );
}

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

describe('migration 168 provider-neutral Adyen product identity', () => {
  it('mechanically matches the receiver length and hyphen semantics', () => {
    expect(receiver).toContain('/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/');
    expect(migration168).toContain('char_length(product_id) BETWEEN 1 AND 100');
    expect(migration168).toContain(
      "product_id ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?$'",
    );
    const receiverAccepts = (value: string) =>
      /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(value);
    const sqlAccepts = (value: string) =>
      value.length >= 1 &&
      value.length <= 100 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value);
    for (const value of [
      'a',
      'mcq-program-a-foundations',
      'practitioner-ai-for-coaches',
      'a--b',
      'a'.repeat(100),
      '',
      '-leading',
      'trailing-',
      'Uppercase',
      'under_score',
      'a'.repeat(101),
    ]) {
      expect(sqlAccepts(value), value).toBe(receiverAccepts(value));
    }
  });

  it('packages both ordered migration and guarded rollback', () => {
    expect(releaseBuilder).toContain('168_contador_adyen_product_identity.sql');
    expect(releaseBuilder).toContain(
      'rollback_168_contador_adyen_product_identity.sql',
    );
    expect(rollback168).toContain(
      'rollback 168 refused: provider-neutral Adyen payment rows exist',
    );
    expect(rollback168).toContain('RAISE EXCEPTION');
    expect(rollback168).not.toMatch(/DELETE FROM|DROP TABLE/i);
  });

  it('applies and reapplies without rewriting existing MCS rows', async () => {
    await insertProduct('mcq-program-a-foundations');
    const before = await pool.query(
      'SELECT psp_reference,product_id,first_seen_at,last_seen_at FROM business_v2.contador_adyen_payments',
    );
    await pool.query(migration168);
    await pool.query(migration168);
    const after = await pool.query(
      'SELECT psp_reference,product_id,first_seen_at,last_seen_at FROM business_v2.contador_adyen_payments',
    );
    expect(after.rows).toEqual(before.rows);
    await insertProduct('practitioner-ai-for-coaches');
    expect(
      (
        await pool.query(
          'SELECT count(*) FROM business_v2.contador_adyen_payments',
        )
      ).rows[0].count,
    ).toBe('2');
  });

  it('raises on unsafe rollback, then proves safe rollback and reapply', async () => {
    const client = await pool.connect();
    try {
      await expect(client.query(rollback168)).rejects.toThrow(
        'rollback 168 refused: provider-neutral Adyen payment rows exist',
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    expect(
      (
        await pool.query(
          "SELECT count(*) FROM business_v2.contador_adyen_payments WHERE product_id='practitioner-ai-for-coaches'",
        )
      ).rows[0].count,
    ).toBe('1');
    await pool.query(
      "DELETE FROM business_v2.contador_adyen_payments WHERE product_id='practitioner-ai-for-coaches'",
    );
    await pool.query(rollback168);
    await expect(
      insertProduct('practitioner-ai-for-coaches'),
    ).rejects.toThrow();
    await pool.query(migration168);
    await insertProduct('practitioner-ai-for-coaches');
  });
});
