import { createHash } from 'node:crypto';

import { IdentityControlPlaneError, invariant } from './errors.js';

type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue };

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalValue(value: unknown, path = '$'): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number') {
    invariant(Number.isFinite(value), 'REPLAY_CANONICAL_VALUE_UNSUPPORTED', {
      path,
    });
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      canonicalValue(item, `${path}[${index}]`),
    );
  }
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    invariant(
      prototype === Object.prototype || prototype === null,
      'REPLAY_CANONICAL_VALUE_UNSUPPORTED',
      { path },
    );
    const object = value as Record<string, unknown>;
    const normalized: Record<string, JsonValue> = {};
    for (const key of Object.keys(object).sort(compareCodePoints)) {
      invariant(
        object[key] !== undefined,
        'REPLAY_CANONICAL_VALUE_UNSUPPORTED',
        { path: `${path}.${key}` },
      );
      normalized[key] = canonicalValue(object[key], `${path}.${key}`);
    }
    return normalized;
  }
  throw new IdentityControlPlaneError('REPLAY_CANONICAL_VALUE_UNSUPPORTED', {
    path,
  });
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function sha256Json(value: unknown): string {
  return sha256(canonicalJson(value));
}

export interface CanonicalScopedReference {
  provider: string;
  environment: string;
  scope: string;
  entityType: string;
  externalId: string;
}

export function scopedReferenceKey(
  reference: CanonicalScopedReference,
): string {
  return canonicalJson([
    reference.provider,
    reference.environment,
    reference.scope,
    reference.entityType,
    reference.externalId,
  ]);
}

export interface CanonicalReceipt {
  receiptId: string;
  sourceRef: CanonicalScopedReference;
  sourceEffectiveAt?: string | null;
  providerEventId?: string | null;
  deduplicationKey: string;
  payloadSha256: string;
}

export function canonicalReceiptSortKey(receipt: CanonicalReceipt): string {
  const reference = receipt.sourceRef;
  return canonicalJson([
    receipt.sourceEffectiveAt ?? '1970-01-01T00:00:00.000Z',
    reference.provider,
    reference.environment,
    reference.scope,
    reference.entityType,
    reference.externalId,
    receipt.providerEventId ?? receipt.deduplicationKey,
    receipt.payloadSha256,
    receipt.receiptId,
  ]);
}

export function canonicalReplayHash(
  receipts: readonly CanonicalReceipt[],
): string {
  const ordered = [...receipts].sort((left, right) =>
    compareCodePoints(
      canonicalReceiptSortKey(left),
      canonicalReceiptSortKey(right),
    ),
  );
  return sha256Json(ordered);
}
