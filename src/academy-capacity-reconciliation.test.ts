import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  defaultReportPath,
  defaultSchemaPath,
  defaultCorrectionPath,
  defaultCorrectionSchemaPath,
  defaultResolutionPath,
  defaultResolutionSchemaPath,
  validateAcademyCapacityReconciliation,
  validateAcademyCapacitySalesReconstruction,
  validateAcademyCapacitySourceResolution,
  validateJsonSchemaDocument,
} from '../scripts/validate-academy-capacity-reconciliation.mjs';

const report = JSON.parse(fs.readFileSync(defaultReportPath, 'utf8'));
const correction = JSON.parse(fs.readFileSync(defaultCorrectionPath, 'utf8'));
const resolution = JSON.parse(fs.readFileSync(defaultResolutionPath, 'utf8'));
const copy = () => structuredClone(report);
const correctionCopy = () => structuredClone(correction);
const resolutionCopy = () => structuredClone(resolution);

describe('Academy capacity read-only reconciliation evidence', () => {
  it('validates the privacy-minimized current snapshot', () => {
    expect(validateAcademyCapacityReconciliation(report)).toEqual([]);
  });

  it('tracks the exact bounded population in the reusable schema', () => {
    const schema = JSON.parse(fs.readFileSync(defaultSchemaPath, 'utf8'));
    expect(validateJsonSchemaDocument(schema, report)).toEqual([]);
    expect(schema.properties.schema_version.const).toBe('1.0');
    expect(schema.required).toContain('delivery_blocks');
    expect(schema.required).toContain('exceptions');
    expect(report.delivery_blocks).toHaveLength(5);

    const missing = copy();
    delete missing.boundary;
    expect(validateJsonSchemaDocument(schema, missing)).toContain(
      '$.boundary: is required',
    );
  });

  it('refuses persisted PII and raw Stripe identifiers', () => {
    const withEmail = copy();
    withEmail.debug = 'student@example.com';
    expect(validateAcademyCapacityReconciliation(withEmail)).toContain(
      'report must not persist email addresses',
    );

    const withPaymentId = copy();
    withPaymentId.debug = 'pi_secretlookingidentifier';
    expect(validateAcademyCapacityReconciliation(withPaymentId)).toContain(
      'report must not persist raw Stripe identifiers',
    );
  });

  it('does not let an owner estimate undercount authoritative roster occupancy', () => {
    const changed = copy();
    const friday = changed.delivery_blocks.find(
      (entry: { delivery_block_key: string }) =>
        entry.delivery_block_key === 'mcs-practicum:2026-09-25',
    );
    friday.computed.occupied = 12;
    friday.computed.over_capacity = 0;
    expect(validateAcademyCapacityReconciliation(changed)).toContain(
      'MCS Friday must preserve the 13-row fail-closed variance',
    );
  });

  it('keeps the ACC shared start fail-closed while capacity is unknown', () => {
    const changed = copy();
    const acc = changed.delivery_blocks.find(
      (entry: { delivery_block_key: string }) =>
        entry.delivery_block_key === 'acc.module-1:2026-09-07',
    );
    acc.capacity = 8;
    acc.computed = { occupied: 8, available: 0, over_capacity: 0 };
    expect(validateAcademyCapacityReconciliation(changed)).toContain(
      'ACC September roster/payment evidence changed unexpectedly',
    );
  });

  it('requires every delivery-block exception to be durable and owned', () => {
    const changed = copy();
    changed.exceptions = changed.exceptions.filter(
      (entry: { exception_id: string }) =>
        entry.exception_id !== 'exception:mcs-deferral-origin-track-conflict',
    );
    expect(validateAcademyCapacityReconciliation(changed)).toContain(
      'mcs-practicum:2026-09-24: unknown exception exception:mcs-deferral-origin-track-conflict',
    );
  });

  it('requires an owned exception for every unresolved funding gap', () => {
    const changed = copy();
    const friday = changed.delivery_blocks.find(
      (entry: { delivery_block_key: string }) =>
        entry.delivery_block_key === 'mcs-practicum:2026-09-25',
    );
    friday.exception_ids = friday.exception_ids.filter(
      (exceptionId: string) =>
        exceptionId !==
        'exception:mcs-friday-funding-source-coverage-incomplete',
    );
    expect(validateAcademyCapacityReconciliation(changed)).toContain(
      'mcs-practicum:2026-09-25: unresolved funding requires an owned coverage exception',
    );
  });
});

