import { describe, expect, it } from 'vitest';
import {
  ProjectionAcceptanceUncertainError,
  assertProjectionReadiness,
  buildSupervisionPilotProjections,
  deliverProjection,
  projectionHash,
  rollbackProjection,
  type ProjectionDeliveryLedger,
  type ProjectionDestinationReadiness,
  type ProjectionEnvelope,
  type ProviderProjectionDriver,
  type SupervisionProjectionSubject,
} from './student-enrollment-projection.js';

const subject: SupervisionProjectionSubject = {
  offerKey: 'supervision-inaugural',
  offerVersion: 1,
  fundingStatus: 'settled',
  payerRelationship: 'self_purchase_explicit',
  sourceAdmissionAuthenticated: true,
  openBlockingExceptions: 0,
  enrollmentKey: 'enrollment:synthetic:1',
  enrollmentVersion: 0,
  assignmentKey: 'assignment:synthetic:2026-10-07:1',
  assignmentVersion: 0,
  participantKey: 'party:synthetic:1',
  participantEmail: 'STUDENT@example.test',
  participantName: 'Synthetic Student',
  deliveryBlockKey: 'supervision:2026-10-07',
  deliveryStartsAt: '2026-10-07T14:00:00.000Z',
  courseAccessGroupKey: 'heartbeat:course-access:supervision',
  deliveryMarkerGroupKey: 'heartbeat:marker:supervision:2026-10-07',
};

const readiness = (): ProjectionDestinationReadiness[] => [
  {
    target: 'student_roster',
    disposition: 'required',
    reviewedAdapter: true,
    destinationKey: 'student_roster:synthetic:supervision',
    applyPath: 'synthetic.roster.upsert',
    readbackPath: 'synthetic.roster.exact_row',
    rollbackSemantics: 'remove exact versioned row',
    reconciliationSemantics: 'compare exact normalized row hash',
    permissionReady: true,
    activationReady: true,
  },
  {
    target: 'heartbeat',
    disposition: 'required',
    reviewedAdapter: true,
    destinationKey: 'heartbeat:synthetic:community',
    applyPath: 'synthetic.heartbeat.memberships',
    readbackPath: 'synthetic.heartbeat.exact_memberships',
    rollbackSemantics: 'remove only memberships from this receipt',
    reconciliationSemantics: 'compare both layer identities and marker safety',
    permissionReady: true,
    activationReady: true,
  },
  {
    target: 'encharge',
    disposition: 'not_applicable',
    reviewedAdapter: false,
    destinationKey: null,
    applyPath: null,
    readbackPath: null,
    rollbackSemantics: null,
    reconciliationSemantics: null,
    permissionReady: false,
    activationReady: false,
  },
  {
    target: 'plutio',
    disposition: 'not_applicable',
    reviewedAdapter: false,
    destinationKey: null,
    applyPath: null,
    readbackPath: null,
    rollbackSemantics: null,
    reconciliationSemantics: null,
    permissionReady: false,
    activationReady: false,
  },
];

class Ledger implements ProjectionDeliveryLedger {
  current = true;
  currentChecks = 0;
  changeAfterApply = false;
  acceptedThrows = false;
  events: string[] = [];
  exceptions: string[] = [];
  operationIds: string[] = [];
  async isCurrent() {
    this.currentChecks += 1;
    return this.current && !(this.changeAfterApply && this.currentChecks > 1);
  }
  async recordAccepted(_e: ProjectionEnvelope, operationId: string) {
    if (this.acceptedThrows) throw new Error('synthetic receipt loss');
    this.events.push(`accepted:${operationId}`);
  }
  async recordVerified(
    _e: ProjectionEnvelope,
    _operationId: string,
    hash: string,
  ) {
    this.operationIds.push(_operationId);
    this.events.push(`verified:${hash}`);
  }
  async recordRetryableFailure(_e: ProjectionEnvelope, code: string) {
    this.events.push(`failed:${code}`);
  }
  async recordHeldException(_e: ProjectionEnvelope, code: string) {
    this.exceptions.push(code);
  }
  async recordPostApplyUncertain(
    _e: ProjectionEnvelope,
    code: 'subject_changed_after_apply' | 'delivery_receipt_uncertain',
    _hash: string,
    operationId: string,
  ) {
    this.exceptions.push(code);
    this.operationIds.push(operationId);
  }
  async recordRolledBack() {
    this.events.push('rolled_back');
  }
}

