/**
 * Pure Company OS follow-up policy.
 *
 * This module decides whether one exact, privacy-minimized case is waiting,
 * ready, blocked, or terminal. It performs no source reads, persistence,
 * drafting, scheduling, Slack posting, approval, or customer action.
 */

import { createHash } from 'crypto';

export const FOLLOWUP_POLICY_VERSION = '2026-08-21.3';
export const FOLLOWUP_TIME_ZONE = 'America/Chicago';

export type FollowupLane =
  | 'sales_conversation'
  | 'proposal_signature'
  | 'receivable';

export type FollowupDisposition =
  | 'waiting'
  | 'ready'
  | 'blocked'
  | 'completed'
  | 'cancelled';

export type FollowupNextAction =
  | 'customer_draft'
  | 'internal_review'
  | 'close_review'
  | 'escalate'
  | 'none';

interface CommonCase {
  lane: FollowupLane;
  sourceKey: string;
  observedAt: string;
  /** Every required source reader completed for this observation. */
  sourceEvidenceComplete: boolean;
  /** Source identities cannot be bound to exactly one durable case. */
  sourceIdentityConflict: boolean;
  pendingAction: boolean;
  uncertainDelivery: boolean;
  suppressed: boolean;
}

export interface SalesConversationCase extends CommonCase {
  lane: 'sales_conversation';
  partyId: string;
  pipelineEntryId: string;
  pipelineStage: string;
  threadId: string | null;
  threadBindingVerified: boolean;
  lastOutboundAt: string | null;
  lastInboundAt: string | null;
  confirmedAttempts: number;
  lastConfirmedAttemptAt: string | null;
  hasOpenProposal: boolean;
  /** Explicit decision on this exact follow-up case; silence is not decline. */
  operatorDecision: 'none' | 'declined';
}

export interface ProposalSignatureCase extends CommonCase {
  lane: 'proposal_signature';
  partyId: string | null;
  proposalStatus: string;
  pendingAt: string | null;
  approvedAt: string | null;
  autoInvoiceId: string | null;
  projectId: string | null;
  recipientResolved: boolean;
  ownerResolved: boolean;
  publicLinkVerified: boolean;
  confirmedAttempts: number;
  lastConfirmedAttemptAt: string | null;
  lastPresentationAt: string | null;
}

export interface ReceivableCase extends CommonCase {
  lane: 'receivable';
  partyId: string | null;
  invoiceStatus: string;
  dueAt: string | null;
  outstandingAmount: number | null;
  currency: string | null;
  paymentReconciled: boolean;
  collectionApproved: boolean;
  specialHandling: boolean;
  recipientResolved: boolean;
  ownerResolved: boolean;
  confirmedAttempts: number;
  lastConfirmedAttemptAt: string | null;
}

export type FollowupCase =
  | SalesConversationCase
  | ProposalSignatureCase
  | ReceivableCase;

export interface FollowupDecision {
  policyVersion: string;
  lane: FollowupLane;
  disposition: FollowupDisposition;
  reason: string;
  nextAction: FollowupNextAction;
  sequence: number | null;
  nextEligibleBusinessDate: string | null;
  ownerGroup: 'sales' | 'contador';
}

const BUSINESS_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: FOLLOWUP_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const OPAQUE_SOURCE_KEY_RE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,499}$/;
const POSITIVE_ID_RE = /^[1-9][0-9]*$/;

function parseTimestamp(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function businessDate(value: string | Date): string | null {
  const date = value instanceof Date ? value : parseTimestamp(value);
  if (!date) return null;
  const parts = BUSINESS_DATE_FORMATTER.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes): string | undefined =>
    parts.find((part) => part.type === type)?.value;
  const year = get('year');
  const month = get('month');
  const day = get('day');
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function parseBusinessDate(value: string): Date {
  return new Date(`${value}T12:00:00.000Z`);
}

export function addBusinessDays(
  timestamp: string,
  days: number,
): string | null {
  const start = businessDate(timestamp);
  if (!start || !Number.isInteger(days) || days < 0) return null;
  const cursor = parseBusinessDate(start);
  let remaining = days;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining--;
  }
  return cursor.toISOString().slice(0, 10);
}

function dateReached(observedAt: string, eligibleDate: string): boolean {
  const observedDate = businessDate(observedAt);
  return observedDate !== null && observedDate >= eligibleDate;
}

function ownerGroup(lane: FollowupLane): 'sales' | 'contador' {
  return lane === 'receivable' ? 'contador' : 'sales';
}

