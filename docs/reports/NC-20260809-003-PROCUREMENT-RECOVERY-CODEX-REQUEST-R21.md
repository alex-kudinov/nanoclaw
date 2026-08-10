# NC-20260809-003 Procurement recovery — Codex request R21

## Requested artifact

Write only:

`docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R21.md`

Do not edit source, tests, task state, or any other file. Do not read `.env*`,
credentials, sessions, databases, customer content, or machine-local settings.

## Authority and production boundary

- Running code/tests and the public portal observations below are mechanics.
- Repository instructions and the existing R20 response remain authoritative.
- Production writes, review cards, decisions, proposals, submission, and source
  expansion remain off. This round is design review only.
- The user authorized the non-secret source/docs collaboration with this exact
  Claude owner session.

## New production evidence

Immutable release `d5836318ce36ae2634b66931ff28b4a4850f2393` passed
the bundled verifier and activated with exact health identity. All three
Procurement gates remained `0`, active containers were zero, and Chrome had a
two-tab baseline.

Shadow 1 stopped the gate exactly at R20 M-1:

```text
baseline: 320 / 320
coaching: observed, visible, 0 rows, 2578 ms
next unit: leadership development
failure: CaleProcure prior result state did not clear before timeout
duration: 74.75 seconds
tabs: 2 -> 2
exit: 1, self-exited
```

A separate bounded public-source, no-write diagnostic then performed one zero,
one clear, and one positive search through the same dedicated browser:

```json
{
  "baseline":{"resultCount":320,"extractedRows":320},
  "departmentCount":300,
  "zero":{"evidence":"visible","resultCount":0,"extractedRows":0},
  "afterZero":{"inputEmpty":false,"summaryCount":0,"gridCount":0,"emptyCount":1},
  "afterClear":{"inputEmpty":true,"summaryCount":0,"gridCount":0,"emptyCount":1},
  "afterPositive":{"inputEmpty":false,"summaryCount":2,"gridCount":1,"emptyCount":0},
  "visibleRows":1
}
```

This proves Clear Criteria really clears the query, summary, and grid while the
full no-results marker is a persistent prior-message artifact. The following
positive search removes that marker and renders one reconciled row.

## Proposed minimal fail-closed repair

1. Define cleared prior result state as zero visible summary and zero visible
   grid after the verified Clear Criteria busy cycle. Do not require the
   persistent no-results message to disappear. Retain the existing exact check
   that Event Name is empty before filling the next query.
2. In the per-query outcome loop, never accept the visible no-results marker by
   itself because it can be stale. A zero is terminal only from the exact
   query-bound HTTP 200 JSON response tuple already implemented. A positive is
   terminal only from a visible summary/grid and must reconcile through the
   existing count/row checks.
3. Preserve the contradiction guard: a query-bound response zero plus visible
   summary/grid is an error. Keep listener cleanup, bounded timeout, partial
   summary/cause chain, tab cleanup, and all gates unchanged.
4. Update tests so a stale visible empty marker after Clear does not terminate a
   later search; a current query-bound zero returns `response`; missing terminal
   response plus only a visible empty marker times out; response-zero plus
   visible positive remains contradictory; positive visible results remain
   accepted and reconciled.

## Questions / verdict

At blocker/high/medium severity:

1. Is the proposal the narrowest safe repair supported by the new evidence?
2. Does making response provenance mandatory for zero results preserve the
   intended two-evidence-path gate (visible for positive, response for zero), or
   is another query-bound visible-zero mechanism required?
3. Identify any missing regression or production gate.
4. Return one explicit verdict: `GO FOR R21 IMPLEMENTATION` or `NO-GO`, with
   exact reasons and acceptance tests.