function driver(
  envelope: ProjectionEnvelope,
  mode: 'ok' | 'fail' | 'uncertain' | 'lookup_fail' | 'readback_fail' = 'ok',
) {
  let effects = 0;
  let existing: { operationId: string; readback: unknown } | null = null;
  const value: ProviderProjectionDriver & { effects: () => number } = {
    target: envelope.target,
    async findByIdempotencyKey() {
      if (mode === 'lookup_fail') throw new Error('synthetic lookup failure');
      return existing;
    },
    async apply() {
      if (mode === 'fail') throw new Error('synthetic failure');
      effects += 1;
      existing = {
        operationId: `op-${effects}`,
        readback: envelope.expectedReadback,
      };
      if (mode === 'uncertain')
        throw new ProjectionAcceptanceUncertainError('synthetic uncertainty');
      return { operationId: `op-${effects}` };
    },
    async readback() {
      if (mode === 'readback_fail')
        throw new Error('synthetic readback failure');
      return existing?.readback ?? null;
    },
    async rollback(_envelope, operationId) {
      if (existing?.operationId !== operationId)
        throw new Error('synthetic_operation_id_mismatch');
      existing = null;
      effects -= 1;
    },
    effects: () => effects,
  };
  return value;
}

describe('student enrollment provider projection foundation', () => {
  it('builds deterministic roster and two-layer Heartbeat payloads', () => {
    const first = buildSupervisionPilotProjections(subject, readiness());
    const second = buildSupervisionPilotProjections(subject, readiness());
    expect(first).toEqual(second);
    expect(first.map((p) => p.target)).toEqual(['student_roster', 'heartbeat']);
    expect(first[1].payload).toMatchObject({
      marker_hidden: true,
      marker_has_content: false,
      marker_proves_payment: false,
      marker_proves_entitlement: false,
    });
    expect(first[0].idempotencyKey).toContain(':v0');
  });

  it('fails readiness closed and never silently infers optional targets', () => {
    const incomplete = readiness();
    incomplete[0] = { ...incomplete[0], readbackPath: null };
    expect(() => assertProjectionReadiness(incomplete)).toThrow(
      'projection_target_not_ready_student_roster',
    );
    const inferred = readiness();
    inferred[2] = { ...inferred[2], disposition: 'required' };
    expect(() => buildSupervisionPilotProjections(subject, inferred)).toThrow(
      'projection_target_not_ready_encharge',
    );
    expect(() =>
      buildSupervisionPilotProjections(
        { ...subject, sourceAdmissionAuthenticated: false },
        readiness(),
      ),
    ).toThrow('projection_requires_authenticated_admission');
    expect(() =>
      buildSupervisionPilotProjections(
        { ...subject, offerKey: 'supervision-regular' },
        readiness(),
      ),
    ).toThrow('projection_pilot_population_not_settled');
  });

  it('verifies exact readback and prevents a duplicate effect after acknowledgement loss', async () => {
    const envelope = buildSupervisionPilotProjections(subject, readiness())[0];
    const ledger = new Ledger();
    const provider = driver(envelope);
    expect(await deliverProjection(envelope, provider, ledger)).toBe(
      'verified',
    );
    expect(await deliverProjection(envelope, provider, ledger)).toBe(
      'verified',
    );
    expect(provider.effects()).toBe(1);
    expect(
      ledger.events.filter((event) => event.startsWith('verified:')),
    ).toHaveLength(2);
    expect(ledger.operationIds).toEqual(['op-1', 'op-1']);
  });

  it('verifies the minimized production Heartbeat identity and membership readback', async () => {
    const expectedReadback = {
      schemaVersion: 1,
      kind: 'heartbeat_live_membership',
      participantPartyId: '10001',
      participantEmailSha256: 'a'.repeat(64),
      groupId: '4c54983c-0e7b-4dd0-aebc-0f0cb1c82298',
      courseId: 'abd312e4-b01a-4718-8918-f79d081753c0',
      cohortId: 'f2a36eca-a017-4536-9b83-368f51219895',
      identity: 'verified',
      membership: 'verified',
      learnerLoginProof: 'not_verified',
    };
    const envelope: ProjectionEnvelope = {
      target: 'heartbeat',
      subjectType: 'enrollment',
      subjectKey: 'website-checkout:fixture:seat:1:enrollment',
      subjectVersion: 0,
      destinationKey:
        'heartbeat:main:group:4c54983c-0e7b-4dd0-aebc-0f0cb1c82298',
      idempotencyKey: 'website_checkout_heartbeat_live:fixture',
      payload: expectedReadback,
      payloadSha256: projectionHash(expectedReadback),
      expectedReadback,
      expectedReadbackSha256: projectionHash(expectedReadback),
    };
    const ledger = new Ledger();
    await expect(
      deliverProjection(envelope, driver(envelope), ledger),
    ).resolves.toBe('verified');
  });

  it('refuses stale versions, retries definitive failure, and holds uncertain acceptance', async () => {
    const envelope = buildSupervisionPilotProjections(subject, readiness())[0];
    const stale = new Ledger();
    stale.current = false;
    await expect(
      deliverProjection(envelope, driver(envelope), stale),
    ).rejects.toThrow('stale_projection_version');
    const failed = new Ledger();
    expect(
      await deliverProjection(envelope, driver(envelope, 'fail'), failed),
    ).toBe('retryable_failure');
    expect(failed.events).toContain('failed:provider_apply_failed');
    const uncertain = new Ledger();
    const uncertainProvider = driver(envelope, 'uncertain');
    expect(
      await deliverProjection(envelope, uncertainProvider, uncertain),
    ).toBe('held');
    expect(uncertain.exceptions).toEqual(['provider_acceptance_uncertain']);
    expect(uncertainProvider.effects()).toBe(1);
  });

  it('holds mismatched readback and supports exact rollback', async () => {
    const envelope = buildSupervisionPilotProjections(subject, readiness())[0];
    const ledger = new Ledger();
    const provider = driver(envelope);
    await deliverProjection(envelope, provider, ledger);
    await rollbackProjection(envelope, 'op-1', provider, ledger);
    expect(provider.effects()).toBe(0);
    expect(ledger.events).toContain('rolled_back');
  });

  it('records bounded lookup failure and holds unavailable post-apply readback', async () => {
    const envelope = buildSupervisionPilotProjections(subject, readiness())[0];
    const lookup = new Ledger();
    expect(
      await deliverProjection(
        envelope,
        driver(envelope, 'lookup_fail'),
        lookup,
      ),
    ).toBe('retryable_failure');
    expect(lookup.events).toContain('failed:provider_lookup_failed');

    const readback = new Ledger();
    expect(
      await deliverProjection(
        envelope,
        driver(envelope, 'readback_fail'),
        readback,
      ),
    ).toBe('held');
    expect(readback.exceptions).toContain('provider_readback_unavailable');
  });

  it('holds an applied effect when the canonical version changes mid-delivery', async () => {
    const envelope = buildSupervisionPilotProjections(subject, readiness())[0];
    const ledger = new Ledger();
    ledger.changeAfterApply = true;
    const provider = driver(envelope);
    expect(await deliverProjection(envelope, provider, ledger)).toBe('held');
    expect(provider.effects()).toBe(1);
    expect(ledger.exceptions).toEqual(['subject_changed_after_apply']);
    expect(ledger.operationIds).toEqual(['op-1']);
    expect(ledger.events.some((event) => event.startsWith('accepted:'))).toBe(
      false,
    );
  });

  it('records post-apply receipt loss as uncertain instead of retryable', async () => {
    const envelope = buildSupervisionPilotProjections(subject, readiness())[0];
    const ledger = new Ledger();
    ledger.acceptedThrows = true;
    const provider = driver(envelope);
    expect(await deliverProjection(envelope, provider, ledger)).toBe('held');
    expect(provider.effects()).toBe(1);
    expect(ledger.exceptions).toEqual(['delivery_receipt_uncertain']);
    expect(ledger.operationIds).toEqual(['op-1']);
    expect(ledger.events).not.toContain('failed:provider_apply_failed');
  });
});
