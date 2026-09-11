import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { userInfo } from 'node:os';

import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { PaymentTransaction } from './payment-store.js';
import { PgWebsiteCheckoutNoticeLedger } from './website-checkout-customer-notices.js';

const database = `nc_student_enrollment_store_${randomUUID().replaceAll('-', '')}`;
const pgConfig = {
  host: '/tmp',
  port: 5432,
  user: userInfo().username,
  password: 'unused-local-disposable',
  ssl: false as const,
  options: '-c search_path=pg_catalog',
  connectionTimeoutMillis: 2000,
  max: 4,
};
const maintenance = new Pool({ ...pgConfig, database: 'postgres' });
let pool: Pool;
let created = false;
let transaction: PaymentTransaction;
const sql = (name: string) =>
  readFileSync(
    new URL(`../data/business/migrations/nanoclaw-v2/${name}`, import.meta.url),
    'utf8',
  );

beforeAll(async () => {
  expect(
    (await maintenance.query('SELECT inet_server_addr() address')).rows[0]
      .address,
  ).toBeNull();
  await maintenance.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
  created = true;
  pool = new Pool({ ...pgConfig, database });
  await pool.query('CREATE EXTENSION citext');
  await pool.query('CREATE SCHEMA business_v2 AUTHORIZATION nanoclaw_admin');
  await pool.query(
    `CREATE FUNCTION business_v2.fn_company_work_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'append-only fixture'; END $$; ALTER FUNCTION business_v2.fn_company_work_append_only() OWNER TO nanoclaw_admin`,
  );
  for (const migration of [
    '01_extensions.sql',
    '02_lookups.sql',
    '03_parties.sql',
    '04_roles.sql',
    '05_engagements.sql',
    '06_programs.sql',
    '07_pipeline.sql',
    '08_interactions.sql',
    '09_documents.sql',
    '10_outbox.sql',
    '11_helpers.sql',
    '12_triggers.sql',
    '13_views.sql',
    '14_grants.sql',
    '16_cutover_helpers.sql',
    '137_relationship_context_dark.sql',
    '142_student_enrollment_dark_foundation.sql',
    '143_academy_capacity_dark.sql',
    '146_student_enrollment_store_contract.sql',
    '147_student_enrollment_writer_claims.sql',
    '149_payment_attempt_store.sql',
    '150_payment_request_admission.sql',
    '151_payment_event_ledger.sql',
    '152_payment_method_reconciliation.sql',
    '153_website_checkout_provisional_finance.sql',
    '154_payment_identity_preparation.sql',
    '155_website_checkout_admission_evidence.sql',
    '157_payment_webhook_method_evidence.sql',
    '158_website_checkout_customer_notices.sql',
  ])
    await pool.query(sql(migration));
  await pool.query(sql('rollback_158_website_checkout_customer_notices.sql'));
  await pool.query(sql('158_website_checkout_customer_notices.sql'));
  await pool.query(sql('159_payment_terminal_card_retry.sql'));
  transaction = async (work) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE nanoclaw_admin');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  };
});
afterAll(async () => {
  if (pool) await pool.end();
  if (created) {
    await maintenance.query(
      `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`,
    );
    created = false;
  }
  await maintenance.end();
});

