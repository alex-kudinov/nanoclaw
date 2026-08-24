# Claude correction review response: Gmail attachment material findings

Reviewed: `src/attachment-convert.ts`, `src/attachment-convert.test.ts`,
`src/gmail-attachment-processing.ts`, `src/gmail-attachment-processing.test.ts`,
against `NC-20260822-011-CLAUDE-ATTACHMENT-CORRECTION-REQUEST.md` and
`NC-20260822-011-CLAUDE-ATTACHMENT-REVIEW-RESPONSE.md`.

## Verdict: NO MATERIAL FINDINGS

## Correction 1 — ODF markup gate

`extractOdfText` (`attachment-convert.ts:174-189`) now trims a UTF-8 BOM and
requires the decoded `content.xml` to match
`/^(?:<\?xml[\s\S]*?\?>\s*)?<office:document-content(?:\s|>)/` before calling
`odfXmlToText`; non-matching bytes return `null` before the anchor-and-strip
path ever runs. `extractAttachmentText`'s `odf` branch
(`attachment-convert.ts:441-453`) turns that `null` into
`{ state: 'extraction_failed', errorCode: 'odf_no_text' }` with no `text`
field — the ciphertext-as-`ready` path Finding 1 identified no longer exists.
Legitimate ODF still passes: `attachment-convert.test.ts:203-210` extracts
real text from a well-formed `content.xml`. The regression
(`attachment-convert.test.ts:236-252`) feeds a `content.xml` of arbitrary
binary bytes (`0xdeadbeef...`) and asserts both `extractOdfText` returns
`null` and `extractAttachmentText` returns the held `extraction_failed` /
`odf_no_text` state — matching the scoped correction exactly.

## Correction 2 — ZIP validation exception handling

`deps.validateZip` is now called inside a `try/catch`
(`gmail-attachment-processing.ts:493-503`); a rejection immediately calls
`finishResult`, finalizing the already-`startReceipt`'d row as
`{ state: 'quarantined', extractionMethod: 'zip-inspection-v1', errorCode: 'zip_inspection_exception' }`.
No code path between `startReceipt` and this catch can leave the row in
`downloading`. The regression
(`gmail-attachment-processing.test.ts:200-225`) supplies a `validateZip` that
rejects and asserts `finishes[0]` is `{ state: 'quarantined', errorCode: 'zip_inspection_exception' }`
with `report.held === 1` — a terminal state is observed, not an absence of a
throw.

## Correction 3 — Post-decode running-total enforcement

After the per-attachment `buf.length > MAX_ATTACHMENT_BYTES` check,
`processOne` now also checks `totalBytesSoFar + buf.length > MAX_TOTAL_BYTES`
(`gmail-attachment-processing.ts:426-437`) using the actual decoded length,
independent of whether `reportedSizeBytes` was present, and returns before
sniffing or extraction runs. The regression
(`gmail-attachment-processing.test.ts:227-259`) sends three attachments with
no `body.size` at 17 MB decoded each; `finishes` states are
`['ready', 'ready', 'oversized']` and `finishes[2]` carries
`errorCode: 'message_total_size_limit'` with `actualSizeBytes` equal to the
buffer length — the 51 MB combined total is caught on the third part before
extraction, closing the bypass Finding 3 identified.

## Invariants

No held state was converted to `ready`, no terminal state was removed, and no
existing bound was loosened. Legitimate ODF, non-ZIP, and under-limit paths
in both test files are unchanged and passing. All three corrections match
their stated scope with no observed side effect outside the finding they
target.