describe('Academy capacity sales reconstruction correction', () => {
  it('applies the correction schema and validates the 21-seat evidence', () => {
    const schema = JSON.parse(
      fs.readFileSync(defaultCorrectionSchemaPath, 'utf8'),
    );
    expect(validateJsonSchemaDocument(schema, correction)).toEqual([]);
    expect(validateAcademyCapacitySalesReconstruction(correction)).toEqual([]);
  });

  it('counts 8 explicit plus 13 unlabeled participants once', () => {
    expect(correction.shared_pool.operational_unique_seats).toBe(21);
    expect(correction.shared_pool.by_roster_route).toEqual({
      module_1: 10,
      full_program_collapsed: 11,
    });
    expect(correction.projection_coverage).toMatchObject({
      pcc_roster_candidate_intersection: 0,
      actc_roster_candidate_intersection: 0,
      professional_heartbeat_group_candidate_intersection: 0,
    });
  });

  it('records capacity 12 and the 9-seat operational overage', () => {
    expect(correction.shared_pool).toMatchObject({
      capacity: 12,
      operational_unique_seats: 21,
      availability: 0,
      over_capacity: 9,
      upper_boundary_over_capacity: 10,
      public_state: 'sold_out',
    });
  });

  it('rejects a projection-driven capacity double count', () => {
    const changed = correctionCopy();
    changed.shared_pool.operational_unique_seats = 22;
    expect(validateAcademyCapacitySalesReconstruction(changed)).toContain(
      'shared-pool unique-seat calculation is incorrect',
    );
  });

  it('keeps the one-row 21-versus-22 boundary explicit', () => {
    const changed = correctionCopy();
    changed.source_boundary.upper_boundary_total = 21;
    expect(validateAcademyCapacitySalesReconstruction(changed)).toContain(
      '21-versus-22 upper boundary does not balance',
    );
  });

  it('does not invent a Professional Coach count from missing projections', () => {
    const changed = correctionCopy();
    changed.projection_coverage.professional_offer_count = 3;
    expect(validateAcademyCapacitySalesReconstruction(changed)).toContain(
      'missing Professional Coach projections must remain unresolved',
    );
  });

  it('requires the probable Friday origin and accepted January destination', () => {
    const changed = correctionCopy();
    changed.owner_corrections.mcs_deferral.current_destination =
      '2027-01-08-friday';
    expect(validateAcademyCapacitySalesReconstruction(changed)).toContain(
      'MCS Friday-to-January owner correction is incomplete',
    );
  });
});

