import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  manifestSha256,
  renderAcademyCapacityShadowSql,
  runAcademyCapacityShadowPopulation,
  sha256,
  validateAcademyCapacityShadowManifest,
} from '../scripts/populate-academy-capacity-shadow.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

const ACC_MODULE_COMPONENTS = [
  { component_key: 'acc.module-1', state: 'included' },
];
const ACC_FULL_COMPONENTS = [
  'acc.module-1',
  'acc.module-2',
  'acc.module-3',
  'acc.module-4',
  'acc.group-mentoring',
  'acc.individual-mentoring',
  'acc.group-supervision',
  'acc.performance-evaluation',
  'acc.exam-preparation',
  'shared.coaching-tools-plus',
].map((component_key) => ({ component_key, state: 'included' }));
const MCS_COMPONENTS = [
  { component_key: 'mcs.foundations', state: 'included' },
  { component_key: 'mcs.acc-bars-training', state: 'included' },
  { component_key: 'mcs.pcc-markers-training', state: 'included' },
  { component_key: 'mcs.live-practicum', state: 'included' },
  { component_key: 'mcs.observed-practice', state: 'included' },
  { component_key: 'mcs.peer-mentoring-arcs', state: 'included' },
  { component_key: 'mcs.mentoring-on-mentoring', state: 'included' },
  { component_key: 'mcs.capstone', state: 'included' },
  { component_key: 'mcs.mcc-bars-bonus', state: 'conditional' },
  { component_key: 'mcs.certificate', state: 'earned_on_completion' },
];

function block(
  delivery_block_key: string,
  component_key: string,
  starts_at: string,
  ends_at: string,
  offers: string[],
) {
  return {
    delivery_block_key,
    component_key,
    source_scope: 'calendar.public',
    source_object_id: `fixture:${delivery_block_key}`,
    starts_at,
    ends_at,
    timezone: 'America/New_York',
    session_set_sha256: sha256(`sessions:${delivery_block_key}`),
    schedule_evidence_sha256: sha256(`schedule:${delivery_block_key}`),
    pool_key: `academy-capacity-shadow-2026-09-06:pool:${delivery_block_key}`,
    capacity: 12,
    operational_state: 'open',
    configuration_evidence_sha256: sha256(`capacity:${delivery_block_key}`),
    offers: offers.map((offer_key) => ({
      offer_key,
      catalog_revision: 1,
      evidence_sha256: sha256(`offer:${delivery_block_key}:${offer_key}`),
    })),
  };
}

