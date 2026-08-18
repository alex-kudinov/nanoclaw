/**
 * Content-free retained-history coverage for the current Gmail ingestion path.
 *
 * This audit does not read Gmail or invent terminal dispositions. It measures
 * only durable host evidence already present in SQLite/PostgreSQL and reports
 * aggregate categories plus fingerprints. Raw message IDs are inputs to the
 * fingerprint but never appear in the report.
 */

import { createHash } from 'node:crypto';

import {
  normalizeGmailInboundDispositionReceipt,
  normalizeGmailInboundMessageId,
  type GmailInboundDispositionReason,
  type GmailInboundDispositionReceipt,
} from './gmail-inbound-disposition.js';

export const GMAIL_HISTORICAL_COVERAGE_CONTRACT_VERSION = 1 as const;
export const GMAIL_HISTORICAL_COVERAGE_SOURCE_KEY =
  'gmail:retained-history-coverage-v1' as const;

export type GmailHistoricalStoredEvidence =
  | 'absent'
  | 'ordinary_persisted'
  | 'direct_route_staged'
  | 'outbound_stored'
  | 'unsupported_inbound_stored';

export type GmailHistoricalCoverageErrorCode =
  | 'invalid_input'
  | 'duplicate_id'
  | 'contradictory_evidence'
  | 'scope_incomplete'
  | 'source_drift'
  | 'storage_unavailable';

export class GmailHistoricalCoverageError extends Error {
  constructor(
    public readonly code: GmailHistoricalCoverageErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GmailHistoricalCoverageError';
  }
}

export interface GmailHistoricalCoverageCandidate {
  messageId: string;
  receipt: GmailInboundDispositionReceipt | null;
  storedEvidence: GmailHistoricalStoredEvidence;
  classificationRouted: boolean;
}

export interface GmailHistoricalClassificationEvidence {
  messageId: string;
  exactRoutedCount: number;
  exactUnroutedCount: number;
  otherClassifierCount: number;
}

export interface GmailHistoricalCoverageReport {
  contractVersion: typeof GMAIL_HISTORICAL_COVERAGE_CONTRACT_VERSION;
  sourceKey: typeof GMAIL_HISTORICAL_COVERAGE_SOURCE_KEY;
  generatedAt: string;
  scopeFingerprint: string;
  sourceEvidenceFingerprint: string;
  reportFingerprint: string;
  evidenceScope: {
    basis: 'retained_host_evidence';
    mailboxComplete: false;
    gmailQueried: false;
  };
  totalIds: number;
  terminalReceipts: {
    total: number;
    accepted: number;
    rejected: number;
    byReason: Record<GmailInboundDispositionReason, number>;
  };
  recoverableEvidence: {
    total: number;
    ordinaryPersisted: number;
    classifiedRoutePersisted: number;
  };
  unknown: {
    total: number;
    directRouteUnresolved: number;
    outboundWithoutReceipt: number;
    unsupportedInboundStored: number;
  };
  accountingClosed: true;
}

const REASON_KEYS: readonly GmailInboundDispositionReason[] = [
  'inbound_message_persisted',
  'classified_route_persisted',
  'rule_auto_archive_completed',
  'legacy_message_persisted',
  'own_outbound',
  'spam_or_trash',
  'empty_message',
  'hard_filter',
  'thread_outbound',
];

const STORED_EVIDENCE = new Set<GmailHistoricalStoredEvidence>([
  'absent',
  'ordinary_persisted',
  'direct_route_staged',
  'outbound_stored',
  'unsupported_inbound_stored',
]);

