/**
 * Pure reconciliation and reporting for the Company OS revenue-follow-up
 * shadow. No source reads, persistence, Slack work, drafting, or customer
 * action occurs here.
 */

import { createHash } from 'crypto';

import type { ProjectFollowupCaseInput } from './followup-case-store.js';
import {
  evaluateFollowup,
  followupDecisionFingerprint,
  type FollowupCase,
  type FollowupDecision,
  type FollowupDisposition,
  type FollowupLane,
  type FollowupNextAction,
} from './followup-policy.js';

export interface FollowupShadowObservation {
  sourceSystem: string;
  sourceFingerprint: string;
  case: FollowupCase;
}

export interface ExistingFollowupShadowCase {
  lane: FollowupLane;
  sourceSystem: string;
  sourceKey: string;
  sourceFingerprint: string;
  decisionFingerprint: string;
  disposition: FollowupDisposition;
  reasonCode: string;
  version: number;
}

export interface FollowupShadowSourceError {
  source:
    | 'business_v2'
    | 'sqlite_actions'
    | 'plutio_proposals'
    | 'plutio_invoices';
  code: string;
}

export type FollowupShadowChange = 'new' | 'changed' | 'unchanged';

export interface FollowupShadowDetail {
  change: Exclude<FollowupShadowChange, 'unchanged'>;
  lane: FollowupLane;
  sourceSystem: string;
  sourceKey: string;
  disposition: FollowupDisposition;
  reason: string;
  nextAction: FollowupNextAction;
  sequence: number | null;
  nextEligibleBusinessDate: string | null;
  ownerGroup: 'sales' | 'contador';
}

export interface FollowupShadowReport {
  contractVersion: 'company-followup-shadow-v1';
  observedAt: string;
  snapshotFingerprint: string;
  sourceErrors: FollowupShadowSourceError[];
  totals: {
    observed: number;
    new: number;
    changed: number;
    unchanged: number;
    ready: number;
    blocked: number;
    waiting: number;
    terminal: number;
  };
  byLane: Record<FollowupLane, number>;
  receivableOutstandingByCurrency: Record<string, number>;
  newlyReadyOrChanged: FollowupShadowDetail[];
  changedExceptions: FollowupShadowDetail[];
  unchangedHealth: Record<string, number>;
}

