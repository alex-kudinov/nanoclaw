/**
 * Content-free durable outcome contract for one Gmail inbound candidate.
 *
 * A disposition receipt proves only that the current host ingestion boundary
 * reached one closed terminal decision for an immutable Gmail message ID. It
 * does not prove task completion, classification quality, reply delivery, or a
 * Company OS watermark advance.
 */

import { createHash } from 'crypto';

import type { CompanyGmailCandidateAccounting } from './company-gmail-reconciliation.js';

export const GMAIL_INBOUND_DISPOSITION_CONTRACT_VERSION = 1 as const;
export const GMAIL_INBOUND_DISPOSITION_SOURCE_KEY = 'gmail:inbound-v1' as const;

const MESSAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

export type GmailInboundAcceptedReason =
  | 'inbound_message_persisted'
  | 'classified_route_persisted'
  | 'rule_auto_archive_completed'
  | 'legacy_message_persisted';

export type GmailInboundRejectedReason =
  | 'own_outbound'
  | 'spam_or_trash'
  | 'empty_message'
  | 'hard_filter'
  | 'thread_outbound';

export type GmailInboundDispositionReason =
  | GmailInboundAcceptedReason
  | GmailInboundRejectedReason;

export type GmailInboundDisposition = 'accepted' | 'rejected';

export type GmailInboundDispositionErrorCode =
  | 'invalid_input'
  | 'conflict'
  | 'storage_unavailable';

export class GmailInboundDispositionError extends Error {
  constructor(
    public readonly code: GmailInboundDispositionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'GmailInboundDispositionError';
  }
}

export interface GmailInboundDispositionInput {
  messageId: string;
  disposition: GmailInboundDisposition;
  reasonKey: GmailInboundDispositionReason;
  sourceEvidenceSha256: string;
  observedAt: string;
}

export interface GmailInboundDispositionReceipt {
  contractVersion: typeof GMAIL_INBOUND_DISPOSITION_CONTRACT_VERSION;
  sourceKey: typeof GMAIL_INBOUND_DISPOSITION_SOURCE_KEY;
  messageId: string;
  disposition: GmailInboundDisposition;
  reasonKey: GmailInboundDispositionReason;
  sourceEvidenceSha256: string;
  receiptFingerprint: string;
  observedAt: string;
  recordedAt: string;
}

export interface NormalizedGmailInboundDispositionInput extends GmailInboundDispositionInput {
  contractVersion: typeof GMAIL_INBOUND_DISPOSITION_CONTRACT_VERSION;
  sourceKey: typeof GMAIL_INBOUND_DISPOSITION_SOURCE_KEY;
  receiptFingerprint: string;
}

const ACCEPTED_REASONS = new Set<GmailInboundDispositionReason>([
  'inbound_message_persisted',
  'classified_route_persisted',
  'rule_auto_archive_completed',
  'legacy_message_persisted',
]);

const REJECTED_REASONS = new Set<GmailInboundDispositionReason>([
  'own_outbound',
  'spam_or_trash',
  'empty_message',
  'hard_filter',
  'thread_outbound',
]);

function fail(
  code: GmailInboundDispositionErrorCode,
  message: string,
  cause?: unknown,
): never {
  throw new GmailInboundDispositionError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function hash(parts: readonly unknown[]): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function normalizeGmailInboundMessageId(value: unknown): string {
  if (typeof value !== 'string' || !MESSAGE_ID_PATTERN.test(value)) {
    fail('invalid_input', 'Gmail disposition messageId is invalid');
  }
  return value;
}

function normalizeSha256(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) {
    fail('invalid_input', `${field} is invalid`);
  }
  return value;
}

function normalizeTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string') fail('invalid_input', `${field} is invalid`);
  const match = ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match) fail('invalid_input', `${field} is invalid`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const calendar = new Date(Date.UTC(year, month - 1, day));
  if (
    calendar.getUTCFullYear() !== year ||
    calendar.getUTCMonth() !== month - 1 ||
    calendar.getUTCDate() !== day
  ) {
    fail('invalid_input', `${field} is invalid`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    fail('invalid_input', `${field} is invalid`);
  }
  return new Date(milliseconds).toISOString();
}

function normalizeDisposition(value: unknown): GmailInboundDisposition {
  if (value !== 'accepted' && value !== 'rejected') {
    fail('invalid_input', 'Gmail disposition is invalid');
  }
  return value;
}

function normalizeReason(
  value: unknown,
  disposition: GmailInboundDisposition,
): GmailInboundDispositionReason {
  if (typeof value !== 'string') {
    fail('invalid_input', 'Gmail disposition reasonKey is invalid');
  }
  const reasons =
    disposition === 'accepted' ? ACCEPTED_REASONS : REJECTED_REASONS;
  if (!reasons.has(value as GmailInboundDispositionReason)) {
    fail(
      'invalid_input',
      'Gmail disposition reasonKey does not match its disposition',
    );
  }
  return value as GmailInboundDispositionReason;
}

export function hashGmailInboundSourceEvidence(
  reasonKey: GmailInboundDispositionReason,
  contentFreeParts: readonly unknown[],
): string {
  return hash([
    'nanoclaw:gmail-inbound-source-evidence:v1',
    reasonKey,
    ...contentFreeParts,
  ]);
}

export function normalizeGmailInboundDispositionInput(
  input: GmailInboundDispositionInput,
): NormalizedGmailInboundDispositionInput {
  if (!input || typeof input !== 'object') {
    fail('invalid_input', 'Gmail disposition input is invalid');
  }
  const messageId = normalizeGmailInboundMessageId(input.messageId);
  const disposition = normalizeDisposition(input.disposition);
  const reasonKey = normalizeReason(input.reasonKey, disposition);
  const sourceEvidenceSha256 = normalizeSha256(
    input.sourceEvidenceSha256,
    'Gmail disposition sourceEvidenceSha256',
  );
  const observedAt = normalizeTimestamp(input.observedAt, 'observedAt');
  const receiptFingerprint = hash([
    'nanoclaw:gmail-inbound-disposition:v1',
    GMAIL_INBOUND_DISPOSITION_CONTRACT_VERSION,
    GMAIL_INBOUND_DISPOSITION_SOURCE_KEY,
    messageId,
    disposition,
    reasonKey,
    sourceEvidenceSha256,
  ]);
  return {
    contractVersion: GMAIL_INBOUND_DISPOSITION_CONTRACT_VERSION,
    sourceKey: GMAIL_INBOUND_DISPOSITION_SOURCE_KEY,
    messageId,
    disposition,
    reasonKey,
    sourceEvidenceSha256,
    receiptFingerprint,
    observedAt,
  };
}

export function normalizeGmailInboundDispositionReceipt(
  receipt: GmailInboundDispositionReceipt,
): GmailInboundDispositionReceipt {
  if (!receipt || typeof receipt !== 'object') {
    fail('storage_unavailable', 'Gmail disposition receipt is malformed');
  }
  const normalized = normalizeGmailInboundDispositionInput(receipt);
  if (
    receipt.contractVersion !== normalized.contractVersion ||
    receipt.sourceKey !== normalized.sourceKey ||
    receipt.receiptFingerprint !== normalized.receiptFingerprint
  ) {
    fail('storage_unavailable', 'Gmail disposition receipt failed validation');
  }
  return {
    ...normalized,
    recordedAt: normalizeTimestamp(receipt.recordedAt, 'recordedAt'),
  };
}

export function gmailInboundReceiptToCandidateAccounting(
  messageIdValue: string,
  receipt: GmailInboundDispositionReceipt | undefined,
): CompanyGmailCandidateAccounting {
  const messageId = normalizeGmailInboundMessageId(messageIdValue);
  if (!receipt) {
    return {
      disposition: 'unknown',
      reasonKey: 'receipt_missing',
      evidenceSha256: hash([
        'nanoclaw:gmail-inbound-disposition-missing:v1',
        GMAIL_INBOUND_DISPOSITION_SOURCE_KEY,
        messageId,
      ]),
    };
  }
  const normalized = normalizeGmailInboundDispositionReceipt(receipt);
  if (normalized.messageId !== messageId) {
    fail('storage_unavailable', 'Gmail disposition receipt ID mismatch');
  }
  return {
    disposition: normalized.disposition,
    reasonKey: normalized.reasonKey,
    evidenceSha256: normalized.receiptFingerprint,
  };
}