function decision(
  input: FollowupCase,
  disposition: FollowupDisposition,
  reason: string,
  nextAction: FollowupNextAction = 'none',
  sequence: number | null = null,
  nextEligibleBusinessDate: string | null = null,
): FollowupDecision {
  return {
    policyVersion: FOLLOWUP_POLICY_VERSION,
    lane: input.lane,
    disposition,
    reason,
    nextAction,
    sequence,
    nextEligibleBusinessDate,
    ownerGroup: ownerGroup(input.lane),
  };
}

function identityGate(input: FollowupCase): FollowupDecision | null {
  if (!businessDate(input.observedAt)) {
    return decision(input, 'blocked', 'invalid_observed_at');
  }
  if (
    !OPAQUE_SOURCE_KEY_RE.test(input.sourceKey) ||
    input.sourceKey.includes('://')
  ) {
    return decision(input, 'blocked', 'invalid_source_key');
  }
  if (!input.sourceEvidenceComplete) {
    return decision(input, 'blocked', 'source_evidence_unavailable');
  }
  if (input.sourceIdentityConflict) {
    return decision(input, 'blocked', 'source_identity_conflict');
  }
  return null;
}

function actionSafetyGate(input: FollowupCase): FollowupDecision | null {
  if (input.suppressed) {
    return decision(input, 'cancelled', 'suppressed');
  }
  if (input.uncertainDelivery) {
    return decision(input, 'blocked', 'delivery_uncertain');
  }
  return null;
}

function dueDecision(
  input: FollowupCase,
  anchor: string | null,
  gapBusinessDays: number,
  reason: string,
  nextAction: FollowupNextAction,
  sequence: number | null,
): FollowupDecision {
  const eligibleDate = anchor ? addBusinessDays(anchor, gapBusinessDays) : null;
  if (!eligibleDate) {
    return decision(input, 'blocked', 'missing_or_invalid_cadence_anchor');
  }
  if (!dateReached(input.observedAt, eligibleDate)) {
    return decision(
      input,
      'waiting',
      'cadence_not_due',
      'none',
      sequence,
      eligibleDate,
    );
  }
  return decision(input, 'ready', reason, nextAction, sequence, eligibleDate);
}

function evaluateSales(input: SalesConversationCase): FollowupDecision {
  if (
    !POSITIVE_ID_RE.test(input.partyId) ||
    !POSITIVE_ID_RE.test(input.pipelineEntryId)
  ) {
    return decision(input, 'blocked', 'invalid_business_identity');
  }
  if (
    ![
      'new',
      'qualifying',
      'proposal',
      'negotiating',
      'won',
      'lost',
      'nurture',
      'paused',
    ].includes(input.pipelineStage)
  ) {
    return decision(input, 'blocked', 'unknown_pipeline_stage');
  }
  if (['won', 'lost', 'nurture'].includes(input.pipelineStage)) {
    return decision(input, 'completed', `pipeline_${input.pipelineStage}`);
  }
  if (input.pipelineStage === 'paused') {
    return decision(input, 'waiting', 'pipeline_paused');
  }
  if (input.hasOpenProposal) {
    return decision(input, 'completed', 'superseded_by_open_proposal');
  }
  if (!['none', 'declined'].includes(input.operatorDecision)) {
    return decision(input, 'blocked', 'unknown_operator_decision');
  }
  if (input.operatorDecision === 'declined') {
    return decision(input, 'cancelled', 'operator_declined_followup');
  }
  const safetyGate = actionSafetyGate(input);
  if (safetyGate) return safetyGate;
  if (input.pendingAction) {
    return decision(input, 'waiting', 'action_or_approval_pending');
  }
  if (!input.threadBindingVerified) {
    return decision(input, 'blocked', 'thread_identity_unverified');
  }
  if (!input.threadId) {
    return decision(input, 'blocked', 'missing_exact_thread');
  }
  const lastOutbound = parseTimestamp(input.lastOutboundAt);
  if (!lastOutbound) {
    return decision(input, 'blocked', 'missing_confirmed_outbound');
  }
  const lastInbound = parseTimestamp(input.lastInboundAt);
  if (input.lastInboundAt && !lastInbound) {
    return decision(input, 'blocked', 'invalid_inbound_timestamp');
  }
  if (lastInbound && lastInbound > lastOutbound) {
    return decision(input, 'completed', 'newer_inbound_requires_response');
  }
  if (
    !Number.isInteger(input.confirmedAttempts) ||
    input.confirmedAttempts < 0 ||
    input.confirmedAttempts > 100
  ) {
    return decision(input, 'blocked', 'invalid_attempt_count');
  }
  if (input.confirmedAttempts === 0) {
    return dueDecision(
      input,
      input.lastOutboundAt,
      3,
      'sales_followup_1_due',
      'customer_draft',
      1,
    );
  }
  if (!input.lastConfirmedAttemptAt) {
    return decision(input, 'blocked', 'missing_confirmed_attempt_receipt');
  }
  if (input.confirmedAttempts === 1) {
    return dueDecision(
      input,
      input.lastConfirmedAttemptAt,
      5,
      'sales_followup_2_due',
      'customer_draft',
      2,
    );
  }
  return dueDecision(
    input,
    input.lastConfirmedAttemptAt,
    10,
    'sales_close_review_due',
    'close_review',
    null,
  );
}

