#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const defaultReportPath = path.join(
  ROOT,
  'docs/programs/company-os/evidence/NC-20260905-008-academy-capacity-readonly-reconciliation.json',
);
export const defaultSchemaPath = path.join(
  ROOT,
  'facts/catalogs/academy-capacity-reconciliation-evidence-v1.schema.json',
);
export const defaultCorrectionPath = path.join(
  ROOT,
  'docs/programs/company-os/evidence/NC-20260905-009-academy-capacity-sales-reconstruction.json',
);
export const defaultCorrectionSchemaPath = path.join(
  ROOT,
  'facts/catalogs/academy-capacity-reconciliation-correction-v1.schema.json',
);
const KEY = /^[a-z0-9][a-z0-9._:-]+$/;
const SHA256 = /^[a-f0-9]{64}$/;
const REQUIRED_BLOCKS = new Set([
  'mcs-practicum:2026-09-24',
  'mcs-practicum:2026-09-25',
  'mcs-practicum:2027-01-07',
  'mcs-practicum:2027-01-08',
  'acc.module-1:2026-09-07',
]);
const FUNDING_COVERAGE_EXCEPTIONS = new Map([
  [
    'mcs-practicum:2026-09-25',
    'exception:mcs-friday-funding-source-coverage-incomplete',
  ],
  [
    'acc.module-1:2026-09-07',
    'exception:acc-funding-source-coverage-incomplete',
  ],
]);

function add(condition, message, findings) {
  if (!condition) findings.push(message);
}

function unique(values) {
  return new Set(values).size === values.length;
}

function schemaTypeMatches(type, value) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object')
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'number')
    return typeof value === 'number' && Number.isFinite(value);
  return typeof value === type;
}

function walkJsonSchema(schema, value, location, findings) {
  if (Object.hasOwn(schema ?? {}, 'const'))
    add(
      Object.is(value, schema.const),
      `${location}: must equal schema const`,
      findings,
    );
  if (schema?.type)
    add(
      schemaTypeMatches(schema.type, value),
      `${location}: must be ${schema.type}`,
      findings,
    );
  if (typeof value === 'string') {
    if (schema?.pattern)
      add(
        new RegExp(schema.pattern).test(value),
        `${location}: does not match schema pattern`,
        findings,
      );
    if (schema?.format === 'date-time')
      add(
        !Number.isNaN(Date.parse(value)) && value.includes('T'),
        `${location}: must be a date-time`,
        findings,
      );
    if (schema?.format === 'date')
      add(
        /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)),
        `${location}: must be a date`,
        findings,
      );
  }
  if (Array.isArray(value)) {
    if (schema?.minItems !== undefined)
      add(
        value.length >= schema.minItems,
        `${location}: must contain at least ${schema.minItems} items`,
        findings,
      );
    if (schema?.items)
      value.forEach((entry, index) =>
        walkJsonSchema(schema.items, entry, `${location}[${index}]`, findings),
      );
  }
  if (schemaTypeMatches('object', value)) {
    for (const required of schema?.required ?? [])
      add(
        Object.hasOwn(value, required),
        `${location}.${required}: is required`,
        findings,
      );
    const properties = schema?.properties ?? {};
    for (const [key, childSchema] of Object.entries(properties))
      if (Object.hasOwn(value, key))
        walkJsonSchema(childSchema, value[key], `${location}.${key}`, findings);
    if (schema?.additionalProperties === false)
      for (const key of Object.keys(value))
        add(
          Object.hasOwn(properties, key),
          `${location}.${key}: additional property is forbidden`,
          findings,
        );
  }
}

export function validateJsonSchemaDocument(schema, value) {
  const findings = [];
  walkJsonSchema(schema, value, '$', findings);
  return findings;
}

function block(report, key) {
  return (report?.delivery_blocks ?? []).find(
    (entry) => entry?.delivery_block_key === key,
  );
}

function validatePrivacy(report, findings) {
  const serialized = JSON.stringify(report);
  add(
    !/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(serialized),
    'report must not persist email addresses',
    findings,
  );
  add(
    !/\b(?:pi|ch|cus)_[A-Za-z0-9]+\b/.test(serialized),
    'report must not persist raw Stripe identifiers',
    findings,
  );
  for (const forbidden of [
    'student_name',
    'student_email',
    'payer_name',
    'payer_email',
    'payment_intent_id',
    'charge_id',
    'customer_id',
  ]) {
    add(
      !Object.hasOwn(report ?? {}, forbidden) &&
        !serialized.includes(`"${forbidden}"`),
      `report contains forbidden field ${forbidden}`,
      findings,
    );
  }
}

