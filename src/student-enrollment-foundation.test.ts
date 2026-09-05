import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  defaultContractPath,
  loadAndValidateStudentEnrollmentFoundation,
  validateStudentEnrollmentFoundation,
} from '../scripts/validate-student-enrollment-foundation.mjs';

function fixture(): any {
  return JSON.parse(fs.readFileSync(defaultContractPath, 'utf8'));
}

describe('student enrollment foundation', () => {
  it('validates the complete foundation contract', () => {
    const result = loadAndValidateStudentEnrollmentFoundation();
    expect(result.findings).toEqual([]);
    expect(result.summary).toEqual({
      entities: 10,
      channels: 8,
      commands: 11,
      exceptions: 18,
      scenarios: 10,
    });
  });

  it('models sponsor purchases as orders with seats rather than students', () => {
    const contract = fixture();
    const sponsor = contract.source_channels.find(
      (entry: any) => entry.key === 'sponsored_cohort',
    );
    expect(sponsor).toMatchObject({
      allows_multiple_seats: true,
      participant_evidence: 'required',
      payer_equals_participant: 'never_inferred',
    });
    expect(contract.state_machines.seat).toContain('unassigned');
  });

  it('rejects automatic payer-to-participant identity', () => {
    const contract = fixture();
    contract.source_channels[0].payer_equals_participant = 'automatic';
    expect(validateStudentEnrollmentFoundation(contract).findings).toContain(
      'channel website_stripe_checkout: payer cannot automatically become participant',
    );
  });

  it('requires class communication to start from assignments', () => {
    const contract = fixture();
    contract.query_contracts.find(
      (entry: any) => entry.key === 'class_recipients',
    ).starts_from = 'heartbeat_group';
    expect(validateStudentEnrollmentFoundation(contract).findings).toContain(
      'class recipients must start from class assignments',
    );
  });

  it('requires payment due to start from actual obligations', () => {
    const contract = fixture();
    contract.query_contracts.find(
      (entry: any) => entry.key === 'next_payment_due',
    ).starts_from = 'component_entitlement';
    expect(validateStudentEnrollmentFoundation(contract).findings).toContain(
      'next payment due must start from actual obligations',
    );
  });

  it('defines every query source as a canonical entity', () => {
    const contract = fixture();
    contract.entities = contract.entities.filter(
      (entry: any) => entry.key !== 'financial_obligation',
    );
    expect(validateStudentEnrollmentFoundation(contract).findings).toEqual(
      expect.arrayContaining([
        'missing entity financial_obligation',
        'query next_payment_due: starts_from must name an entity',
      ]),
    );
  });

  it('requires source aliases and version-bound materialization', () => {
    const contract = fixture();
    contract.commands = contract.commands.filter(
      (entry: any) => entry.key !== 'link_source_reference',
    );
    contract.commands.find(
      (entry: any) => entry.key === 'materialize_enrollment',
    ).requires = ['all_materialization_gates'];
    expect(validateStudentEnrollmentFoundation(contract).findings).toEqual(
      expect.arrayContaining([
        'source reference linking must be append-only',
        'materialize_enrollment must require order_version',
        'materialize_enrollment must require seat_version',
      ]),
    );
  });

  it('requires financial terms to be classified before materialization', () => {
    const contract = fixture();
    contract.materialization_gates = contract.materialization_gates.filter(
      (gate: string) => gate !== 'required_financial_terms_are_classified',
    );
    expect(validateStudentEnrollmentFoundation(contract).findings).toContain(
      'missing materialization gate required_financial_terms_are_classified',
    );
  });

  it('keeps provider projection behind an outbox and exact readback', () => {
    const contract = fixture();
    contract.commands.find(
      (entry: any) => entry.key === 'request_projection',
    ).writes = 'provider_direct';
    contract.projection_policy.verified_requires_exact_readback = false;
    expect(validateStudentEnrollmentFoundation(contract).findings).toEqual(
      expect.arrayContaining([
        'request_projection must write only to an outbox',
        'projection verification must require exact readback',
      ]),
    );
  });

  it('holds a check when participant identity is missing', () => {
    const contract = fixture();
    contract.synthetic_scenarios.find(
      (entry: any) => entry.key === 'check_without_participant',
    ).expected = 'materializable';
    expect(validateStudentEnrollmentFoundation(contract).findings).toContain(
      'scenario check_without_participant must expect held_needs_participant',
    );
  });

  it('forbids reconciliation and data changes in this phase', () => {
    const contract = fixture();
    contract.phase_boundary.forbidden =
      contract.phase_boundary.forbidden.filter(
        (value: string) => value !== 'reconciliation',
      );
    expect(validateStudentEnrollmentFoundation(contract).findings).toContain(
      'phase boundary must forbid reconciliation',
    );
  });

  it('enforces authority, privacy, and non-receipt invariants', () => {
    const contract = fixture();
    contract.authority.canonical_process_owner = 'Student Roster';
    contract.privacy_and_audit.raw_participant_uploads_short_lived = false;
    contract.projection_policy.success_exit_or_message_is_not_receipt = false;
    expect(validateStudentEnrollmentFoundation(contract).findings).toEqual(
      expect.arrayContaining([
        'Company OS must remain canonical process owner',
        'privacy invariant raw_participant_uploads_short_lived must be true',
        'success exit or message must not count as a receipt',
      ]),
    );
  });

  it('enforces every synthetic scenario outcome and enrollment-state meaning', () => {
    const contract = fixture();
    contract.synthetic_scenarios.find(
      (entry: any) => entry.key === 'refund_or_dispute',
    ).expected = 'silently_revoked';
    delete contract.state_semantics.enrollment.pending;
    expect(validateStudentEnrollmentFoundation(contract).findings).toEqual(
      expect.arrayContaining([
        'scenario refund_or_dispute must expect held_for_policy_not_silent_revoke',
        'enrollment state pending requires semantics',
      ]),
    );
  });
});