function manifestFixture() {
  const delivery_blocks = [
    block(
      'acc.module-1:2026-09-07',
      'acc.module-1',
      '2026-09-07T15:00:00Z',
      '2026-09-28T17:00:00Z',
      ['acc-module-1', 'acc-full', 'acc-pcc-full'],
    ),
    block(
      'mcs-practicum:2026-09-24',
      'mcs.live-practicum',
      '2026-09-24T22:00:00Z',
      '2026-12-18T01:00:00Z',
      ['mcs-full'],
    ),
    block(
      'mcs-practicum:2026-09-25',
      'mcs.live-practicum',
      '2026-09-25T14:00:00Z',
      '2026-12-18T17:00:00Z',
      ['mcs-full'],
    ),
    block(
      'mcs-practicum:2027-01-07',
      'mcs.live-practicum',
      '2027-01-07T23:00:00Z',
      '2027-03-12T01:00:00Z',
      ['mcs-full'],
    ),
    block(
      'mcs-practicum:2027-01-08',
      'mcs.live-practicum',
      '2027-01-08T15:00:00Z',
      '2027-03-12T17:00:00Z',
      ['mcs-full'],
    ),
  ];
  const participants: any[] = [];
  const addParticipants = (
    count: number,
    delivery_block_key: string,
    offer_key: string,
    bundle_key: string,
    components: Array<{ component_key: string; state: string }>,
  ) => {
    for (let index = 0; index < count; index += 1) {
      const ordinal = participants.length + 1;
      const email = `student-${String(ordinal).padStart(3, '0')}@example.test`;
      participants.push({
        participant_key: sha256(email),
        email,
        display_name: `Fixture Student ${ordinal}`,
        allow_create_party: ordinal <= 3,
        delivery_block_key,
        offer_key,
        bundle_key,
        assignment_component_key:
          offer_key === 'mcs-full' ? 'mcs.live-practicum' : 'acc.module-1',
        financial_classification: ordinal === 1 ? 'held' : 'settled',
        source_scope:
          offer_key === 'mcs-full'
            ? 'student_roster.mcs'
            : 'student_roster.acc',
        record_evidence_sha256: sha256(`record:${ordinal}`),
        components: structuredClone(components),
      });
    }
  };
  addParticipants(
    10,
    'acc.module-1:2026-09-07',
    'acc-module-1',
    'acc-module-1:v1',
    ACC_MODULE_COMPONENTS,
  );
  addParticipants(
    11,
    'acc.module-1:2026-09-07',
    'acc-full',
    'acc-full:v1',
    ACC_FULL_COMPONENTS,
  );
  addParticipants(
    5,
    'mcs-practicum:2026-09-24',
    'mcs-full',
    'mcs-standard-path:v1',
    MCS_COMPONENTS,
  );
  addParticipants(
    13,
    'mcs-practicum:2026-09-25',
    'mcs-full',
    'mcs-standard-path:v1',
    MCS_COMPONENTS,
  );
  addParticipants(
    1,
    'mcs-practicum:2027-01-07',
    'mcs-full',
    'mcs-standard-path:v1',
    MCS_COMPONENTS,
  );
  return {
    schema_version: '1.0',
    batch_key: 'academy-capacity-shadow-2026-09-06',
    observed_at: '2026-09-06T16:49:27Z',
    source_evidence_sha256: sha256('source-resolution'),
    delivery_blocks,
    participants,
    exceptions: [
      {
        exception_key:
          'academy-capacity-shadow-2026-09-06:exception:mcs-friday-owner-count',
        subject_type: 'assignment',
        delivery_block_key: 'mcs-practicum:2026-09-25',
        reason_code: 'mcs_friday_owner_count_variance',
        severity: 'high',
        owner_role: 'owner_admin',
        evidence_sha256: sha256('mcs-owner-count'),
        review_at: '2026-09-13T16:49:27Z',
      },
      {
        exception_key:
          'academy-capacity-shadow-2026-09-06:exception:acc-module-1-funding',
        subject_type: 'agreement',
        participant_key: participants[0].participant_key,
        reason_code: 'funding_source_unresolved',
        severity: 'medium',
        owner_role: 'finance_operator',
        evidence_sha256: sha256('funding-held'),
        review_at: '2026-09-13T16:49:27Z',
      },
      {
        exception_key:
          'academy-capacity-shadow-2026-09-06:exception:acc-heartbeat-email-alias',
        subject_type: 'enrollment',
        participant_key: participants[10].participant_key,
        reason_code: 'cross_provider_email_alias_unresolved',
        severity: 'medium',
        owner_role: 'enrollment_operator',
        evidence_sha256: sha256('alias-held'),
        review_at: '2026-09-13T16:49:27Z',
      },
    ],
  };
}

function privateManifestFile(manifest: unknown, mode = 0o600) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'academy-shadow-manifest-'),
  );
  temporaryDirectories.push(directory);
  const file = path.join(directory, 'manifest.json');
  fs.writeFileSync(file, `${JSON.stringify(manifest)}\n`, { mode });
  fs.chmodSync(file, mode);
  return file;
}

