import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const defaultPacketPath = path.join(
  root,
  'docs/work-packets/NC-20260909-002-PRODUCTION-ADMISSION-ROLLOUT.json',
);
export const defaultSchemaPath = path.join(
  root,
  'docs/work-packets/NC-20260909-002-PRODUCTION-ADMISSION-ROLLOUT.schema.json',
);

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const EXPECTED_SAFETY_CONTRACT_SHA256 =
  'e5b3a931707700810772e0354e5fda71d40d7abd1b7fc8baafc4e529fb4682e4';

function add(condition, message, findings) {
  if (!condition) findings.push(message);
}

function hasPath(value, dotted) {
  let cursor = value;
  for (const segment of dotted.split('.')) {
    if (
      cursor === null ||
      typeof cursor !== 'object' ||
      !Object.prototype.hasOwnProperty.call(cursor, segment)
    )
      return false;
    cursor = cursor[segment];
  }
  if (cursor === null || cursor === undefined) return false;
  if (typeof cursor === 'string') return cursor.trim().length > 0;
  if (Array.isArray(cursor)) return cursor.length > 0;
  return true;
}

function unique(values) {
  return new Set(values).size === values.length;
}

function fileSha256(base, relative) {
  return createHash('sha256')
    .update(fs.readFileSync(path.join(base, relative)))
    .digest('hex');
}