function laterBusinessDate(left: string, right: string): string {
  return left >= right ? left : right;
}

function evaluateProposal(input: ProposalSignatureCase): FollowupDecision {
  if (
    input.approvedAt ||
    input.autoInvoiceId ||
    input.projectId ||
    input.proposalStatus === 'approved'
  ) {
    return decision(input, 'completed', 'proposal_converted');
  }
  if (['declined', 'cancelled'].includes(input.proposalStatus)) {
    return decision(input, 'completed', `proposal_${input.proposalStatus}`);
  }
  if (
    !['draft', 'pending', 'approved', 'declined', 'cancelled'].includes(
      input.proposalStatus,
    )
  ) {
    return decision(input, 'blocked', 'unknown_proposal_status');
  }
  const safetyGate = actionSafetyGate(input);
  if (safetyGate) return safetyGate;
  if (input.proposalStatus !== 'pending') {
    return decision(input, 'waiting', 'proposal_not_issued');
  }
  if (input.pendingAction) {
    return decision(input, 'waiting', 'action_or_approval_pending');
  }
  if (!input.ownerResolved) {
    return decision(input, 'blocked', 'proposal_owner_unresolved');
  }
  if (!input.recipientResolved) {
    return decision(input, 'blocked', 'proposal_recipient_unresolved');
  }
  if (!input.publicLinkVerified) {
    return decision(input, 'blocked', 'proposal_link_unverified');
  }
  if (
    !Number.isInteger(input.confirmedAttempts) ||
    input.confirmedAttempts < 0 ||
    input.confirmedAttempts > 100
  ) {
    return decision(input, 'blocked', 'invalid_attempt_count');
  }
  if (input.confirmedAttempts >= 3) {
    return dueDecision(
      input,
      input.lastConfirmedAttemptAt,
      7,
      'proposal_close_review_due',
      'close_review',
      null,
    );
  }
  const cadenceDays = [5, 5, 8][input.confirmedAttempts];
  const cadenceAnchor =
    input.confirmedAttempts === 0
      ? input.pendingAt
      : input.lastConfirmedAttemptAt;
  const cadenceDate = cadenceAnchor
    ? addBusinessDays(cadenceAnchor, cadenceDays)
    : null;
  if (!cadenceDate) {
    return decision(input, 'blocked', 'missing_or_invalid_cadence_anchor');
  }
  const firstDue = input.pendingAt ? addBusinessDays(input.pendingAt, 5) : null;
  const staleReviewDate = input.pendingAt
    ? addBusinessDays(input.pendingAt, 130)
    : null;
  if (
    input.confirmedAttempts === 0 &&
    firstDue &&
    staleReviewDate &&
    dateReached(input.observedAt, staleReviewDate)
  ) {
    return decision(
      input,
      'ready',
      'stale_proposal_review_due',
      'internal_review',
      null,
      staleReviewDate,
    );
  }
  const cooldownDate = input.lastPresentationAt
    ? addBusinessDays(input.lastPresentationAt, 3)
    : null;
  const eligibleDate = cooldownDate
    ? laterBusinessDate(cadenceDate, cooldownDate)
    : cadenceDate;
  if (!dateReached(input.observedAt, eligibleDate)) {
    return decision(
      input,
      'waiting',
      'cadence_not_due',
      'none',
      input.confirmedAttempts + 1,
      eligibleDate,
    );
  }
  return decision(
    input,
    'ready',
    `proposal_touch_${input.confirmedAttempts + 1}_due`,
    'customer_draft',
    input.confirmedAttempts + 1,
    eligibleDate,
  );
}

