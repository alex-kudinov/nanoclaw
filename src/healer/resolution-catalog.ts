/**
 * Read-only healer resolution catalog.
 *
 * The incident table already preserves diagnoses and proposed fixes, but those
 * solutions are otherwise visible mainly through Slack threads and raw rows.
 * This module turns the existing evidence into one stable item per incident
 * fingerprint without exposing raw context, commands, diffs, Slack identities,
 * or investigation transcripts. It has no mutation or action capability.
 */

import { createHash } from 'node:crypto';

import type { QueryResultRow } from 'pg';

import { query } from '../business-db.js';
import { redact } from './incident-store.js';

export const HEALER_RESOLUTION_CATALOG_VERSION = 1 as const;

export type HealerResolutionDisposition =
  | 'monitoring'
  | 'pending_decision'
  | 'verified_fixed'
  | 'decided_no_action';

export type HealerDecisionCode =
  | 'approve_proposed_fix'
  | 'review_low_trust_or_manual_fix'
  | 'select_next_action_after_recurrence'
  | 'confirm_external_or_no_fix_disposition'
  | 'review_unverified_terminal_state'
  | 'review_unrouted_diagnosis'
  | 'review_stale_lifecycle_state'
  | 'review_unknown_incident_state';

export interface HealerResolutionSourceRow extends QueryResultRow {
  id: string;
  source: string;
  fingerprint: string;
  severity: string;
  status: string;
  occurrences: number;
  first_seen: string;
  last_seen: string;
  updated_at: string;
  remediation_class: string | null;
  diagnosis: string | null;
  proposed_kind: string | null;
  proposed_summary: string | null;
  confidence: string | null;
  cause_or_symptom: string | null;
  evidence: unknown;
  applied_action_kind: string | null;
  decision_actor: string | null;
  outcome: string | null;
}

export interface HealerResolutionCatalogItem {
  catalogVersion: typeof HEALER_RESOLUTION_CATALOG_VERSION;
  key: string;
  resolutionFingerprint: string;
  incidentFingerprint: string;
  incidentId: string;
  source: string;
  severity: string;
  incidentStatus: string;
  disposition: HealerResolutionDisposition;
  decisionRequired: boolean;
  decisionCode: HealerDecisionCode | null;
  decisionOwner: 'unassigned' | null;
  decisionActorSha256: string | null;
  decisionPrompt: string | null;
  closureCondition: string;
  proposedResolution: string | null;
  diagnosisSummary: string | null;
  remediationClass: string | null;
  confidence: string | null;
  causeOrSymptom: string | null;
  evidenceCount: number;
  evidenceSha256: string;
  occurrences: number;
  firstSeen: string;
  lastSeen: string;
  updatedAt: string;
}

export interface HealerResolutionCatalog {
  catalogVersion: typeof HEALER_RESOLUTION_CATALOG_VERSION;
  generatedAt: string;
  scannedRows: number;
  currentIncidents: number;
  deduplicatedRows: number;
  summary: {
    pendingDecision: number;
    monitoring: number;
    verifiedFixed: number;
    decidedNoAction: number;
  };
  items: HealerResolutionCatalogItem[];
}

export type HealerResolutionCatalogQuery = (
  sql: string,
  params: unknown[],
) => Promise<{ rows: HealerResolutionSourceRow[] }>;

const TERMINAL = new Set(['resolved', 'wont_fix']);
const STALE_LIFECYCLE_MS = 30 * 60_000;
const KNOWN_MONITORING = new Set([
  'new',
  'triaging',
  'investigating',
  'adversarial_review',
  'remediating',
  'verifying',
]);
const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  error: 1,
  warn: 2,
  info: 3,
};
const DISPOSITION_RANK: Record<HealerResolutionDisposition, number> = {
  pending_decision: 0,
  monitoring: 1,
  verified_fixed: 2,
  decided_no_action: 3,
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function boundedText(value: unknown, max = 500): string | null {
  if (typeof value !== 'string') return null;
  const clean = redact(value).replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

function normalizedEvidence(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((entry) => boundedText(entry, 300))
        .filter((entry): entry is string => entry !== null),
    ),
  ].sort();
}

