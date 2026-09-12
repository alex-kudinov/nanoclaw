# NC-20260909-003 paid-invoice backend review response

Scope reviewed: `NC-20260909-003-PAID-INVOICE-BACKEND-REVIEW.diff` only, per the
bounded packet. Findings below, ordered by consequence.

## 1. [Material] Migration164's purge escape hatch is not privilege-separated from the app's own DB role

`purge_payment_checkout_document()` and the five new/updated trigger guards
(`fn_payment_checkout_document_body_guard`, `..._capability_guard`,
`..._email_receipt_guard`, `..._retention_event_guard`, and the rewritten
`fn_payment_checkout_document_email_guard`) all gate DELETE with the same
pattern:

```sql
IF TG_OP='DELETE' AND
   current_setting('business_v2.checkout_document_purge',true)=OLD.document_id::text THEN
  RETURN OLD;
END IF;
RAISE EXCEPTION ...;
```
(`164_payment_checkout_document_retention.sql:102-169`)

`set_config()`/`current_setting()` are ordinary built-ins with no
object-level ACL — any session on the connection can set that GUC itself.
The only reason this is safe in the intended flow is that
`purge_payment_checkout_document()` is the sole caller that sets it, and
that function is `SECURITY DEFINER`, owned by `nanoclaw_admin`, with
`REVOKE ALL ... FROM PUBLIC` and a per-role revoke loop
(`164_...sql:259-279`).

But `config-examples/website-checkout-live.private.template.json` (unchanged
context line 6) shows the app itself connects as `"role": "nanoclaw_admin"` —
the same role that owns `payment_checkout_documents`,
`payment_checkout_document_capabilities`, `payment_checkout_document_email_jobs/receipts`,
and the new retention tables/function. PostgreSQL table owners retain full
implicit DML rights on their own objects regardless of REVOKE statements
aimed at other roles, and no `FORCE ROW LEVEL SECURITY`/RLS policy is defined
on any of these tables in this migration.

Net effect: any code path on the app's own connection (a bug, a future
maintenance change, or an injection) that runs

```sql
SELECT set_config('business_v2.checkout_document_purge','<document_id>',true);
DELETE FROM business_v2.payment_checkout_documents WHERE document_id='<document_id>';
```

satisfies the trigger guard and deletes the row **without ever calling
`purge_payment_checkout_document()`** — i.e., without the retention-window
check, without the legal-hold check, and without ever writing a tombstone.
Without a tombstone, the `purged.rowCount` guard in the issuance path
(`payment-checkout-documents.ts:917-923`) that blocks regeneration also never
fires, since it only checks the tombstones table.

This is new surface introduced by migration164: the pre-existing
`fn_payment_checkout_document_immutable()` (reused unmodified for the
tombstones table, `164_...sql:192-194`) has no escape hatch at all and simply
always raises. The new guard functions do. Because the escape hatch's only
real protection is "application code is trusted to call the wrapped function
correctly," not a DB-enforced privilege boundary, the stated guarantees
(immutability, legal-hold-blocks-purge, retention-window-enforced,
no-regeneration-without-tombstone) hold only by code discipline for this
table set, not by database access control, contrary to what a
`SECURITY DEFINER` + `REVOKE ALL` pattern normally implies.

Recommend either: (a) running the app under a role that does **not** own
these tables and has no DELETE/UPDATE grant on them (so only the
`SECURITY DEFINER` function, owned by a separate privileged role, can act),
or (b) explicitly documenting that these particular guarantees are
enforced by code discipline only, not database privilege separation, so
reviewers don't rely on the trigger as an independent control.

## 2. [Material] Retention worker silently discards purge failures and can be permanently stuck by Gmail dedup

`PaymentCheckoutDocumentRetentionWorker.sweep()`'s per-candidate error
handling is a bare swallow:

```ts
} catch {
  held++;
}
```
(`payment-checkout-documents.ts:1247-1249`)

No error, document id, or reason is logged or counted anywhere. Combined
with `PgPaymentCheckoutDocumentStore.purge()`'s evidence check:

