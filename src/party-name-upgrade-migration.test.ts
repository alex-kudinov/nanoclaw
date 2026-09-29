/**
 * NC-20260929-001 — migration 173 and every host path that uses it, against
 * a disposable local PostgreSQL 16 database built from the real base
 * migrations (01-14, 95, 99). Needs the local server on /tmp:5432.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const env = vi.hoisted(() => ({ url: '' }));
vi.mock('./env.js', () => ({
  readEnvFile: () => ({ BUSINESS_DB_URL: env.url }),
}));
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { resetBusinessPool } from './business-db.js';
import { resolveOrCreateParty } from './identity-join.js';
import { runBackfill, parseCandidateFile } from './party-name-backfill.js';
import {
  upgradeCommerceOrderNames,
  upgradePartyNameByEmail,
} from './party-name-upgrade.js';

const dir = new URL(
  '../data/business/migrations/nanoclaw-v2/',
  import.meta.url,
);
const sql = (name: string) => fs.readFileSync(new URL(name, dir), 'utf8');
const BASE = [
  '01_extensions',
  '02_lookups',
  '03_parties',
  '04_roles',
  '05_engagements',
  '06_programs',
  '07_pipeline',
  '08_interactions',
  '09_documents',
  '10_outbox',
  '11_helpers',
  '12_triggers',
  '13_views',
  '14_grants',
  '95_fn_create_party_outbox_enqueue',
  '99_source_providers_chaos',
].map((n) => `${n}.sql`);
const migration = sql('173_party_display_name_upgrade.sql');
const rollback = sql('rollback_173_party_display_name_upgrade.sql');

const database = `nc_party_name_173_${process.pid}_${randomUUID().replaceAll('-', '')}`;
if (!/^nc_party_name_173_[0-9]+_[a-f0-9]{32}$/.test(database))
  throw new Error('unsafe database name');
const user = os.userInfo().username;
const base = { host: '/tmp', port: 5432, user, ssl: false as const, max: 4 };
const maintenance = new Pool({ ...base, database: 'postgres' });
let pool: Pool;
let created = false;

beforeAll(async () => {
  await maintenance.query(`CREATE DATABASE "${database}" TEMPLATE template0`);
  created = true;
  pool = new Pool({ ...base, database });
  await pool.query('CREATE EXTENSION IF NOT EXISTS citext');
  for (const name of BASE) await pool.query(sql(name));
  await pool.query(migration);
  env.url = `postgresql://${encodeURIComponent(user)}@localhost/${database}?host=/tmp`;
}, 30_000);

afterAll(async () => {
  await resetBusinessPool();
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
        if (Date.now() >= deadline) throw new Error('disposable drain failed');
        await delay(20);
      }
      await maintenance.query(`DROP DATABASE "${database}"`);
    }
  } finally {
    await maintenance.end();
  }
});

async function party(
  name: string,
  email: string,
  type = 'person',
): Promise<number> {
  const r = await pool.query<{ id: string }>(
    `SELECT business_v2.fn_create_party($1, $2, $3::citext, 'chaos')::text AS id`,
    [type, name, email],
  );
  return Number(r.rows[0].id);
}

async function nameOf(id: number): Promise<string> {
  return (
    await pool.query(
      'SELECT display_name FROM business_v2.parties WHERE id=$1',
      [id],
    )
  ).rows[0].display_name;
}

async function auditCount(): Promise<number> {
  return (
    await pool.query(
      'SELECT count(*)::int AS n FROM business_v2.party_display_name_changes',
    )
  ).rows[0].n;
}

describe('migration 173 party display-name upgrade', () => {
  it('is packaged with its rollback and grants nothing to agents', async () => {
    const builder = fs.readFileSync(
      new URL('../scripts/build-release.mjs', import.meta.url),
      'utf8',
    );
    expect(builder).toContain('173_party_display_name_upgrade.sql');
    expect(builder).toContain('rollback_173_party_display_name_upgrade.sql');
    const grants = await pool.query(
      `SELECT count(*)::int AS n FROM information_schema.role_table_grants
        WHERE table_schema='business_v2' AND table_name='party_display_name_changes'
          AND grantee NOT IN ('nanoclaw_admin')`,
    );
    expect(grants.rows[0].n).toBe(0);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE nanoclaw_inbox');
      await expect(
        client.query(
          `SELECT business_v2.fn_upgrade_party_display_name(1, 'A B', 'chaos')`,
        ),
      ).rejects.toMatchObject({ code: '42501' });
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('rolls back while empty and reapplies idempotently', async () => {
    await pool.query(rollback);
    const gone = await pool.query(
      `SELECT to_regclass('business_v2.party_display_name_changes') AS t,
              to_regprocedure('business_v2.fn_upgrade_party_display_name(bigint,text,text,text)') AS f`,
    );
    expect(gone.rows[0]).toEqual({ t: null, f: null });
    await pool.query(migration);
    await pool.query(migration);
    expect(await auditCount()).toBe(0);
  });

  it.each([
    ['steve', 'Steve Rivera', 'upgrade'],
    ['steve', '  Steve \t  Rivera  ', 'upgrade'],
    ['STEVE', 'steve rivera jr', 'upgrade'],
    ['Steve Rivera', 'Steve Rivera Smith', 'current_not_one_word'],
    ['steve', 'Mike Rivera', 'first_word_differs'],
    ['steve', 'steve@example.com', 'candidate_is_email'],
    ['steve', 'Steve r@x.com', 'candidate_is_email'],
    ['steve@example.com', 'steve@example.com Rivera', 'current_is_email'],
    ['steve', 'Steve', 'candidate_one_word'],
    ['steve', '   ', 'candidate_missing'],
    ['', 'Steve Rivera', 'current_missing'],
    ['steve', `Steve ${'R'.repeat(200)}`, 'candidate_too_long'],
    ['steve', 'Steve Ri\u200Bvera', 'candidate_bad_characters'],
    ['steve', 'Steve \u202EareviR', 'candidate_bad_characters'],
    ['steve', 'Steve Ri\u0007vera', 'candidate_bad_characters'],
  ])('verdict(%j, %j) = %s', async (current, candidate, verdict) => {
    const r = await pool.query(
      'SELECT business_v2.fn_display_name_upgrade_verdict($1, $2) AS v',
      [current, candidate],
    );
    expect(r.rows[0].v).toBe(verdict);
  });

  it('upgrades "steve" to "Steve Rivera" through resolveOrCreateParty, with audit', async () => {
    const id = await party('steve', 'steve@example.com');
    const before = (
      await pool.query(
        'SELECT updated_at FROM business_v2.parties WHERE id=$1',
        [id],
      )
    ).rows[0].updated_at;
    const resolved = await resolveOrCreateParty({
      email: 'Steve@Example.com',
      display_name: '  Steve   Rivera ',
      source_hint: 'wordpress',
      agent: 'cnpc:host',
      upgradeName: true,
    });
    expect(resolved).toBe(id);
    const row = (
      await pool.query(
        'SELECT display_name, last_updated_by, updated_at FROM business_v2.parties WHERE id=$1',
        [id],
      )
    ).rows[0];
    expect(row.display_name).toBe('Steve Rivera');
    expect(row.last_updated_by).toBe('cnpc:host');
    expect(row.updated_at.getTime()).toBeGreaterThan(before.getTime());
    const audit = await pool.query(
      `SELECT previous_display_name, new_display_name, source, changed_by
         FROM business_v2.party_display_name_changes WHERE party_id=$1`,
      [id],
    );
    expect(audit.rows).toEqual([
      {
        previous_display_name: 'steve',
        new_display_name: 'Steve Rivera',
        source: 'wordpress',
        changed_by: 'cnpc:host',
      },
    ]);
  });

  it('leaves multi-word, different, email and one-word cases alone', async () => {
    const cases: Array<[string, string, string]> = [
      ['Jamie Rivera', 'jamie.r@example.com', 'Jamie Rivera Smith'],
      ['jamie', 'jamie.x@example.com', 'Mike Rivera'],
      ['jamie', 'jamie.y@example.com', 'jamie.y@example.com'],
      [
        'jamie.z@example.com',
        'jamie.z@example.com',
        'jamie.z@example.com Rivera',
      ],
      ['jamie', 'jamie.w@example.com', 'Jamie'],
    ];
    const start = await auditCount();
    for (const [current, email, candidate] of cases) {
      const id = await party(current, email);
      await resolveOrCreateParty({
        email,
        display_name: candidate,
        source_hint: 'chaos',
        upgradeName: true,
      });
      expect(await nameOf(id)).toBe(current);
    }
    const org = await party('Acme', 'office@acme.example', 'org');
    await pool.query(
      `SELECT business_v2.fn_upgrade_party_display_name($1, 'Acme Corp', 'chaos')`,
      [org],
    );
    expect(await nameOf(org)).toBe('Acme');
    const off = await party('lee', 'lee@example.com');
    await resolveOrCreateParty({
      email: 'lee@example.com',
      display_name: 'Lee Rivera',
    });
    expect(await nameOf(off)).toBe('lee');
    expect(await auditCount()).toBe(start);
  });

  it('creates a new party with its name and writes no audit row', async () => {
    const start = await auditCount();
    const id = await resolveOrCreateParty({
      email: 'new@example.com',
      display_name: 'New Person',
      source_hint: 'chaos',
      upgradeName: true,
    });
    expect(await nameOf(id)).toBe('New Person');
    expect(await auditCount()).toBe(start);
  });

  it('upgrades nobody when an email belongs to two parties', async () => {
    const a = await party('kim', 'kim@example.com');
    const b = await party('kim', 'kim.other@example.com');
    await pool.query(
      `INSERT INTO business_v2.party_emails (party_id, email, is_primary) VALUES ($1, 'kim@example.com', false)`,
      [b],
    );
    await resolveOrCreateParty({
      email: 'kim@example.com',
      display_name: 'Kim Rivera',
      source_hint: 'chaos',
      upgradeName: true,
    });
    expect(
      await upgradePartyNameByEmail({
        email: 'kim@example.com',
        candidate: 'Kim Rivera',
        source: 'chaos-form',
        agent: 'form-submitted',
      }),
    ).toBe(false);
    expect([await nameOf(a), await nameOf(b)]).toEqual(['kim', 'kim']);
  });

  it('gives Commerce payer and learner their own names, only for existing parties', async () => {
    const payer = await party('pat', 'pat@example.com');
    const learner = await party('sam', 'sam@example.com');
    const upgraded = await upgradeCommerceOrderNames({
      payer: { firstName: 'Pat', lastName: 'Rivera', email: 'pat@example.com' },
      learner: {
        firstName: 'Sam',
        lastName: 'Rivera',
        email: 'sam@example.com',
      },
    });
    expect(upgraded).toBe(2);
    expect([await nameOf(payer), await nameOf(learner)]).toEqual([
      'Pat Rivera',
      'Sam Rivera',
    ]);
    await upgradeCommerceOrderNames({
      payer: {
        firstName: 'Nobody',
        lastName: 'Here',
        email: 'nobody@example.com',
      },
      learner: {
        firstName: 'Nobody',
        lastName: 'Here',
        email: 'nobody@example.com',
      },
    });
    expect(
      (
        await pool.query(
          `SELECT count(*)::int AS n FROM business_v2.party_emails WHERE email='nobody@example.com'`,
        )
      ).rows[0].n,
    ).toBe(0);
  });

  it('follows a merge to the surviving party and honours the expected-current guard', async () => {
    const winner = await party('ana', 'ana@example.com');
    const loser = await party('ana', 'ana.old@example.com');
    await pool.query(
      `UPDATE business_v2.parties SET merged_into=$2, merged_at=now() WHERE id=$1`,
      [loser, winner],
    );
    const guarded = await pool.query(
      `SELECT business_v2.fn_upgrade_party_display_name($1, 'Ana Rivera', 'chaos', 'Ana') AS u`,
      [winner],
    );
    expect(guarded.rows[0].u).toBe(false);
    const viaLoser = await pool.query(
      `SELECT business_v2.fn_upgrade_party_display_name($1, 'Ana Rivera', 'chaos') AS u`,
      [loser],
    );
    expect(viaLoser.rows[0].u).toBe(true);
    expect([await nameOf(winner), await nameOf(loser)]).toEqual([
      'Ana Rivera',
      'ana',
    ]);
  });

  it('keeps the audit append-only', async () => {
    for (const statement of [
      'UPDATE business_v2.party_display_name_changes SET source = source',
      'DELETE FROM business_v2.party_display_name_changes',
      'TRUNCATE business_v2.party_display_name_changes',
    ]) {
      await expect(pool.query(statement)).rejects.toMatchObject({
        code: '55000',
      });
    }
  });

  it('backfills from the candidate file: dry run writes nothing, apply is guarded', async () => {
    const eligible = await party('robin', 'robin@example.com');
    const changed = await party('drew', 'drew@example.com');
    const multi = await party('Casey Rivera', 'casey@example.com');
    const tsv = [
      'pid\tcur\tvariants\tnames\tsources',
      `${eligible}\trobin\t2\trobin rivera | Robin Rivera\tencharge`,
      `${changed}\tdrewe\t1\tDrew Rivera\theartbeat`,
      `${multi}\tCasey Rivera\t1\tCasey Rivera Jr\theartbeat`,
      `999999\tghost\t1\tGhost Rivera\theartbeat`,
      '(4 rows)',
      '',
    ].join('\n');
    const rows = parseCandidateFile(tsv);
    const start = await auditCount();
    const dry = await runBackfill(rows, false);
    expect(dry).toEqual({
      mode: 'dry_run',
      file_rows: 4,
      would_upgrade: 1,
      upgraded: 0,
      skipped: {
        name_changed_since_file: 1,
        current_not_one_word: 1,
        party_not_found: 1,
      },
    });
    expect(await auditCount()).toBe(start);
    expect(await nameOf(eligible)).toBe('robin');
    const applied = await runBackfill(rows, true);
    expect(applied.upgraded).toBe(1);
    expect([
      await nameOf(eligible),
      await nameOf(changed),
      await nameOf(multi),
    ]).toEqual(['Robin Rivera', 'drew', 'Casey Rivera']);
    const audit = await pool.query(
      `SELECT source, changed_by FROM business_v2.party_display_name_changes WHERE party_id=$1`,
      [eligible],
    );
    expect(audit.rows).toEqual([
      { source: 'backfill-nc-20260929-001', changed_by: 'party-name-backfill' },
    ]);
    const again = await runBackfill(rows, false);
    expect(again.would_upgrade).toBe(0);
    expect(again.skipped.name_changed_since_file).toBe(2);
  });

  it('refuses rollback once any name was upgraded', async () => {
    const client = await pool.connect();
    try {
      await expect(client.query(rollback)).rejects.toThrow(
        'rollback 173 refused',
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    expect(await auditCount()).toBeGreaterThan(0);
    expect(
      (
        await pool.query(
          `SELECT to_regprocedure('business_v2.fn_upgrade_party_display_name(bigint,text,text,text)') AS f`,
        )
      ).rows[0].f,
    ).not.toBeNull();
  });
});