function evaluateReceivable(input: ReceivableCase): FollowupDecision {
  if (['paid', 'cancelled'].includes(input.invoiceStatus)) {
    return decision(input, 'completed', `invoice_${input.invoiceStatus}`);
  }
  if (
    !['draft', 'pending', 'overdue', 'paid', 'cancelled'].includes(
      input.invoiceStatus,
    )
  ) {
    return decision(input, 'blocked', 'unknown_invoice_status');
  }
  if (
    typeof input.outstandingAmount !== 'number' ||
    !Number.isFinite(input.outstandingAmount)
  ) {
    return decision(input, 'blocked', 'invoice_balance_invalid');
  }
  if (!input.currency || !/^[A-Z]{3}$/.test(input.currency)) {
    return decision(input, 'blocked', 'invoice_currency_invalid');
  }
  if (input.outstandingAmount <= 0) {
    return decision(input, 'completed', 'invoice_zero_balance');
  }
  const safetyGate = actionSafetyGate(input);
  if (safetyGate) return safetyGate;
  if (input.pendingAction) {
    return decision(input, 'waiting', 'action_or_approval_pending');
  }
  if (input.invoiceStatus === 'draft') {
    return decision(input, 'waiting', 'invoice_not_issued');
  }
  if (!input.dueAt) {
    return decision(input, 'blocked', 'invoice_due_date_missing');
  }
  const reviewDate = addBusinessDays(input.dueAt, 3);
  if (!reviewDate) {
    return decision(input, 'blocked', 'invoice_due_date_invalid');
  }
  if (!dateReached(input.observedAt, reviewDate)) {
    return decision(
      input,
      'waiting',
      'invoice_not_collection_due',
      'none',
      null,
      reviewDate,
    );
  }
  if (!input.paymentReconciled) {
    return decision(input, 'blocked', 'payment_reconciliation_required');
  }
  if (input.specialHandling) {
    return decision(input, 'blocked', 'receivable_special_handling');
  }
  if (!input.collectionApproved) {
    return decision(
      input,
      'ready',
      'collection_review_due',
      'internal_review',
      null,
      reviewDate,
    );
  }
  if (!input.ownerResolved) {
    return decision(input, 'blocked', 'relationship_owner_unresolved');
  }
  if (!input.recipientResolved) {
    return decision(input, 'blocked', 'billing_recipient_unresolved');
  }
  if (
    !Number.isInteger(input.confirmedAttempts) ||
    input.confirmedAttempts < 0 ||
    input.confirmedAttempts > 100
  ) {
    return decision(input, 'blocked', 'invalid_attempt_count');
  }
  if (input.confirmedAttempts === 0) {
    return decision(
      input,
      'ready',
      'receivable_reminder_1_due',
      'customer_draft',
      1,
      businessDate(input.observedAt),
    );
  }
  if (!input.lastConfirmedAttemptAt) {
    return decision(input, 'blocked', 'missing_confirmed_attempt_receipt');
  }
  if (input.confirmedAttempts === 1) {
    return dueDecision(
      input,
      input.lastConfirmedAttemptAt,
      5,
      'receivable_reminder_2_due',
      'customer_draft',
      2,
    );
  }
  return dueDecision(
    input,
    input.lastConfirmedAttemptAt,
    10,
    'receivable_escalation_due',
    'escalate',
    null,
  );
}

export function evaluateFollowup(input: FollowupCase): FollowupDecision {
  const gated = identityGate(input);
  if (gated) return gated;
  switch (input.lane) {
    case 'sales_conversation':
      return evaluateSales(input);
    case 'proposal_signature':
      return evaluateProposal(input);
    case 'receivable':
      return evaluateReceivable(input);
  }
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value !== 'object') {
    throw new TypeError('Follow-up fingerprint input must be JSON-compatible');
  }
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(',')}}`;
}

/**
 * Stable, content-free fingerprint for persistence/presentation dedupe.
 * Inputs intentionally exclude names, addresses, subjects, bodies, and source
 * payloads, so callers cannot accidentally persist customer content here.
 */
export function followupDecisionFingerprint(
  input: FollowupCase,
  output: FollowupDecision = evaluateFollowup(input),
): string {
  const { observedAt: _observationClock, ...caseEvidence } = input;
  return createHash('sha256')
    .update(
      canonicalJson({
        policyVersion: FOLLOWUP_POLICY_VERSION,
        caseEvidence,
        output,
      }),
    )
    .digest('hex');
}