describe('Academy capacity source resolution', () => {
  it('validates the privacy-minimized mutation and readback receipt', () => {
    const schema = JSON.parse(
      fs.readFileSync(defaultResolutionSchemaPath, 'utf8'),
    );
    expect(validateJsonSchemaDocument(schema, resolution)).toEqual([]);
    expect(validateAcademyCapacitySourceResolution(resolution)).toEqual([]);
  });

  it('settles the Friday-to-January transfer without reopening Rita', () => {
    expect(resolution.owner_decisions.mcs_deferral).toEqual({
      origin: '2026-09-25-friday',
      origin_confidence: 'owner_confirmed_final',
      destination: '2027-01-07-thursday',
      destination_disposition: 'settled_no_further_confirmation_required',
    });
    expect(
      resolution.source_readback.heartbeat.owner_named_deferral,
    ).toMatchObject({
      user_retained: true,
      base_mcs_access_retained: true,
      september_membership_removed_and_verified: true,
    });
    expect(
      resolution.remaining_exceptions.some((entry: { exception_id: string }) =>
        entry.exception_id.includes('mcs-deferral'),
      ),
    ).toBe(false);
  });

  it('separates assignment origin from payment source and reconciles Friday funding', () => {
    expect(resolution.source_readback.tandemweb).toMatchObject({
      mcs_assignment_origin: '2026-09-25',
      mcs_payment_source_cohort: '2026-09-24',
      mcs_transfer_destination: '2027-01-07',
      reconciliation: {
        september_thursday: {
          roster_active: 5,
          payment_transfer_adjustment: -1,
          reconciled_funding: 5,
          occupied: 5,
          status: 'matched',
          public_state: 'open',
        },
        september_friday: {
          roster_active: 13,
          manual_or_legacy_funding_adjustment: 3,
          reconciled_funding: 13,
          occupied: 13,
          status: 'needs_review',
          public_state: 'sold_out',
        },
      },
    });
    expect(
      resolution.resolved_exceptions.map(
        (entry: { exception_id: string }) => entry.exception_id,
      ),
    ).toContain('exception:mcs-friday-funding-source-coverage-incomplete');
    expect(
      resolution.remaining_exceptions.map(
        (entry: { exception_id: string }) => entry.exception_id,
      ),
    ).not.toContain('exception:mcs-friday-funding-source-coverage-incomplete');
  });

  it('balances 21 explicit assignments into exact offers and one held funding case', () => {
    expect(
      resolution.source_readback.student_roster.acc_september,
    ).toMatchObject({
      active_rows: 21,
      module_1_routes: 10,
      full_program_routes: 11,
      unlabeled_post_boundary_rows: 0,
    });
    expect(resolution.offer_and_funding.exact_paid_seats).toEqual({
      'acc-module-1': 9,
      'acc-full': 11,
      'acc-pcc-full': 0,
    });
    expect(
      resolution.offer_and_funding.assignment_without_exact_matching_live_offer,
    ).toBe(1);
    expect(resolution.capacity).toMatchObject({
      capacity: 12,
      occupied: 21,
      available: 0,
      over_capacity: 9,
      public_state: 'sold_out',
    });
  });

  it('refuses to keep the settled deferral as an active exception', () => {
    const changed = resolutionCopy();
    changed.remaining_exceptions.push({
      exception_id: 'exception:mcs-deferral-origin-probable-friday',
      facts: 'stale',
      owner: 'academy_operations',
      next_evidence: 'ask again',
    });
    expect(validateAcademyCapacitySourceResolution(changed)).toContain(
      'settled MCS deferral must not remain an exception',
    );
  });

  it('refuses resolved capacity arithmetic drift', () => {
    const changed = resolutionCopy();
    changed.capacity.occupied = 20;
    changed.capacity.over_capacity = 8;
    expect(validateAcademyCapacitySourceResolution(changed)).toEqual(
      expect.arrayContaining([
        'resolved ACC capacity arithmetic is incorrect',
        'resolved ACC assignment routes do not balance',
      ]),
    );
  });

  it('refuses missing provider readback for the settled deferral', () => {
    const changed = resolutionCopy();
    changed.source_readback.heartbeat.owner_named_deferral.september_membership_removed_and_verified = false;
    expect(validateAcademyCapacitySourceResolution(changed)).toContain(
      'settled MCS Heartbeat projection readback is incomplete',
    );
  });

  it('refuses invented Professional Coach projections or hidden mutations', () => {
    const changed = resolutionCopy();
    changed.offer_and_funding.exact_paid_seats['acc-pcc-full'] = 1;
    changed.offer_and_funding.professional_projection_required = 1;
    changed.boundary.source_mutations = 15;
    expect(validateAcademyCapacitySourceResolution(changed)).toEqual(
      expect.arrayContaining([
        'resolved ACC offer and funding counts do not balance',
        'source-resolution side-effect boundary is incomplete',
      ]),
    );
  });
});