describe('Academy capacity production shadow population', () => {
  it('packages the private-manifest builder and population command in releases', () => {
    const builder = fs.readFileSync(
      new URL('../scripts/build-release.mjs', import.meta.url),
      'utf8',
    );
    expect(builder).toContain(
      "'scripts/build-academy-capacity-shadow-manifest.mjs'",
    );
    expect(builder).toContain("'scripts/populate-academy-capacity-shadow.mjs'");
  });

  it('accepts only the exact five-block, 40-assignment, three-exception batch', () => {
    const manifest = manifestFixture();
    expect(validateAcademyCapacityShadowManifest(manifest)).toEqual([]);
    expect(manifest.participants).toHaveLength(40);
    expect(manifest.delivery_blocks).toHaveLength(5);
    expect(manifest.exceptions).toHaveLength(3);
  });

  it('rejects population drift, payer inference, and unapproved Party creation', () => {
    const manifest = manifestFixture() as any;
    manifest.participants.pop();
    manifest.participants[4].participant_key = 'a'.repeat(64);
    manifest.participants[3].allow_create_party = true;
    expect(validateAcademyCapacityShadowManifest(manifest)).toEqual(
      expect.arrayContaining([
        'exactly 40 assignments are required',
        expect.stringContaining('participant key does not match email'),
        'exactly three exact roster Parties may be created',
        'mcs-practicum:2027-01-07: expected 1 assignments',
      ]),
    );
  });

  it('binds every held exception to the exact participant or delivery block state', () => {
    const manifest = manifestFixture() as any;
    const mcsParticipant = manifest.participants.find(
      (entry: any) => entry.offer_key === 'mcs-full',
    );
    const moduleParticipant = manifest.participants.find(
      (entry: any) => entry.offer_key === 'acc-module-1',
    );
    manifest.exceptions.find(
      (entry: any) => entry.reason_code === 'funding_source_unresolved',
    ).participant_key = mcsParticipant.participant_key;
    manifest.exceptions.find(
      (entry: any) =>
        entry.reason_code === 'cross_provider_email_alias_unresolved',
    ).participant_key = moduleParticipant.participant_key;
    manifest.exceptions.find(
      (entry: any) => entry.reason_code === 'mcs_friday_owner_count_variance',
    ).delivery_block_key = 'mcs-practicum:2026-09-24';
    expect(validateAcademyCapacityShadowManifest(manifest)).toEqual(
      expect.arrayContaining([
        'funding_source_unresolved: must bind the held ACC Module 1 agreement',
        'cross_provider_email_alias_unresolved: must bind an ACC Full enrollment',
        'mcs_friday_owner_count_variance: must bind the MCS Friday delivery block',
      ]),
    );
  });

  it('requires every generated namespace key and readback to be batch-scoped', () => {
    const changed = manifestFixture() as any;
    changed.delivery_blocks[0].pool_key =
      'academy-shadow:pool:acc.module-1:2026-09-07';
    changed.exceptions[0].exception_key =
      'academy-shadow:exception:mcs-friday-owner-count';
    expect(validateAcademyCapacityShadowManifest(changed)).toEqual(
      expect.arrayContaining([
        'acc.module-1:2026-09-07: pool_key must be batch-scoped',
        'mcs_friday_owner_count_variance: exception_key must be batch-scoped',
      ]),
    );

    const sql = renderAcademyCapacityShadowSql(manifestFixture());
    expect(sql).toContain(
      "LIKE 'academy-capacity-shadow-2026-09-06:assignment:%'",
    );
    expect(sql).not.toContain("LIKE 'academy-shadow:");
  });

  it('renders an atomic, idempotent, aggregate-readback SQL transaction', () => {
    const sql = renderAcademyCapacityShadowSql(manifestFixture());
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('ON CONFLICT (order_key) DO NOTHING');
    expect(sql).toContain('migrations 142 and 143 must be applied');
    expect(sql).toContain('capacity occupancy readback mismatch');
    expect(sql).toContain("'pending_projections'");
    expect(sql).toContain('COMMIT;');
    expect(sql).not.toMatch(/\b(?:pi|ch|cus)_[A-Za-z0-9]+\b/);
  });

  it('keeps the private manifest mode-0600 and dry-runs without psql', () => {
    const manifest = manifestFixture();
    const file = privateManifestFile(manifest);
    expect(
      runAcademyCapacityShadowPopulation({
        manifest: file,
        database: 'nanoclaw_business',
        psql: '/does/not/matter/in/dry-run',
        apply: false,
        confirmHost: '',
        expectedManifestSha256: '',
      }),
    ).toMatchObject({
      ok: true,
      dry_run: true,
      manifest_sha256: manifestSha256(manifest),
      delivery_blocks: 5,
      participants: 40,
      held_exceptions: 3,
      create_party_allowances: 3,
    });
  });

  it('refuses group-readable manifests and wrong host confirmation before psql', () => {
    const manifest = manifestFixture();
    const exposed = privateManifestFile(manifest, 0o640);
    expect(() =>
      runAcademyCapacityShadowPopulation({
        manifest: exposed,
        database: 'nanoclaw_business',
        psql: '/does/not/exist',
        apply: false,
        confirmHost: '',
        expectedManifestSha256: '',
      }),
    ).toThrow('must not grant group or world permissions');

    const file = privateManifestFile(manifest);
    expect(() =>
      runAcademyCapacityShadowPopulation({
        manifest: file,
        database: 'nanoclaw_business',
        psql: '/does/not/exist',
        apply: true,
        confirmHost: 'wrong-host.invalid',
        expectedManifestSha256: manifestSha256(manifest),
      }),
    ).toThrow('host confirmation mismatch');
  });
});