```ts
if (
  externalDeletionEvidenceSha256.length !== candidate.emailJobs.length ||
  new Set(externalDeletionEvidenceSha256).size !==
    externalDeletionEvidenceSha256.length
)
  throw new PaymentDomainError('checkout_document_retention_conflict');
```
(`payment-checkout-documents.ts:1080-1085`)

— a document whose email jobs resolve to the same Gmail message (the
existing "Gmail deduplication/readback" behavior the request calls out as an
invariant to preserve) will produce **identical** evidence hashes for two or
more jobs (the hash is derived only from `messageId`/`threadId`/`pdfSha256`,
`deleteExact` in `payment-checkout-documents.ts:1152-1194`). The uniqueness
check then throws on every sweep, forever, for that document, and the bare
`catch {}` hides it completely. That document's PII/PDF/recipient data would
never purge past the 7-year window despite retention_until having passed,
with no operator-visible signal — the exact "silently discard evidence"
failure mode the request asked about, and a live path to violating the
retention/deletion guarantee rather than just an availability nuisance.

Recommend logging/counting each swallowed exception (document id + error),
and reconsidering the per-evidence uniqueness check so that legitimately
deduplicated Gmail sends (same message backing multiple job rows) don't
permanently block purge.

## 3. [Minor] Retention worker does not drain on shutdown

`stop()` only clears the interval; it does not await or track an in-flight
`sweep()` (started fire-and-forget via `void this.sweep()` in `start()`,
`payment-checkout-documents.ts:1257-1269`). This does not block
shutdown/readiness (the opposite of a concern), but a sweep can be cut off
mid-flight by process exit. Because DB purge is transactional and Gmail
delete is idempotent (404 handled as `already_absent`), this is not a
data-integrity risk today, but it is an unmanaged async operation across
shutdown and could throw an unhandled rejection during teardown. Consider
awaiting the last sweep in the service's shutdown path before closing the
pool.

## 4. [Info, not a defect] No cross-instance locking in `dueForPurge`

`dueForPurge` is a plain `SELECT` with no `FOR UPDATE SKIP LOCKED`; overlap
protection is only the in-process `running` boolean plus the `FOR UPDATE`
row lock inside `purge_payment_checkout_document()`. For a single running
instance this is sufficient. If this service is ever scaled to multiple
concurrent instances, duplicate Gmail-delete attempts and duplicate purge
attempts are possible but are individually idempotent (404-tolerant delete,
`already_purged`/`not found` handling), so this does not currently rise to a
data-integrity defect — noting it only because the request asked about
overlap.

## Checked and found consistent with the accepted decisions (no findings)

- Immediate-capture evidence is fail-closed: `capturePolicy.evidenceReference`
  is cross-checked against `backend.cardCaptureConfigurationEvidence` at
  config parse time and throws on mismatch
  (`website-checkout-live-runner.ts:303-309`).
- Tombstones store only number/date/amount/currency/hashes, no PII or
  encrypted payloads (`164_...sql:79-100`); regeneration is blocked by a
  pre-issuance lookup against the tombstone table keyed on
  `attempt_id_sha256` + `document_kind`.
- Gmail deletion happens before the local DB purge call in `sweep()`, and
  both sides are independently idempotent/retry-safe on partial failure.
- Legal hold and retention-window checks in `purge_payment_checkout_document`
  are re-evaluated under the same `FOR UPDATE` row lock used by
  `recordRetentionEvent`, closing the race between "hold placed after
  `dueForPurge` selected a candidate" and the actual purge.
- Customer-facing PDF text removes "authorized for automatic capture" /
  "settlement status is not represented" language and renders "Paid"; seller
  EIN is omitted with an explanatory line; buyer tax/VAT ID remains optional
  and is only rendered when present.
- `build-release.mjs` adds both the migration and its rollback plus the new
  logo asset to the immutable bundle list; the "Current verification"
  section already reports two runtime PDFs render cleanly against the
  packaged asset, which covers the main risk (asset path resolution after
  bundling) empirically.
- Rollback correctly refuses once any v2 document, retention event, or
  tombstone exists.

No further material findings.
