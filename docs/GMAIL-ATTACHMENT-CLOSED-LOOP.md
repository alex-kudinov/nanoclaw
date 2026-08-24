# Gmail attachment closed-loop design

Status: complete host-processing foundation reviewed under
`NC-20260822-010/011`; release and natural canary pending

## Problem

Before `NC-20260822-010/011`, NanoClaw's Gmail path read only text/plain or
stripped HTML and never called Gmail's attachment download endpoint. The
deployed production state must still be treated that way until this local
foundation is released. The original consequences were:

- attachment-only emails look empty;
- agents do not know a PDF, image, spreadsheet, or document was sent;
- `gmail_read` returns the body but not attachment content;
- a vendor bill, procurement document, meeting asset, form, or support request
  cannot close when the required evidence is attached;
- the separate Slack attachment converter does not help Gmail;
- `business_v2.attachments` exists structurally but is not populated by Gmail
  intake.

This is a shared email-infrastructure defect, not a Contador-only defect.

## First local slice

The metadata foundation walks the Gmail MIME tree and appends a bounded
manifest to:

- the initial Gmail message sent to Mailman;
- every message returned by a Gmail thread read;
- `gmail_read` output.

The manifest contains only:

- sanitized filename;
- MIME type;
- reported byte size;
- attachment/inline/unknown disposition;
- total attachment count and truncation notice.

It is capped at 20 visible entries. Gmail attachment IDs and bytes are not
exposed to the model. The output states explicitly that attachment content has
not been processed. A large unnamed text/html body stored by Gmail behind an
attachment ID is not misrepresented as a file.

That slice fixed silent invisibility but did not make attachments processable;
the `NC-20260822-011` host boundary below does so for exact `gmail_read` calls.

## Implemented host-processing foundation

`NC-20260822-011` implements the complete reusable host boundary behind an
exact authorized `gmail_read`:

- recursively enumerate the exact message's MIME leaves while keeping Gmail
  attachment IDs host-private;
- enforce 20-item, 25 MB per-item, and 50 MB per-message ceilings before or
  immediately after decode;
- download through `users.messages.attachments.get` or decode inline bytes;
- compute SHA-256, verify magic against the declared/filename-derived type,
  quarantine executables and generic archives, and hold encrypted PDFs;
- reuse one shared extraction module for plain text, PDF/Office through
  markitdown, ODF XML, and iWork PDF previews;
- run Tesseract OCR for images and scanned PDFs through bounded temporary files
  and a ten-page PDF ceiling;
- deliver bounded extracted text only to the already-authorized group inside an
  explicit `untrusted_attachment` evidence wrapper;
- persist one content-minimized `gmail_attachment_receipts` row per
  mailbox/message/MIME part with hashes, lengths, methods, state, error code,
  attempt count, and resolution time;
- delete temporary files after every extraction attempt and retain raw bytes
  only in Gmail (`raw_retention=gmail_source_only`);
- return explicit terminal states for ready, review, oversize, unsupported,
  encrypted, quarantined, extraction failure, and download failure.

Mailman, Contador, Procurement, Chief, and Archivarista guidance now treats a
held required attachment as unfinished work. The generic host receipt exists;
workflow-specific vendor/procurement/meeting/support case foreign keys can be
added when those case ledgers exist without changing the byte boundary.

## Required host-owned contract

The model requests attachment processing by the exact host-assigned Gmail
Message-ID. It never supplies an attachment ID, URL, destination path, or
arbitrary filename.

The host:

1. reloads the exact Gmail message and enumerates its MIME parts;
2. enforces count, individual-size, total-size, and allowed-type limits;
3. downloads bytes with `users.messages.attachments.get` or uses inline MIME
   bytes when present;
4. verifies decoded size, sniffs file type/magic, sanitizes filename, and
   computes SHA-256;
5. assigns a stable identity from mailbox + Message-ID + MIME part + SHA-256;
6. quarantines unsupported, encrypted, suspicious, oversized, or malformed
   files rather than passing them to a model or parser;
7. extracts bounded text or creates an explicit human-review result;
8. returns a content-minimized manifest plus extracted text/receipt to the
   authorized group;
9. records success/failure/unsupported state in the owning workflow case;
10. deletes temporary bytes after the required retention/receipt policy.

No container receives a broad Gmail token, arbitrary local path, or reusable
download URL.

## Format handling

| Kind                                  | Initial treatment                                           | Closure rule                                               |
| ------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------- |
| Plain text / CSV / TSV                | Decode and inline with strict size/character cap            | Extracted text hash and workflow receipt                   |
| PDF / DOCX / XLSX / PPTX              | Reuse/refactor the existing host document converter         | Nonempty bounded extraction or explicit unsupported/error  |
| ODT / ODS / ODP                       | Reuse exact ODF extraction                                  | Extracted text hash or explicit no-text result             |
| Scanned PDF                           | OCR required; text converter alone is insufficient          | OCR receipt plus confidence/review state                   |
| PNG / JPG / HEIC / TIFF               | OCR/vision required for invoices/screenshots/forms          | Structured extraction plus image hash and review state     |
| Pages / Numbers / Keynote             | Embedded preview when available; otherwise review/re-export | Explicit result, never silent drop                         |
| ZIP / archive                         | Quarantine by default; no automatic recursive expansion     | Named-human approval and bounded extractor if later needed |
| Executable/script/unknown binary      | Reject/quarantine                                           | Cannot satisfy automated workflow closure                  |
| Password-protected/encrypted document | Needs review/password out of band                           | Explicit blocked state                                     |