function validateBlock(entry, exceptionIds, findings) {
  const key = entry?.delivery_block_key ?? '(missing)';
  add(KEY.test(key), `invalid delivery block key ${key}`, findings);
  add(
    typeof entry?.starts_on === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(entry.starts_on),
    `${key}: starts_on must be a date`,
    findings,
  );
  add(
    Array.isArray(entry?.offers) &&
      entry.offers.length > 0 &&
      unique(entry.offers),
    `${key}: offers must be a nonempty unique list`,
    findings,
  );
  const roster = entry?.roster ?? {};
  for (const value of [roster.rows, roster.refunded, roster.active])
    add(
      Number.isInteger(value) && value >= 0,
      `${key}: roster counts must be nonnegative integers`,
      findings,
    );
  add(
    roster.active === roster.rows - roster.refunded,
    `${key}: active roster arithmetic does not balance`,
    findings,
  );
  const blockExceptionIds = Array.isArray(entry?.exception_ids)
    ? entry.exception_ids
    : [];
  add(
    Array.isArray(entry?.exception_ids) && unique(blockExceptionIds),
    `${key}: exception_ids must be a unique list`,
    findings,
  );
  for (const exceptionId of blockExceptionIds)
    add(
      exceptionIds.has(exceptionId),
      `${key}: unknown exception ${exceptionId}`,
      findings,
    );
  if ((entry?.payments?.funding_unresolved_or_non_stripe ?? 0) > 0)
    add(
      blockExceptionIds.includes(FUNDING_COVERAGE_EXCEPTIONS.get(key)),
      `${key}: unresolved funding requires an owned coverage exception`,
      findings,
    );

  if (entry?.capacity === null) {
    add(
      entry?.computed?.available === null &&
        entry?.computed?.over_capacity === null,
      `${key}: unknown capacity cannot claim availability`,
      findings,
    );
    add(
      entry?.public_state === 'sold_out' &&
        entry?.state_basis === 'owner_override_fail_closed',
      `${key}: unknown capacity must remain fail-closed`,
      findings,
    );
    return;
  }

  add(
    Number.isInteger(entry?.capacity) && entry.capacity > 0,
    `${key}: capacity must be positive`,
    findings,
  );
  const occupied = entry?.computed?.occupied;
  add(
    Number.isInteger(occupied) && occupied >= roster.active,
    `${key}: occupied cannot be lower than active roster assignments`,
    findings,
  );
  add(
    entry?.computed?.available === Math.max(0, entry.capacity - occupied),
    `${key}: available-seat arithmetic is incorrect`,
    findings,
  );
  add(
    entry?.computed?.over_capacity === Math.max(0, occupied - entry.capacity),
    `${key}: over-capacity arithmetic is incorrect`,
    findings,
  );
  if (entry?.public_state === 'open')
    add(
      entry.computed.available > 0,
      `${key}: open block must have availability`,
      findings,
    );
}