interface EvaluatedObservation {
  observation: FollowupShadowObservation;
  decision: FollowupDecision;
  decisionFingerprint: string;
  change: FollowupShadowChange;
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
    throw new TypeError('followup-shadow evidence must be JSON-compatible');
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

function sha(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/** Observation fingerprint excludes the scan clock, so unchanged daily reads no-op. */
export function followupSourceFingerprint(input: FollowupCase): string {
  const { observedAt: _observationClock, ...evidence } = input;
  return sha(evidence);
}

export function makeFollowupShadowObservation(
  sourceSystem: string,
  input: FollowupCase,
): FollowupShadowObservation {
  return {
    sourceSystem,
    sourceFingerprint: followupSourceFingerprint(input),
    case: input,
  };
}

function identity(
  lane: FollowupLane,
  sourceSystem: string,
  sourceKey: string,
): string {
  return `${lane}\u0000${sourceSystem}\u0000${sourceKey}`;
}

function evaluateObservations(
  observations: FollowupShadowObservation[],
  existing: ExistingFollowupShadowCase[],
): EvaluatedObservation[] {
  const current = new Map(
    existing.map((item) => [
      identity(item.lane, item.sourceSystem, item.sourceKey),
      item,
    ]),
  );
  return observations.map((observation) => {
    const decision = evaluateFollowup(observation.case);
    const decisionFingerprint = followupDecisionFingerprint(
      observation.case,
      decision,
    );
    const prior = current.get(
      identity(
        observation.case.lane,
        observation.sourceSystem,
        observation.case.sourceKey,
      ),
    );
    const change: FollowupShadowChange = !prior
      ? 'new'
      : prior.sourceFingerprint === observation.sourceFingerprint &&
          prior.decisionFingerprint === decisionFingerprint
        ? 'unchanged'
        : 'changed';
    return { observation, decision, decisionFingerprint, change };
  });
}

function detail(item: EvaluatedObservation): FollowupShadowDetail {
  return {
    change: item.change as Exclude<FollowupShadowChange, 'unchanged'>,
    lane: item.observation.case.lane,
    sourceSystem: item.observation.sourceSystem,
    sourceKey: item.observation.case.sourceKey,
    disposition: item.decision.disposition,
    reason: item.decision.reason,
    nextAction: item.decision.nextAction,
    sequence: item.decision.sequence,
    nextEligibleBusinessDate: item.decision.nextEligibleBusinessDate,
    ownerGroup: item.decision.ownerGroup,
  };
}

export function buildFollowupShadowReport(input: {
  observedAt: string;
  observations: FollowupShadowObservation[];
  existing?: ExistingFollowupShadowCase[];
  sourceErrors?: FollowupShadowSourceError[];
}): FollowupShadowReport {
  if (!Number.isFinite(Date.parse(input.observedAt))) {
    throw new Error('followup-shadow: observedAt must be ISO-8601');
  }
  const evaluated = evaluateObservations(
    input.observations,
    input.existing ?? [],
  );
  const unchangedHealth: Record<string, number> = {};
  const byLane: Record<FollowupLane, number> = {
    sales_conversation: 0,
    proposal_signature: 0,
    receivable: 0,
  };
  let ready = 0;
  let blocked = 0;
  let waiting = 0;
  let terminal = 0;
  const receivableOutstandingByCurrency: Record<string, number> = {};
  for (const item of evaluated) {
    byLane[item.observation.case.lane]++;
    if (item.decision.disposition === 'ready') ready++;
    else if (item.decision.disposition === 'blocked') blocked++;
    else if (item.decision.disposition === 'waiting') waiting++;
    else terminal++;
    if (
      item.observation.case.lane === 'receivable' &&
      typeof item.observation.case.outstandingAmount === 'number' &&
      Number.isFinite(item.observation.case.outstandingAmount) &&
      item.observation.case.outstandingAmount > 0
    ) {
      const currency = item.observation.case.currency ?? 'UNKNOWN';
      receivableOutstandingByCurrency[currency] =
        (receivableOutstandingByCurrency[currency] ?? 0) +
        item.observation.case.outstandingAmount;
    }
    if (item.change === 'unchanged') {
      const key = `${item.observation.case.lane}:${item.decision.disposition}:${item.decision.reason}`;
      unchangedHealth[key] = (unchangedHealth[key] ?? 0) + 1;
    }
  }
  const changed = evaluated.filter((item) => item.change !== 'unchanged');
  const sourceErrors = [...(input.sourceErrors ?? [])].sort((left, right) =>
    `${left.source}:${left.code}`.localeCompare(
      `${right.source}:${right.code}`,
    ),
  );
  return {
    contractVersion: 'company-followup-shadow-v1',
    observedAt: new Date(input.observedAt).toISOString(),
    snapshotFingerprint: sha({
      observations: evaluated
        .map((item) => ({
          lane: item.observation.case.lane,
          sourceSystem: item.observation.sourceSystem,
          sourceKey: item.observation.case.sourceKey,
          sourceFingerprint: item.observation.sourceFingerprint,
          decisionFingerprint: item.decisionFingerprint,
        }))
        .sort((left, right) =>
          `${left.lane}:${left.sourceSystem}:${left.sourceKey}`.localeCompare(
            `${right.lane}:${right.sourceSystem}:${right.sourceKey}`,
          ),
        ),
      sourceErrors,
    }),
    sourceErrors,
    totals: {
      observed: evaluated.length,
      new: changed.filter((item) => item.change === 'new').length,
      changed: changed.filter((item) => item.change === 'changed').length,
      unchanged: evaluated.filter((item) => item.change === 'unchanged').length,
      ready,
      blocked,
      waiting,
      terminal,
    },
    byLane,
    receivableOutstandingByCurrency,
    newlyReadyOrChanged: changed
      .filter((item) => item.decision.disposition === 'ready')
      .map(detail),
    changedExceptions: changed
      .filter((item) => item.decision.disposition !== 'ready')
      .map(detail),
    unchangedHealth,
  };
}

export function followupShadowProjectionInputs(
  observations: FollowupShadowObservation[],
  observedAt: string,
): ProjectFollowupCaseInput[] {
  const scanFingerprint = sha(observedAt).slice(0, 24);
  return observations.map((observation) => {
    const sourceKeyFingerprint = sha([
      observation.case.lane,
      observation.sourceSystem,
      observation.case.sourceKey,
    ]).slice(0, 24);
    const eventKey = `shadow:${scanFingerprint}:${sourceKeyFingerprint}`;
    return {
      sourceSystem: observation.sourceSystem,
      sourceEventKey: eventKey,
      idempotencyKey: `followup:${eventKey}`,
      sourceFingerprint: observation.sourceFingerprint,
      actor: 'company-followup-shadow:host',
      occurredAt: observedAt,
      case: observation.case,
    };
  });
}
