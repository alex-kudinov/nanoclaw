# NC-20260804-003 convergence state

- Topic: host-owned immutable approved-email execution fields and canonical
  transactional-link content policy
- Status: converged_committed_ready_for_deploy
- Current round: R3 complete
- Claude project path: `/private/tmp/nanoclaw-sales-ack`
- Current Claude session UUID: `DF73C42D-43D7-4EED-A284-7521FE6AB8B3`
- Prior Claude session UUIDs: none recorded for this task
- Native handoff path: none
- Latest Codex request:
  `docs/reports/NC-20260804-003-CODEX-REQUEST-R3.md`
- Latest Claude response:
  `docs/reports/NC-20260804-003-CLAUDE-RESPONSE-R3.md` (`CONVERGED`)
- Verified agreements: queued is not sent; exact approved card bytes are
  authoritative; the Lead #1003 action is Gmail-confirmed once and must not be
  retried; Action `c4bdc122-ee80-47fd-848a-a18ddd6318b3` is also
  Gmail-confirmed once and must not be retried; Lead #1019 Action
  `732cc8de-b9cc-4cb6-8d73-2e6b833e6d01` reproduced the same literal-ampersand
  entity expansion before deployment, is Gmail-confirmed once as
  `19fceafb937b9bfa`, and must not be retried; Lead #1029 Action
  `67a46d16-02d6-4ca8-a7da-4f311d8f2b2d` reproduced the combined missing-ID
  and entity-mutation path before deployment, is Gmail-confirmed once as
  `19fd3438954b40fe`, and must not be retried; Lead #1032 Action
  `3d789365-c1e0-4eab-9e9d-8075f7a63859` reproduced the same path with an exact
  recipient/subject and one body-only `&amp;` expansion, is Gmail-confirmed once
  as `19fd44fd031fc6f1`, and must not be retried
- Open defects: no review blocker; committed as `2e625f0`; deployment, live
  release verification, and natural-path outcome validation remain pending
- Owner decisions: owner authorized exact recovery, implementation, Claude
  validation, commit, immutable activation, and safe live verification; no
  unrelated email or approval widening is authorized. Claude R2 converged; Codex
  accepted its documentation recommendation and additionally closed the narrow
  raw prior-follow-up marker false-rejection residual before final release.
- Last independent checks: six focused files passed 91/91 tests for host
  rehydration, follow-up arming, and proposal one-time execution; the content
  guard plus host rehydration/Gmail authorization subset passes 3 files / 18
  tests. The exact combined tree passes pinned Node 22.23.2 typecheck, the
  expanded serial email-critical gate (18 files / 492 tests), and the complete
  suite (147 files / 1,922 tests). After the Lead #1029 incident, the dedicated
  unthreaded first-response regression with no Action-ID and `&amp;`-mutated
  subject/body passes in the focused 2-file / 6-test subset locally and in the
  isolated pinned-Node-22.23.2 email-critical gate on the Mac Mini: 18 files /
  492 tests. No service activation or production-data mutation occurred during
  that gate. After Claude R1, the pinned Node 22.23.2 focused set passed 6
  files / 115 tests and the exact serial email-critical release gate passed 18
  files / 497 tests. The R1 repairs cover superseded-action blocking,
  Gmail-thread ambiguity, deterministic pre-Gmail wording, restart-safe
  authorization, confirmed replay ordering, approval-marker scoping, proposal
  test routing, and WHATWG URL-host parsing. After R3, the exact final pinned
  Node 22.23.2 tree passed typecheck, the 18-file / 497-test email-critical gate,
  and the complete 147-file / 1,927-test suite.
- Elapsed/cost notes: initial sandboxed Claude attempt failed `ENOTFOUND` with
  zero API cost; the earlier escalated retry was denied by the privacy gate.
  The owner explicitly approved transmission of the scoped, secret-excluding
  review material on 2026-08-05. Claude R1 used the approved Opus session for
  about 15 minutes and cost $8.8824595. It found one blocking wrong-action
  selection defect plus eight non-blocking findings; Codex independently
  reproduced the blocker and implemented the accepted repairs before R2. R2
  used 28 turns, about 9 minutes, and cost $7.4164145; verdict `CONVERGED`. R3
  used 12 turns, about 3 minutes, and cost $5.299514; verdict `CONVERGED`.
