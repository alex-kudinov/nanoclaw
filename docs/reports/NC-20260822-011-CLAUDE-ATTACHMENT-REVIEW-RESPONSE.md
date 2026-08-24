# Claude bounded review response: host-owned Gmail attachment processing

Reviewed: `src/gmail-attachment-processing.ts`, `src/gmail-attachment-processing.test.ts`,
`src/attachment-convert.ts`, `src/gmail-api.ts`, `src/gmail-ipc-handlers.ts`, `src/db.ts`,
`src/gmail-parser.ts`.

## Verdict: MATERIAL FINDINGS

## Finding 1 (High) — Encrypted/malformed ODF content can report `ready` with ciphertext-derived text instead of a held state

**Evidence:** `attachment-convert.ts:168-177` (`extractOdfText`) reads the `content.xml`
zip entry and returns `odfXmlToText(content.toString('utf-8'))` as valid text whenever the
result is non-empty, with no check that the bytes are actually well-formed ODF markup.
`odfXmlToText` (`attachment-convert.ts:123-141`) anchors on `<office:body...>` via
`.replace()`, which is a no-op when the tag isn't present — the untouched input is returned
unchanged rather than failing. Contrast with `extractIWorkPdf`
(`attachment-convert.ts:183-192`), which validates the `%PDF` magic before accepting
extracted bytes as usable.

OpenDocument encryption (ODF 1.2 §3, e.g. a password set from LibreOffice) encrypts each
file's *content* but does not apply the ZIP format's own password protection — `content.xml`
remains an ordinary, unencrypted zip entry whose payload is ciphertext. `readZipEntry`
therefore succeeds and returns the ciphertext bytes unmodified. Cryptographic ciphertext
essentially never contains the literal ASCII sequence `<office:body`, so the anchor never
matches, the tag-stripping regexes have nothing to strip, and the result is very unlikely to
be empty. `extractAttachmentText`'s `odf` branch (`attachment-convert.ts:429-442`) then
returns `state: 'ready'`, and `gmail-attachment-processing.ts`'s `finishResult` /
`formatGmailAttachmentProcessingReport` deliver that ciphertext-derived text to the model
inside `<untrusted_attachment>` as if it were the document's real content.

There is no ODF-equivalent of the PDF encryption check
(`gmail-attachment-processing.ts:469-479`, which only inspects `sniffedMimeType ===
'application/pdf'`), so an encrypted or corrupted ODF file has no path to a held state.

**Contract impact:** Violates the required invariant that "encrypted documents ... must
remain explicit held states" and produces exactly the "false `ready`" outcome the review is
scoped to catch.

**Smallest correction:** Before accepting `extractOdfText`'s result, verify the decoded
bytes are actually ODF markup (e.g. require a `<?xml` prologue or an
`<office:document-content` root — mirroring the `%PDF` magic check already used for
`extractIWorkPdf`) and return an explicit held state (`encrypted` or `extraction_failed`)
when that check fails.

**Focused regression:** A test that feeds `extractOdfText`/`extractAttachmentText` a zip
whose `content.xml` entry is arbitrary non-XML binary, asserting the result is a held state
(not `ready`) with no `text` field.

## Finding 2 (Medium) — An unhandled `validateZip` rejection leaves the receipt stuck in the non-terminal `downloading` state

**Evidence:** `gmail-attachment-processing.ts:480-490` calls `await deps.validateZip(buf,
receiptId)` with no try/catch. Two blocks later, the structurally identical
`deps.extract(...)` call (`gmail-attachment-processing.ts:492-506`) *is* wrapped in
try/catch specifically to convert a thrown rejection into a terminal `extraction_failed`
result. `startGmailAttachmentReceipt` (`db.ts:732-775`) has already written `state =
'downloading'` for this receipt before `processOne` reaches zip validation. If
`deps.validateZip` throws, that exception propagates out of the per-attachment loop in
`processGmailMessageAttachments` (`gmail-attachment-processing.ts:527-538`) uncaught, and
`finishGmailAttachmentReceipt` is never called for that attachment. The outer catch in
`readEmailWithAttachments` (`gmail-api.ts:698-705`) only returns a generic user-facing
notice — it never finalizes the specific SQLite row, leaving it permanently in
`downloading`.

**Contract impact:** `downloading` is excluded from `GmailAttachmentFinalState` and is not
one of the defined held states; a stuck row misrepresents in-flight status indefinitely and
breaks "exact replay updates the same receipt and increments attempts" for any later attempt
that doesn't happen to re-touch this exact message. Matches "corrupt/deduplicate receipts
incorrectly" and "make live verification misleading."

**Smallest correction:** Wrap the `deps.validateZip` call in the same try/catch pattern
already used for `deps.extract`, converting a thrown rejection into a terminal quarantined
result (e.g. `errorCode: 'zip_inspection_exception'`) before continuing.

**Focused regression:** A test supplying a `validateZip` dependency that rejects, asserting
`finishReceipt` is still called with a terminal (non-`downloading`) state.

## Finding 3 (Low-Medium) — The 50 MB total-message cap can be bypassed when Gmail omits `body.size` on a part

**Evidence:** The pre-download total check (`gmail-attachment-processing.ts:396-401`) only
runs `if (source.reportedSizeBytes !== null && totalBytesSoFar + source.reportedSizeBytes >
MAX_TOTAL_BYTES)`. The post-download check (`gmail-attachment-processing.ts:413-425`) only
compares the decoded buffer against the per-attachment `MAX_ATTACHMENT_BYTES` — it never
re-checks the running total using the actual decoded length. `processGmailMessageAttachments`
(`gmail-attachment-processing.ts:527-538`) only folds an attachment's bytes into `totalBytes`
*after* that attachment's own checks have already passed, so an attachment whose
`reportedSizeBytes` is `null` is downloaded and processed (up to 25 MB) without ever being
weighed against the 50 MB total; its bytes count only toward bounding attachments that come
after it.

**Contract impact:** Violates the stated 50 MB total-message bound. In the worst case, up to
`MAX_ATTACHMENTS_PER_MESSAGE` (20) attachments at `MAX_ATTACHMENT_BYTES` (25 MB) each could
be downloaded and pushed through extraction/OCR/markitdown before the total is ever enforced,
if Gmail reports no size for those parts.

**Smallest correction:** After decoding, also check `totalBytesSoFar + buf.length >
MAX_TOTAL_BYTES` using the actual decoded length, returning the existing
`oversized`/`message_total_size_limit` terminal result regardless of whether
`reportedSizeBytes` was present.

**Focused regression:** A test with two attachments whose `reportedSizeBytes` is `null` but
whose actual decoded bytes combined exceed 50 MB, asserting the second is marked `oversized`.