function rowTime(row: HealerResolutionSourceRow): number {
  for (const value of [row.updated_at, row.last_seen]) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numericId(value: string): bigint {
  return /^[0-9]+$/.test(value) ? BigInt(value) : 0n;
}

function preferRow(
  left: HealerResolutionSourceRow,
  right: HealerResolutionSourceRow,
): HealerResolutionSourceRow {
  const leftOpen = !TERMINAL.has(left.status);
  const rightOpen = !TERMINAL.has(right.status);
  if (leftOpen !== rightOpen) return rightOpen ? right : left;
  const timeDelta = rowTime(right) - rowTime(left);
  if (timeDelta !== 0) return timeDelta > 0 ? right : left;
  return numericId(right.id) > numericId(left.id) ? right : left;
}

function stableIncidentIdentity(row: HealerResolutionSourceRow): {
  key: string;
  fingerprint: string;
} {
  const fingerprint = /^[a-f0-9]{8,64}$/i.test(row.fingerprint)
    ? row.fingerprint.toLowerCase()
    : `invalid-${sha256(`${row.source}|${row.id}|${row.fingerprint}`).slice(0, 16)}`;
  return { key: `healer:${fingerprint}`, fingerprint };
}

interface ResolutionClassification {
  disposition: HealerResolutionDisposition;
  decisionCode: HealerDecisionCode | null;
  decisionPrompt: string | null;
  closureCondition: string;
}

function classify(
  row: HealerResolutionSourceRow,
  generatedAtMs: number,
): ResolutionClassification {
  if (row.status === 'resolved' && row.outcome === 'verified_fixed') {
    return {
      disposition: 'verified_fixed',
      decisionCode: null,
      decisionPrompt: null,
      closureCondition:
        'Existing verified_fixed receipt remains authoritative.',
    };
  }
  if (
    row.status === 'wont_fix' &&
    row.applied_action_kind === 'proposal_rejected' &&
    row.decision_actor
  ) {
    return {
      disposition: 'decided_no_action',
      decisionCode: null,
      decisionPrompt: null,
      closureCondition:
        'Existing named rejection receipt remains authoritative.',
    };
  }
  if (row.status === 'awaiting_approval') {
    return {
      disposition: 'pending_decision',
      decisionCode: 'approve_proposed_fix',
      decisionPrompt: 'Approve or reject the exact proposed resolution.',
      closureCondition:
        'A named owner records one exact decision; approval still requires separate verified execution.',
    };
  }
  if (row.status === 'needs_human') {
    return {
      disposition: 'pending_decision',
      decisionCode: 'review_low_trust_or_manual_fix',
      decisionPrompt:
        'Review the diagnosis and proposed manual resolution; record a disposition or request better evidence.',
      closureCondition:
        'A named owner records a disposition, or new evidence produces a verified resolution.',
    };
  }
  if (row.status === 'recurring') {
    return {
      disposition: 'pending_decision',
      decisionCode: 'select_next_action_after_recurrence',
      decisionPrompt:
        'Choose the next bounded action for a resolution that did not hold.',
      closureCondition:
        'A named owner selects the next action and the incident later reaches verified_fixed or an explicit no-action decision.',
    };
  }
  if (row.status === 'wont_fix') {
    return {
      disposition: 'pending_decision',
      decisionCode: 'confirm_external_or_no_fix_disposition',
      decisionPrompt:
        'Confirm whether to monitor, escalate, or accept no action; no named decision receipt is present.',
      closureCondition:
        'A named owner records the external/no-fix disposition or verified recovery supersedes it.',
    };
  }
  if (row.status === 'resolved') {
    return {
      disposition: 'pending_decision',
      decisionCode: 'review_unverified_terminal_state',
      decisionPrompt:
        'Review this terminal incident because it lacks a verified_fixed outcome.',
      closureCondition:
        'A verified recovery receipt or explicit named disposition is recorded.',
    };
  }
  if (row.status === 'diagnosed') {
    if (row.remediation_class === 'transient') {
      return {
        disposition: 'monitoring',
        decisionCode: null,
        decisionPrompt: null,
        closureCondition:
          'The existing transient-remediation loop advances this incident or converts it into a visible pending decision.',
      };
    }
    return {
      disposition: 'pending_decision',
      decisionCode: 'review_unrouted_diagnosis',
      decisionPrompt:
        'Review this stored diagnosis and proposed resolution; it has no separate decision state.',
      closureCondition:
        'A named owner records a disposition, or the healer routes the resolution to verified execution or an explicit pending-decision state.',
    };
  }
  if (KNOWN_MONITORING.has(row.status)) {
    const updatedAt = rowTime(row);
    if (
      !Number.isFinite(generatedAtMs) ||
      updatedAt === 0 ||
      generatedAtMs - updatedAt > STALE_LIFECYCLE_MS
    ) {
      return {
        disposition: 'pending_decision',
        decisionCode: 'review_stale_lifecycle_state',
        decisionPrompt:
          'Review this stale lifecycle state; the ordinary healer loop has not advanced it.',
        closureCondition:
          'The incident resumes a supported bounded stage or receives an explicit named disposition.',
      };
    }
    return {
      disposition: 'monitoring',
      decisionCode: null,
      decisionPrompt: null,
      closureCondition:
        'The existing healer lifecycle advances this incident or converts it into a visible pending decision.',
    };
  }
  return {
    disposition: 'pending_decision',
    decisionCode: 'review_unknown_incident_state',
    decisionPrompt:
      'Review this unsupported incident state before relying on any resolution.',
    closureCondition:
      'The row is reconciled to a supported state with verified recovery or an explicit named disposition.',
  };
}

function itemFrom(
  row: HealerResolutionSourceRow,
  generatedAtMs: number,
): HealerResolutionCatalogItem {
  const identity = stableIncidentIdentity(row);
  const classification = classify(row, generatedAtMs);
  const diagnosisSummary = boundedText(row.diagnosis);
  const proposedResolution = boundedText(row.proposed_summary);
  const evidence = normalizedEvidence(row.evidence);
  const evidenceSha256 = sha256(JSON.stringify(evidence));
  const decisionActorSha256 =
    classification.disposition === 'decided_no_action' && row.decision_actor
      ? sha256(row.decision_actor)
      : null;
  const resolutionFingerprint = sha256(
    JSON.stringify([
      HEALER_RESOLUTION_CATALOG_VERSION,
      identity.fingerprint,
      row.status,
      row.outcome,
      row.remediation_class,
      row.proposed_kind,
      diagnosisSummary,
      proposedResolution,
      evidenceSha256,
      row.applied_action_kind,
      decisionActorSha256,
      classification.disposition,
      classification.decisionCode,
    ]),
  );
  return {
    catalogVersion: HEALER_RESOLUTION_CATALOG_VERSION,
    key: identity.key,
    resolutionFingerprint,
    incidentFingerprint: identity.fingerprint,
    incidentId: String(row.id),
    source: boundedText(row.source, 160) ?? 'unknown',
    severity: row.severity,
    incidentStatus: row.status,
    disposition: classification.disposition,
    decisionRequired: classification.disposition === 'pending_decision',
    decisionCode: classification.decisionCode,
    decisionOwner:
      classification.disposition === 'pending_decision' ? 'unassigned' : null,
    decisionActorSha256,
    decisionPrompt: classification.decisionPrompt,
    closureCondition: classification.closureCondition,
    proposedResolution,
    diagnosisSummary,
    remediationClass: row.remediation_class,
    confidence: row.confidence,
    causeOrSymptom: row.cause_or_symptom,
    evidenceCount: evidence.length,
    evidenceSha256,
    occurrences: Number.isInteger(row.occurrences) ? row.occurrences : 0,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    updatedAt: row.updated_at,
  };
}

export function buildHealerResolutionCatalog(
  rows: HealerResolutionSourceRow[],
  generatedAt = new Date().toISOString(),
): HealerResolutionCatalog {
  const generatedAtMs = Date.parse(generatedAt);
  const current = new Map<string, HealerResolutionSourceRow>();
  for (const row of rows) {
    const { key } = stableIncidentIdentity(row);
    const existing = current.get(key);
    current.set(key, existing ? preferRow(existing, row) : row);
  }
  const items = [...current.values()]
    .map((row) => itemFrom(row, generatedAtMs))
    .sort((left, right) => {
      return (
        DISPOSITION_RANK[left.disposition] -
          DISPOSITION_RANK[right.disposition] ||
        (SEVERITY_RANK[left.severity] ?? 9) -
          (SEVERITY_RANK[right.severity] ?? 9) ||
        timestamp(right.lastSeen) - timestamp(left.lastSeen) ||
        left.key.localeCompare(right.key)
      );
    });
  return {
    catalogVersion: HEALER_RESOLUTION_CATALOG_VERSION,
    generatedAt,
    scannedRows: rows.length,
    currentIncidents: items.length,
    deduplicatedRows: rows.length - items.length,
    summary: {
      pendingDecision: items.filter(
        ({ disposition }) => disposition === 'pending_decision',
      ).length,
      monitoring: items.filter(
        ({ disposition }) => disposition === 'monitoring',
      ).length,
      verifiedFixed: items.filter(
        ({ disposition }) => disposition === 'verified_fixed',
      ).length,
      decidedNoAction: items.filter(
        ({ disposition }) => disposition === 'decided_no_action',
      ).length,
    },
    items,
  };
}

function boundedLimit(value: number | undefined): number {
  if (value === undefined) return 500;
  if (!Number.isSafeInteger(value) || value < 1 || value > 2_000) {
    throw new Error(
      'resolution catalog limit must be an integer from 1 to 2000',
    );
  }
  return value;
}

export async function readHealerResolutionCatalog(
  options: {
    limit?: number;
    generatedAt?: string;
    runQuery?: HealerResolutionCatalogQuery;
  } = {},
): Promise<HealerResolutionCatalog> {
  const limit = boundedLimit(options.limit);
  const runQuery: HealerResolutionCatalogQuery =
    options.runQuery ??
    ((sql, params) => query<HealerResolutionSourceRow>(sql, params));
  const result = await runQuery(
    `WITH ranked AS (
       SELECT id, source, fingerprint, severity, status, occurrences,
              first_seen, last_seen, updated_at, remediation_class, diagnosis,
              proposed_fix, confidence, cause_or_symptom, evidence,
              applied_action, outcome,
              row_number() OVER (
                PARTITION BY fingerprint
                ORDER BY CASE WHEN status NOT IN ('resolved', 'wont_fix')
                              THEN 0 ELSE 1 END,
                         last_seen DESC, id DESC
              ) AS row_rank
         FROM business_v2.incidents
     )
     SELECT id::text AS id, source, fingerprint, severity, status, occurrences,
            first_seen::text AS first_seen, last_seen::text AS last_seen,
            updated_at::text AS updated_at, remediation_class, diagnosis,
            proposed_fix->>'kind' AS proposed_kind,
            proposed_fix->>'summary' AS proposed_summary,
            confidence, cause_or_symptom, evidence,
            applied_action->>'kind' AS applied_action_kind,
            applied_action->>'rejected_by' AS decision_actor, outcome
       FROM ranked
      WHERE row_rank = 1
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'error' THEN 1
                             WHEN 'warn' THEN 2 ELSE 3 END,
               last_seen DESC, id DESC
      LIMIT $1`,
    [limit],
  );
  return buildHealerResolutionCatalog(
    result.rows,
    options.generatedAt ?? new Date().toISOString(),
  );
}

export function formatHealerResolutionCatalog(
  catalog: HealerResolutionCatalog,
  json = false,
): string {
  if (json) return `${JSON.stringify(catalog, null, 2)}\n`;
  const lines = [
    `Healer resolution catalog — ${catalog.generatedAt}`,
    `scanned=${catalog.scannedRows} current=${catalog.currentIncidents} deduplicated=${catalog.deduplicatedRows} pending_decision=${catalog.summary.pendingDecision} monitoring=${catalog.summary.monitoring} verified_fixed=${catalog.summary.verifiedFixed} decided_no_action=${catalog.summary.decidedNoAction}`,
  ];
  const pending = catalog.items.filter(
    ({ decisionRequired }) => decisionRequired,
  );
  if (pending.length === 0) lines.push('No pending healer decisions.');
  for (const item of pending) {
    lines.push(
      `[PENDING] key=${item.key} source=${item.source} severity=${item.severity} status=${item.incidentStatus} decision=${item.decisionCode} owner=${item.decisionOwner} occurrences=${item.occurrences}`,
      `  proposed=${item.proposedResolution ?? '(none recorded)'}`,
      `  close=${item.closureCondition}`,
    );
  }
  return `${lines.join('\n')}\n`;
}
