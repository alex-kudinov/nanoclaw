import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const policy = JSON.parse(
  fs.readFileSync(
    path.resolve('facts/catalogs/student-enrollment-policy-v1.json'),
    'utf8',
  ),
);

describe('student enrollment dark policy', () => {
  it('keeps every live boundary disabled', () => {
    expect(policy.phase_boundary).toEqual({
      runtime_enabled: false,
      adapters_wired: false,
      projections_enabled: false,
      migration_applied: false,
      real_data_allowed: false,
      deployment_allowed: false,
    });
  });

  it('separates financial, enrollment, owner, and projection authority', () => {
    expect(policy.roles.source_adapter).not.toContain('assign_participant');
    expect(policy.roles.enrollment_operator).not.toContain(
      'confirm_off_platform_payment',
    );
    expect(policy.roles.finance_operator).not.toContain('grant_scholarship');
    expect(policy.roles.owner_admin).toContain(
      'approve_post_activation_transfer',
    );
    expect(policy.roles.projection_worker).toEqual([
      'claim_projection_outbox',
      'record_projection_readback',
    ]);
  });

  it('fails closed on unpaid, ambiguous, and refund/dispute cases', () => {
    expect(policy.activation.paid_offer_default).toBe(
      'requires_settled_payment_or_explicit_active_terms',
    );
    expect(policy.activation.missing_or_conflicting_finance).toBe('hold');
    expect(policy.sponsor_seats.payer_as_participant).toBe('never_inferred');
    expect(policy.refund_dispute_withdrawal).toMatchObject({
      default: 'open_policy_hold',
      silent_access_revocation: false,
      silent_entitlement_deletion: false,
    });
  });

  it('preserves operator roster values until a separately accepted cutover', () => {
    expect(policy.roster_coexistence).toMatchObject({
      initial_mode: 'projection_preview_only',
      nonempty_operator_cell: 'preserve_and_open_drift_exception',
      cutover: 'separate_owner_decision_after_shadow_parity',
    });
  });

  it('requires exact readback and holds ambiguous provider acceptance', () => {
    expect(policy.projection_failure).toMatchObject({
      independent_targets: true,
      retry_from_immutable_outbox: true,
      ambiguous_acceptance: 'hold_for_readback_not_blind_retry',
      complete_requires_exact_readback: true,
    });
  });

  it('keeps production retention subject to privacy/legal acceptance', () => {
    expect(policy.retention_defaults).toMatchObject({
      raw_participant_upload_days: 7,
      source_reference_and_audit_years: 7,
      production_acceptance:
        'requires_privacy_and_legal_review_before_retention_job',
    });
  });
});
