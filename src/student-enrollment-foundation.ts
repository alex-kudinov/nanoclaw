export type SourceChannel =
  | 'website_stripe_checkout'
  | 'manual_stripe_payment'
  | 'plutio_invoice_or_contract'
  | 'check_ach_or_wire'
  | 'sponsored_cohort'
  | 'scholarship'
  | 'complimentary_owner_grant'
  | 'migration_or_correction';
export type FinancialClassification =
  | 'not_applicable'
  | 'unverified'
  | 'settled'
  | 'active_terms'
  | 'held';
export type PayerRelationship =
  | 'unknown'
  | 'self_purchase_explicit'
  | 'separate_payer'
  | 'sponsor'
  | 'not_applicable';
export type EnrollmentState =
  | 'pending'
  | 'active'
  | 'held'
  | 'completed'
  | 'withdrawn'
  | 'cancelled';
export type ProjectionTarget =
  | 'student_roster'
  | 'heartbeat'
  | 'encharge'
  | 'plutio';

export interface EnrollmentOrder {
  orderKey: string;
  sourceChannel: SourceChannel;
  offerKey: string | null;
  bundleKey: string | null;
  bundleVersion: number | null;
  payerPartyId: number | null;
  seatCount: number;
  financialClassification: FinancialClassification;
  state:
    | 'captured'
    | 'needs_source_evidence'
    | 'needs_offer'
    | 'needs_financial_terms'
    | 'needs_participants'
    | 'ready_to_materialize'
    | 'partially_materialized'
    | 'materialized'
    | 'held'
    | 'cancelled';
  version: number;
  policyRevision: number;
  evidenceSha256: string;
  effectiveAt: string | null;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface OrderSourceReference {
  orderKey: string;
  sourceScope: string;
  sourceObjectType: string;
  sourceObjectId: string;
  idempotencyKey: string;
  evidenceSha256: string;
  observedAt: string;
  recordedAt: string;
  recordedBy: string;
}

export interface EnrollmentEvidence {
  evidenceKey: string;
  subjectType:
    | 'order'
    | 'seat'
    | 'enrollment'
    | 'agreement'
    | 'obligation'
    | 'entitlement'
    | 'assignment'
    | 'projection'
    | 'exception';
  subjectKey: string;
  evidenceType: string;
  sourceReferenceKey: string | null;
  evidenceSha256: string;
  observedAt: string;
  recordedAt: string;
  recordedBy: string;
}

export interface EnrollmentSeat {
  seatKey: string;
  orderKey: string;
  seatNumber: number;
  participantPartyId: number | null;
  participantEvidenceSha256: string | null;
  payerRelationship: PayerRelationship;
  state:
    | 'unassigned'
    | 'assigned'
    | 'accepted'
    | 'materialized'
    | 'transferred'
    | 'cancelled';
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface StudentEnrollment {
  enrollmentKey: string;
  orderKey: string;
  seatKey: string;
  participantPartyId: number;
  offerKey: string;
  bundleKey: string;
  bundleVersion: number;
  catalogRevision: number;
  state: EnrollmentState;
  version: number;
  effectiveAt: string | null;
  endedAt: string | null;
  materializationSha256: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ComponentEntitlement {
  entitlementKey: string;
  enrollmentKey: string;
  componentKey: string;
  grantEpisode: number;
  state:
    | 'included'
    | 'conditional'
    | 'earned_on_completion'
    | 'held'
    | 'revoked';
  version: number;
  evidenceSha256: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface FinancialAgreement {
  agreementKey: string;
  orderKey: string;
  agreementType:
    | 'paid_in_full'
    | 'installment'
    | 'pay_as_you_go'
    | 'invoice'
    | 'scholarship'
    | 'complimentary'
    | 'other_explicit';
  state: 'unverified' | 'active' | 'held' | 'complete' | 'cancelled';
  version: number;
  evidenceSha256: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface FinancialObligation {
  obligationKey: string;
  agreementKey: string;
  sequenceNumber: number;
  amountMinor: number | null;
  currency: string | null;
  dueAt: string | null;
  state:
    | 'not_due'
    | 'due'
    | 'paid'
    | 'waived'
    | 'cancelled'
    | 'refunded'
    | 'disputed';
  version: number;
  evidenceSha256: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ClassAssignment {
  assignmentKey: string;
  enrollmentKey: string;
  entitlementKey: string;
  deliveryBlockKey: string;
  state: 'pending' | 'active' | 'completed' | 'transferred' | 'cancelled';
  version: number;
  scheduleEvidenceSha256: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ProjectionOutboxItem {
  projectionKey: string;
  target: ProjectionTarget;
  subjectType: string;
  subjectKey: string;
  subjectVersion: number;
  payloadSha256: string;
  payload: Record<string, unknown>;
  expectedReadbackSha256: string;
  state: 'queued' | 'applied' | 'verified' | 'failed' | 'held' | 'superseded';
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectionReceipt {
  receiptKey: string;
  projectionKey: string;
  subjectVersion: number;
  stage: 'requested' | 'accepted' | 'applied' | 'readback' | 'final';
  outcome: 'verified' | 'failed' | 'held' | 'not_applicable' | 'superseded';
  resultCode: string;
  evidenceSha256: string;
  actor: string;
  occurredAt: string;
  recordedAt: string;
}

export interface EnrollmentException {
  exceptionKey: string;
  subjectType: string;
  subjectKey: string;
  reasonCode: string;
  state:
    | 'open'
    | 'acknowledged'
    | 'resolved'
    | 'accepted_no_action'
    | 'superseded';
  severity: 'critical' | 'high' | 'medium' | 'low';
  ownerRole:
    | 'enrollment_operator'
    | 'finance_operator'
    | 'owner_admin'
    | 'projection_worker';
  version: number;
  evidenceSha256: string;
  resolutionSha256: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  reviewAt: string;
  resolvedAt: string | null;
  occurrenceCount: number;
  updatedBy: string;
}

export interface EnrollmentHistory {
  subjectType: string;
  subjectKey: string;
  previousVersion: number | null;
  newVersion: number;
  commandKey: string;
  reasonCode: string;
  evidenceSha256: string;
  actor: string;
  occurredAt: string;
  recordedAt: string;
}

export interface EnrollmentFoundationState {
  orders: Record<string, EnrollmentOrder>;
  sourceReferences: Record<string, OrderSourceReference>;
  sourceIdempotency: Record<string, string>;
  evidence: Record<string, EnrollmentEvidence>;
  seats: Record<string, EnrollmentSeat>;
  enrollments: Record<string, StudentEnrollment>;
  entitlements: Record<string, ComponentEntitlement>;
  agreements: Record<string, FinancialAgreement>;
  obligations: Record<string, FinancialObligation>;
  assignments: Record<string, ClassAssignment>;
  projections: Record<string, ProjectionOutboxItem>;
  receipts: Record<string, ProjectionReceipt>;
  exceptions: Record<string, EnrollmentException>;
  history: EnrollmentHistory[];
}

export class EnrollmentCommandError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function createEmptyEnrollmentFoundationState(): EnrollmentFoundationState {
  return {
    orders: {},
    sourceReferences: {},
    sourceIdempotency: {},
    evidence: {},
    seats: {},
    enrollments: {},
    entitlements: {},
    agreements: {},
    obligations: {},
    assignments: {},
    projections: {},
    receipts: {},
    exceptions: {},
    history: [],
  };
}

function copy(state: EnrollmentFoundationState): EnrollmentFoundationState {
  return structuredClone(state);
}
function assertKey(value: string, field: string, maxLength: number): void {
  if (value.length > maxLength || !/^[a-z0-9][a-z0-9._:-]*$/.test(value))
    throw new EnrollmentCommandError('invalid_key', `${field} is invalid`);
}
function assertSha(value: string, field: string): void {
  if (!/^[0-9a-f]{64}$/.test(value))
    throw new EnrollmentCommandError('invalid_hash', `${field} must be sha256`);
}
function assertBoundedText(
  value: string,
  field: string,
  maxLength: number,
): void {
  if (value.length < 1 || value.length > maxLength)
    throw new EnrollmentCommandError(
      'invalid_text',
      `${field} must contain between 1 and ${maxLength} characters`,
    );
}
function assertLowerSnake(value: string, field: string): void {
  if (!/^[a-z][a-z0-9_]{0,99}$/.test(value))
    throw new EnrollmentCommandError(
      'invalid_lower_snake',
      `${field} must be lower snake case`,
    );
}
function assertTime(value: string, field: string): void {
  if (Number.isNaN(Date.parse(value)))
    throw new EnrollmentCommandError(
      'invalid_time',
      `${field} must be ISO date-time`,
    );
}
function assertBoundedJson(value: unknown, field: string): void {
  let encoded: string;
  try {
    encoded = JSON.stringify(value);
  } catch {
    throw new EnrollmentCommandError(
      'invalid_json',
      `${field} is not serializable`,
    );
  }
  if (!encoded || Buffer.byteLength(encoded, 'utf8') > 8192)
    throw new EnrollmentCommandError(
      'invalid_json',
      `${field} exceeds the 8192-byte limit`,
    );
}
function assertActor(value: string): void {
  if (!value.trim())
    throw new EnrollmentCommandError('invalid_actor', 'actor is required');
}
function assertVersion(
  actual: number,
  expected: number,
  subject: string,
): void {
  if (actual !== expected)
    throw new EnrollmentCommandError(
      'stale_version',
      `${subject} expected version ${expected}, found ${actual}`,
    );
}
function refKey(
  input: Pick<
    OrderSourceReference,
    'sourceScope' | 'sourceObjectType' | 'sourceObjectId'
  >,
): string {
  return `${input.sourceScope}:${input.sourceObjectType}:${input.sourceObjectId}`;
}
function assertSourceReference(
  input: Omit<OrderSourceReference, 'orderKey'>,
): void {
  assertKey(input.sourceScope, 'sourceScope', 200);
  assertKey(input.sourceObjectType, 'sourceObjectType', 100);
  if (
    input.sourceObjectId.length < 1 ||
    input.sourceObjectId.length > 300 ||
    input.idempotencyKey.length < 1 ||
    input.idempotencyKey.length > 500
  )
    throw new EnrollmentCommandError(
      'invalid_source_reference',
      'source object and idempotency keys must be bounded',
    );
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.recordedBy);
  assertTime(input.observedAt, 'observedAt');
  assertTime(input.recordedAt, 'recordedAt');
}
function history(
  input: Omit<
    EnrollmentHistory,
    'previousVersion' | 'newVersion' | 'recordedAt'
  > & {
    previousVersion: number | null;
  },
): EnrollmentHistory {
  return {
    ...input,
    newVersion: input.previousVersion === null ? 0 : input.previousVersion + 1,
    recordedAt: input.occurredAt,
  };
}
function sameOrder(a: EnrollmentOrder, b: EnrollmentOrder): boolean {
  return [
    'sourceChannel',
    'offerKey',
    'bundleKey',
    'bundleVersion',
    'payerPartyId',
    'seatCount',
    'financialClassification',
    'policyRevision',
    'evidenceSha256',
  ].every(
    (field) =>
      a[field as keyof EnrollmentOrder] === b[field as keyof EnrollmentOrder],
  );
}

const SOURCE_CHANNELS = new Set<SourceChannel>([
  'website_stripe_checkout',
  'manual_stripe_payment',
  'plutio_invoice_or_contract',
  'check_ach_or_wire',
  'sponsored_cohort',
  'scholarship',
  'complimentary_owner_grant',
  'migration_or_correction',
]);
const FINANCIAL_CLASSIFICATIONS = new Set<FinancialClassification>([
  'not_applicable',
  'unverified',
  'settled',
  'active_terms',
  'held',
]);
const PAYER_RELATIONSHIPS = new Set<PayerRelationship>([
  'unknown',
  'self_purchase_explicit',
  'separate_payer',
  'sponsor',
  'not_applicable',
]);
const AGREEMENT_TYPES = new Set<FinancialAgreement['agreementType']>([
  'paid_in_full',
  'installment',
  'pay_as_you_go',
  'invoice',
  'scholarship',
  'complimentary',
  'other_explicit',
]);
const AGREEMENT_STATES = new Set<FinancialAgreement['state']>([
  'unverified',
  'active',
  'held',
  'complete',
  'cancelled',
]);
const OBLIGATION_STATES = new Set<FinancialObligation['state']>([
  'not_due',
  'due',
  'paid',
  'waived',
  'cancelled',
  'refunded',
  'disputed',
]);
const ENTITLEMENT_STATES = new Set<ComponentEntitlement['state']>([
  'included',
  'conditional',
  'earned_on_completion',
  'held',
  'revoked',
]);
const ASSIGNMENT_STATES = new Set<ClassAssignment['state']>([
  'pending',
  'active',
  'completed',
  'transferred',
  'cancelled',
]);
const PROJECTION_TARGETS = new Set<ProjectionTarget>([
  'student_roster',
  'heartbeat',
  'encharge',
  'plutio',
]);
const PROJECTION_SUBJECT_TYPES = new Set([
  'order',
  'seat',
  'enrollment',
  'entitlement',
  'assignment',
  'obligation',
  'exception',
]);
const EVIDENCE_SUBJECT_TYPES = new Set<EnrollmentEvidence['subjectType']>([
  'order',
  'seat',
  'enrollment',
  'agreement',
  'obligation',
  'entitlement',
  'assignment',
  'projection',
  'exception',
]);
const EXCEPTION_SUBJECT_TYPES = new Set([
  'order',
  'seat',
  'enrollment',
  'entitlement',
  'assignment',
  'agreement',
  'obligation',
  'projection',
]);
const EXCEPTION_SEVERITIES = new Set<EnrollmentException['severity']>([
  'critical',
  'high',
  'medium',
  'low',
]);
const EXCEPTION_OWNER_ROLES = new Set<EnrollmentException['ownerRole']>([
  'enrollment_operator',
  'finance_operator',
  'owner_admin',
  'projection_worker',
]);
const EXCEPTION_RESOLUTIONS = new Set([
  'resolved',
  'accepted_no_action',
  'superseded',
]);

function assertChoice<T extends string>(
  values: Set<T>,
  value: string,
  field: string,
): asserts value is T {
  if (!values.has(value as T))
    throw new EnrollmentCommandError('invalid_choice', `${field} is invalid`);
}

export function captureOrder(
  state: EnrollmentFoundationState,
  input: Omit<EnrollmentOrder, 'version' | 'state'> & {
    sourceReference: Omit<OrderSourceReference, 'orderKey'>;
  },
): {
  state: EnrollmentFoundationState;
  order: EnrollmentOrder;
  duplicate: boolean;
} {
  if (!SOURCE_CHANNELS.has(input.sourceChannel))
    throw new EnrollmentCommandError(
      'invalid_source_channel',
      'sourceChannel is invalid',
    );
  if (!FINANCIAL_CLASSIFICATIONS.has(input.financialClassification))
    throw new EnrollmentCommandError(
      'invalid_financial_classification',
      'financialClassification is invalid',
    );
  if (!Number.isInteger(input.policyRevision) || input.policyRevision < 1)
    throw new EnrollmentCommandError(
      'invalid_policy_revision',
      'policyRevision must be positive',
    );
  if (
    input.payerPartyId !== null &&
    (!Number.isInteger(input.payerPartyId) || input.payerPartyId < 1)
  )
    throw new EnrollmentCommandError(
      'invalid_payer',
      'payerPartyId must be a positive integer or null',
    );
  if ((input.bundleKey === null) !== (input.bundleVersion === null))
    throw new EnrollmentCommandError(
      'bundle_version_unknown',
      'bundle key and version must both be present or absent',
    );
  assertSourceReference(input.sourceReference);
  assertKey(input.orderKey, 'orderKey', 200);
  if (input.offerKey !== null) assertKey(input.offerKey, 'offerKey', 200);
  if (input.bundleKey !== null) assertKey(input.bundleKey, 'bundleKey', 200);
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.updatedBy);
  assertTime(input.createdAt, 'createdAt');
  assertTime(input.updatedAt, 'updatedAt');
  if (
    !Number.isInteger(input.seatCount) ||
    input.seatCount < 1 ||
    input.seatCount > 10000
  )
    throw new EnrollmentCommandError(
      'invalid_seat_count',
      'seatCount is invalid',
    );
  const { sourceReference: inputSourceReference, ...orderInput } = input;
  const candidate: EnrollmentOrder = {
    ...orderInput,
    version: 0,
    state:
      input.offerKey && input.bundleKey && input.bundleVersion
        ? input.financialClassification === 'unverified' ||
          input.financialClassification === 'held'
          ? 'needs_financial_terms'
          : 'needs_participants'
        : 'needs_offer',
  } as EnrollmentOrder;
  const key = refKey(inputSourceReference);
  const existingRef = state.sourceReferences[key];
  if (existingRef) {
    const existing = state.orders[existingRef.orderKey];
    if (
      existing &&
      existingRef.idempotencyKey === inputSourceReference.idempotencyKey &&
      sameOrder(existing, candidate)
    )
      return { state, order: existing, duplicate: true };
    throw new EnrollmentCommandError(
      'duplicate_source_conflict',
      'source reference is already bound to different material facts',
    );
  }
  if (state.sourceIdempotency[inputSourceReference.idempotencyKey])
    throw new EnrollmentCommandError(
      'duplicate_source_conflict',
      'idempotency key is already bound',
    );
  if (state.orders[input.orderKey])
    throw new EnrollmentCommandError(
      'duplicate_order_key',
      'orderKey already exists',
    );
  const next = copy(state);
  next.orders[input.orderKey] = candidate;
  const sourceReference = {
    ...inputSourceReference,
    orderKey: input.orderKey,
  };
  next.sourceReferences[key] = sourceReference;
  next.sourceIdempotency[sourceReference.idempotencyKey] = key;
  next.history.push(
    history({
      subjectType: 'order',
      subjectKey: input.orderKey,
      previousVersion: null,
      commandKey: 'capture_order',
      reasonCode: 'source_admitted',
      evidenceSha256: input.evidenceSha256,
      actor: input.updatedBy,
      occurredAt: input.updatedAt,
    }),
  );
  return { state: next, order: candidate, duplicate: false };
}

export function linkSourceReference(
  state: EnrollmentFoundationState,
  input: {
    orderKey: string;
    expectedOrderVersion: number;
    reference: Omit<OrderSourceReference, 'orderKey'>;
  },
): EnrollmentFoundationState {
  const order = state.orders[input.orderKey];
  if (!order)
    throw new EnrollmentCommandError('order_not_found', 'order not found');
  assertVersion(order.version, input.expectedOrderVersion, 'order');
  assertSourceReference(input.reference);
  const key = refKey(input.reference);
  const existing = state.sourceReferences[key];
  if (existing) {
    if (
      existing.orderKey === input.orderKey &&
      existing.idempotencyKey === input.reference.idempotencyKey
    )
      return state;
    throw new EnrollmentCommandError(
      'duplicate_source_conflict',
      'source reference is already bound',
    );
  }
  if (state.sourceIdempotency[input.reference.idempotencyKey])
    throw new EnrollmentCommandError(
      'duplicate_source_conflict',
      'idempotency key is already bound',
    );
  const next = copy(state);
  next.sourceReferences[key] = { ...input.reference, orderKey: input.orderKey };
  next.sourceIdempotency[input.reference.idempotencyKey] = key;
  next.orders[input.orderKey] = {
    ...order,
    version: order.version + 1,
    updatedAt: input.reference.recordedAt,
    updatedBy: input.reference.recordedBy,
  };
  next.history.push(
    history({
      subjectType: 'order',
      subjectKey: input.orderKey,
      previousVersion: order.version,
      commandKey: 'link_source_reference',
      reasonCode: 'source_alias_linked',
      evidenceSha256: input.reference.evidenceSha256,
      actor: input.reference.recordedBy,
      occurredAt: input.reference.recordedAt,
    }),
  );
  return next;
}

function subjectExists(
  state: EnrollmentFoundationState,
  type: EnrollmentEvidence['subjectType'],
  key: string,
): boolean {
  const maps: Record<
    EnrollmentEvidence['subjectType'],
    Record<string, unknown>
  > = {
    order: state.orders,
    seat: state.seats,
    enrollment: state.enrollments,
    agreement: state.agreements,
    obligation: state.obligations,
    entitlement: state.entitlements,
    assignment: state.assignments,
    projection: state.projections,
    exception: state.exceptions,
  };
  return Boolean(maps[type]?.[key]);
}

export function attachEnrollmentEvidence(
  state: EnrollmentFoundationState,
  input: EnrollmentEvidence,
): EnrollmentFoundationState {
  assertKey(input.evidenceKey, 'evidenceKey', 250);
  assertLowerSnake(input.evidenceType, 'evidenceType');
  assertBoundedText(input.subjectKey, 'subjectKey', 300);
  assertChoice(
    EVIDENCE_SUBJECT_TYPES,
    input.subjectType,
    'evidenceSubjectType',
  );
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.recordedBy);
  assertTime(input.observedAt, 'observedAt');
  assertTime(input.recordedAt, 'recordedAt');
  if (!subjectExists(state, input.subjectType, input.subjectKey))
    throw new EnrollmentCommandError(
      'evidence_subject_not_found',
      'evidence subject does not exist',
    );
  if (
    input.sourceReferenceKey !== null &&
    !state.sourceReferences[input.sourceReferenceKey]
  )
    throw new EnrollmentCommandError(
      'source_reference_not_found',
      'source reference does not exist',
    );
  const existing = state.evidence[input.evidenceKey];
  if (existing) {
    if (JSON.stringify(existing) === JSON.stringify(input)) return state;
    throw new EnrollmentCommandError(
      'evidence_key_conflict',
      'evidence key has different material facts',
    );
  }
  const next = copy(state);
  next.evidence[input.evidenceKey] = input;
  next.history.push(
    history({
      subjectType: input.subjectType,
      subjectKey: input.subjectKey,
      previousVersion: null,
      commandKey: 'attach_evidence',
      reasonCode: input.evidenceType,
      evidenceSha256: input.evidenceSha256,
      actor: input.recordedBy,
      occurredAt: input.recordedAt,
    }),
  );
  return next;
}

export function correctOrderTerms(
  state: EnrollmentFoundationState,
  input: {
    orderKey: string;
    expectedOrderVersion: number;
    offerKey: string;
    bundleKey: string;
    bundleVersion: number;
    financialClassification: FinancialClassification;
    evidenceSha256: string;
    actor: string;
    occurredAt: string;
  },
): EnrollmentFoundationState {
  const order = state.orders[input.orderKey];
  if (!order)
    throw new EnrollmentCommandError('order_not_found', 'order not found');
  assertVersion(order.version, input.expectedOrderVersion, 'order');
  assertKey(input.offerKey, 'offerKey', 200);
  assertKey(input.bundleKey, 'bundleKey', 200);
  assertChoice(
    FINANCIAL_CLASSIFICATIONS,
    input.financialClassification,
    'financialClassification',
  );
  if (!Number.isInteger(input.bundleVersion) || input.bundleVersion < 1)
    throw new EnrollmentCommandError(
      'bundle_version_unknown',
      'bundleVersion is invalid',
    );
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  const hasSeats = Object.values(state.seats).some(
    (seat) => seat.orderKey === input.orderKey,
  );
  const nextState =
    input.financialClassification === 'unverified' ||
    input.financialClassification === 'held'
      ? 'needs_financial_terms'
      : hasSeats
        ? 'needs_participants'
        : 'captured';
  const next = copy(state);
  next.orders[input.orderKey] = {
    ...order,
    offerKey: input.offerKey,
    bundleKey: input.bundleKey,
    bundleVersion: input.bundleVersion,
    financialClassification: input.financialClassification,
    state: nextState,
    version: order.version + 1,
    evidenceSha256: input.evidenceSha256,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  next.history.push(
    history({
      subjectType: 'order',
      subjectKey: input.orderKey,
      previousVersion: order.version,
      commandKey: 'correct_or_transfer',
      reasonCode: 'order_terms_corrected',
      evidenceSha256: input.evidenceSha256,
      actor: input.actor,
      occurredAt: input.occurredAt,
    }),
  );
  return next;
}

export function transitionOrderState(
  state: EnrollmentFoundationState,
  input: {
    orderKey: string;
    expectedOrderVersion: number;
    state: 'ready_to_materialize' | 'held' | 'cancelled';
    reasonCode: string;
    evidenceSha256: string;
    actor: string;
    occurredAt: string;
  },
): EnrollmentFoundationState {
  const order = state.orders[input.orderKey];
  if (!order)
    throw new EnrollmentCommandError('order_not_found', 'order not found');
  assertVersion(order.version, input.expectedOrderVersion, 'order');
  if (order.state === 'cancelled')
    throw new EnrollmentCommandError(
      'order_terminal',
      'cancelled order cannot transition',
    );
  assertLowerSnake(input.reasonCode, 'reasonCode');
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  if (input.state === 'ready_to_materialize') {
    if (
      !order.offerKey ||
      !order.bundleKey ||
      !order.bundleVersion ||
      !['settled', 'active_terms', 'not_applicable'].includes(
        order.financialClassification,
      ) ||
      !Object.values(state.seats).some(
        (seat) =>
          seat.orderKey === input.orderKey &&
          ['assigned', 'accepted'].includes(seat.state),
      ) ||
      hasBlockingException(state, [input.orderKey])
    )
      throw new EnrollmentCommandError(
        'order_not_ready',
        'order does not satisfy ready-to-materialize prerequisites',
      );
  }
  const next = copy(state);
  next.orders[input.orderKey] = {
    ...order,
    state: input.state,
    version: order.version + 1,
    evidenceSha256: input.evidenceSha256,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  next.history.push(
    history({
      subjectType: 'order',
      subjectKey: input.orderKey,
      previousVersion: order.version,
      commandKey: 'correct_or_transfer',
      reasonCode: input.reasonCode,
      evidenceSha256: input.evidenceSha256,
      actor: input.actor,
      occurredAt: input.occurredAt,
    }),
  );
  return next;
}

export function createSeats(
  state: EnrollmentFoundationState,
  input: {
    orderKey: string;
    expectedOrderVersion: number;
    seatKeys: string[];
    evidenceSha256: string;
    actor: string;
    occurredAt: string;
  },
): EnrollmentFoundationState {
  const order = state.orders[input.orderKey];
  if (!order)
    throw new EnrollmentCommandError('order_not_found', 'order not found');
  assertVersion(order.version, input.expectedOrderVersion, 'order');
  if (
    input.seatKeys.length !== order.seatCount ||
    new Set(input.seatKeys).size !== input.seatKeys.length
  )
    throw new EnrollmentCommandError(
      'seat_count_mismatch',
      'seat keys must exactly match seat count',
    );
  if (
    Object.values(state.seats).some((seat) => seat.orderKey === input.orderKey)
  )
    throw new EnrollmentCommandError(
      'seats_already_created',
      'order already has seats',
    );
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  const next = copy(state);
  input.seatKeys.forEach((seatKey, index) => {
    assertKey(seatKey, 'seatKey', 200);
    if (next.seats[seatKey])
      throw new EnrollmentCommandError(
        'duplicate_seat_key',
        'seatKey already exists',
      );
    next.seats[seatKey] = {
      seatKey,
      orderKey: input.orderKey,
      seatNumber: index + 1,
      participantPartyId: null,
      participantEvidenceSha256: null,
      payerRelationship: 'unknown',
      state: 'unassigned',
      version: 0,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      updatedBy: input.actor,
    };
    next.history.push(
      history({
        subjectType: 'seat',
        subjectKey: seatKey,
        previousVersion: null,
        commandKey: 'create_seats',
        reasonCode: 'seat_created',
        evidenceSha256: input.evidenceSha256,
        actor: input.actor,
        occurredAt: input.occurredAt,
      }),
    );
  });
  next.orders[input.orderKey] = {
    ...order,
    version: order.version + 1,
    state: 'needs_participants',
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  return next;
}

export function assignParticipant(
  state: EnrollmentFoundationState,
  input: {
    seatKey: string;
    expectedSeatVersion: number;
    participantPartyId: number;
    participantEvidenceSha256: string;
    payerRelationship: Exclude<PayerRelationship, 'unknown'>;
    actor: string;
    occurredAt: string;
  },
): EnrollmentFoundationState {
  const seat = state.seats[input.seatKey];
  if (!seat)
    throw new EnrollmentCommandError('seat_not_found', 'seat not found');
  assertVersion(seat.version, input.expectedSeatVersion, 'seat');
  if (!['unassigned', 'assigned'].includes(seat.state))
    throw new EnrollmentCommandError(
      'seat_not_assignable',
      'seat is not assignable',
    );
  if (
    !Number.isInteger(input.participantPartyId) ||
    input.participantPartyId < 1
  )
    throw new EnrollmentCommandError(
      'participant_missing',
      'exact participant is required',
    );
  const payerRelationship = input.payerRelationship as PayerRelationship;
  if (
    !PAYER_RELATIONSHIPS.has(payerRelationship) ||
    payerRelationship === 'unknown'
  )
    throw new EnrollmentCommandError(
      'payer_relationship_missing',
      'explicit payer relationship is required',
    );
  assertSha(input.participantEvidenceSha256, 'participantEvidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  const next = copy(state);
  next.seats[input.seatKey] = {
    ...seat,
    participantPartyId: input.participantPartyId,
    participantEvidenceSha256: input.participantEvidenceSha256,
    payerRelationship: input.payerRelationship,
    state: 'assigned',
    version: seat.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  next.history.push(
    history({
      subjectType: 'seat',
      subjectKey: input.seatKey,
      previousVersion: seat.version,
      commandKey: 'assign_participant',
      reasonCode: 'participant_evidenced',
      evidenceSha256: input.participantEvidenceSha256,
      actor: input.actor,
      occurredAt: input.occurredAt,
    }),
  );
  return next;
}

export function recordFinancialAgreement(
  state: EnrollmentFoundationState,
  input: Omit<FinancialAgreement, 'createdAt' | 'updatedAt' | 'updatedBy'> & {
    expectedOrderVersion: number;
    actor: string;
    occurredAt: string;
  },
): EnrollmentFoundationState {
  const order = state.orders[input.orderKey];
  if (!order)
    throw new EnrollmentCommandError('order_not_found', 'order not found');
  assertVersion(order.version, input.expectedOrderVersion, 'order');
  assertKey(input.agreementKey, 'agreementKey', 200);
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  assertChoice(AGREEMENT_TYPES, input.agreementType, 'agreementType');
  assertChoice(AGREEMENT_STATES, input.state, 'agreementState');
  if (input.version !== 0)
    throw new EnrollmentCommandError(
      'invalid_initial_version',
      'agreement version must start at zero',
    );
  if (
    Object.values(state.agreements).some(
      (agreement) => agreement.orderKey === input.orderKey,
    )
  )
    throw new EnrollmentCommandError(
      'agreement_already_exists',
      'order already has an agreement',
    );
  const next = copy(state);
  const {
    expectedOrderVersion: _expected,
    actor: _actor,
    occurredAt: _at,
    ...agreement
  } = input;
  next.agreements[input.agreementKey] = {
    ...agreement,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  next.orders[input.orderKey] = {
    ...order,
    version: order.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  next.history.push(
    history({
      subjectType: 'agreement',
      subjectKey: input.agreementKey,
      previousVersion: null,
      commandKey: 'record_financial_agreement',
      reasonCode: 'agreement_recorded',
      evidenceSha256: input.evidenceSha256,
      actor: input.actor,
      occurredAt: input.occurredAt,
    }),
  );
  return next;
}

export function recordFinancialObligation(
  state: EnrollmentFoundationState,
  input: Omit<FinancialObligation, 'createdAt' | 'updatedAt' | 'updatedBy'> & {
    expectedAgreementVersion: number;
    actor: string;
    occurredAt: string;
  },
): EnrollmentFoundationState {
  const agreement = state.agreements[input.agreementKey];
  if (!agreement)
    throw new EnrollmentCommandError(
      'agreement_not_found',
      'agreement not found',
    );
  assertVersion(agreement.version, input.expectedAgreementVersion, 'agreement');
  assertKey(input.obligationKey, 'obligationKey', 200);
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  assertChoice(OBLIGATION_STATES, input.state, 'obligationState');
  if (input.version !== 0)
    throw new EnrollmentCommandError(
      'invalid_initial_version',
      'obligation version must start at zero',
    );
  if (!Number.isInteger(input.sequenceNumber) || input.sequenceNumber < 1)
    throw new EnrollmentCommandError(
      'invalid_sequence',
      'sequenceNumber must be positive',
    );
  if (input.dueAt !== null) assertTime(input.dueAt, 'dueAt');
  if (input.currency !== null && !/^[A-Z]{3}$/.test(input.currency))
    throw new EnrollmentCommandError(
      'invalid_currency',
      'currency must be three uppercase letters',
    );
  if (
    state.obligations[input.obligationKey] ||
    Object.values(state.obligations).some(
      (value) =>
        value.agreementKey === input.agreementKey &&
        value.sequenceNumber === input.sequenceNumber,
    )
  )
    throw new EnrollmentCommandError(
      'duplicate_obligation',
      'obligation already exists',
    );
  if ((input.amountMinor === null) !== (input.currency === null))
    throw new EnrollmentCommandError(
      'invalid_amount',
      'amount and currency must both be present or absent',
    );
  if (
    input.amountMinor !== null &&
    (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0)
  )
    throw new EnrollmentCommandError(
      'invalid_amount',
      'amountMinor must be a nonnegative safe integer',
    );
  const next = copy(state);
  const {
    expectedAgreementVersion: _expected,
    actor: _actor,
    occurredAt: _at,
    ...obligation
  } = input;
  next.obligations[input.obligationKey] = {
    ...obligation,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  next.agreements[input.agreementKey] = {
    ...agreement,
    version: agreement.version + 1,
  };
  next.history.push(
    history({
      subjectType: 'obligation',
      subjectKey: input.obligationKey,
      previousVersion: null,
      commandKey: 'record_financial_obligation',
      reasonCode: 'obligation_recorded',
      evidenceSha256: input.evidenceSha256,
      actor: input.actor,
      occurredAt: input.occurredAt,
    }),
  );
  return next;
}

export function transitionFinancialObligation(
  state: EnrollmentFoundationState,
  input: {
    obligationKey: string;
    expectedVersion: number;
    state: FinancialObligation['state'];
    evidenceSha256: string;
    actor: string;
    occurredAt: string;
  },
): EnrollmentFoundationState {
  const obligation = state.obligations[input.obligationKey];
  if (!obligation)
    throw new EnrollmentCommandError(
      'obligation_not_found',
      'obligation not found',
    );
  assertVersion(obligation.version, input.expectedVersion, 'obligation');
  assertChoice(OBLIGATION_STATES, input.state, 'obligationState');
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  const next = copy(state);
  next.obligations[input.obligationKey] = {
    ...obligation,
    state: input.state,
    version: obligation.version + 1,
    evidenceSha256: input.evidenceSha256,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  next.history.push(
    history({
      subjectType: 'obligation',
      subjectKey: input.obligationKey,
      previousVersion: obligation.version,
      commandKey: 'correct_or_transfer',
      reasonCode: `obligation_${input.state}`,
      evidenceSha256: input.evidenceSha256,
      actor: input.actor,
      occurredAt: input.occurredAt,
    }),
  );
  return next;
}

function hasBlockingException(
  state: EnrollmentFoundationState,
  keys: string[],
): boolean {
  return Object.values(state.exceptions).some(
    (item) =>
      keys.includes(item.subjectKey) &&
      ['open', 'acknowledged'].includes(item.state),
  );
}

export function materializeEnrollment(
  state: EnrollmentFoundationState,
  input: {
    orderKey: string;
    expectedOrderVersion: number;
    seatKey: string;
    expectedSeatVersion: number;
    enrollmentKey: string;
    catalogRevision: number;
    enrollmentState: 'pending' | 'active';
    effectiveAt: string | null;
    materializationSha256: string;
    components: Array<{
      entitlementKey: string;
      componentKey: string;
      state: ComponentEntitlement['state'];
    }>;
    actor: string;
    occurredAt: string;
  },
): EnrollmentFoundationState {
  const order = state.orders[input.orderKey];
  const seat = state.seats[input.seatKey];
  if (!order || !seat || seat.orderKey !== input.orderKey)
    throw new EnrollmentCommandError(
      'order_or_seat_not_found',
      'order/seat binding not found',
    );
  assertVersion(order.version, input.expectedOrderVersion, 'order');
  assertVersion(seat.version, input.expectedSeatVersion, 'seat');
  assertKey(input.enrollmentKey, 'enrollmentKey', 200);
  if (!Number.isInteger(input.catalogRevision) || input.catalogRevision < 1)
    throw new EnrollmentCommandError(
      'invalid_catalog_revision',
      'catalogRevision must be positive',
    );
  if (!['pending', 'active'].includes(input.enrollmentState))
    throw new EnrollmentCommandError(
      'invalid_choice',
      'enrollmentState is invalid',
    );
  if (!order.offerKey || !order.bundleKey || !order.bundleVersion)
    throw new EnrollmentCommandError(
      'offer_unknown',
      'offer and bundle version are required',
    );
  if (['held', 'cancelled'].includes(order.state))
    throw new EnrollmentCommandError(
      'order_not_materializable',
      'held or cancelled order cannot materialize',
    );
  if (
    !seat.participantPartyId ||
    !seat.participantEvidenceSha256 ||
    seat.payerRelationship === 'unknown'
  )
    throw new EnrollmentCommandError(
      'participant_missing',
      'exact participant and payer relationship are required',
    );
  if (
    (seat.payerRelationship === 'self_purchase_explicit' &&
      order.payerPartyId !== seat.participantPartyId) ||
    (['separate_payer', 'sponsor'].includes(seat.payerRelationship) &&
      (order.payerPartyId === null ||
        order.payerPartyId === seat.participantPartyId)) ||
    (seat.payerRelationship === 'not_applicable' && order.payerPartyId !== null)
  )
    throw new EnrollmentCommandError(
      'payer_relationship_conflict',
      'payer and participant do not match the explicit relationship',
    );
  if (
    !['settled', 'active_terms', 'not_applicable'].includes(
      order.financialClassification,
    )
  )
    throw new EnrollmentCommandError(
      'financial_terms_unknown',
      'financial terms do not permit materialization',
    );
  if (!['assigned', 'accepted'].includes(seat.state))
    throw new EnrollmentCommandError(
      'seat_not_materializable',
      'seat is not materializable',
    );
  if (hasBlockingException(state, [order.orderKey, seat.seatKey]))
    throw new EnrollmentCommandError(
      'blocking_exception',
      'blocking exception exists',
    );
  if (
    Object.values(state.enrollments).some(
      (value) =>
        value.seatKey === input.seatKey &&
        ['pending', 'active', 'held'].includes(value.state),
    )
  )
    throw new EnrollmentCommandError(
      'seat_already_materialized',
      'seat already has a current enrollment',
    );
  if (state.enrollments[input.enrollmentKey])
    throw new EnrollmentCommandError(
      'duplicate_enrollment_key',
      'enrollmentKey already exists',
    );
  if (input.enrollmentState === 'pending' && !input.effectiveAt)
    throw new EnrollmentCommandError(
      'pending_requires_effective_at',
      'pending enrollment requires effectiveAt',
    );
  const componentKeys = input.components.map((value) => value.componentKey);
  const entitlementKeys = input.components.map((value) => value.entitlementKey);
  if (
    input.components.length === 0 ||
    new Set(componentKeys).size !== componentKeys.length ||
    new Set(entitlementKeys).size !== entitlementKeys.length
  )
    throw new EnrollmentCommandError(
      'invalid_entitlements',
      'components must be nonempty and unique',
    );
  assertSha(input.materializationSha256, 'materializationSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  const next = copy(state);
  next.enrollments[input.enrollmentKey] = {
    enrollmentKey: input.enrollmentKey,
    orderKey: input.orderKey,
    seatKey: input.seatKey,
    participantPartyId: seat.participantPartyId,
    offerKey: order.offerKey,
    bundleKey: order.bundleKey,
    bundleVersion: order.bundleVersion,
    catalogRevision: input.catalogRevision,
    state: input.enrollmentState,
    version: 0,
    effectiveAt: input.effectiveAt,
    endedAt: null,
    materializationSha256: input.materializationSha256,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  for (const component of input.components) {
    assertKey(component.entitlementKey, 'entitlementKey', 250);
    assertKey(component.componentKey, 'componentKey', 200);
    assertChoice(ENTITLEMENT_STATES, component.state, 'entitlementState');
    next.entitlements[component.entitlementKey] = {
      ...component,
      enrollmentKey: input.enrollmentKey,
      grantEpisode: 1,
      version: 0,
      evidenceSha256: input.materializationSha256,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
      updatedBy: input.actor,
    };
  }
  next.seats[input.seatKey] = {
    ...seat,
    state: 'materialized',
    version: seat.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  const orderSeats = Object.values(next.seats).filter(
    (value) => value.orderKey === input.orderKey,
  );
  const materialized = orderSeats.filter(
    (value) => value.state === 'materialized',
  ).length;
  next.orders[input.orderKey] = {
    ...order,
    state:
      materialized === order.seatCount
        ? 'materialized'
        : 'partially_materialized',
    version: order.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  next.history.push(
    history({
      subjectType: 'enrollment',
      subjectKey: input.enrollmentKey,
      previousVersion: null,
      commandKey: 'materialize_enrollment',
      reasonCode: 'all_gates_passed',
      evidenceSha256: input.materializationSha256,
      actor: input.actor,
      occurredAt: input.occurredAt,
    }),
  );
  return next;
}

export function assignClass(
  state: EnrollmentFoundationState,
  input: Omit<ClassAssignment, 'createdAt' | 'updatedAt' | 'updatedBy'> & {
    expectedEnrollmentVersion: number;
    actor: string;
    occurredAt: string;
  },
): EnrollmentFoundationState {
  const enrollment = state.enrollments[input.enrollmentKey];
  const entitlement = state.entitlements[input.entitlementKey];
  if (
    !enrollment ||
    !entitlement ||
    entitlement.enrollmentKey !== input.enrollmentKey
  )
    throw new EnrollmentCommandError(
      'entitlement_conflict',
      'matching enrollment entitlement is required',
    );
  assertVersion(
    enrollment.version,
    input.expectedEnrollmentVersion,
    'enrollment',
  );
  if (!['pending', 'active'].includes(enrollment.state))
    throw new EnrollmentCommandError(
      'enrollment_not_assignable',
      'enrollment is not assignable',
    );
  if (state.assignments[input.assignmentKey])
    throw new EnrollmentCommandError(
      'duplicate_assignment',
      'assignmentKey already exists',
    );
  if (
    Object.values(state.assignments).some(
      (value) =>
        value.entitlementKey === input.entitlementKey &&
        value.deliveryBlockKey === input.deliveryBlockKey &&
        !['transferred', 'cancelled'].includes(value.state),
    )
  )
    throw new EnrollmentCommandError(
      'duplicate_assignment',
      'entitlement is already assigned to this delivery block',
    );
  assertKey(input.assignmentKey, 'assignmentKey', 250);
  assertKey(input.deliveryBlockKey, 'deliveryBlockKey', 250);
  assertChoice(ASSIGNMENT_STATES, input.state, 'assignmentState');
  if (input.version !== 0)
    throw new EnrollmentCommandError(
      'invalid_initial_version',
      'assignment version must start at zero',
    );
  assertSha(input.scheduleEvidenceSha256, 'scheduleEvidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  const next = copy(state);
  const {
    expectedEnrollmentVersion: _expected,
    actor: _actor,
    occurredAt: _at,
    ...assignment
  } = input;
  next.assignments[input.assignmentKey] = {
    ...assignment,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  next.enrollments[input.enrollmentKey] = {
    ...enrollment,
    version: enrollment.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  next.history.push(
    history({
      subjectType: 'assignment',
      subjectKey: input.assignmentKey,
      previousVersion: null,
      commandKey: 'assign_class',
      reasonCode: 'schedule_evidenced',
      evidenceSha256: input.scheduleEvidenceSha256,
      actor: input.actor,
      occurredAt: input.occurredAt,
    }),
  );
  return next;
}

export function requestProjection(
  state: EnrollmentFoundationState,
  input: Omit<ProjectionOutboxItem, 'createdAt' | 'updatedAt'> & {
    actor: string;
    occurredAt: string;
  },
): EnrollmentFoundationState {
  assertKey(input.projectionKey, 'projectionKey', 500);
  assertBoundedText(input.subjectKey, 'subjectKey', 300);
  assertChoice(PROJECTION_TARGETS, input.target, 'projectionTarget');
  assertChoice(
    PROJECTION_SUBJECT_TYPES,
    input.subjectType,
    'projectionSubjectType',
  );
  if (!Number.isInteger(input.subjectVersion) || input.subjectVersion < 0)
    throw new EnrollmentCommandError(
      'invalid_subject_version',
      'subjectVersion must be nonnegative',
    );
  const existing = state.projections[input.projectionKey];
  if (existing) {
    const same =
      existing.target === input.target &&
      existing.subjectType === input.subjectType &&
      existing.subjectKey === input.subjectKey &&
      existing.subjectVersion === input.subjectVersion &&
      existing.payloadSha256 === input.payloadSha256 &&
      existing.expectedReadbackSha256 === input.expectedReadbackSha256;
    if (same) return state;
    throw new EnrollmentCommandError(
      'projection_key_conflict',
      'projection key has different material facts',
    );
  }
  assertSha(input.payloadSha256, 'payloadSha256');
  assertSha(input.expectedReadbackSha256, 'expectedReadbackSha256');
  assertBoundedJson(input.payload, 'projection payload');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  const next = copy(state);
  const { actor: _actor, occurredAt: _at, ...projection } = input;
  next.projections[input.projectionKey] = {
    ...projection,
    state: 'queued',
    version: 0,
    createdAt: input.occurredAt,
    updatedAt: input.occurredAt,
  };
  next.history.push(
    history({
      subjectType: 'projection',
      subjectKey: input.projectionKey,
      previousVersion: null,
      commandKey: 'request_projection',
      reasonCode: 'outbox_queued',
      evidenceSha256: input.payloadSha256,
      actor: input.actor,
      occurredAt: input.occurredAt,
    }),
  );
  return next;
}

export function recordProjectionReadback(
  state: EnrollmentFoundationState,
  input: {
    projectionKey: string;
    expectedProjectionVersion: number;
    receiptKey: string;
    subjectVersion: number;
    readbackSha256: string;
    actor: string;
    occurredAt: string;
    recordedAt: string;
    ambiguousAcceptance?: boolean;
  },
): EnrollmentFoundationState {
  const existingReceipt = state.receipts[input.receiptKey];
  if (existingReceipt) {
    const resultCode = input.ambiguousAcceptance
      ? 'ambiguous_acceptance'
      : input.readbackSha256 ===
          state.projections[input.projectionKey]?.expectedReadbackSha256
        ? 'exact_readback'
        : 'readback_mismatch';
    if (
      existingReceipt.projectionKey === input.projectionKey &&
      existingReceipt.subjectVersion === input.subjectVersion &&
      existingReceipt.evidenceSha256 === input.readbackSha256 &&
      existingReceipt.resultCode === resultCode &&
      existingReceipt.actor === input.actor &&
      existingReceipt.occurredAt === input.occurredAt &&
      existingReceipt.recordedAt === input.recordedAt
    )
      return state;
    throw new EnrollmentCommandError(
      'receipt_key_conflict',
      'receipt key has different material facts',
    );
  }
  const projection = state.projections[input.projectionKey];
  if (!projection)
    throw new EnrollmentCommandError(
      'projection_not_found',
      'projection not found',
    );
  assertVersion(
    projection.version,
    input.expectedProjectionVersion,
    'projection',
  );
  if (input.subjectVersion !== projection.subjectVersion)
    throw new EnrollmentCommandError(
      'projection_subject_version_mismatch',
      'subject version mismatch',
    );
  assertKey(input.receiptKey, 'receiptKey', 500);
  assertSha(input.readbackSha256, 'readbackSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  assertTime(input.recordedAt, 'recordedAt');
  const verified =
    !input.ambiguousAcceptance &&
    input.readbackSha256 === projection.expectedReadbackSha256;
  const next = copy(state);
  next.receipts[input.receiptKey] = {
    receiptKey: input.receiptKey,
    projectionKey: input.projectionKey,
    subjectVersion: input.subjectVersion,
    stage: 'readback',
    outcome: verified ? 'verified' : 'held',
    resultCode: verified
      ? 'exact_readback'
      : input.ambiguousAcceptance
        ? 'ambiguous_acceptance'
        : 'readback_mismatch',
    evidenceSha256: input.readbackSha256,
    actor: input.actor,
    occurredAt: input.occurredAt,
    recordedAt: input.recordedAt,
  };
  next.projections[input.projectionKey] = {
    ...projection,
    state: verified ? 'verified' : 'held',
    version: projection.version + 1,
    updatedAt: input.recordedAt,
  };
  next.history.push(
    history({
      subjectType: 'projection',
      subjectKey: input.projectionKey,
      previousVersion: projection.version,
      commandKey: 'record_projection_readback',
      reasonCode: verified ? 'exact_readback' : 'projection_held',
      evidenceSha256: input.readbackSha256,
      actor: input.actor,
      occurredAt: input.occurredAt,
    }),
  );
  return next;
}

export function openEnrollmentException(
  state: EnrollmentFoundationState,
  input: Omit<
    EnrollmentException,
    | 'state'
    | 'version'
    | 'resolutionSha256'
    | 'firstSeenAt'
    | 'lastSeenAt'
    | 'resolvedAt'
    | 'occurrenceCount'
    | 'updatedBy'
  > & { actor: string; occurredAt: string },
): EnrollmentFoundationState {
  assertKey(input.exceptionKey, 'exceptionKey', 500);
  assertLowerSnake(input.reasonCode, 'reasonCode');
  assertBoundedText(input.subjectKey, 'subjectKey', 300);
  assertChoice(
    EXCEPTION_SUBJECT_TYPES,
    input.subjectType,
    'exceptionSubjectType',
  );
  assertChoice(EXCEPTION_SEVERITIES, input.severity, 'exceptionSeverity');
  assertChoice(EXCEPTION_OWNER_ROLES, input.ownerRole, 'exceptionOwnerRole');
  assertSha(input.evidenceSha256, 'evidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  assertTime(input.reviewAt, 'reviewAt');
  if (
    !subjectExists(
      state,
      input.subjectType as EnrollmentEvidence['subjectType'],
      input.subjectKey,
    )
  )
    throw new EnrollmentCommandError(
      'exception_subject_not_found',
      'exception subject does not exist',
    );
  const existing = state.exceptions[input.exceptionKey];
  if (existing) {
    if (!['open', 'acknowledged'].includes(existing.state))
      throw new EnrollmentCommandError(
        'exception_closed',
        'closed exception requires a new exception key',
      );
    const same =
      existing.subjectType === input.subjectType &&
      existing.subjectKey === input.subjectKey &&
      existing.reasonCode === input.reasonCode &&
      existing.severity === input.severity &&
      existing.ownerRole === input.ownerRole &&
      existing.evidenceSha256 === input.evidenceSha256 &&
      existing.reviewAt === input.reviewAt;
    if (!same)
      throw new EnrollmentCommandError(
        'exception_key_conflict',
        'exception key has different material facts',
      );
    if (Date.parse(input.occurredAt) < Date.parse(existing.lastSeenAt))
      throw new EnrollmentCommandError(
        'exception_time_regression',
        'exception observation cannot move backward',
      );
    if (existing.lastSeenAt === input.occurredAt) return state;
    const next = copy(state);
    next.exceptions[input.exceptionKey] = {
      ...existing,
      version: existing.version + 1,
      occurrenceCount: existing.occurrenceCount + 1,
      lastSeenAt: input.occurredAt,
      updatedBy: input.actor,
    };
    next.history.push(
      history({
        subjectType: 'exception',
        subjectKey: input.exceptionKey,
        previousVersion: existing.version,
        commandKey: 'open_exception',
        reasonCode: 're_observed',
        evidenceSha256: input.evidenceSha256,
        actor: input.actor,
        occurredAt: input.occurredAt,
      }),
    );
    return next;
  }
  const next = copy(state);
  const { actor: _actor, occurredAt: _at, ...exception } = input;
  next.exceptions[input.exceptionKey] = {
    ...exception,
    state: 'open',
    version: 0,
    resolutionSha256: null,
    firstSeenAt: input.occurredAt,
    lastSeenAt: input.occurredAt,
    resolvedAt: null,
    occurrenceCount: 1,
    updatedBy: input.actor,
  };
  next.history.push(
    history({
      subjectType: 'exception',
      subjectKey: input.exceptionKey,
      previousVersion: null,
      commandKey: 'open_exception',
      reasonCode: input.reasonCode,
      evidenceSha256: input.evidenceSha256,
      actor: input.actor,
      occurredAt: input.occurredAt,
    }),
  );
  return next;
}

export function resolveEnrollmentException(
  state: EnrollmentFoundationState,
  input: {
    exceptionKey: string;
    expectedVersion: number;
    resolution: 'resolved' | 'accepted_no_action' | 'superseded';
    resolutionSha256: string;
    actor: string;
    occurredAt: string;
  },
): EnrollmentFoundationState {
  const exception = state.exceptions[input.exceptionKey];
  if (!exception)
    throw new EnrollmentCommandError(
      'exception_not_found',
      'exception not found',
    );
  assertVersion(exception.version, input.expectedVersion, 'exception');
  assertChoice(EXCEPTION_RESOLUTIONS, input.resolution, 'exceptionResolution');
  if (!['open', 'acknowledged'].includes(exception.state))
    throw new EnrollmentCommandError(
      'exception_closed',
      'exception is already terminal',
    );
  assertSha(input.resolutionSha256, 'resolutionSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  if (Date.parse(input.occurredAt) < Date.parse(exception.lastSeenAt))
    throw new EnrollmentCommandError(
      'exception_time_regression',
      'resolution cannot precede last observation',
    );
  const next = copy(state);
  next.exceptions[input.exceptionKey] = {
    ...exception,
    state: input.resolution,
    version: exception.version + 1,
    resolutionSha256: input.resolutionSha256,
    resolvedAt: input.occurredAt,
    lastSeenAt: input.occurredAt,
    updatedBy: input.actor,
  };
  next.history.push(
    history({
      subjectType: 'exception',
      subjectKey: input.exceptionKey,
      previousVersion: exception.version,
      commandKey: 'resolve_exception',
      reasonCode: input.resolution,
      evidenceSha256: input.resolutionSha256,
      actor: input.actor,
      occurredAt: input.occurredAt,
    }),
  );
  return next;
}

export function transferParticipant(
  state: EnrollmentFoundationState,
  input: {
    seatKey: string;
    expectedSeatVersion: number;
    currentEnrollmentKey?: string;
    expectedEnrollmentVersion?: number;
    newParticipantPartyId: number;
    participantEvidenceSha256: string;
    payerRelationship: Exclude<PayerRelationship, 'unknown'>;
    ownerDecisionSha256?: string;
    actor: string;
    occurredAt: string;
  },
): EnrollmentFoundationState {
  const seat = state.seats[input.seatKey];
  if (!seat)
    throw new EnrollmentCommandError('seat_not_found', 'seat not found');
  assertVersion(seat.version, input.expectedSeatVersion, 'seat');
  if (
    seat.participantPartyId === null ||
    !['assigned', 'accepted', 'materialized'].includes(seat.state)
  )
    throw new EnrollmentCommandError(
      'seat_not_transferable',
      'transfer requires a current prior assignment',
    );
  if (
    !Number.isInteger(input.newParticipantPartyId) ||
    input.newParticipantPartyId < 1
  )
    throw new EnrollmentCommandError(
      'participant_missing',
      'new participant is invalid',
    );
  const payerRelationship = input.payerRelationship as PayerRelationship;
  if (
    !PAYER_RELATIONSHIPS.has(payerRelationship) ||
    payerRelationship === 'unknown'
  )
    throw new EnrollmentCommandError(
      'payer_relationship_missing',
      'explicit payer relationship is required',
    );
  assertSha(input.participantEvidenceSha256, 'participantEvidenceSha256');
  assertActor(input.actor);
  assertTime(input.occurredAt, 'occurredAt');
  const order = state.orders[seat.orderKey];
  if (!order)
    throw new EnrollmentCommandError('order_not_found', 'seat order not found');
  if (
    (payerRelationship === 'self_purchase_explicit' &&
      order.payerPartyId !== input.newParticipantPartyId) ||
    (['separate_payer', 'sponsor'].includes(payerRelationship) &&
      (order.payerPartyId === null ||
        order.payerPartyId === input.newParticipantPartyId)) ||
    (payerRelationship === 'not_applicable' && order.payerPartyId !== null)
  )
    throw new EnrollmentCommandError(
      'payer_relationship_conflict',
      'payer and new participant do not match the explicit relationship',
    );
  const current = Object.values(state.enrollments).find(
    (value) =>
      value.seatKey === input.seatKey &&
      ['pending', 'active', 'held'].includes(value.state),
  );
  if (current) {
    if (!input.ownerDecisionSha256)
      throw new EnrollmentCommandError(
        'owner_decision_required',
        'post-materialization transfer requires owner decision',
      );
    if (
      input.currentEnrollmentKey !== current.enrollmentKey ||
      input.expectedEnrollmentVersion === undefined
    )
      throw new EnrollmentCommandError(
        'enrollment_version_required',
        'current enrollment binding is required',
      );
    assertVersion(
      current.version,
      input.expectedEnrollmentVersion,
      'enrollment',
    );
    assertSha(input.ownerDecisionSha256, 'ownerDecisionSha256');
  }
  const next = copy(state);
  if (current) {
    next.enrollments[current.enrollmentKey] = {
      ...current,
      state: 'withdrawn',
      version: current.version + 1,
      endedAt: input.occurredAt,
      updatedAt: input.occurredAt,
      updatedBy: input.actor,
    };
    next.history.push(
      history({
        subjectType: 'enrollment',
        subjectKey: current.enrollmentKey,
        previousVersion: current.version,
        commandKey: 'correct_or_transfer',
        reasonCode: 'withdrawn_by_transfer',
        evidenceSha256: input.ownerDecisionSha256!,
        actor: input.actor,
        occurredAt: input.occurredAt,
      }),
    );
  }
  next.seats[input.seatKey] = {
    ...seat,
    participantPartyId: input.newParticipantPartyId,
    participantEvidenceSha256: input.participantEvidenceSha256,
    payerRelationship,
    state: 'assigned',
    version: seat.version + 1,
    updatedAt: input.occurredAt,
    updatedBy: input.actor,
  };
  for (const projection of Object.values(next.projections))
    if (
      projection.subjectKey === current?.enrollmentKey &&
      projection.state !== 'superseded'
    ) {
      const previousVersion = projection.version;
      projection.state = 'superseded';
      projection.version += 1;
      projection.updatedAt = input.occurredAt;
      next.history.push(
        history({
          subjectType: 'projection',
          subjectKey: projection.projectionKey,
          previousVersion,
          commandKey: 'correct_or_transfer',
          reasonCode: 'superseded_by_transfer',
          evidenceSha256:
            input.ownerDecisionSha256 ?? input.participantEvidenceSha256,
          actor: input.actor,
          occurredAt: input.occurredAt,
        }),
      );
    }
  next.history.push(
    history({
      subjectType: 'seat',
      subjectKey: input.seatKey,
      previousVersion: seat.version,
      commandKey: 'correct_or_transfer',
      reasonCode: current
        ? 'post_activation_transfer'
        : 'pre_activation_reassignment',
      evidenceSha256:
        input.ownerDecisionSha256 ?? input.participantEvidenceSha256,
      actor: input.actor,
      occurredAt: input.occurredAt,
    }),
  );
  return next;
}
