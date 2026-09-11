# MCS website checkout enrollment adapter contract

Status: bounded synthetic/disposable implementation contract under
NC-20260909-003. This does not activate a route, runtime, provider call,
projection, course access, certificate clearance, attribution or production
database migration.

## Authenticated checkout-admission evidence

The fixed private command is `POST /internal/payments/enrollment-admissions`.
Its signed inner body has these exact fields:

```json
{
  "schemaVersion": 1,
  "requestId": "uuid",
  "attemptId": "uuid",
  "quoteId": "uuid",
  "quoteFingerprint": "sha256",
  "identity": {
    "preparationId": "uuid",
    "originOperationId": "uuid",
    "receiptReference": "identity-preparation:...",
    "payerReference": "party-ref:...",
    "participantReference": "party-ref:...",
    "payerRoleProof": "party-role-proof:...",
    "participantRoleProof": "party-role-proof:...",
    "purchaseRelationship": "self|other"
  },
  "consentBundle": {
    "bundleReceiptReference": "opaque-ref-matching-quote-consentReceipt",
    "enrollmentTerms": {
      "version": "approved-policy-version",
      "contentSha256": "sha256",
      "receiptReference": "opaque-ref",
      "acceptedAt": 0
    },
    "privacy": {
      "version": "approved-policy-version",
      "contentSha256": "sha256",
      "receiptReference": "opaque-ref",
      "acceptedAt": 0
    },
    "achMandate": null
  }
}
```

When present, `achMandate` has exact version/content/receipt/acceptedAt plus the
quote amount/currency, `frequency: one_time`, and `secCode: WEB`. It is required
only when a new enrollment consumes verified ACH payment acceptance. The
synthetic implementation does not establish live legal mandate validity,
provider account-validation configuration or an account-bound mandate.

The configured WordPress caller is authenticated by the existing request-HMAC
and nonce store. The host re-reads the exact persisted PaymentAttempt and exact
identity-preparation row using caller, preparation, originating operation and
identity receipt. It requires the role references/proofs/relationship, quote ID,
quote fingerprint, payer/participant references, bundle receipt, terms version
and terms acceptedAt to match the persisted records. Privacy uses the same
acceptance time/action bundle but retains an independent approved version,
content hash and receipt.

New evidence must match a fixed host policy registry of approved document
version/content-hash pairs and applicability time. An exact previously accepted
row replays after policy rotation; policy changes never rewrite history.

## Durable boundary

Migration 155 creates two admin-only immutable tables:

1. `payment_checkout_admission_evidence`: authenticated WordPress commerce,
   identity and consent facts. Its identity includes scope hash, caller,
   operation and attempt; it stores exact identity and consent bindings, request
   and evidence hashes, a stable evidence reference and database acceptance time.
2. `payment_enrollment_admissions`: the exact evidence consumed by canonical
   enrollment materialization. It binds the checkout evidence, full-scope native
   PSP, method-binding operation/evidence, original payment projection
   version/hash, staged publication identity/hash, offer/locale/bundle/component,
   canonical order/seat/enrollment and immutable financial/admission digests.

Both stable evidence references are reconstructable through host-only read
accessors for a future authenticated status route. This slice adds no status
route.

## Enrollment sequence and replay

The adapter accepts only `attemptId` and re-reads all authority. It is
`synthetic_fixture_only`, accepts only the staged Foundations publication with
runtime consumer disabled, and persists only through the existing disposable
enrollment-store transaction guard.

For new materialization it requires one exact method binding and one current
authorized payment projection matching the quote amount/currency/PSP, with no
second authorized PSP or adverse/conflicting evidence. ACH requires the accepted
mandate bundle; card requires fixed configured capture evidence. It claims the
full scoped native PSP writer separately, captures the commerce order from
scope+quote ID, links attempt/provider-operation/PSP aliases, and writes one
seat, active paid-in-full agreement, accepted-pending-receipt obligation and one
locale component. The resulting canonical enrollment is not course-access
delivery: no projection job or provider effect is requested.

Exact replay validates the immutable accepted and consumed bindings plus the
canonical readback. It does not recompute the original consumption digest from
today's evolving financial projection, catalog or capture configuration. It
separately rechecks current adverse state and reports it without rewriting facts,
revoking access or clearing certification. Missing/pending/conflicting evidence
returns held before canonical writes. Multiple PSPs never create a second writer
claim or enrollment.

No certificate financial-clearance, received-funds, free-order, promotion
consumption, attribution, native access, customer communication or payment
operation is implemented here.