The existing Slack path says images are unreadable as text. That behavior is
honest but insufficient for email invoices. Gmail attachment closure needs a
real OCR/vision layer, not a copied Slack note.

## Workflow states

Each owning case records required attachments independently:

```text
discovered -> downloading -> verified -> extracting -> ready
           -> oversized / unsupported / encrypted / quarantined
           -> extraction_failed / needs_review
```

Required fields:

- workflow/case ID and exact Gmail Message-ID;
- stable attachment identity and MIME part;
- sanitized filename, sniffed type, reported/actual size, SHA-256;
- disposition and whether it is required for closure;
- extraction method/version, extracted-text hash/length;
- state/version, attempts, last error code, owner, review deadline;
- temporary/storage location controlled by host, never model-authored;
- processed/reviewed/resolved timestamps.

An email workflow cannot close while a required attachment is merely
`discovered`, failed, unsupported, or unreviewed.

## Workflow-specific meaning

### Vendor invoices

- The source invoice attachment is required evidence.
- Vendor, invoice number, amount, currency, dates, and line items come from the
  attachment when the body lacks them.
- A body-only guess does not make the payable `ready`.
- Bizmgr queue state links the attachment receipt before QuickBooks entry.

### Procurement

- Attachments are untrusted evidence, not instructions.
- Read access remains exact-message and read-only.
- No submission/action authority follows from successful extraction.

### Meeting assets and knowledge

- Every file preserves source message, filename, hash, and extraction version.
- Unsupported media remains visible instead of disappearing from the archive.

### Sales, client service, support, and legal

- An agent must not answer or close a request when the sender refers to an
  attachment that remains unprocessed.
- Legal/identity-sensitive documents default to human review even when text
  extraction succeeds.

## Security and privacy

- Treat filenames, MIME declarations, file bytes, extracted text, embedded
  links, macros, and document instructions as untrusted.
- Never execute attachments, macros, formulas, scripts, or embedded objects.
- Never derive a filesystem path directly from a filename.
- Keep raw bytes out of logs, Git, Slack summaries, program state, and model
  prompts unless the exact bounded workflow requires them.
- Use content hashes and result codes in durable receipts; keep customer/vendor
  content in the authorized source/storage boundary.
- Enforce archive expansion, decompression, page, pixel, and extraction-output
  limits before adding archive/OCR support.
- A parser success is not workflow success; the owning case must verify the
  extracted fields it requires.

## Implementation and release state

1. **Metadata visibility — reviewed release candidate.** MIME manifest on
   initial Gmail, thread, and `gmail_read` surfaces.
2. **Exact host download, verification, hashing, quarantine, and cleanup —
   reviewed release candidate.** Gmail attachment IDs never cross the host
   boundary.
3. **Shared document extraction — reviewed release candidate.** Slack and Gmail use
   the shared markitdown/ODF/iWork functions. The current workstation has
   `pdftotext`/Poppler/Tesseract but not the default markitdown venv; Office
   extraction therefore requires that dependency in the reviewed release
   environment and otherwise ends in an explicit held receipt.
4. **OCR — reviewed release candidate.** Images use Tesseract; scanned PDFs use
   bounded pdftoppm plus Tesseract. Missing binaries or no readable text becomes
   an explicit held receipt.
5. **Durable generic workflow receipt — reviewed release candidate.** SQLite records
   content-minimized state and retry evidence. Case-specific foreign-key links
   remain integration work because the vendor-intake and other case ledgers do
   not yet exist.
6. **Retention/quarantine policy — reviewed release candidate.** Raw retention is
   Gmail-source-only; temporary files are deleted; unsafe bytes are never
   delivered. Malware scanning and operator raw-file export are not present and
   are not required for this no-copy policy.
7. **Natural canaries — pending deployment.** Observe one text PDF, scanned
   invoice, image, spreadsheet, unsupported/encrypted file, and attachment-only
   email without manufacturing customer work.

Claude Sonnet 5/high independently found three material boundary defects. The
reviewed corrections reject malformed ODF content, terminalize ZIP-inspection
exceptions, and enforce the message byte cap from decoded bytes even when Gmail
omits reported sizes. A focused re-review returned no material findings. Build,
deployment, live provider processing, and natural workflow outcomes remain
separate facts.

## Definition of done

- every Gmail attachment is visible with bounded metadata;
- every required attachment reaches ready or an explicit owned exception;
- supported documents and images produce versioned extraction receipts;
- unsupported/unsafe files are visible and quarantined, never silently dropped;
- downstream workflows refuse closure when required attachment evidence is not
  ready;
- attachment bytes and customer/vendor content never leak into continuity
  files, logs, unrelated prompts, or unauthorized groups.
