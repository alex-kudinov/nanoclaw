import { createHash } from 'node:crypto';

import { z } from 'zod';

import { PaymentDomainError } from './payment-domain.js';

const uuid = z.uuid();
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const ref = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9_:.\/-]+$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const country = z.string().regex(/^[A-Z]{2}$/);
const locale = z.string().regex(/^[a-z]{2}-(?:[A-Z]{2}|[0-9]{3})$/);

const pricingSchema = z
  .object({
    baseAmount: integer,
    displayAmount: integer,
    currency: z.string().regex(/^[A-Z]{3}$/),
    regionalEligible: z.boolean(),
    regionalApplied: z.boolean(),
    pricingPolicy: ref,
  })
  .strict();
const recoverySchema = z
  .object({
    consent: z.enum(['granted', 'denied']),
    policy: ref,
    country: z.union([z.literal(''), country]),
    choice: z.enum(['default', 'opt_in', 'opt_out']),
    mode: z.enum(['default_on', 'explicit_required']),
  })
  .strict();
const trackingConsentSchema = z
  .object({
    state: z.enum(['granted', 'denied', 'unknown']),
    provenance: ref,
    receipt: ref.nullable(),
    claimReference: ref.nullable(),
  })
  .strict();
const trackingSchema = z
  .object({
    consentReceipt: ref.nullable(),
    joinStatus: z.enum([
      'permission_denied',
      'permission_unknown',
      'claim_missing',
      'resolved',
      'session_not_found',
      'session_ambiguous',
      'gclid_missing',
      'lookup_unavailable',
    ]),
    trackerSessionReference: ref.nullable(),
    gclid: z
      .string()
      .min(1)
      .max(255)
      .refine((value) => !/[\u0000-\u0020\u007f]/u.test(value))
      .nullable(),
  })
  .strict();
const snapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    snapshotId: uuid,
    intentId: uuid,
    offerKey: ref,
    program: ref,
    productName: z
      .string()
      .min(1)
      .max(200)
      .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value)),
    canonicalLocale: locale,
    country,
    pricingPreference: z.enum(['regional', 'standard']),
    promotionCodeHash: digest.nullable(),
    catalogVersion: ref,
    bundleVersion: ref,
    deliveryVersion: ref,
    returnContextReference: ref,
    pricing: pricingSchema,
    recovery: recoverySchema,
    fieldMapId: ref,
    fieldMapSha256: digest,
    origin: z.literal('tandem_wordpress_preview'),
    enrollmentScope: z.literal('standalone_course'),
    cohortDisposition: z.literal('not_applicable_self_paced'),
    promotionStatus: z.enum(['none', 'pending_validation']),
    trackingConsent: trackingConsentSchema,
    tracking: trackingSchema,
    requestFingerprint: digest,
    capturedAt: integer,
  })
  .strict();
const bindingSchema = z
  .object({
    schemaVersion: z.literal(1),
    snapshotId: uuid,
    snapshotSha256: digest,
    intentId: uuid,
    quoteId: uuid,
    quoteFingerprint: digest,
    dispatchKind: z.literal('payment'),
    attemptReference: uuid,
    attemptOperationReference: ref,
    freeOrderId: z.null(),
    freeOrderOperationReference: z.null(),
    offerKey: ref,
    catalogVersion: ref,
    bundleVersion: ref,
    deliveryVersion: ref,
    locale,
    country,
    currency: z.string().regex(/^[A-Z]{3}$/),
    originalAmount: integer,
    discountAmount: integer,
    finalAmount: integer,
    discountPolicyReference: ref.nullable(),
    paymentOption: z.literal('one_time'),
    payerReference: ref.regex(/^party-ref:/),
    participantReference: ref.regex(/^party-ref:/),
    termsVersion: ref,
    termsAcceptedAt: integer,
    consentBundleReference: ref,
    privacyVersion: ref,
    privacyAcknowledgementReference: ref,
  })
  .strict();
export const checkoutAttributionHandoffSchema = z
  .object({
    snapshotId: uuid,
    snapshotSha256: digest,
    snapshotJsonBase64: z.string().min(4).max(65536),
    bindingReference: ref.regex(/^attribution-binding:v1:/),
    bindingSha256: digest,
    bindingJsonBase64: z.string().min(4).max(65536),
  })
  .strict();

export type CheckoutAttributionHandoff = z.infer<
  typeof checkoutAttributionHandoffSchema
>;
export type CheckoutAttributionSnapshot = z.infer<typeof snapshotSchema>;
export type CheckoutAttributionBinding = z.infer<typeof bindingSchema>;

export interface ValidatedCheckoutAttribution {
  handoff: CheckoutAttributionHandoff;
  snapshot: CheckoutAttributionSnapshot;
  binding: CheckoutAttributionBinding;
  snapshotJson: string;
  bindingJson: string;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, child]) => [key, canonical(child)]),
    );
  return value;
}

export function canonicalCheckoutAttributionJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}

function decodeCanonicalBase64(
  encoded: string,
  expectedSha256: string,
  code: string,
): { value: unknown; json: string } {
  try {
    const body = Buffer.from(encoded, 'base64');
    if (
      body.length < 2 ||
      body.length > 32768 ||
      body.toString('base64') !== encoded
    )
      throw new Error();
    const json = body.toString('utf8');
    if (
      Buffer.from(json, 'utf8').compare(body) !== 0 ||
      createHash('sha256').update(body).digest('hex') !== expectedSha256
    )
      throw new Error();
    const value: unknown = JSON.parse(json);
    if (canonicalCheckoutAttributionJson(value) !== json) throw new Error();
    return { value, json };
  } catch {
    throw new PaymentDomainError(code);
  }
}

function ensure(condition: boolean, code: string): asserts condition {
  if (!condition) throw new PaymentDomainError(code);
}

/**
 * Validate the exact WordPress-produced immutable snapshot and quote binding.
 * Cross-system attempt/identity/consent checks remain the host store's job.
 */
export function parseCheckoutAttributionHandoff(
  input: unknown,
): ValidatedCheckoutAttribution {
  const parsed = checkoutAttributionHandoffSchema.safeParse(input);
  if (!parsed.success)
    throw new PaymentDomainError('invalid_checkout_attribution');
  const handoff = parsed.data;
  const decodedSnapshot = decodeCanonicalBase64(
    handoff.snapshotJsonBase64,
    handoff.snapshotSha256,
    'checkout_attribution_snapshot_conflict',
  );
  const decodedBinding = decodeCanonicalBase64(
    handoff.bindingJsonBase64,
    handoff.bindingSha256,
    'checkout_attribution_binding_conflict',
  );
  const snapshot = snapshotSchema.safeParse(decodedSnapshot.value);
  const binding = bindingSchema.safeParse(decodedBinding.value);
  if (!snapshot.success)
    throw new PaymentDomainError('invalid_checkout_attribution_snapshot');
  if (!binding.success)
    throw new PaymentDomainError('invalid_checkout_attribution_binding');
  const s = snapshot.data;
  const b = binding.data;
  const {
    tracking: _tracking,
    requestFingerprint: _requestFingerprint,
    capturedAt: _capturedAt,
    ...snapshotRequest
  } = s;
  ensure(
    handoff.snapshotId === s.snapshotId &&
      handoff.snapshotId === b.snapshotId &&
      handoff.snapshotSha256 === b.snapshotSha256 &&
      handoff.bindingReference === `attribution-binding:v1:${b.quoteId}` &&
      s.intentId === b.intentId &&
      s.offerKey === b.offerKey &&
      s.catalogVersion === b.catalogVersion &&
      s.bundleVersion === b.bundleVersion &&
      s.deliveryVersion === b.deliveryVersion &&
      s.canonicalLocale === b.locale &&
      s.country === b.country &&
      s.pricing.baseAmount === b.originalAmount &&
      s.pricing.displayAmount >= b.finalAmount &&
      s.pricing.currency === b.currency &&
      b.discountAmount <= b.originalAmount &&
      b.finalAmount === b.originalAmount - b.discountAmount &&
      s.promotionStatus ===
        (s.promotionCodeHash === null ? 'none' : 'pending_validation') &&
      (!s.pricing.regionalApplied || s.pricing.regionalEligible) &&
      createHash('sha256')
        .update(canonicalCheckoutAttributionJson(snapshotRequest))
        .digest('hex') === s.requestFingerprint,
    'checkout_attribution_binding_conflict',
  );
  const consent = s.trackingConsent;
  const tracking = s.tracking;
  ensure(
    ((consent.state === 'unknown' && consent.receipt === null) ||
      (consent.state !== 'unknown' && consent.receipt !== null)) &&
      (consent.state === 'granted' || consent.claimReference === null) &&
      (tracking.joinStatus !== 'resolved' ||
        (tracking.gclid !== null &&
          tracking.trackerSessionReference !== null)) &&
      (tracking.joinStatus === 'resolved' || tracking.gclid === null) &&
      (!['permission_denied', 'permission_unknown', 'claim_missing'].includes(
        tracking.joinStatus,
      ) ||
        tracking.trackerSessionReference === null),
    'checkout_attribution_snapshot_conflict',
  );
  return Object.freeze({
    handoff: Object.freeze(structuredClone(handoff)),
    snapshot: Object.freeze(structuredClone(s)),
    binding: Object.freeze(structuredClone(b)),
    snapshotJson: decodedSnapshot.json,
    bindingJson: decodedBinding.json,
  });
}