function fail(
  code: GmailHistoricalCoverageErrorCode,
  message: string,
  cause?: unknown,
): never {
  throw new GmailHistoricalCoverageError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function hash(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function deriveGmailHistoricalCoverageScopeIdentity(
  chatJid: string,
): string {
  if (
    typeof chatJid !== 'string' ||
    !chatJid.startsWith('gmail:') ||
    chatJid.length < 7 ||
    chatJid.length > 320
  ) {
    fail('invalid_input', 'coverage chat JID is invalid');
  }
  return `gmail:retained-host:${hash([
    'nanoclaw:gmail-historical-coverage-mailbox:v1',
    chatJid,
  ])}`;
}

function timestamp(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    fail('invalid_input', 'coverage generatedAt is invalid');
  }
  return new Date(parsed).toISOString();
}

function normalizeCandidate(
  input: GmailHistoricalCoverageCandidate,
): GmailHistoricalCoverageCandidate {
  if (!input || typeof input !== 'object') {
    fail('invalid_input', 'coverage candidate is invalid');
  }
  let messageId: string;
  try {
    messageId = normalizeGmailInboundMessageId(input.messageId);
  } catch (error) {
    fail('invalid_input', 'coverage candidate message ID is invalid', error);
  }
  if (!STORED_EVIDENCE.has(input.storedEvidence)) {
    fail('invalid_input', 'coverage stored evidence is invalid');
  }
  if (typeof input.classificationRouted !== 'boolean') {
    fail('invalid_input', 'coverage routed marker is invalid');
  }
  if (
    input.classificationRouted &&
    input.storedEvidence !== 'direct_route_staged'
  ) {
    fail(
      'contradictory_evidence',
      'routed marker exists without direct-route staging evidence',
    );
  }
  let receipt: GmailInboundDispositionReceipt | null = null;
  if (input.receipt !== null) {
    try {
      receipt = normalizeGmailInboundDispositionReceipt(input.receipt);
    } catch (error) {
      fail('invalid_input', 'coverage receipt is invalid', error);
    }
    if (receipt.messageId !== messageId) {
      fail('contradictory_evidence', 'receipt ID does not match candidate ID');
    }
  }
  return {
    messageId,
    receipt,
    storedEvidence: input.storedEvidence,
    classificationRouted: input.classificationRouted,
  };
}

function normalizeCandidateSet(
  inputs: readonly GmailHistoricalCoverageCandidate[],
): GmailHistoricalCoverageCandidate[] {
  const normalized = inputs.map(normalizeCandidate);
  normalized.sort((left, right) =>
    left.messageId.localeCompare(right.messageId),
  );
  for (let index = 1; index < normalized.length; index++) {
    if (normalized[index - 1].messageId === normalized[index].messageId) {
      fail(
        'duplicate_id',
        'historical coverage source contains a duplicate ID',
      );
    }
  }
  return normalized;
}

function requireReceiptEvidence(
  candidate: GmailHistoricalCoverageCandidate,
): void {
  const receipt = candidate.receipt;
  if (!receipt) return;
  const evidence = candidate.storedEvidence;
  switch (receipt.reasonKey) {
    case 'inbound_message_persisted':
    case 'legacy_message_persisted':
      if (evidence !== 'ordinary_persisted') {
        fail(
          'contradictory_evidence',
          'persisted inbound receipt lacks its ordinary stored row',
        );
      }
      break;
    case 'classified_route_persisted':
      if (
        evidence !== 'direct_route_staged' ||
        !candidate.classificationRouted
      ) {
        fail(
          'contradictory_evidence',
          'classified-route receipt lacks its exact routed marker',
        );
      }
      break;
    case 'rule_auto_archive_completed':
    case 'spam_or_trash':
    case 'empty_message':
    case 'hard_filter':
      if (evidence !== 'absent') {
        fail(
          'contradictory_evidence',
          'no-persist receipt conflicts with a stored message row',
        );
      }
      break;
    case 'own_outbound':
    case 'thread_outbound':
      if (evidence !== 'absent' && evidence !== 'outbound_stored') {
        fail(
          'contradictory_evidence',
          'outbound receipt conflicts with inbound stored evidence',
        );
      }
      break;
  }
}

function emptyReasonCounts(): Record<GmailInboundDispositionReason, number> {
  return Object.fromEntries(REASON_KEYS.map((key) => [key, 0])) as Record<
    GmailInboundDispositionReason,
    number
  >;
}

export function fingerprintGmailHistoricalCoverageCandidates(
  candidates: readonly GmailHistoricalCoverageCandidate[],
): string {
  const normalized = normalizeCandidateSet(candidates);
  return hash([
    'nanoclaw:gmail-historical-coverage-source:v1',
    normalized.map((candidate) => [
      candidate.messageId,
      candidate.receipt?.receiptFingerprint ?? null,
      candidate.storedEvidence,
      candidate.classificationRouted,
    ]),
  ]);
}

export function buildGmailHistoricalCoverageReport(input: {
  scopeIdentity: string;
  generatedAt: string;
  candidates: readonly GmailHistoricalCoverageCandidate[];
}): GmailHistoricalCoverageReport {
  if (
    typeof input.scopeIdentity !== 'string' ||
    !input.scopeIdentity.startsWith('gmail:') ||
    input.scopeIdentity.length > 320
  ) {
    fail('invalid_input', 'coverage scope identity is invalid');
  }
  const generatedAt = timestamp(input.generatedAt);
  const candidates = normalizeCandidateSet(input.candidates);

  const byReason = emptyReasonCounts();
  let accepted = 0;
  let rejected = 0;
  let ordinaryPersisted = 0;
  let classifiedRoutePersisted = 0;
  let directRouteUnresolved = 0;
  let outboundWithoutReceipt = 0;
  let unsupportedInboundStored = 0;

  for (const candidate of candidates) {
    requireReceiptEvidence(candidate);
    if (candidate.receipt) {
      byReason[candidate.receipt.reasonKey]++;
      if (candidate.receipt.disposition === 'accepted') accepted++;
      else rejected++;
      continue;
    }
    switch (candidate.storedEvidence) {
      case 'ordinary_persisted':
        ordinaryPersisted++;
        break;
      case 'direct_route_staged':
        if (candidate.classificationRouted) classifiedRoutePersisted++;
        else directRouteUnresolved++;
        break;
      case 'outbound_stored':
        outboundWithoutReceipt++;
        break;
      case 'unsupported_inbound_stored':
        unsupportedInboundStored++;
        break;
      case 'absent':
        fail(
          'contradictory_evidence',
          'candidate has neither receipt nor retained message evidence',
        );
    }
  }

  const terminalTotal = accepted + rejected;
  const recoverableTotal = ordinaryPersisted + classifiedRoutePersisted;
  const unknownTotal =
    directRouteUnresolved + outboundWithoutReceipt + unsupportedInboundStored;
  if (terminalTotal + recoverableTotal + unknownTotal !== candidates.length) {
    fail('contradictory_evidence', 'historical coverage arithmetic is open');
  }

  const scopeFingerprint = hash([
    'nanoclaw:gmail-historical-coverage-scope:v1',
    input.scopeIdentity,
  ]);
  const sourceEvidenceFingerprint =
    fingerprintGmailHistoricalCoverageCandidates(candidates);
  const fingerprintPayload = {
    contractVersion: GMAIL_HISTORICAL_COVERAGE_CONTRACT_VERSION,
    sourceKey: GMAIL_HISTORICAL_COVERAGE_SOURCE_KEY,
    scopeFingerprint,
    sourceEvidenceFingerprint,
    evidenceScope: {
      basis: 'retained_host_evidence' as const,
      mailboxComplete: false as const,
      gmailQueried: false as const,
    },
    totalIds: candidates.length,
    terminalReceipts: {
      total: terminalTotal,
      accepted,
      rejected,
      byReason,
    },
    recoverableEvidence: {
      total: recoverableTotal,
      ordinaryPersisted,
      classifiedRoutePersisted,
    },
    unknown: {
      total: unknownTotal,
      directRouteUnresolved,
      outboundWithoutReceipt,
      unsupportedInboundStored,
    },
    accountingClosed: true as const,
  };
  return {
    ...fingerprintPayload,
    generatedAt,
    reportFingerprint: hash([
      'nanoclaw:gmail-historical-coverage-report:v1',
      fingerprintPayload,
    ]),
  };
}

export interface GmailHistoricalCoverageAuditDeps {
  listCandidates(): Promise<readonly GmailHistoricalCoverageCandidate[]>;
  listClassificationEvidence(
    messageIds: readonly string[],
  ): Promise<readonly GmailHistoricalClassificationEvidence[]>;
}

function directRouteIds(
  candidates: readonly GmailHistoricalCoverageCandidate[],
): string[] {
  return candidates
    .filter((candidate) => candidate.storedEvidence === 'direct_route_staged')
    .map((candidate) => candidate.messageId)
    .sort();
}

function nonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail('storage_unavailable', `${field} is invalid`);
  }
  return Number(value);
}

