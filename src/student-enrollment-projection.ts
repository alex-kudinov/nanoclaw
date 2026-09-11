import { createHash } from 'node:crypto';

export const STUDENT_PROJECTION_MODE = 'local_unwired' as const;
export const STUDENT_PROJECTION_TARGETS = [
  'student_roster',
  'heartbeat',
  'encharge',
  'plutio',
] as const;
export type StudentProjectionTarget =
  (typeof STUDENT_PROJECTION_TARGETS)[number];

export type TargetDisposition = 'required' | 'not_applicable';

export interface ProjectionDestinationReadiness {
  target: StudentProjectionTarget;
  disposition: TargetDisposition;
  reviewedAdapter: boolean;
  destinationKey: string | null;
  applyPath: string | null;
  readbackPath: string | null;
  rollbackSemantics: string | null;
  reconciliationSemantics: string | null;
  permissionReady: boolean;
  activationReady: boolean;
}

export interface SupervisionProjectionSubject {
  offerKey: 'supervision-inaugural' | 'supervision-regular';
  offerVersion: number;
  fundingStatus: 'settled';
  payerRelationship: 'self_purchase_explicit';
  sourceAdmissionAuthenticated: boolean;
  openBlockingExceptions: number;
  enrollmentKey: string;
  enrollmentVersion: number;
  assignmentKey: string;
  assignmentVersion: number;
  participantKey: string;
  participantEmail: string;
  participantName: string;
  deliveryBlockKey: string;
  deliveryStartsAt: string;
  courseAccessGroupKey: string;
  deliveryMarkerGroupKey: string;
}

export interface ProjectionEnvelope {
  target: StudentProjectionTarget;
  subjectType: 'assignment' | 'enrollment';
  subjectKey: string;
  subjectVersion: number;
  destinationKey: string;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  payloadSha256: string;
  expectedReadback: Record<string, unknown>;
  expectedReadbackSha256: string;
}

export interface ProjectionApplyResult {
  operationId: string;
}

export interface ExistingProjectionEffect {
  operationId: string;
}

export interface ProviderProjectionDriver {
  readonly target: StudentProjectionTarget;
  findByIdempotencyKey(
    idempotencyKey: string,
    destinationKey: string,
  ): Promise<ExistingProjectionEffect | null>;
  apply(envelope: ProjectionEnvelope): Promise<ProjectionApplyResult>;
  readback(envelope: ProjectionEnvelope): Promise<unknown | null>;
  rollback(envelope: ProjectionEnvelope, operationId: string): Promise<void>;
}

export interface ProjectionDeliveryLedger {
  isCurrent(envelope: ProjectionEnvelope): Promise<boolean>;
  recordAccepted(
    envelope: ProjectionEnvelope,
    operationId: string,
  ): Promise<void>;
  recordVerified(
    envelope: ProjectionEnvelope,
    operationId: string,
    readbackSha256: string,
  ): Promise<void>;
  recordRetryableFailure(
    envelope: ProjectionEnvelope,
    code: string,
  ): Promise<void>;
  recordHeldException(
    envelope: ProjectionEnvelope,
    code: string,
    evidenceSha256: string,
    operationId?: string,
  ): Promise<void>;
  recordPostApplyUncertain(
    envelope: ProjectionEnvelope,
    code: 'subject_changed_after_apply' | 'delivery_receipt_uncertain',
    evidenceSha256: string,
    operationId: string,
  ): Promise<void>;
  recordRolledBack(
    envelope: ProjectionEnvelope,
    operationId: string,
  ): Promise<void>;
}

export class ProjectionAcceptanceUncertainError extends Error {
  readonly code = 'provider_acceptance_uncertain';
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`)
    .join(',')}}`;
}

export function projectionHash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}

function assertKey(value: string, label: string): void {
  if (!/^[a-z0-9][a-z0-9._:@+-]{0,299}$/.test(value))
    throw new Error(`invalid_${label}`);
}

function assertSubject(subject: SupervisionProjectionSubject): void {
  for (const [value, label] of [
    [subject.enrollmentKey, 'enrollment_key'],
    [subject.assignmentKey, 'assignment_key'],
    [subject.participantKey, 'participant_key'],
    [subject.deliveryBlockKey, 'delivery_block_key'],
    [subject.courseAccessGroupKey, 'course_access_group_key'],
    [subject.deliveryMarkerGroupKey, 'delivery_marker_group_key'],
  ] as const)
    assertKey(value, label);
  if (!Number.isInteger(subject.offerVersion) || subject.offerVersion < 1)
    throw new Error('invalid_offer_version');
  if (
    !Number.isInteger(subject.assignmentVersion) ||
    subject.assignmentVersion < 0
  )
    throw new Error('invalid_assignment_version');
  if (!subject.participantEmail.includes('@'))
    throw new Error('invalid_participant_email');
  if (!Number.isFinite(Date.parse(subject.deliveryStartsAt)))
    throw new Error('invalid_delivery_start');
  if (!subject.sourceAdmissionAuthenticated)
    throw new Error('projection_requires_authenticated_admission');
  if (subject.fundingStatus !== 'settled')
    throw new Error('projection_requires_settled_funding');
  if (subject.payerRelationship !== 'self_purchase_explicit')
    throw new Error('projection_requires_self_purchase');
  if (subject.openBlockingExceptions !== 0)
    throw new Error('projection_blocked_by_exception');
}

