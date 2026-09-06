import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  defaultReportPath,
  defaultSchemaPath,
  defaultCorrectionPath,
  defaultCorrectionSchemaPath,
  validateAcademyCapacityReconciliation,
  validateAcademyCapacitySalesReconstruction,
  validateJsonSchemaDocument,
} from '../scripts/validate-academy-capacity-reconciliation.mjs';

const report = JSON.parse(fs.readFileSync(defaultReportPath, 'utf8'));
const correction = JSON.parse(fs.readFileSync(defaultCorrectionPath, 'utf8'));
const copy = () => structuredClone(report);
const correctionCopy = () => structuredClone(correction);

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