function applyClassificationEvidence(
  candidates: readonly GmailHistoricalCoverageCandidate[],
  evidenceRows: readonly GmailHistoricalClassificationEvidence[],
): GmailHistoricalCoverageCandidate[] {
  const normalizedCandidates = normalizeCandidateSet(candidates);
  for (const candidate of normalizedCandidates) {
    if (candidate.classificationRouted) {
      fail(
        'contradictory_evidence',
        'SQLite source may not assert PostgreSQL route evidence',
      );
    }
  }
  const requested = new Set(directRouteIds(normalizedCandidates));
  const exactRouted = new Set<string>();
  const seen = new Set<string>();
  for (const row of evidenceRows) {
    let messageId: string;
    try {
      messageId = normalizeGmailInboundMessageId(row.messageId);
    } catch (error) {
      fail(
        'storage_unavailable',
        'routed-marker source returned an invalid ID',
        error,
      );
    }
    if (!requested.has(messageId)) {
      fail(
        'contradictory_evidence',
        'routed-marker source returned an ID outside the requested set',
      );
    }
    if (seen.has(messageId)) {
      fail('duplicate_id', 'routed-marker source returned a duplicate ID');
    }
    seen.add(messageId);
    const exactRoutedCount = nonNegativeInteger(
      row.exactRoutedCount,
      'exact routed count',
    );
    const exactUnroutedCount = nonNegativeInteger(
      row.exactUnroutedCount,
      'exact unrouted count',
    );
    const otherClassifierCount = nonNegativeInteger(
      row.otherClassifierCount,
      'other classifier count',
    );
    if (
      exactRoutedCount > 1 ||
      (exactRoutedCount === 1 &&
        (exactUnroutedCount > 0 || otherClassifierCount > 0))
    ) {
      fail(
        'contradictory_evidence',
        'direct-route staging has ambiguous classification evidence',
      );
    }
    if (exactRoutedCount === 1) exactRouted.add(messageId);
  }
  return normalizedCandidates.map((candidate) => ({
    ...candidate,
    classificationRouted:
      candidate.storedEvidence === 'direct_route_staged' &&
      exactRouted.has(candidate.messageId),
  }));
}

