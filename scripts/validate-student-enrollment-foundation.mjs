import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const defaultContractPath = path.join(
  root,
  'facts/catalogs/student-enrollment-foundation-v1.json',
);
export const defaultSchemaPath = path.join(
  root,
  'facts/catalogs/student-enrollment-foundation-v1.schema.json',
);
const KEY = /^[a-z0-9][a-z0-9._:-]+$/;

function add(condition, message, findings) {
  if (!condition) findings.push(message);
}
function unique(values) {
  return new Set(values).size === values.length;
}
function keys(entries) {
  return Array.isArray(entries) ? entries.map((entry) => entry?.key) : [];
}

export function validateStudentEnrollmentFoundation(contract) {
  const findings = [];
  add(
    contract?.schema_version === '1.0',
    'schema_version must be 1.0',
    findings,
  );
  add(
    contract?.contract_id === 'student-enrollment-foundation',
    'contract_id must be student-enrollment-foundation',
    findings,
  );
  add(
    Number.isInteger(contract?.contract_revision) &&
      contract.contract_revision > 0,
    'contract_revision must be positive',
    findings,
  );
  add(
    typeof contract?.effective_from === 'string' &&
      !Number.isNaN(Date.parse(contract.effective_from)),
    'effective_from must be a date-time',
    findings,
  );

  for (const collection of [
    'entities',
    'source_channels',
    'commands',
    'query_contracts',
    'synthetic_scenarios',
  ]) {
    const values = contract?.[collection];
    add(
      Array.isArray(values) && values.length > 0,
      `${collection} must be nonempty`,
      findings,
    );
    const valueKeys = keys(values);
    add(
      valueKeys.every((key) => KEY.test(key ?? '')),
      `${collection} contains an invalid key`,
      findings,
    );
    add(unique(valueKeys), `${collection} keys must be unique`, findings);
  }

  const entitySet = new Set(keys(contract?.entities));
  for (const required of [
    'enrollment_order',
    'enrollment_seat',
    'student_enrollment',
    'component_entitlement',
    'class_assignment',
    'financial_agreement',
    'financial_obligation',
    'order_source_reference',
    'projection_receipt',
    'enrollment_exception',
  ]) {
    add(entitySet.has(required), `missing entity ${required}`, findings);
  }

  const channelSet = new Set(keys(contract?.source_channels));
  for (const channel of contract?.source_channels ?? []) {
    add(
      channel.participant_evidence === 'required',
      `channel ${channel.key}: participant evidence must be required`,
      findings,
    );
    add(
      channel.payer_equals_participant !== 'automatic',
      `channel ${channel.key}: payer cannot automatically become participant`,
      findings,
    );
  }
  for (const required of [
    'website_stripe_checkout',
    'manual_stripe_payment',
    'plutio_invoice_or_contract',
    'check_ach_or_wire',
    'sponsored_cohort',
    'scholarship',
    'complimentary_owner_grant',
    'migration_or_correction',
  ]) {
    add(
      channelSet.has(required),
      `missing source channel ${required}`,
      findings,
    );
  }
  const sponsor = (contract?.source_channels ?? []).find(
    (entry) => entry.key === 'sponsored_cohort',
  );
  add(
    sponsor?.allows_multiple_seats === true &&
      sponsor?.payer_equals_participant === 'never_inferred',
    'sponsored_cohort must support multiple seats and never infer participants',
    findings,
  );

  const machines = contract?.state_machines ?? {};
  for (const name of [
    'order',
    'seat',
    'enrollment',
    'obligation',
    'projection',
    'exception',
  ]) {
    add(
      Array.isArray(machines[name]) && machines[name].length > 0,
      `missing state machine ${name}`,
      findings,
    );
    add(
      unique(machines[name] ?? []),
      `state machine ${name} has duplicate states`,
      findings,
    );
  }
  add(
    (machines.seat ?? []).includes('unassigned'),
    'seat state must preserve unassigned capacity',
    findings,
  );
  add(
    (machines.projection ?? []).includes('verified'),
    'projection requires verified state',
    findings,
  );
  add(
    (machines.obligation ?? []).includes('not_due'),
    'obligation must distinguish not_due',
    findings,
  );
  for (const state of machines.enrollment ?? []) {
    add(
      typeof contract?.state_semantics?.enrollment?.[state] === 'string' &&
        contract.state_semantics.enrollment[state].length > 0,
      `enrollment state ${state} requires semantics`,
      findings,
    );
  }

  const gates = new Set(contract?.materialization_gates ?? []);
  for (const gate of [
    'order_has_immutable_source_reference',
    'offer_key_and_bundle_version_are_exact',
    'seat_is_assigned_to_one_exact_party',
    'participant_evidence_is_source_bound',
    'payer_participant_relationship_is_explicit',
    'required_financial_terms_are_classified',
    'no_blocking_identity_offer_or_entitlement_conflict',
  ]) {
    add(gates.has(gate), `missing materialization gate ${gate}`, findings);
  }

  const commandMap = new Map(
    (contract?.commands ?? []).map((entry) => [entry.key, entry]),
  );
  add(
    commandMap.get('link_source_reference')?.writes === 'append_only',
    'source reference linking must be append-only',
    findings,
  );
  for (const field of [
    'order_version',
    'source_scope',
    'source_object_type',
    'source_object_id',
    'idempotency_key',
  ]) {
    add(
      commandMap.get('link_source_reference')?.requires?.includes(field),
      `link_source_reference must require ${field}`,
      findings,
    );
  }
  for (const field of [
    'order_version',
    'seat_version',
    'all_materialization_gates',
  ]) {
    add(
      commandMap.get('materialize_enrollment')?.requires?.includes(field),
      `materialize_enrollment must require ${field}`,
      findings,
    );
  }
  add(
    commandMap.get('request_projection')?.writes === 'outbox_only',
    'request_projection must write only to an outbox',
    findings,
  );
  add(
    commandMap.get('record_projection_readback')?.writes === 'append_only',
    'projection readback must be append-only',
    findings,
  );
  add(
    commandMap.get('correct_or_transfer')?.writes === 'append_only',
    'corrections and transfers must be append-only',
    findings,
  );

  const queryMap = new Map(
    (contract?.query_contracts ?? []).map((entry) => [entry.key, entry]),
  );
  for (const query of contract?.query_contracts ?? []) {
    add(
      entitySet.has(query.starts_from),
      `query ${query.key}: starts_from must name an entity`,
      findings,
    );
  }
  add(
    queryMap.get('class_recipients')?.starts_from === 'class_assignment',
    'class recipients must start from class assignments',
    findings,
  );
  add(
    queryMap.get('next_payment_due')?.starts_from === 'financial_obligation',
    'next payment due must start from actual obligations',
    findings,
  );
  add(
    queryMap
      .get('unassigned_sponsor_seats')
      ?.forbids?.includes('invented_participant'),
    'unassigned sponsor seats must forbid invented participants',
    findings,
  );

  add(
    contract?.projection_policy?.verified_requires_exact_readback === true,
    'projection verification must require exact readback',
    findings,
  );
  add(
    contract?.projection_policy?.success_exit_or_message_is_not_receipt ===
      true,
    'success exit or message must not count as a receipt',
    findings,
  );
  add(
    contract?.projection_policy
      ?.direct_operator_target_edit_is_not_canonical_intake === true,
    'direct target edits must not be canonical intake',
    findings,
  );
  add(
    contract?.projection_policy?.heartbeat_access_groups_remain_constant ===
      true,
    'Heartbeat access groups must remain constant',
    findings,
  );
  add(
    contract?.projection_policy
      ?.heartbeat_marker_groups_are_zero_content_parallel_projection === true,
    'Heartbeat markers must remain zero-content parallel projections',
    findings,
  );
  const targets = new Set(contract?.projection_policy?.targets ?? []);
  for (const target of ['student_roster', 'heartbeat', 'encharge', 'plutio']) {
    add(
      targets.has(target),
      `projection target ${target} is required`,
      findings,
    );
  }

  add(
    contract?.authority?.canonical_process_owner === 'Company OS',
    'Company OS must remain canonical process owner',
    findings,
  );
  add(
    contract?.authority?.entitlement_catalog ===
      'facts/catalogs/student-entitlements-v1.json',
    'entitlement catalog binding is invalid',
    findings,
  );
  const nonMasters = new Set(
    contract?.authority?.projections_not_masters ?? [],
  );
  for (const target of [
    'Student Roster',
    'Heartbeat',
    'Encharge',
    'Plutio student projects',
  ]) {
    add(
      nonMasters.has(target),
      `${target} must remain a projection, not a master`,
      findings,
    );
  }
  for (const fact of [
    'payment',
    'participant',
    'course_access',
    'schedule',
    'learning_progress',
    'communication',
  ]) {
    add(
      Array.isArray(contract?.authority?.native_fact_owners?.[fact]) &&
        contract.authority.native_fact_owners[fact].length > 0,
      `native fact authority missing for ${fact}`,
      findings,
    );
  }

  const forbidden = new Set(contract?.phase_boundary?.forbidden ?? []);
  for (const boundary of [
    'historical student inspection',
    'reconciliation',
    'backfill',
    'provider write',
    'database migration',
    'runtime change',
    'deployment',
    'student communication',
  ]) {
    add(
      forbidden.has(boundary),
      `phase boundary must forbid ${boundary}`,
      findings,
    );
  }
  add(
    contract?.privacy_and_audit?.append_only_evidence_and_transition_history ===
      true,
    'evidence and transition history must be append-only',
    findings,
  );
  add(
    contract?.privacy_and_audit?.named_actor_for_manual_decisions === true,
    'manual decisions require a named actor',
    findings,
  );
  for (const flag of [
    'store_source_references_not_raw_financial_documents',
    'raw_participant_uploads_short_lived',
    'content_minimized_operational_views',
    'retention_policy_requires_owner_acceptance_before_build',
  ]) {
    add(
      contract?.privacy_and_audit?.[flag] === true,
      `privacy invariant ${flag} must be true`,
      findings,
    );
  }

  for (const scenario of contract?.synthetic_scenarios ?? []) {
    add(
      channelSet.has(scenario.channel),
      `scenario ${scenario.key}: unknown channel ${scenario.channel}`,
      findings,
    );
    add(
      Number.isInteger(scenario.seats) && scenario.seats > 0,
      `scenario ${scenario.key}: seats must be positive`,
      findings,
    );
  }
  const expectedScenarios = new Map([
    ['self_pay_full', 'materializable'],
    ['separate_payer_one_student', 'materializable'],
    ['sponsor_nine_named_students', 'materializable'],
    ['sponsor_nine_only_four_named', 'partially_materializable'],
    ['check_without_participant', 'held_needs_participant'],
    ['scholarship_no_payment', 'materializable_without_payment'],
    [
      'module_only_future_module',
      'no_future_payment_obligation_without_agreement',
    ],
    ['duplicate_manual_capture', 'deduplicated_by_source_key'],
    ['participant_transfer', 'append_only_transfer'],
    ['refund_or_dispute', 'held_for_policy_not_silent_revoke'],
  ]);
  const scenarioMap = new Map(
    (contract?.synthetic_scenarios ?? []).map((entry) => [entry.key, entry]),
  );
  for (const [key, expected] of expectedScenarios) {
    add(
      scenarioMap.get(key)?.expected === expected,
      `scenario ${key} must expect ${expected}`,
      findings,
    );
  }

  const laterGates = new Set(contract?.later_gates ?? []);
  for (const gate of [
    'schema_and_dark_runtime_implementation',
    'read_only_reconciliation',
    'operator_pilot',
    'provider_projection_writes',
    'bounded_historical_backfill',
    'deployment',
    'student_communication',
  ]) {
    add(laterGates.has(gate), `later gate ${gate} is required`, findings);
  }

  return {
    ok: findings.length === 0,
    findings,
    summary: {
      entities: contract?.entities?.length ?? 0,
      channels: contract?.source_channels?.length ?? 0,
      commands: contract?.commands?.length ?? 0,
      exceptions: contract?.exception_codes?.length ?? 0,
      scenarios: contract?.synthetic_scenarios?.length ?? 0,
    },
  };
}

export function loadAndValidateStudentEnrollmentFoundation(
  contractPath = defaultContractPath,
  schemaPath = defaultSchemaPath,
) {
  JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  return validateStudentEnrollmentFoundation(
    JSON.parse(fs.readFileSync(contractPath, 'utf8')),
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = loadAndValidateStudentEnrollmentFoundation(
    process.argv[2],
    process.argv[3],
  );
  if (!result.ok) {
    for (const finding of result.findings) console.error(`ERROR: ${finding}`);
    process.exit(1);
  }
  console.log(
    `VALID: ${result.summary.entities} entities, ${result.summary.channels} channels, ${result.summary.commands} commands, ${result.summary.exceptions} exceptions, ${result.summary.scenarios} synthetic scenarios`,
  );
}