function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
    .join(',')}}`;
}

export function studentEnrollmentProductionRolloutSafetyHash(packet) {
  const safetyContract = {
    eligibility: packet?.eligibility,
    authenticated_native_proof: packet?.authenticated_native_proof,
    writer_ownership: packet?.writer_ownership,
    accounting_continuity: packet?.accounting_continuity,
    destinations: packet?.destinations,
    migration_runbook: packet?.migration_runbook,
    rollout: packet?.rollout,
    duplicate_and_alias_assertions: packet?.duplicate_and_alias_assertions,
    uncertain_acceptance: packet?.uncertain_acceptance,
    rollback: packet?.rollback,
    external_mutations: packet?.external_mutations,
    owner_decisions: packet?.owner_decisions,
    forbidden_actions: packet?.forbidden_actions,
  };
  return createHash('sha256').update(canonical(safetyContract)).digest('hex');
}

export function validateStudentEnrollmentProductionRollout(
  packet,
  schema,
  options = {},
) {
  const findings = [];
  const base = options.root ?? root;
  const verifyFiles = options.verifyFiles !== false;
  const requiredTop = schema?.required ?? [];
  const requiredPaths = schema?.['x-required-paths'] ?? [];

  add(schema?.type === 'object', 'schema must describe an object', findings);
  add(
    schema?.additionalProperties === false,
    'schema must refuse additional top-level properties',
    findings,
  );
  add(
    Array.isArray(requiredTop) && requiredTop.length > 0,
    'schema required list must be nonempty',
    findings,
  );
  add(
    Array.isArray(requiredPaths) && requiredPaths.length > 0,
    'schema x-required-paths must be nonempty',
    findings,
  );
  add(unique(requiredTop), 'schema required keys must be unique', findings);
  add(unique(requiredPaths), 'schema required paths must be unique', findings);
  const allowedTop = new Set(Object.keys(schema?.properties ?? {}));
  for (const key of Object.keys(packet ?? {}))
    add(allowedTop.has(key), `unexpected top-level field ${key}`, findings);
  for (const key of requiredTop)
    add(
      Object.prototype.hasOwnProperty.call(packet ?? {}, key),
      `missing required top-level field ${key}`,
      findings,
    );
  for (const requiredPath of requiredPaths)
    add(
      hasPath(packet, requiredPath),
      `missing required path ${requiredPath}`,
      findings,
    );

  add(packet?.schema_version === '1.0', 'schema_version must be 1.0', findings);
  add(packet?.packet_id === 'NC-20260909-002', 'packet_id mismatch', findings);
  add(
    packet?.status === 'prepared_not_authorized',
    'packet must remain prepared_not_authorized',
    findings,
  );
  add(
    Number.isFinite(Date.parse(packet?.prepared_at_utc ?? '')),
    'prepared_at_utc must be ISO-8601',
    findings,
  );
  const safetyHash = studentEnrollmentProductionRolloutSafetyHash(packet);
  add(
    packet?.safety_contract_sha256 === safetyHash,
    'safety contract hash does not match packet contents',
    findings,
  );
  add(
    safetyHash === EXPECTED_SAFETY_CONTRACT_SHA256,
    'safety contract differs from the reviewed validator pin',
    findings,
  );
  add(
    packet?.authority?.execution_authorized === false &&
      packet?.authority?.production_or_provider_writes_authorized === false &&
      packet?.authority?.owner_acceptance_required === true,
    'preparation must not authorize execution or provider writes',
    findings,
  );
  add(
    packet?.authority?.natural_event_only === true &&
      packet?.authority?.historical_population_reads_allowed === false,
    'packet must require a natural event and forbid historical population reads',
    findings,
  );

  for (const field of [
    'registration_commit',
    'reviewed_projection_closure',
    'reviewed_projection_implementation',
    'reviewed_admission_closure',
    'reviewed_admission_implementation',
    'reviewed_store_closure',
    'reviewed_store_implementation',
    'reviewed_publication_closure',
    'current_production_release',
    'current_production_parent',
    'current_production_source_tree',
  ])
    add(
      COMMIT.test(packet?.lineage?.[field] ?? ''),
      `${field} must be a full commit`,
      findings,
    );
  for (const field of ['current_production_artifact_sha256'])
    add(
      SHA256.test(packet?.lineage?.[field] ?? ''),
      `${field} must be SHA-256`,
      findings,
    );
  add(
    packet?.lineage?.current_production_node === '22.23.2',
    'production Node pin must be 22.23.2',
    findings,
  );
  add(
    packet?.lineage?.release_revalidation_required === true,
    'release lineage must be revalidated at rollout',
    findings,
  );

  const population = packet?.population ?? {};
  const exactPopulation = {
    maximum_natural_events: 1,
    offer_key: 'supervision-inaugural',
    offer_version: 1,
    bundle_key: 'coaching-supervision-mastery:v1',
    catalog_revision: 1,
    stripe_account: 'tandem',
    canonical_source_object_type: 'payment_intent',
    funding_state: 'settled',
    agreement_type: 'paid_in_full',
    currency: 'usd',
    gross_amount_minor: 399600,
    discount_policy: 'none_for_this_pilot',
    payer_relationship: 'self_purchase_explicit',
    seat_count: 1,
    delivery_block_key: 'supervision:2026-10-07',
    delivery_program: 'supervision',
    delivery_start_date: '2026-10-07',
    event_must_be_received_after_activation: true,
    known_historical_episode_replay_forbidden: true,
  };
  for (const [field, expected] of Object.entries(exactPopulation))
    add(
      population[field] === expected,
      `population.${field} must equal ${JSON.stringify(expected)}`,
      findings,
    );
  add(
    (packet?.eligibility?.all_required ?? []).length >= 9,
    'eligibility must cover all nine positive gates',
    findings,
  );
  add(
    (packet?.eligibility?.refuse_or_preserve_legacy ?? []).length >= 6,
    'eligibility must cover all refusal families',
    findings,
  );

  const ingress = packet?.writer_ownership?.actual_ingress_paths ?? [];
  add(
    ingress.length === 2,
    'exactly two actual Stripe ingress paths are required',
    findings,
  );
  add(
    ingress.some((entry) => entry.path === 'src/webhook-server.ts') &&
      ingress.some((entry) => entry.path === 'src/webhook-inbox-reaper.ts') &&
      ingress.every((entry) => entry.required_call === 'handleStripePayment'),
    'request-time and reaper paths must converge on handleStripePayment',
    findings,
  );
  add(
    packet?.writer_ownership?.atomic_gate ===
      'src/student-enrollment-admission.ts#claimEnrollmentWriter',
    'writer ownership must use the reviewed atomic gate',
    findings,
  );
  add(
    (packet?.writer_ownership?.raw_store_bypass_controls ?? []).length >= 5,
    'raw-store bypass controls are incomplete',
    findings,
  );
  add(
    packet?.accounting_continuity
      ?.always_runs_for_authenticated_settled_payment === true &&
      packet?.accounting_continuity?.independent_of_enrollment_acceptance ===
        true,
    'accounting must continue independently of enrollment',
    findings,
  );
  const accountingSystems = (packet?.accounting_continuity?.stages ?? []).map(
    (stage) => stage.system,
  );
  for (const required of [
    'Student Payment Log',
    'PostgreSQL public.payments',
    'Contador fulfillment ledger',
  ])
    add(
      accountingSystems.includes(required),
      `missing accounting stage ${required}`,
      findings,
    );

  const destinations = packet?.destinations ?? {};
  add(
    Object.keys(destinations).sort().join('|') ===
      'encharge|heartbeat|plutio|student_roster',
    'destination set must be exact',
    findings,
  );
  add(
    destinations.student_roster?.disposition === 'required',
    'Student Roster must be required',
    findings,
  );
  add(
    destinations.heartbeat?.disposition === 'required',
    'Heartbeat must be required',
    findings,
  );
  for (const target of ['encharge', 'plutio']) {
    add(
      destinations[target]?.disposition === 'not_applicable',
      `${target} must be not_applicable`,
      findings,
    );
    add(
      destinations[target]?.offer_key === 'supervision-inaugural',
      `${target} offer mismatch`,
      findings,
    );
    add(
      destinations[target]?.offer_version === 1,
      `${target} version mismatch`,
      findings,
    );
  }
  add(
    destinations.student_roster?.sheet_id === 1796552584 &&
      destinations.student_roster?.sheet_title === 'CSS',
    'Student Roster CSS identity mismatch',
    findings,
  );
  add(
    JSON.stringify(destinations.student_roster?.current_header) ===
      JSON.stringify([
        'Email',
        'Name',
        'Coaching Supervision Mastery',
        'Refunded',
        'Joined',
      ]),
    'Student Roster current header mismatch',
    findings,
  );
  add(
    (
      destinations.student_roster?.required_operational_headers_f_through_m ??
      []
    ).length === 8,
    'Student Roster must pin eight operational headers F:M',
    findings,
  );
  add(
    destinations.student_roster?.current_write_permission ===
      'unverified_without_write' &&
      destinations.student_roster?.activation_ready_now === false,
    'Student Roster must remain not ready until write preflight',
    findings,
  );
  add(
    destinations.heartbeat?.course_access_group_id ===
      'fa5f5f09-a10e-4dfd-8bf2-0451f7cffa83' &&
      destinations.heartbeat?.course_id ===
        '1f2febfe-eb34-463a-818e-ce7d0cac1251',
    'Heartbeat access group/course identity mismatch',
    findings,
  );
  add(
    destinations.heartbeat?.marker_parent_name === 'Student Markers' &&
      destinations.heartbeat?.delivery_marker_name ===
        'class:supervision:live-practicum:2026-10-07:inaugural',
    'Heartbeat marker identities mismatch',
    findings,
  );
  const marker = destinations.heartbeat?.marker_invariants ?? {};
  for (const field of ['hidden', 'admin_controlled'])
    add(
      marker[field] === true,
      `Heartbeat marker ${field} must be true`,
      findings,
    );
  for (const field of [
    'joinable',
    'paid_offer_attached',
    'course_attached',
    'channel_attached',
    'event_attached',
    'resource_attached',
    'workflow_attached',
    'proves_payment',
    'proves_entitlement',
  ])
    add(
      marker[field] === false,
      `Heartbeat marker ${field} must be false`,
      findings,
    );
  add(
    destinations.heartbeat?.current_write_permission ===
      'unverified_without_write' &&
      destinations.heartbeat?.activation_ready_now === false,
    'Heartbeat must remain not ready until write/readback preflight',
    findings,
  );

  const expectedMigrations = [
    {
      number: 146,
      file: 'data/business/migrations/nanoclaw-v2/146_student_enrollment_store_contract.sql',
      source:
        '3162275b7b91bfeb443b1cdbf5baea2030634cffdc9c8d7c52bd5b6716315f9e',
      rollback:
        'data/business/migrations/nanoclaw-v2/rollback_146_student_enrollment_store_contract.sql',
      rollbackSha:
        '2dee44c805f5f92e4bfa382bfd507222740a44becfff12b5d0d06b0cf5ace35b',
    },
    {
      number: 147,
      file: 'data/business/migrations/nanoclaw-v2/147_student_enrollment_writer_claims.sql',
      source:
        'b0ace8499f9548fd6695ea6a5e0fd922d7e607d5a7d4e23c3d7b5f9bbe608a81',
      rollback:
        'data/business/migrations/nanoclaw-v2/rollback_147_student_enrollment_writer_claims.sql',
      rollbackSha:
        'be7400d2c7811b33e944a2e492f66ce702a54856a636546c2dd301a0b4c3f121',
    },
    {
      number: 148,
      file: 'data/business/migrations/nanoclaw-v2/148_student_enrollment_projection_foundation.sql',
      source:
        '274eafeef352fb06fafd9a7613ac8aab565b3b8a57b610a5a456c67740036881',
      rollback:
        'data/business/migrations/nanoclaw-v2/rollback_148_student_enrollment_projection_foundation.sql',
      rollbackSha:
        '3539f2289a5fa7548f7c07ccae10f84aaa804ad5421c353b96da5a58fcb49278',
    },
  ];
  add(
    (packet?.migrations ?? []).length === 3,
    'exactly three migrations are required',
    findings,
  );
  expectedMigrations.forEach((expected, index) => {
    const actual = packet?.migrations?.[index] ?? {};
    add(
      actual.number === expected.number,
      `migration ${index} number mismatch`,
      findings,
    );
    add(
      actual.file === expected.file,
      `migration ${expected.number} file mismatch`,
      findings,
    );
    add(
      actual.source_sha256 === expected.source,
      `migration ${expected.number} hash mismatch`,
      findings,
    );
    add(
      actual.rollback_file === expected.rollback,
      `migration ${expected.number} rollback mismatch`,
      findings,
    );
    add(
      actual.rollback_sha256 === expected.rollbackSha,
      `migration ${expected.number} rollback hash mismatch`,
      findings,
    );
    add(
      actual.current_production_state === 'unapplied',
      `migration ${expected.number} must be unapplied`,
      findings,
    );
    if (verifyFiles) {
      add(
        fileSha256(base, expected.file) === expected.source,
        `migration ${expected.number} source file hash drift`,
        findings,
      );
      add(
        fileSha256(base, expected.rollback) === expected.rollbackSha,
        `migration ${expected.number} rollback file hash drift`,
        findings,
      );
    }
  });
  add(
    JSON.stringify(packet?.migration_runbook?.required_order) ===
      JSON.stringify([146, 147, 148]),
    'migration apply order must be 146,147,148',
    findings,
  );
  add(
    JSON.stringify(packet?.migration_runbook?.pre_event_rollback_order) ===
      JSON.stringify([148, 147, 146]),
    'migration rollback order must be 148,147,146',
    findings,
  );

  const preflightIds = (packet?.rollout?.preflight ?? []).map(
    (item) => item.id,
  );
  add(
    JSON.stringify(preflightIds) ===
      JSON.stringify([
        'P01_owner_authority',
        'P02_current_lineage',
        'P03_zero_work_and_backups',
        'P04_schema_and_permissions',
        'P05_writer_exclusion',
        'P06_capacity_and_assignment',
        'P07_roster_target',
        'P08_heartbeat_targets',
        'P09_event_filter',
        'P10_activation_epoch',
      ]),
    'preflight IDs and order must be exact',
    findings,
  );
  for (const item of packet?.rollout?.preflight ?? []) {
    add(
      typeof item.required_evidence === 'string' &&
        item.required_evidence.length > 0,
      `${item.id} missing evidence`,
      findings,
    );
    add(
      /^[a-z][a-z0-9_]+$/.test(item.abort_code ?? ''),
      `${item.id} invalid abort code`,
      findings,
    );
  }
  add(
    packet?.rollout?.activation?.mode === 'one_future_natural_event' &&
      packet?.rollout?.activation?.policy_key ===
        'student_enrollment_supervision_inaugural_v1_one_event',
    'activation mode/policy mismatch',
    findings,
  );
  const milestones = packet?.rollout?.milestones ?? [];
  add(
    milestones.length === 2 &&
      milestones[0]?.order === 1 &&
      milestones[0]?.id === 'canonical_admission' &&
      milestones[1]?.order === 2 &&
      milestones[1]?.id === 'immediate_provider_projection',
    'canonical then immediate projection milestones are required',
    findings,
  );
  add(
    (packet?.rollout?.monitoring?.checks ?? []).length >= 8,
    'monitoring contract is incomplete',
    findings,
  );
  add(
    (packet?.rollout?.abort_triggers ?? []).length >= 8,
    'abort triggers are incomplete',
    findings,
  );
  add(
    (packet?.duplicate_and_alias_assertions ?? []).length >= 7,
    'duplicate/alias assertions are incomplete',
    findings,
  );
  add(
    (packet?.rollback?.post_rollback_verification ?? []).length >= 6,
    'post-rollback verification is incomplete',
    findings,
  );
  add(
    (packet?.external_mutations ?? []).length >= 8,
    'external mutations are incomplete',
    findings,
  );

  const decisions = (packet?.owner_decisions ?? []).map((item) => item.id);
  add(
    JSON.stringify(decisions) ===
      JSON.stringify([
        'D01_authorize_exact_rollout',
        'D02_numeric_capacity',
        'D03_roster_operational_columns',
        'D04_heartbeat_marker_identity',
      ]),
    'owner decisions must be the exact minimal set',
    findings,
  );
  add(
    (packet?.forbidden_actions ?? []).length >= 6,
    'forbidden action boundary is incomplete',
    findings,
  );

  if (verifyFiles) {
    const evidence = packet?.evidence_sources ?? {};
    add(
      fileSha256(base, evidence.target_catalog) ===
        evidence.target_catalog_sha256,
      'target catalog hash drift',
      findings,
    );
    add(
      fileSha256(base, evidence.entitlement_catalog) ===
        evidence.entitlement_catalog_sha256,
      'entitlement catalog hash drift',
      findings,
    );
    for (const field of [
      'projection_contract',
      'admission_contract',
      'store_contract',
      'lifecycle_strategy',
      'product_identity',
      'live_schema_snapshot',
      'roster_metadata_snapshot',
      'provider_metadata_receipt',
    ])
      add(
        typeof evidence[field] === 'string' &&
          fs.existsSync(path.join(base, evidence[field])),
        `missing evidence source ${field}`,
        findings,
      );
  }
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const packetPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : defaultPacketPath;
  const schemaPath = process.argv[3]
    ? path.resolve(process.argv[3])
    : defaultSchemaPath;
  const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const findings = validateStudentEnrollmentProductionRollout(packet, schema);
  if (findings.length) {
    console.error(`INVALID: ${findings.length} finding(s)`);
    findings.forEach((finding) => console.error(`- ${finding}`));
    process.exit(1);
  }
  console.log(
    `VALID: ${packet.packet_id}; ${schema['x-required-paths'].length} omission-guarded paths; ${packet.rollout.preflight.length} preflights; ${packet.migrations.length} migrations; ${packet.external_mutations.length} exact external mutations; execution remains unauthorized`,
  );
}