describe('migration 158 and PostgreSQL notice ledger', () => {
  it('persists one immutable claimed acknowledged and verified notice with exact replay', async () => {
    const attemptId = randomUUID();
    const party = (
      await pool.query(
        `INSERT INTO business_v2.parties(party_type,display_name,primary_email,last_updated_by) VALUES('person','Synthetic Learner','synthetic@example.test','fixture') RETURNING id`,
      )
    ).rows[0].id;
    await pool.query(
      `INSERT INTO business_v2.payment_attempts(attempt_id,scope_sha256,quote_id,contract) VALUES($1,$2,$3,'{}')`,
      [attemptId, 'a'.repeat(64), randomUUID()],
    );
    const ledger = new PgWebsiteCheckoutNoticeLedger(
      transaction,
      () => '20000000-0000-4000-8000-000000000002',
    );
    const input = {
      noticeKey: `website_checkout_notice:${attemptId}:self_confirmation:v1`,
      idempotencyKey: `website_checkout_receipt_welcome:${attemptId}:self_confirmation:v1`,
      attemptId,
      kind: 'self_confirmation' as const,
      recipientPartyId: Number(party),
      recipientEmailSha256: 'b'.repeat(64),
      contentSha256: 'c'.repeat(64),
      senderAccount: 'academy@tandemcoach.co',
      senderAddress: 'academy@tandemcoach.co',
      messageIdentity: `mcs-foundations:${attemptId}:self:v1`,
    };
    const queued = await ledger.ensure(input, '2026-09-11T15:00:00Z');
    expect(queued).toMatchObject({ state: 'queued', version: 0 });
    expect(await ledger.ensure(input, '2026-09-11T15:00:01Z')).toMatchObject({
      id: queued.id,
      state: 'queued',
    });
    const claimed = await ledger.claim(
      input.noticeKey,
      '2026-09-11T15:00:02Z',
      '2026-09-11T15:00:32Z',
    );
    expect(claimed).toMatchObject({ state: 'claimed', version: 1 });
    const acknowledged = await ledger.acknowledge(
      input.noticeKey,
      claimed.leaseToken!,
      'gmail-1',
      'thread-1',
      '2026-09-11T15:00:03Z',
    );
    expect(acknowledged).toMatchObject({
      state: 'acknowledged',
      gmailMessageId: 'gmail-1',
    });
    const confirmed = await ledger.confirm(
      input.noticeKey,
      'gmail-1',
      'thread-1',
      'd'.repeat(64),
      '2026-09-11T15:00:04Z',
    );
    expect(confirmed).toMatchObject({
      state: 'confirmed',
      uncertainAcceptance: false,
    });
    expect(
      await ledger.confirm(
        input.noticeKey,
        'gmail-1',
        'thread-1',
        'd'.repeat(64),
        '2026-09-11T15:00:05Z',
      ),
    ).toMatchObject({ state: 'confirmed', version: 3 });
    expect(
      (
        await pool.query(
          'SELECT stage,outcome FROM business_v2.website_checkout_customer_notice_receipts ORDER BY version',
        )
      ).rows,
    ).toEqual([
      { stage: 'queued', outcome: 'pending' },
      { stage: 'claimed', outcome: 'pending' },
      { stage: 'sent_acknowledged', outcome: 'pending' },
      { stage: 'readback', outcome: 'verified' },
    ]);
    await expect(
      ledger.ensure(
        { ...input, contentSha256: 'e'.repeat(64) },
        '2026-09-11T15:00:06Z',
      ),
    ).rejects.toThrow('notice_job_identity_conflict');
    await expect(
      pool.query(
        `UPDATE business_v2.website_checkout_customer_notice_jobs SET sender_address='other@example.test',version=version+1`,
      ),
    ).rejects.toThrow(/immutable contract/);
    await expect(
      pool.query(sql('rollback_158_website_checkout_customer_notices.sql')),
    ).rejects.toThrow(
      /populated website checkout customer notice rollback refused/,
    );
  });

  it('holds unknown acceptance and permits exact later adoption without another claim', async () => {
    const attemptId = randomUUID();
    const party = (
      await pool.query(
        `INSERT INTO business_v2.parties(party_type,display_name,primary_email,last_updated_by) VALUES('person','Synthetic Gift','gift@example.test','fixture') RETURNING id`,
      )
    ).rows[0].id;
    await pool.query(
      `INSERT INTO business_v2.payment_attempts(attempt_id,scope_sha256,quote_id,contract) VALUES($1,$2,$3,'{}')`,
      [attemptId, 'f'.repeat(64), randomUUID()],
    );
    const ledger = new PgWebsiteCheckoutNoticeLedger(
      transaction,
      () => '30000000-0000-4000-8000-000000000003',
    );
    const key = `website_checkout_notice:${attemptId}:gift_payer_receipt:v1`;
    await ledger.ensure(
      {
        noticeKey: key,
        idempotencyKey: `root:${attemptId}`,
        attemptId,
        kind: 'gift_payer_receipt',
        recipientPartyId: Number(party),
        recipientEmailSha256: '1'.repeat(64),
        contentSha256: '2'.repeat(64),
        senderAccount: 'academy@tandemcoach.co',
        senderAddress: 'academy@tandemcoach.co',
        messageIdentity: `mcs-foundations:${attemptId}:payer:v1`,
      },
      '2026-09-11T16:00:00Z',
    );
    const claimed = await ledger.claim(
      key,
      '2026-09-11T16:00:01Z',
      '2026-09-11T16:00:31Z',
    );
    const held = await ledger.hold(
      key,
      'gmail_acceptance_unknown',
      true,
      '3'.repeat(64),
      '2026-09-11T16:00:02Z',
    );
    expect(held).toMatchObject({ state: 'held', uncertainAcceptance: true });
    expect(
      await ledger.claim(key, '2026-09-11T16:01:00Z', '2026-09-11T16:01:30Z'),
    ).toMatchObject({ state: 'held' });
    const adopted = await ledger.adopt(
      key,
      'gmail-adopted',
      'thread-adopted',
      '2026-09-11T16:02:00Z',
    );
    expect(adopted).toMatchObject({
      state: 'acknowledged',
      gmailMessageId: 'gmail-adopted',
    });
    expect(
      await ledger.confirm(
        key,
        'gmail-adopted',
        'thread-adopted',
        '4'.repeat(64),
        '2026-09-11T16:02:01Z',
      ),
    ).toMatchObject({ state: 'confirmed' });
    expect(claimed.leaseToken).toBeTruthy();
  });
});
