# NC-20260809-003 Procurement recovery — Codex request R18

Date: 2026-08-10

## Review boundary

Continue the exact NanoClaw owner session. Review only the narrow response-
correlation delta described here and the named non-secret repository files.
Write exactly one response file:

`docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R18.md`

Do not edit implementation or any other file. Do not read `.env*`, credentials,
sessions, browser profiles, logs, databases, task payloads, or production state.
Do not browse or use the network. Do not commit, deploy, or perform external
actions.

## Evidence since R17

R17 returned GO for the exact query/no-results tuple and requested result-
evidence provenance plus malformed-URL hardening. Codex applied both, added the
two requested parser regressions, and passed exact Node 22.23.2 focused tests,
typecheck, formatting, build, continuity, the 165-file / 2,209-test root suite,
and the runner's 5-file / 34-test suite. Commit `a69f0ff1a372` was built as a
592-file immutable release and activated with exact commit/tree/artifact/Node
health. All three procurement gates remained off.

The first no-write shadow on those exact bytes still failed on `coaching` after
75 seconds, while browser tabs returned `2 -> 2` and the one-shot process exited
on its own. This disproves R17's assumption that origin + path + method selects
the search-result response: one Search action can emit multiple matching
PeopleSoft POSTs, and `waitForResponse` resolves the first before the body tuple
is checked. A non-correlated response therefore fell through to the known
hidden UI state and timed out.

## Candidate repair

Read:

- `src/procurement-browser-port.ts`
- `src/procurement-browser-port.test.ts`
- `src/procurement-caleprocure-collector.ts`
- `src/procurement-caleprocure-collector.test.ts`
- `src/procurement-caleprocure-job.ts`
- R17 request and response

The uncommitted delta changes the `waitForResponse` predicate to async. It still
requires exact HTTPS origin, fixed PeopleSoft path, POST, HTTP 200, and JSON. It
then parses the candidate body and resolves only when `CaptureResults` contains
exactly one `eventName` whose `Properties.value` equals the current keyword.
The matched payload is retained and the existing exact no-results tuple decides
`response` zero versus the existing visible reconciliation path. Every URL,
status, content-type, body, JSON, shape, cardinality, or query mismatch returns
false and keeps waiting until the bounded timeout. Tests add exact/mismatch,
duplicate-query, and malformed-shape cases. Focused verification is 3 files /
17 tests plus typecheck, formatting, and `git diff --check`.

## Questions

1. Does an async body-aware Playwright response predicate safely correlate the
   terminal search response under multiple same-path POSTs, including concurrent
   predicate evaluation and retention of `matchedPayload`?
2. Can a response for the current keyword satisfy the exact-one `eventName`
   condition before it is actually the terminal results payload, creating a
   false zero or premature visible-state wait?
3. Does reading `response.json()` inside the predicate have any unsafe body-
   consumption, rejection, timing, or lifecycle behavior in pinned
   `playwright-core@1.62.1`?
4. Is the repair still fail-closed for positive results, changed portal shape,
   response races, and contradictions?
5. Identify any blocker/high/medium issue, missing unit test, or additional live
   gate required before commit, immutable release, and a repeat shadow.

Return a clear `GO` or `NO-GO`, severity-ranked findings, exact repairs, and any
new owner decision. Do not reopen migration 116 or source expansion unless this
delta creates a direct conflict.