export function validateAcademyCapacityReconciliation(report) {
  const findings = [];
  add(report?.schema_version === '1.0', 'schema_version must be 1.0', findings);
  add(
    report?.report_id === 'academy-capacity-readonly-reconciliation-2026-09-05',
    'unexpected report_id',
    findings,
  );
  add(report?.task_id === 'NC-20260905-008', 'unexpected task_id', findings);
  add(
    typeof report?.observed_at === 'string' &&
      !Number.isNaN(Date.parse(report.observed_at)),
    'observed_at must be a date-time',
    findings,
  );
  add(
    report?.source_window?.from === '2026-01-01' &&
      report?.source_window?.through === '2026-09-05',
    'source window must match the authorized decision',
    findings,
  );
  add(
    report?.privacy?.classification === 'aggregate_hash_only' &&
      report?.privacy?.exact_identity_transient_only === true &&
      report?.privacy?.persisted_content ===
        'aggregate_counts_hashes_and_exceptions',
    'privacy boundary is incomplete',
    findings,
  );
  validatePrivacy(report, findings);

  const authorityFacts = (report?.authority ?? []).map((entry) => entry?.fact);
  for (const required of [
    'class_assignment',
    'payment_and_refund',
    'schedule',
    'public_state',
    'course_access',
  ])
    add(
      authorityFacts.includes(required),
      `missing authority ${required}`,
      findings,
    );
  add(unique(authorityFacts), 'authority facts must be unique', findings);

  const exceptions = report?.exceptions ?? [];
  const exceptionIds = new Set(
    exceptions.map((entry) => entry?.exception_id).filter(Boolean),
  );
  add(
    exceptionIds.size === exceptions.length,
    'exception IDs must be unique',
    findings,
  );
  for (const entry of exceptions) {
    add(KEY.test(entry?.exception_id ?? ''), 'invalid exception ID', findings);
    add(
      typeof entry?.owner === 'string' && entry.owner.length > 0,
      `${entry?.exception_id}: owner is required`,
      findings,
    );
    add(
      typeof entry?.next_evidence === 'string' &&
        entry.next_evidence.length > 0,
      `${entry?.exception_id}: next evidence is required`,
      findings,
    );
  }

  const blockKeys = (report?.delivery_blocks ?? []).map(
    (entry) => entry?.delivery_block_key,
  );
  add(unique(blockKeys), 'delivery block keys must be unique', findings);
  add(
    blockKeys.length === REQUIRED_BLOCKS.size &&
      blockKeys.every((key) => REQUIRED_BLOCKS.has(key)),
    'delivery block population differs from authorization',
    findings,
  );
  for (const entry of report?.delivery_blocks ?? [])
    validateBlock(entry, exceptionIds, findings);

  const friday = block(report, 'mcs-practicum:2026-09-25');
  add(
    friday?.capacity === 12 &&
      friday?.roster?.active === 13 &&
      friday?.computed?.occupied === 13 &&
      friday?.computed?.over_capacity === 1 &&
      friday?.public_state === 'sold_out',
    'MCS Friday must preserve the 13-row fail-closed variance',
    findings,
  );
  add(
    friday?.owner_hypothesis?.active === 12 &&
      friday?.owner_hypothesis?.variance_from_roster === 1,
    'MCS Friday owner hypothesis must remain separate from roster authority',
    findings,
  );

  const thursday = block(report, 'mcs-practicum:2026-09-24');
  add(
    thursday?.roster?.active === 5 &&
      thursday?.computed?.available === 7 &&
      thursday?.public_state === 'open',
    'MCS Thursday must remain open at 5 of 12',
    findings,
  );
  const janThursday = block(report, 'mcs-practicum:2027-01-07');
  const janFriday = block(report, 'mcs-practicum:2027-01-08');
  add(
    report?.sources?.student_roster?.mcs?.owner_named_deferral_matches === 1 &&
      SHA256.test(
        report?.sources?.student_roster?.mcs?.owner_named_deferral_row_sha256 ??
          '',
      ) &&
      janThursday?.roster?.active === 1 &&
      janFriday?.roster?.active === 0,
    'MCS deferral destination evidence is incomplete',
    findings,
  );

  const acc = block(report, 'acc.module-1:2026-09-07');
  add(
    JSON.stringify([...(acc?.offers ?? [])].sort()) ===
      JSON.stringify(['acc-full', 'acc-module-1', 'acc-pcc-full']),
    'ACC September shared-offer mapping is incomplete',
    findings,
  );
  add(
    acc?.capacity === null &&
      acc?.roster?.active === 8 &&
      acc?.roster?.module_1_only === 2 &&
      acc?.roster?.full_program_offer_collapsed === 6 &&
      acc?.payments?.successful === 2,
    'ACC September roster/payment evidence changed unexpectedly',
    findings,
  );
  add(
    report?.sources?.heartbeat?.capacity_authority === false,
    'Heartbeat must not be treated as capacity authority',
    findings,
  );
  for (const digest of [
    report?.sources?.student_roster?.mcs?.relevant_rowset_sha256,
    report?.sources?.student_roster?.acc?.relevant_rowset_sha256,
    ...Object.values(report?.sources?.heartbeat?.groups ?? {}).map(
      (entry) => entry?.sha256,
    ),
  ])
    add(SHA256.test(digest ?? ''), 'source receipt hash is invalid', findings);

  add(
    report?.boundary?.external_reads_only === true &&
      Array.isArray(report?.boundary?.forbidden_actions) &&
      report.boundary.forbidden_actions.length >= 8,
    'read-only boundary is incomplete',
    findings,
  );
  return findings;
}