export function assertProjectionReadiness(
  entries: readonly ProjectionDestinationReadiness[],
): void {
  const byTarget = new Map(entries.map((entry) => [entry.target, entry]));
  if (byTarget.size !== STUDENT_PROJECTION_TARGETS.length)
    throw new Error('projection_readiness_incomplete');
  for (const target of STUDENT_PROJECTION_TARGETS) {
    const entry = byTarget.get(target);
    if (!entry) throw new Error(`projection_readiness_missing_${target}`);
    if (entry.disposition === 'not_applicable') continue;
    if (
      !entry.reviewedAdapter ||
      !entry.destinationKey ||
      !entry.applyPath ||
      !entry.readbackPath ||
      !entry.rollbackSemantics ||
      !entry.reconciliationSemantics ||
      !entry.permissionReady ||
      !entry.activationReady
    )
      throw new Error(`projection_target_not_ready_${target}`);
  }
  if (byTarget.get('student_roster')?.disposition !== 'required')
    throw new Error('student_roster_required_for_pilot');
  if (byTarget.get('heartbeat')?.disposition !== 'required')
    throw new Error('heartbeat_required_for_pilot');
}

function baseEnvelope(
  target: StudentProjectionTarget,
  subject: SupervisionProjectionSubject,
  destinationKey: string,
  payload: Record<string, unknown>,
  expectedReadback: Record<string, unknown>,
): ProjectionEnvelope {
  assertKey(destinationKey, 'destination_key');
  return {
    target,
    subjectType: 'assignment',
    subjectKey: subject.assignmentKey,
    subjectVersion: subject.assignmentVersion,
    destinationKey,
    idempotencyKey: `student_projection:${target}:${subject.assignmentKey}:v${subject.assignmentVersion}`,
    payload,
    payloadSha256: projectionHash(payload),
    expectedReadback,
    expectedReadbackSha256: projectionHash(expectedReadback),
  };
}

export function buildStudentRosterProjection(
  subject: SupervisionProjectionSubject,
  destinationKey: string,
): ProjectionEnvelope {
  assertSubject(subject);
  const row = {
    participant_key: subject.participantKey,
    participant_email: subject.participantEmail.trim().toLowerCase(),
    participant_name: subject.participantName.trim(),
    offer_key: subject.offerKey,
    offer_version: subject.offerVersion,
    enrollment_key: subject.enrollmentKey,
    assignment_key: subject.assignmentKey,
    delivery_block_key: subject.deliveryBlockKey,
    delivery_starts_at: subject.deliveryStartsAt,
  };
  return baseEnvelope('student_roster', subject, destinationKey, row, row);
}

export function buildHeartbeatProjection(
  subject: SupervisionProjectionSubject,
  destinationKey: string,
): ProjectionEnvelope {
  assertSubject(subject);
  if (subject.courseAccessGroupKey === subject.deliveryMarkerGroupKey)
    throw new Error('heartbeat_layers_must_be_distinct');
  const membership = {
    participant_key: subject.participantKey,
    participant_email: subject.participantEmail.trim().toLowerCase(),
    course_access_group_key: subject.courseAccessGroupKey,
    delivery_marker_group_key: subject.deliveryMarkerGroupKey,
    marker_hidden: true,
    marker_admin_controlled: true,
    marker_has_content: false,
    marker_proves_payment: false,
    marker_proves_entitlement: false,
  };
  return baseEnvelope(
    'heartbeat',
    subject,
    destinationKey,
    membership,
    membership,
  );
}

export function buildSupervisionPilotProjections(
  subject: SupervisionProjectionSubject,
  readiness: readonly ProjectionDestinationReadiness[],
): ProjectionEnvelope[] {
  assertProjectionReadiness(readiness);
  assertSubject(subject);
  if (
    subject.offerKey !== 'supervision-inaugural' ||
    subject.offerVersion !== 1 ||
    !subject.deliveryBlockKey.includes('2026-10-07') ||
    !subject.deliveryStartsAt.startsWith('2026-10-07T')
  )
    throw new Error('projection_pilot_population_not_settled');
  return readiness.flatMap((entry) => {
    if (entry.disposition === 'not_applicable') return [];
    if (!entry.destinationKey)
      throw new Error(`destination_missing_${entry.target}`);
    if (entry.target === 'student_roster')
      return [buildStudentRosterProjection(subject, entry.destinationKey)];
    if (entry.target === 'heartbeat')
      return [buildHeartbeatProjection(subject, entry.destinationKey)];
    throw new Error(`required_target_builder_missing_${entry.target}`);
  });
}

