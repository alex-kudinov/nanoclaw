# NC-20260822-011 Gmail attachment processing evidence

Date: 2026-08-23T00:04:09Z
Program: `program:company-os`
Work item: `work:gmail-attachment-processing`
Evidence class: reviewed source, tests, schema, prompts, immutable release, and
live host proof; natural provider outcome pending

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

Exact release `195dd3b3664a63651db16256b247ee7cda5a4a97` is live. Its
source tree is `14f2d87bcf918c8a1f3a1eddfa9d705a5bb71559`, 884-file artifact
SHA-256 is
`b4b8b0ac989502a7e8f83cd9ecc7a03ec15976489c1e4d15e4ddd785a146745f`,
and archive SHA-256 is
`b27463e7e68aad8938c36e1622544852192acab68ba9ecdd8145c33f83cfbf65`.
Local and Mini verification agree under Node 22.23.2.

Production retained the old container image as
`nanoclaw-agent:rollback-NC-20260822-011-195dd3b3`, built image digest
`sha256:ed06f269df3adbf2a87e04053ed384190cd3d39e8d351037bf2be0a0753f572c`,
and synchronized 18 runner snapshots to source hash
`52cc140dfdbd163f7b37db703b9d9f27`. Tesseract 5.5.3, Poppler 26.03.0,
and markitdown 0.0.2 are available on the host.

The mode-0600 deployment backup is
`~/.local/share/nanoclaw-deploy-backups/NC-20260822-011-20260824T0109Z`.
Its SQLite copy passed `quick_check` with SHA-256
`11bd390d8a001febf66ce490732d40be87b96fec1a6f752b96b7b53314f9a0ea`;
the plist SHA-256 is
`8ad75cccb312b9bc5274aaab0dfc90eb6da3d16eb7d8d74421fbc9452b52c38d`.
Fast/main activation retained exact rollback plists and changed only their
three release pointers.

Live PID 82252 is the sole listener. Health binds the exact release/code root,
Node 22.23.2, connected Gmail/Slack, and empty containers/queues. The receipt
table and index exist, database `quick_check` is clean, receipt count is zero,
and main/fast error-line counts remain 273/24. No live Gmail attachment was
downloaded, no customer/vendor content was stored, and no provider, business,
message, accounting, or schedule action was manufactured for proof. The next
natural supported and held attachment receipts remain the outcome gate.