export function validateAcademyCapacitySalesReconstruction(correction) {
  const findings = [];
  add(
    correction?.schema_version === '1.0',
    'correction schema_version must be 1.0',
    findings,
  );
  add(
    correction?.correction_id ===
      'academy-capacity-sales-reconstruction-2026-09-05',
    'unexpected correction_id',
    findings,
  );
  add(
    correction?.task_id === 'NC-20260905-009',
    'unexpected correction task_id',
    findings,
  );
  add(
    correction?.corrects?.report_id ===
      'academy-capacity-readonly-reconciliation-2026-09-05' &&
      correction?.corrects?.task_id === 'NC-20260905-008' &&
      correction?.corrects?.commit === 'c0779fcb',
    'correction lineage is incomplete',
    findings,
  );
  add(
    correction?.privacy?.classification === 'aggregate_hash_only' &&
      correction?.privacy?.exact_identity_transient_only === true &&
      correction?.privacy?.persisted_content ===
        'aggregate_counts_hashes_corrections_and_exceptions',
    'correction privacy boundary is incomplete',
    findings,
  );
  validatePrivacy(correction, findings);

  const ownerAcc = correction?.owner_corrections?.acc_september_7 ?? {};
  add(
    ownerAcc.expected_unique_seats === 21 &&
      JSON.stringify([...(ownerAcc.included_offers ?? [])].sort()) ===
        JSON.stringify(['acc-full', 'acc-module-1', 'acc-pcc-full']),
    'owner ACC shared-pool correction is incomplete',
    findings,
  );
  add(
    ownerAcc.professional_projection_rule ===
      'one_participant_one_shared_acc_seat_even_when_projected_to_acc_pcc_actc',
    'Professional Coach projection must not double-count capacity',
    findings,
  );
  const ownerMcs = correction?.owner_corrections?.mcs_deferral ?? {};
  add(
    ownerMcs.origin === '2026-09-25-friday_probable' &&
      ownerMcs.origin_confidence === 'owner_recollection_not_confirmed' &&
      ownerMcs.current_destination === '2027-01-07-thursday' &&
      ownerMcs.destination_disposition ===
        'accepted_in_january_no_further_move' &&
      ownerMcs.current_friday_roster_excludes_deferral_subject === true,
    'MCS Friday-to-January owner correction is incomplete',
    findings,
  );

  const sourceBoundary = correction?.source_boundary ?? {};
  add(
    sourceBoundary.explicit_september_rows === 8 &&
      sourceBoundary.unlabeled_rows_from_operational_boundary === 13 &&
      sourceBoundary.operational_total === 21 &&
      sourceBoundary.operational_total ===
        sourceBoundary.explicit_september_rows +
          sourceBoundary.unlabeled_rows_from_operational_boundary,
    'operational 21-seat boundary does not balance',
    findings,
  );
  add(
    sourceBoundary.unlabeled_rows_from_first_candidate === 14 &&
      sourceBoundary.upper_boundary_total === 22 &&
      sourceBoundary.upper_boundary_total ===
        sourceBoundary.explicit_september_rows +
          sourceBoundary.unlabeled_rows_from_first_candidate,
    '21-versus-22 upper boundary does not balance',
    findings,
  );
  add(
    sourceBoundary.operational_september_boundary_date === '2026-06-03' &&
      sourceBoundary.first_unlabeled_post_cohort_candidate_date ===
        '2026-05-27',
    'source boundary dates changed unexpectedly',
    findings,
  );

  const pool = correction?.shared_pool ?? {};
  add(
    pool.delivery_block_key === 'acc.module-1:2026-09-07' &&
      pool.operational_unique_seats === 21 &&
      pool.explicit_cohort_seats === 8 &&
      pool.unlabeled_operational_seats === 13 &&
      pool.by_roster_route?.module_1 === 10 &&
      pool.by_roster_route?.full_program_collapsed === 11 &&
      pool.by_roster_route.module_1 +
        pool.by_roster_route.full_program_collapsed ===
        pool.operational_unique_seats,
    'shared-pool unique-seat calculation is incorrect',
    findings,
  );
  add(
    pool.unique_participant_rule ===
      'normalized_participant_email_once_across_all_roster_tabs_and_offers',
    'shared pool lacks a unique-participant rule',
    findings,
  );
  add(
    pool.capacity === null &&
      pool.availability === null &&
      pool.over_capacity === null &&
      pool.public_state === 'sold_out',
    'unknown ACC capacity must remain sold out without invented availability',
    findings,
  );

  const log = correction?.source_coverage?.payment_log ?? {};
  const exactOffers = log.by_exact_offer ?? {};
  const exactOfferTotal =
    (exactOffers['acc-module-1'] ?? 0) +
    (exactOffers['acc-full'] ?? 0) +
    (exactOffers['acc-pcc-full'] ?? 0);
  add(
    log.candidate_emails_with_any_rows === 21 &&
      log.exact_product_map_unique_participants === 13 &&
      exactOfferTotal === 13 &&
      log.without_exact_product_map_offer === 8 &&
      log.exact_product_map_unique_participants +
        log.without_exact_product_map_offer ===
        pool.operational_unique_seats,
    'Payment Log offer coverage does not balance to 21 unique seats',
    findings,
  );
  add(
    exactOffers['acc-module-1'] === 8 &&
      exactOffers['acc-full'] === 5 &&
      exactOffers['acc-pcc-full'] === 0,
    'Payment Log exact-offer split changed unexpectedly',
    findings,
  );
  add(
    correction?.source_coverage?.stripe?.capacity_authority === false,
    'Stripe must not become capacity authority',
    findings,
  );
  add(
    correction?.source_coverage?.plutio_and_email
      ?.counted_without_exact_binding === 0,
    'Plutio or email evidence cannot count without participant binding',
    findings,
  );

  const projection = correction?.projection_coverage ?? {};
  add(
    projection.pcc_roster_candidate_intersection === 0 &&
      projection.actc_roster_candidate_intersection === 0 &&
      projection.professional_heartbeat_group_candidate_intersection === 0 &&
      projection.professional_offer_count === null,
    'missing Professional Coach projections must remain unresolved',
    findings,
  );

  const expectedExceptions = new Set([
    'exception:acc-september-may-27-boundary',
    'exception:acc-september-capacity-unknown',
    'exception:acc-september-full-offer-split-unresolved',
    'exception:acc-professional-projections-missing',
    'exception:acc-september-funding-classification-incomplete',
    'exception:mcs-deferral-origin-probable-friday',
  ]);
  const exceptions = correction?.exceptions ?? [];
  const exceptionIds = exceptions.map((entry) => entry?.exception_id);
  add(
    exceptionIds.length === expectedExceptions.size &&
      unique(exceptionIds) &&
      exceptionIds.every((id) => expectedExceptions.has(id)),
    'correction exception set is incomplete',
    findings,
  );
  for (const exception of exceptions) {
    add(
      KEY.test(exception?.exception_id ?? '') &&
        typeof exception?.owner === 'string' &&
        exception.owner.length > 0 &&
        typeof exception?.next_evidence === 'string' &&
        exception.next_evidence.length > 0,
      `${exception?.exception_id ?? 'unknown'}: exception is not owned`,
      findings,
    );
  }
  for (const digest of [
    pool.candidate_rowset_sha256,
    pool.explicit_rowset_sha256,
    pool.unlabeled_rowset_sha256,
    log.candidate_rows_sha256,
  ])
    add(
      SHA256.test(digest ?? ''),
      'correction source hash is invalid',
      findings,
    );
  add(
    correction?.boundary?.external_reads_only === true &&
      correction?.boundary?.source_mutations === 0 &&
      correction?.boundary?.production_mutations === 0 &&
      Array.isArray(correction?.boundary?.forbidden_actions) &&
      correction.boundary.forbidden_actions.length >= 8,
    'correction read-only boundary is incomplete',
    findings,
  );
  return findings;
}

function main() {
  const report = JSON.parse(fs.readFileSync(defaultReportPath, 'utf8'));
  const reportSchema = JSON.parse(fs.readFileSync(defaultSchemaPath, 'utf8'));
  const correction = JSON.parse(fs.readFileSync(defaultCorrectionPath, 'utf8'));
  const correctionSchema = JSON.parse(
    fs.readFileSync(defaultCorrectionSchemaPath, 'utf8'),
  );
  const findings = process.argv[2]
    ? ['custom report paths are not supported by this bounded validator']
    : [
        ...validateJsonSchemaDocument(reportSchema, report),
        ...validateAcademyCapacityReconciliation(report),
        ...validateJsonSchemaDocument(correctionSchema, correction),
        ...validateAcademyCapacitySalesReconstruction(correction),
      ];
  if (findings.length) {
    for (const finding of findings) process.stderr.write(`ERROR: ${finding}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `${JSON.stringify({ ok: true, reports: 2, deliveryBlocks: report.delivery_blocks.length, baseExceptions: report.exceptions.length, correctionSeats: correction.shared_pool.operational_unique_seats, correctionExceptions: correction.exceptions.length, privacy: correction.privacy.classification })}\n`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  main();
