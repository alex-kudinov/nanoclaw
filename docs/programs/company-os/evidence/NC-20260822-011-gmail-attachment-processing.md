# NC-20260822-011 Gmail attachment processing evidence

Date: 2026-08-23T00:04:09Z
Program: `program:company-os`
Work item: `work:gmail-attachment-processing`
Evidence class: reviewed release-candidate source, tests, schema, prompts, and
documentation; deployment and natural outcome pending

## Outcome

An exact host-authorized `gmail_read` now processes the source message's
attachments instead of returning metadata alone. The host owns Gmail byte
retrieval, limits, validation, hashing, extraction/OCR, temporary cleanup,
content-minimized durable receipts, and bounded delivery to the already
authorized group.

## Implemented controls

- Containers supply only the exact Gmail Message-ID already granted by the
  host. Gmail attachment IDs, credentials, URLs, bytes, and paths stay private.
- Limits: 20 attachments, 25 MB per attachment, 50 MB per message, 1,000 MIME
  parts, MIME depth 12, 2,000 zip entries, 100 MB zip expansion, 10 OCR pages,
  and bounded extracted/model-visible text.
- Verification: SHA-256, declared-type/extension classification, magic sniff,
  executable refusal, generic archive quarantine, zip traversal/expansion
  checks, and encrypted-PDF hold.
- Extraction: UTF-8 text, `pdftotext`, bounded PDF/image Tesseract OCR,
  markitdown Office extraction, ODF `content.xml`, and iWork PDF preview.
- Terminal states: `ready`, `needs_review`, `oversized`, `unsupported`,
  `encrypted`, `quarantined`, `extraction_failed`, and `download_failed`.
- Durable SQLite receipts store source identity, hashes, lengths, methods,
  states, result codes, retries, and timestamps, never raw bytes or extracted
  customer/vendor text.
- Retention: Gmail remains the raw source; all parser/OCR files are temporary
  and deleted after the attempt. Extracted text is delivered only in an
  explicit `untrusted_attachment` evidence wrapper.
- Contador and Meeting Assets handoffs carry `Attachment-Count`; Contador,
  Procurement, Chief, Archivarista, and Mailman procedures treat held required
  files as unfinished work.

## Verification

- Pinned runtime: Node 22.23.2.
- Focused attachment/converter/database/routing: 170/170 passed.
- Focused Gmail/API/IPC/channel/Slack regression: 284/284 passed.
- Root typecheck: passed.
- Root build: passed.
- Independent agent-runner build: passed.
- Independent agent-runner tests: 43/43 passed.
- Full root suite: 3,050 passed / 12 skipped. The sole failure is the
  pre-existing, unrelated CNPC wrapper-literal contract failure.
- `git diff --check`: passed.
- Local dependency probe: `tesseract`, `pdftotext`, and `pdftoppm` are present;
  the default markitdown venv path is absent on this workstation. PDF/image OCR
  can run here, while Office formats safely end as `extraction_failed` until an
  exact release environment supplies `NANOCLAW_MARKITDOWN_BIN` or the documented
  default venv.

## Independent review

- Claude Sonnet 5/high session `c98a5b20-c5a2-4246-b024-778775f54b34`
  found three material defects: malformed/encrypted ODF could be marked ready,
  a ZIP-inspection rejection could strand a downloading receipt, and missing
  Gmail reported size could bypass the total decoded-byte limit.
- Codex reproduced and corrected all three: ODF content must identify a real
  `office:document-content` root, ZIP inspection exceptions end in a terminal
  quarantine receipt, and the 50 MB cap is enforced against decoded bytes.
- Claude Sonnet 5/high correction session
  `5bcb8160-4a61-49e4-b175-ce1364f18383` returned
  `NO MATERIAL FINDINGS`.
- Review usage audits: first round 12 model calls / 24 input / 137,646
  cache-create / 893,021 cache-read / 36,666 output / max context 137,648;
  correction round 8 calls / 16 input / 59,238 cache-create / 370,922
  cache-read / 7,764 output / max context 67,804.

## State boundary

The implementation is isolated on the clean release branch
`codex/gmail-attachment-release-20260823` and remains undeployed.
No live Gmail attachment was downloaded, no customer/vendor content was stored,
no runtime database was migrated, and no provider, business, message, schedule,
or deployment state changed. Production and natural workflow behavior remain
unverified until an exact release is deployed and exercised by natural
attachments.
