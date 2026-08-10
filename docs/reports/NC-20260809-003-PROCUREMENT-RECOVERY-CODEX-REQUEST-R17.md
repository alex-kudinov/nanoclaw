# NC-20260809-003 — Query-bound zero-result response repair review, Codex R17

- Date: 2026-08-10T03:35Z
- Requested reviewer: Claude Code Opus 5, exact NanoClaw company-OS owner
  session `58fde579-483e-42ca-a516-434971d3ad07`
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`
- Base commit: `4053bf89867bc09dbd19bb58d48f56a54bf926df`
- Scope: read the request and the uncommitted diffs in
  `src/procurement-browser-port.ts`,
  `src/procurement-browser-port.test.ts`,
  `docs/ACTIVE-WORK.md`, `docs/ENGINEERING-CHANGELOG.md`, and
  `docs/reports/NC-20260809-003-PROCUREMENT-SOURCE-CANDIDATES.md`.
- Write authority: create only
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R17.md`.
  Do not edit source, tests, other docs, production, browser state, databases,
  config, credentials, or external systems.

## Current production boundary

Production remains healthy on integrated release `f3c423c52f62`; CaleProcure
container ingest, deterministic collector, and review are all `0`. No source
receipt, opportunity, review, proposal, message, email, registration, or
submission was written in this round.

R16 commit `4053bf89867b` built and remotely verified as a clean immutable
release, but it was deliberately not activated while an unrelated Sales
container remained active. Two direct shadows from those exact verified bytes
proved the required teardown property: the process exited by itself, Chrome
remained alive, and the dedicated browser returned to its two-tab baseline.

## Reproduced acquisition evidence

The captured shadow ran 2026-08-10T03:17:07Z–03:18:22Z and exited 1 with
`CaleProcure search failed for "coaching"`, tabs `2 -> 2`, Chrome healthy.
Repeated bounded diagnostics, all public and read-only, proved:

1. connect/open succeeds;
2. unfiltered baseline reconciles exactly 320 reported / 320 extracted;
3. department directory has 300 entries;
4. `coaching` is retained exactly, its same-origin PeopleSoft POST returns 200
   `application/json`, but the UI renders no visible summary, no-results marker,
   grid, rows, busy state, or page error;
5. the 15,650-byte response carries the exact current query at
   `CaptureResults.eventName[0].Properties.value` and the exact terminal text
   `No event met your search criteria` at
   `CaptureResults.box_error_items[0].Properties.text`;
6. `facilitation` through the same interaction returns exactly one visible row;
   its 18,610-byte response echoes the query but has no no-results field.

No response body, row content, contact data, credential, or page dump entered
the repository. Temporary diagnostics emitted only counts, paths, hashes,
marker booleans, and JSON structure.

## Candidate repair

`isCaleProcureZeroResultResponse(payload, keyword)` accepts only:

- an object with `CaptureResults`;
- exactly one `eventName` capture whose `Properties.value` equals the exact
  current keyword; and
- exactly one `box_error_items` capture whose normalized `Properties.text`
  equals the exact portal no-results text.

`search()` starts a response wait before clicking Search and binds it to the
exact HTTPS origin/path and POST method. After the already-required busy cycle:

- a 200 JSON exact tuple may prove zero results even if the portal fails to make
  that state visible;
- simultaneous visible summary/grid is a hard contradiction;
- malformed, changed, mismatched, non-200, or non-JSON responses prove nothing
  and retain the existing visible-state fail-closed path;
- positive results still require the visible summary/grid/row reconciliation
  and downstream directory/detail identity checks.

Focused exact Node 22.23.2 verification passes 3 files / 16 tests plus
typecheck, formatting, and `git diff --check`. Full root/runner/continuity gates
will run after this review.

## Review questions

1. Is the response wait sufficiently correlated to the exact Search action, or
   can another same-path POST race it after input fill and before the click?
2. Is the exact query/no-results tuple strong enough to count a truthful zero
   without a visible marker, given the live positive-control contrast?
3. Are the contradiction and fallback rules fail-closed for portal drift,
   malformed JSON, stale response state, and positive results?
4. Are any additional unit or live gates required before commit, immutable
   release, and three consecutive 9/9 shadows?
5. Return `GO`, `CHANGES REQUIRED`, or `NO-GO`, with blocker/high/medium/low
   findings and explicit owner decisions.