export function normalizeProviderReadback(
  target: StudentProjectionTarget,
  value: unknown,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid_provider_readback');
  const v = value as Record<string, unknown>;
  if (target === 'student_roster')
    return {
      participant_key: v.participant_key,
      participant_email: String(v.participant_email ?? '')
        .trim()
        .toLowerCase(),
      participant_name: String(v.participant_name ?? '').trim(),
      offer_key: v.offer_key,
      offer_version: v.offer_version,
      enrollment_key: v.enrollment_key,
      assignment_key: v.assignment_key,
      delivery_block_key: v.delivery_block_key,
      delivery_starts_at: v.delivery_starts_at,
    };
  if (target === 'heartbeat')
    if (v.kind === 'heartbeat_test_membership')
      return {
        schemaVersion: v.schemaVersion,
        kind: v.kind,
        participantPartyId: v.participantPartyId,
        participantEmailSha256: v.participantEmailSha256,
        heartbeatUserId: v.heartbeatUserId,
        groupId: v.groupId,
        courseId: v.courseId,
        cohortId: v.cohortId,
        membership: v.membership,
        learnerLoginProof: v.learnerLoginProof,
      };
  if (target === 'heartbeat')
    if (v.kind === 'heartbeat_live_membership')
      return {
        schemaVersion: v.schemaVersion,
        kind: v.kind,
        participantPartyId: v.participantPartyId,
        participantEmailSha256: v.participantEmailSha256,
        groupId: v.groupId,
        courseId: v.courseId,
        cohortId: v.cohortId,
        identity: v.identity,
        membership: v.membership,
        learnerLoginProof: v.learnerLoginProof,
      };
  if (target === 'heartbeat')
    return {
      participant_key: v.participant_key,
      participant_email: String(v.participant_email ?? '')
        .trim()
        .toLowerCase(),
      course_access_group_key: v.course_access_group_key,
      delivery_marker_group_key: v.delivery_marker_group_key,
      marker_hidden: v.marker_hidden,
      marker_admin_controlled: v.marker_admin_controlled,
      marker_has_content: v.marker_has_content,
      marker_proves_payment: false,
      marker_proves_entitlement: false,
    };
  throw new Error(`readback_normalizer_missing_${target}`);
}

export async function deliverProjection(
  envelope: ProjectionEnvelope,
  driver: ProviderProjectionDriver,
  ledger: ProjectionDeliveryLedger,
): Promise<'verified' | 'retryable_failure' | 'held'> {
  if (driver.target !== envelope.target)
    throw new Error('projection_driver_target_mismatch');
  if (!(await ledger.isCurrent(envelope)))
    throw new Error('stale_projection_version');
  let operationId: string;
  let prior: ExistingProjectionEffect | null;
  try {
    prior = await driver.findByIdempotencyKey(
      envelope.idempotencyKey,
      envelope.destinationKey,
    );
  } catch {
    await ledger.recordRetryableFailure(envelope, 'provider_lookup_failed');
    return 'retryable_failure';
  }
  if (prior) {
    operationId = prior.operationId;
  } else {
    try {
      operationId = (await driver.apply(envelope)).operationId;
    } catch (error) {
      if (error instanceof ProjectionAcceptanceUncertainError) {
        await ledger.recordHeldException(
          envelope,
          error.code,
          projectionHash({
            target: envelope.target,
            idempotencyKey: envelope.idempotencyKey,
          }),
        );
        return 'held';
      }
      await ledger.recordRetryableFailure(envelope, 'provider_apply_failed');
      return 'retryable_failure';
    }
    if (!(await ledger.isCurrent(envelope))) {
      await ledger.recordPostApplyUncertain(
        envelope,
        'subject_changed_after_apply',
        projectionHash({
          operationId,
          idempotencyKey: envelope.idempotencyKey,
        }),
        operationId,
      );
      return 'held';
    }
    try {
      await ledger.recordAccepted(envelope, operationId);
    } catch {
      await ledger.recordPostApplyUncertain(
        envelope,
        'delivery_receipt_uncertain',
        projectionHash({
          operationId,
          idempotencyKey: envelope.idempotencyKey,
        }),
        operationId,
      );
      return 'held';
    }
  }
  let readback: unknown;
  try {
    readback = await driver.readback(envelope);
  } catch {
    await ledger.recordHeldException(
      envelope,
      'provider_readback_unavailable',
      projectionHash({
        target: envelope.target,
        idempotencyKey: envelope.idempotencyKey,
      }),
      operationId,
    );
    return 'held';
  }
  const readbackSha256 = projectionHash(
    normalizeProviderReadback(envelope.target, readback),
  );
  if (readbackSha256 !== envelope.expectedReadbackSha256) {
    await ledger.recordHeldException(
      envelope,
      'exact_readback_mismatch',
      readbackSha256,
    );
    return 'held';
  }
  await ledger.recordVerified(envelope, operationId, readbackSha256);
  return 'verified';
}

export async function rollbackProjection(
  envelope: ProjectionEnvelope,
  operationId: string,
  driver: ProviderProjectionDriver,
  ledger: ProjectionDeliveryLedger,
): Promise<void> {
  await driver.rollback(envelope, operationId);
  await ledger.recordRolledBack(envelope, operationId);
}
