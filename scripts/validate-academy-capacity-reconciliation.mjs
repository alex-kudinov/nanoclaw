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
export const defaultResolutionPath = path.join(
  ROOT,
  'docs/programs/company-os/evidence/NC-20260906-001-academy-capacity-source-resolution.json',
);
export const defaultResolutionSchemaPath = path.join(
  ROOT,
  'facts/catalogs/academy-capacity-source-resolution-v1.schema.json',
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
      ownerAcc.approved_capacity === 12 &&
      ownerAcc.capacity_source === 'owner-confirmed-2026-09-06' &&
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
    pool.capacity === 12 &&
      pool.availability === 0 &&
      pool.over_capacity === 9 &&
      pool.upper_boundary_over_capacity === 10 &&
      pool.public_state === 'sold_out',
    'confirmed ACC capacity and overage arithmetic are incorrect',
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

export function validateAcademyCapacitySourceResolution(resolution) {
  const findings = [];
  add(
    resolution?.schema_version === '1.0' &&
      resolution?.resolution_id ===
        'academy-capacity-source-resolution-2026-09-06' &&
      resolution?.task_id === 'NC-20260906-001',
    'source-resolution identity is incomplete',
    findings,
  );
  add(
    resolution?.resolves?.report_id ===
      'academy-capacity-readonly-reconciliation-2026-09-05' &&
      resolution?.resolves?.correction_id ===
        'academy-capacity-sales-reconstruction-2026-09-05' &&
      resolution?.resolves?.prevention_commit === '3b03332f',
    'source-resolution lineage is incomplete',
    findings,
  );
  add(
    resolution?.privacy?.classification === 'aggregate_hash_only' &&
      resolution?.privacy?.exact_identity_transient_only === true &&
      resolution?.privacy?.persisted_content ===
        'aggregate_counts_hashes_dispositions_and_receipts',
    'source-resolution privacy boundary is incomplete',
    findings,
  );
  validatePrivacy(resolution, findings);

  const ownerMcs = resolution?.owner_decisions?.mcs_deferral ?? {};
  add(
    ownerMcs.origin === '2026-09-25-friday' &&
      ownerMcs.origin_confidence === 'owner_confirmed_final' &&
      ownerMcs.destination === '2027-01-07-thursday' &&
      ownerMcs.destination_disposition ===
        'settled_no_further_confirmation_required',
    'settled MCS transfer must not remain probabilistic',
    findings,
  );
  const roster = resolution?.source_readback?.student_roster ?? {};
  add(
    roster?.owner_named_deferral?.matches === 1 &&
      roster?.owner_named_deferral?.destination === 'January 2027 – Thursday' &&
      SHA256.test(roster?.owner_named_deferral?.row_sha256 ?? ''),
    'settled MCS roster destination readback is incomplete',
    findings,
  );
  const heartbeat = resolution?.source_readback?.heartbeat ?? {};
  add(
    heartbeat?.capacity_authority === false &&
      heartbeat?.mcs_september?.owner_named_deferral_present === false &&
      heartbeat?.owner_named_deferral?.user_retained === true &&
      heartbeat?.owner_named_deferral?.base_mcs_access_retained === true &&
      heartbeat?.owner_named_deferral
        ?.september_membership_removed_and_verified === true,
    'settled MCS Heartbeat projection readback is incomplete',
    findings,
  );
  const tandemweb = resolution?.source_readback?.tandemweb ?? {};
  add(
    tandemweb?.prevention_commit === '4bb852bb3' &&
      tandemweb?.source_resolution_commit === '7872a3a9b' &&
      tandemweb?.mcs_transfer_origin === '2026-09-25' &&
      tandemweb?.mcs_transfer_destination === '2027-01-07' &&
      typeof tandemweb?.paired_adjustment_source_ref === 'string' &&
      tandemweb.paired_adjustment_source_ref.length > 0,
    'Tandemweb transfer pair does not match the settled owner decision',
    findings,
  );
  const mcsReconciliation = tandemweb?.reconciliation ?? {};
  add(
    mcsReconciliation?.september_thursday?.roster_active === 5 &&
      mcsReconciliation?.september_thursday?.stripe_floor === 6 &&
      mcsReconciliation?.september_thursday?.occupied === 6 &&
      mcsReconciliation?.september_thursday?.status === 'needs_review' &&
      mcsReconciliation?.september_thursday?.public_state === 'open' &&
      mcsReconciliation?.september_friday?.roster_active === 13 &&
      mcsReconciliation?.september_friday?.stripe_floor === 10 &&
      mcsReconciliation?.september_friday?.transfer_adjustment === -1 &&
      mcsReconciliation?.september_friday?.occupied === 13 &&
      mcsReconciliation?.september_friday?.status === 'needs_review' &&
      mcsReconciliation?.september_friday?.public_state === 'sold_out' &&
      mcsReconciliation?.january_thursday?.roster_active === 1 &&
      mcsReconciliation?.january_thursday?.transfer_adjustment === 1 &&
      mcsReconciliation?.january_thursday?.occupied === 1 &&
      mcsReconciliation?.january_thursday?.status === 'matched' &&
      mcsReconciliation?.january_thursday?.public_state === 'open',
    'MCS post-transfer source reconciliation changed unexpectedly',
    findings,
  );

  const acc = roster?.acc_september ?? {};
  add(
    acc.active_rows === 21 &&
      acc.module_1_routes === 10 &&
      acc.full_program_routes === 11 &&
      acc.unlabeled_post_boundary_rows === 0 &&
      acc.module_1_routes + acc.full_program_routes === acc.active_rows,
    'ACC roster source repair does not balance to 21 explicit assignments',
    findings,
  );
  add(
    roster?.prior_june_boundary?.active_rows === 1 &&
      SHA256.test(roster?.prior_june_boundary?.rowset_sha256 ?? ''),
    'May 27 boundary is not durably assigned to the prior cohort',
    findings,
  );
  const capacity = resolution?.capacity ?? {};
  add(
    capacity.delivery_block_key === 'acc.module-1:2026-09-07' &&
      capacity.capacity === 12 &&
      capacity.occupied === 21 &&
      capacity.available === 0 &&
      capacity.over_capacity === 9 &&
      capacity.public_state === 'sold_out',
    'resolved ACC capacity arithmetic is incorrect',
    findings,
  );

  const offer = resolution?.offer_and_funding ?? {};
  const routes = offer.assignment_routes ?? {};
  const paid = offer.exact_paid_seats ?? {};
  const paidTotal =
    (paid['acc-module-1'] ?? 0) +
    (paid['acc-full'] ?? 0) +
    (paid['acc-pcc-full'] ?? 0);
  add(
    routes.module_1 === 10 &&
      routes.full_program === 11 &&
      routes.module_1 + routes.full_program === capacity.occupied,
    'resolved ACC assignment routes do not balance',
    findings,
  );
  add(
    paid['acc-module-1'] === 9 &&
      paid['acc-full'] === 11 &&
      paid['acc-pcc-full'] === 0 &&
      offer.assignment_without_exact_matching_live_offer === 1 &&
      paidTotal + offer.assignment_without_exact_matching_live_offer ===
        capacity.occupied &&
      offer.refunded_assignments === 0 &&
      offer.professional_projection_required === 0,
    'resolved ACC offer and funding counts do not balance',
    findings,
  );
  const log = resolution?.source_readback?.payment_log ?? {};
  add(
    log.seat_binding_rows === 17 &&
      log.unique_participants === 16 &&
      log.by_exact_offer?.['acc-module-1'] === 9 &&
      log.by_exact_offer?.['acc-full'] === 7 &&
      log.by_exact_offer?.['acc-pcc-full'] === 0 &&
      log.product_cells_updated_and_verified === 2,
    'Payment Log source repair coverage changed unexpectedly',
    findings,
  );
  const plutio = resolution?.source_readback?.plutio ?? {};
  add(
    plutio.read_only === true &&
      plutio.paid_invoice_receipts === 3 &&
      plutio.paid_participant_seats === 4 &&
      plutio.by_exact_offer?.['acc-full'] === 4 &&
      plutio.by_exact_offer?.['acc-pcc-full'] === 0,
    'Plutio invoice binding does not balance the four manual ACC Full seats',
    findings,
  );
  add(
    log.by_exact_offer['acc-full'] + plutio.by_exact_offer['acc-full'] ===
      paid['acc-full'],
    'ACC Full payment sources do not balance to 11 seats',
    findings,
  );
  add(
    heartbeat?.acc_full?.candidate_exact_email_matches === 10 &&
      heartbeat?.acc_full?.candidate_exact_name_company_alias_matches === 1 &&
      heartbeat?.acc_full?.candidate_total_matches === 11 &&
      heartbeat?.professional_coach?.candidate_matches === 0,
    'Heartbeat offer projection readback does not match resolved offers',
    findings,
  );

  const mutation = roster?.mutation_receipt ?? {};
  const boundary = resolution?.boundary ?? {};
  add(
    mutation.requested_updates === 13 &&
      mutation.updated_and_verified === 11 &&
      mutation.precondition_conflicts_already_desired === 2 &&
      mutation.updated_and_verified +
        mutation.precondition_conflicts_already_desired ===
        mutation.requested_updates,
    'Student Roster mutation/readback receipt does not balance',
    findings,
  );
  add(
    boundary.source_mutations === 14 &&
      boundary.student_roster_mutations === 11 &&
      boundary.payment_log_mutations === 2 &&
      boundary.heartbeat_membership_mutations === 1 &&
      boundary.student_roster_mutations +
        boundary.payment_log_mutations +
        boundary.heartbeat_membership_mutations ===
        boundary.source_mutations &&
      boundary.plutio_mutations === 0 &&
      boundary.refund_mutations === 0 &&
      boundary.communications === 0 &&
      boundary.public_website_deployments === 0 &&
      boundary.production_database_mutations === 0 &&
      boundary.runtime_or_minion_activations === 0 &&
      boundary.authority_cutovers === 0,
    'source-resolution side-effect boundary is incomplete',
    findings,
  );

  const expectedResolved = new Set([
    'exception:mcs-deferral-origin-probable-friday',
    'exception:acc-september-may-27-boundary',
    'exception:acc-september-full-offer-split-unresolved',
    'exception:acc-professional-projections-missing',
    'exception:acc-september-funding-classification-incomplete',
  ]);
  const resolved = resolution?.resolved_exceptions ?? [];
  add(
    resolved.length === expectedResolved.size &&
      unique(resolved.map((entry) => entry?.exception_id)) &&
      resolved.every(
        (entry) =>
          expectedResolved.has(entry?.exception_id) &&
          typeof entry?.disposition === 'string' &&
          entry.disposition.length > 0,
      ),
    'source-resolution exception dispositions are incomplete',
    findings,
  );
  const remaining = resolution?.remaining_exceptions ?? [];
  add(
    unique(remaining.map((entry) => entry?.exception_id)) &&
      remaining.every(
        (entry) =>
          KEY.test(entry?.exception_id ?? '') &&
          typeof entry?.facts === 'string' &&
          entry.facts.length > 0 &&
          typeof entry?.owner === 'string' &&
          entry.owner.length > 0 &&
          typeof entry?.next_evidence === 'string' &&
          entry.next_evidence.length > 0,
      ),
    'remaining source exceptions must stay explicit and owned',
    findings,
  );
  add(
    !remaining.some((entry) =>
      String(entry?.exception_id ?? '').includes('mcs-deferral'),
    ),
    'settled MCS deferral must not remain an exception',
    findings,
  );
  for (const digest of [
    acc.rowset_sha256,
    roster?.prior_june_boundary?.rowset_sha256,
    roster?.owner_named_deferral?.row_sha256,
    log.seat_binding_rows_sha256,
    plutio.receipt_sha256,
    heartbeat?.mcs_september?.member_sha256,
    heartbeat?.acc_full?.member_sha256,
  ])
    add(
      SHA256.test(digest ?? ''),
      'source-resolution receipt hash is invalid',
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
  const resolution = JSON.parse(fs.readFileSync(defaultResolutionPath, 'utf8'));
  const resolutionSchema = JSON.parse(
    fs.readFileSync(defaultResolutionSchemaPath, 'utf8'),
  );
  const findings = process.argv[2]
    ? ['custom report paths are not supported by this bounded validator']
    : [
        ...validateJsonSchemaDocument(reportSchema, report),
        ...validateAcademyCapacityReconciliation(report),
        ...validateJsonSchemaDocument(correctionSchema, correction),
        ...validateAcademyCapacitySalesReconstruction(correction),
        ...validateJsonSchemaDocument(resolutionSchema, resolution),
        ...validateAcademyCapacitySourceResolution(resolution),
      ];
  if (findings.length) {
    for (const finding of findings) process.stderr.write(`ERROR: ${finding}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(
    `${JSON.stringify({ ok: true, reports: 3, deliveryBlocks: report.delivery_blocks.length, baseExceptions: report.exceptions.length, correctionSeats: correction.shared_pool.operational_unique_seats, correctionExceptions: correction.exceptions.length, resolvedExceptions: resolution.resolved_exceptions.length, remainingExceptions: resolution.remaining_exceptions.length, privacy: resolution.privacy.classification })}\n`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
)
  main();
