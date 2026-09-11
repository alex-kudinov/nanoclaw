# Bounded independent review response: shared Adyen TEST feed (R1)

## Verdict

No material defect found against the required properties, within the exact
allowed files reviewed.

## Evidence per required property

**Batch signatures + exact merchant validated before any filter/write**
`src/adyen-webhook.ts:273-283`: `signedItems` is parsed for the whole batch,
then a `for...of` loop verifies HMAC for every item (throws 401 on first
failure, `:274-278`), then a second full-batch loop checks
`merchantAccountCode` (throws 403 on first failure, `:279-283`). Only after
both loops complete does the filter/admission loop (`:285-302`) run. No write
path is reachable before these two loops finish without throwing.

**Only signed non-Tandem references silently discarded when opted in**
`src/adyen-webhook.ts:286-290`: the discard branch keys exclusively off
`signed.merchantReference` (an HMAC-signed field, confirmed not derived from
`additionalData.store`, which is excluded from `standardWebhookSigningPayload`
at `:183-194`). `continue` produces no side effect. Matches
`docs/ADYEN-TEST-WEBHOOK.md:60-62` ("Filtering never uses the unsigned
reported store to decide ownership").

**Store cannot control discard; Tandem-prefixed item with bad store/metadata/event still rejects atomically**
`src/adyen-webhook.ts:291-300`: for any item passing the prefix check,
`parseTandemItem` (enforces `eventDate` and bounded optional fields) then the
store equality check (`:292-294`) then the event-code allowlist check
(`:295-300`) each throw synchronously, before the function's single `return`
(`:304-338`) executes. Because the return is one statement built from the
fully-populated `items` array, a throw on any item discards previously
collected admissions too — confirmed by
`src/adyen-webhook.test.ts:254-258` and `:245-253` (store/event-code
rejections still fire with `sharedFeedConfig`).

**Foreign-only batch → 202, zero archive/dispatch/logging of payload/IDs**
`FILTER-DIFF.md` test "acknowledges a verified foreign-only TEST batch..."
(webhook-server.test.ts) asserts `archiveWebhook`, `markWebhookHandled`,
`runAgent`, `enqueueAgentTask` are not called and that
`foreign-psp-reference` / `another-platform-attempt-1` / `another_store` do
not appear in any logger call. The route handler in `FILTER-DIFF.md` has no
logging statement on the success path (`res.writeHead(202, ...)`), only on
the `catch` branches (`logger.warn` at admission rejection, `logger.error` on
durable-admission failure), neither of which logs item content.

**Mixed batch archives only valid Tandem notices; strict default remains**
`src/adyen-webhook.test.ts:182-198` and the `FILTER-DIFF.md` test "archives
only the Tandem item from a verified mixed TEST batch" both confirm one
admitted item with `eventId: 'tandem-psp-reference:AUTHORISATION:true'`.
Default-off behavior is confirmed by
`src/adyen-webhook.test.ts:101-105` (`discardVerifiedForeignReferences` is
`false` when the env var is unset) and `:268-312` (unqualified `config`,
without the flag, still 403s a non-Tandem reference).

**Malformed / HMAC-invalid / LIVE / wrong-merchant fail closed**
`src/adyen-webhook.ts:256-262` (LIVE → 403), `:274-278` (HMAC → 401),
`:279-283` (merchant → 403); malformed structural fields fail via
`requiredString`/`parseAmount`/`normalizeSuccess` (400) in `parseSignedItem`
(`:134-159`), all ahead of any write path. Covered by
`src/adyen-webhook.test.ts:268-312`.

**No credential value included; fixture is not a real key**
`OFFICIAL_KEY` (`src/adyen-webhook.test.ts:11-12`) and its paired
`hmacSignature` in the "matches the official Adyen signing example" test
(`:124-139`) are Adyen's own published Standard-webhook documentation
example (pspReference `7914073381342284`, `TestPayment-1407325143704`, 1130
EUR) — a publicly documented test vector, not a live secret. Per the review
packet's accepted scope, this vector is already covered and not reopened.

## Notes (non-defects, no action needed)

- `docs/ADYEN-TEST-WEBHOOK.md:60-62` lists the Tandem-item checks as "store,
  event-code, date, and bounded optional-field," while the code order is
  date/optional-fields (inside `parseTandemItem`) then store then event-code
  (`src/adyen-webhook.ts:291-300`). All checks are conjunctive and each
  throws before the function's single return statement, so the ordering
  difference has no security or correctness effect. Not raised as a defect.

## Scope compliance

Reviewed only: `src/adyen-webhook.ts`, `src/adyen-webhook.test.ts`,
`docs/ADYEN-TEST-WEBHOOK.md`, and the bounded diffs/excerpts in
`FILTER-DIFF.md`. Did not open `src/webhook-server.ts` in full, did not
re-examine the Standard HMAC algorithm or payment architecture, ran no Bash
and made no source edits.

## Run receipt

Sonnet/high bounded review, session7096c3ea-2d87-4d42-8e7e-c222c1977835.
Actual Read,Write tools and strict empty MCP config. Six model calls; input12,
cache creation57212, cache reads217046, output14017; max context67099.
Reported usage cost0.4124512; no usage warnings. Codex independently checked
the admitted-only return path and HTTP archive/empty-array behavior. Actual
provider and LIVE outcomes are not inferred from this source review.