/**
 * Read every source twice. A report is refused if either SQLite evidence or
 * PostgreSQL routed-marker evidence changes during the bounded dry run.
 */
export async function runGmailHistoricalCoverageAudit(input: {
  scopeIdentity: string;
  generatedAt: string;
  deps: GmailHistoricalCoverageAuditDeps;
}): Promise<GmailHistoricalCoverageReport> {
  let first: readonly GmailHistoricalCoverageCandidate[];
  let second: readonly GmailHistoricalCoverageCandidate[];
  try {
    first = await input.deps.listCandidates();
    const firstRouted = await input.deps.listClassificationEvidence(
      directRouteIds(first),
    );
    const firstComplete = applyClassificationEvidence(first, firstRouted);
    second = await input.deps.listCandidates();
    const secondRouted = await input.deps.listClassificationEvidence(
      directRouteIds(second),
    );
    const secondComplete = applyClassificationEvidence(second, secondRouted);
    if (
      fingerprintGmailHistoricalCoverageCandidates(firstComplete) !==
      fingerprintGmailHistoricalCoverageCandidates(secondComplete)
    ) {
      fail('source_drift', 'historical coverage source changed during audit');
    }
    return buildGmailHistoricalCoverageReport({
      scopeIdentity: input.scopeIdentity,
      generatedAt: input.generatedAt,
      candidates: secondComplete,
    });
  } catch (error) {
    if (error instanceof GmailHistoricalCoverageError) throw error;
    fail(
      'storage_unavailable',
      'historical coverage source is unavailable',
      error,
    );
  }
}
