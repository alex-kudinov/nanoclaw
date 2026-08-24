# Claude correction review: Gmail attachment material findings

## Objective

Verify that all three findings in
`NC-20260822-011-CLAUDE-ATTACHMENT-REVIEW-RESPONSE.md` are fully resolved
without weakening a security or receipt invariant. Report only remaining
material defects attributable to these corrections.

## Exact corrections

1. `extractOdfText` now requires `content.xml` to begin with an optional XML
   declaration followed by an `office:document-content` root. Non-markup bytes
   return null, and `extractAttachmentText` produces terminal
   `extraction_failed/odf_no_text`. Regression covers binary content.xml.
2. ZIP validation is wrapped in try/catch. A rejection finalizes the existing
   receipt as `quarantined/zip_inspection_exception`; no row remains
   `downloading`. Regression asserts terminal finish and held report.
3. After decode and the per-item bound, the processor checks
   `totalBytesSoFar + buf.length` against 50 MB regardless of reported size.
   Regression uses three size-less 17 MB parts and requires the third to be
   `oversized/message_total_size_limit` before extraction.

## Allowed paths

1. `src/attachment-convert.ts`
2. `src/attachment-convert.test.ts`
3. `src/gmail-attachment-processing.ts`
4. `src/gmail-attachment-processing.test.ts`
5. Original review response and this request

Do not read any other file or edit source. Do not access `.env`, credentials,
sessions, logs, databases, or Gmail content.

## Verification

- corrected converter/processor tests: 49 passed;
- attachment/converter/database/routing: 170 passed;
- Gmail/parser/API/IPC/channel/Slack: 284 passed;
- typecheck: passed.

## Required response

Write only
`docs/reports/NC-20260822-011-CLAUDE-ATTACHMENT-CORRECTION-RESPONSE.md` with
verdict `NO MATERIAL FINDINGS` or `MATERIAL FINDINGS`. For a material finding,
give exact evidence, contract impact, smallest correction, and regression.
Do not reopen accepted facts or propose unrelated cleanup.
