# NC-20260809-003 Procurement recovery — Codex request R19

Date: 2026-08-10

## Review boundary

Continue the exact NanoClaw owner session. Review only the R18 repairs and the
named non-secret repository files. Write exactly one response file:

`docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R19.md`

Do not edit implementation or any other file. Do not read `.env*`, credentials,
sessions, browser profiles, logs, databases, task payloads, or production state.
Do not browse or use the network. Do not commit, deploy, or perform external
actions.

## Decisive R18 diagnostics

The bounded no-write diagnostic requested in R18 ran once for `coaching` and
once for the positive control `facilitation`. Each Search action emitted exactly
one matching fixed-path POST. Both were HTTP 200 JSON and contained exactly one
`CaptureResults.eventName` capture whose value exactly equaled the query.

For `coaching`, the single `box_error_items` text is exactly:

`No event met your search criteria. Please change your search criteria and try again`

The R17 parser required only `No event met your search criteria`, so the tuple
was false and the hidden UI timed out. For `facilitation`, the visible UI
reconciled exactly one row, the response still contained one
`box_error_items` capture, but that capture had no text property. These results
refute wrong-first-response, status, and content-type hypotheses and isolate the
terminal string mismatch.

## R18 repairs

Read:

- `src/procurement-browser-port.ts`
- `src/procurement-browser-port.test.ts`
- `src/procurement-caleprocure-collector.ts`
- `src/procurement-caleprocure-collector.test.ts`
- `src/procurement-caleprocure-job.ts`
- `src/procurement-caleprocure-job.test.ts`
- the R18 request and Claude response

The candidate now:

1. matches only the exact full query-bound terminal message;
2. installs a removable `response` listener before Search, applies URL/path,
   POST, 200, and JSON gates before body parsing, and reduces the terminal tuple
   to a local boolean rather than retaining a mutable payload;
3. after the bounded busy cycle, polls one bounded outcome loop that accepts a
   query-bound response zero or the existing visible summary/empty state,
   rejects a simultaneous response-zero plus visible result state, and removes
   the listener in `finally`;
4. leaves the positive visible path independent of response-body shape and has
   no losing `waitForResponse` timeout/promise;
5. wraps shadow `CaleProcureCollectionError` with its public partial summary and
   preserves a cycle-safe, eight-level cause chain in CLI output.

Exact Node 22.23.2 focused verification passes 3 files / 19 tests, typecheck,
formatting, and `git diff --check`. New tests execute `search()` itself: a
rejected non-JSON/500 response is not parsed, an advisory same-path response is
ignored, the later terminal tuple returns a response-evidenced zero, the
listener is removed, and a positive response with no terminal text still uses
the reconciled visible row. The job test proves shadow partial evidence and the
nested cause chain.

## Questions

1. Do the diagnostics and exact full-string correction close R18 H-1 and H-2?
2. Does the listener plus bounded outcome loop close the mutable-payload and
   losing-promise races without introducing a response lifecycle leak?
3. Is the visible positive path genuinely independent of response body shape,
   and does terminal zero remain fail-closed under malformed or changed shape?
4. Do shadow partial and cause-chain changes make the next live failure
   actionable without changing live receipt semantics?
5. Identify any blocker/high/medium issue or missing test before commit,
   immutable deployment, and the three-shadow gate.

Return a clear `GO` or `NO-GO`, severity-ranked findings, exact repairs, and any
new owner decision. Do not reopen migration 116 or source expansion unless this
delta creates a direct conflict.
