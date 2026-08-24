# Claude bounded review request: host-owned Gmail attachment processing

## Objective

Review the isolated current-lineage implementation for material defects before
production release. The host must process attachments for one already-authorized
exact Gmail Message-ID while keeping attachment IDs, bytes, paths, credentials,
and raw extracted customer/vendor content out of containers, logs, durable
receipts, and continuity files.

## Authority and accepted facts

- Owner-authorized task: `NC-20260822-011`, program item
  `work:gmail-attachment-processing`.
- The existing Gmail IPC policy validates the exact Message-ID before
  `handleGmailRead`; do not redesign authorization or inspect unrelated policy.
- Containers may receive only bounded extracted text inside an explicit
  `untrusted_attachment` wrapper plus content-minimized ready/held receipts.
- Gmail remains the raw source. Temporary extraction/OCR files must be deleted.
- Missing extraction tools, encrypted documents, unsafe types, malformed data,
  oversize data, and empty extraction must remain explicit held states.
- Deployment does not authorize a manufactured customer email or broad mailbox
  scan. Natural outcome validation remains separate.

## Required limits and invariants

- Maximum 20 attachments, 25 MB each, 50 MB total, 1,000 MIME parts, MIME depth
  12, 2,000 ZIP entries, 100 MB ZIP expansion, 10 OCR PDF pages, and bounded
  model-visible extracted text.
- Executables and generic archives never reach extractors/models. Declared,
  extension, and magic types may not silently disagree into `ready`.
- Gmail attachment IDs and buffers never leave the host processor.
- SQLite stores identifiers, sanitized filename, hashes, lengths, method/state,
  error/retry/timestamps only—never bytes or extracted text.
- Exact replay updates the same receipt and increments attempts; failure cannot
  look ready, and a held required attachment cannot imply workflow closure.
- Attachment-originated text cannot break the evidence wrapper or become
  executable instructions.

## Allowed read paths

1. `src/gmail-attachment-processing.ts`
2. `src/gmail-attachment-processing.test.ts`
3. `src/attachment-convert.ts`
4. `src/gmail-api.ts`
5. `src/gmail-ipc-handlers.ts`
6. `src/db.ts`
7. `src/gmail-parser.ts`
8. This request file

Do not read `.env`, credentials, auth/session directories, logs, databases,
Gmail content, unrelated private files, or other source. Do not edit source.

## Current verification

- attachment/converter/database/routing: 167 passed;
- Gmail/parser/API/IPC/channel/Slack: 284 passed;
- typecheck: passed;
- independent agent-runner build and 43 tests: passed.

## Required response

Write only
`docs/reports/NC-20260822-011-CLAUDE-ATTACHMENT-REVIEW-RESPONSE.md`.

Use verdict `NO MATERIAL FINDINGS` or `MATERIAL FINDINGS`. Report only defects
that could expose private attachment data, process the wrong Gmail resource,
bypass a bound, permit unsafe content, leak temporary files, corrupt/deduplicate
receipts incorrectly, produce false `ready`, or make live verification
misleading. Order findings by severity with exact file/line evidence, contract
impact, smallest correction, and focused regression. Do not propose unrelated
cleanup, architecture expansion, or a backlog.
