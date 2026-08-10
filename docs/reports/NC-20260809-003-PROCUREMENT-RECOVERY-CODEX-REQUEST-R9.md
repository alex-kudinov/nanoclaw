# NC-20260809-003 Procurement Recovery — Codex Request R9

## Objective

Review the post-R8 production evidence and the smallest operational procedure
correction for the failed CaleProcure discovery outcome. Decide whether the
corrected procedure is safe to commit, install byte-exact on the production
host, and exercise with one fourth natural collection-only canary.

Write only:

`docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R9.md`

Do not edit source, tests, migrations, prompts, continuity files, or any other
artifact in this round.

## Authority and boundaries

Use the R8 request/response as the immediate implementation-review authority:

- `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R8.md`
- `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R8.md`

Also apply `CLAUDE.md`, `docs/PROJECT-MAP.md`, `docs/ACTIVE-WORK.md`,
`docs/CHANGE-PROTOCOL.md`, `docs/ENGINEERING-CHANGELOG.md`, and
`groups/procurement/CLAUDE.md` in their normal authority order.

Never read or transmit `.env*`, credentials, OAuth/session/browser-profile
state, databases or row content, task result payloads, local MCP settings, or
other secret/restricted material. The user authorized the non-secret source and
documentation named here. Commercial decisions and every `DECIDE`/`ADVANCE`
command remain named-human-only. Review stays off in this round.

## Production facts since R8

1. Follow-up commit `ba726e7cbda03e35cf63d7d1b732ced5339f95e4` was
   built and verified as immutable archive
   `nanoclaw-ba726e7cbda0.tar.gz`, SHA-256
   `09606bde8ed6a9f20ef587c46f3a8877a30809c88987fada187e29b03f95b6de`.
   The verified source-tree hash is
   `14272af5b15c6431ff9de41f44cdcf182f6a9224`; artifact hash is
   `268749789bde31b0f6389776066802e6d537f2558f1fd93186dac2700f51492d`.
2. The immutable release is live under Node 22.23.2. Health reports exact
   `ba726e7`, Slack/Gmail connected, and zero active container. The retained
   rollback plist is
   `com.nanoclaw.plist.rollback-9aa23b4e7c39-2026-08-09T23-54-21-421Z`.
3. R8's read-only live PostgreSQL JSONB-predicate precheck returned zero
   contradictory rows.
4. Production CaleProcure ingest was unexpectedly still `0`; it was enabled
   after an exact backup. Review remains exactly `0`. Live group timeout drift
   was corrected from 600000 to release-owned 900000 milliseconds while no
   task was active.
5. The release archive does not package `knowledge/`. The previously reviewed
   tracked procedure was therefore installed separately and byte-exact after
   backing up the old operational bytes. This is an explicit operational
   packaging boundary, not a claim that the release artifact contained it.
6. Natural task `nc-20260809-003-caleprocure-canary-3` ran exactly once.
   Host source run 5 completed with adapter v2, planned 9, observed 9, missing
   0, but observations seen/new and opportunity count were all 0. The current
   positive control was absent. Scheduler/CAS/token/receipt mechanics pass;
   the procurement discovery outcome fails. Review remained off.

## Independent public-browser reproduction

Codex used the public, unauthenticated CaleProcure event search page without
reading browser-profile/session material.

1. Initial page state exposes a visible `Event Name` textbox, visible
   `Clear Criteria`, visible `Search`, and an unfiltered
   `Showing Results 1-320 of 320` table.
2. Filling `Event Name` with `facilitation` and waiting does **not** execute a
   search. The page can simultaneously expose the default visible result state
   and stale/hidden `Showing Results 0 of 0` content.
3. Clicking the explicit visible `Search` button and waiting produces visible
   `Showing Results 1 of 1` and one visible grid row:
   event `0000039985`, `NOTICE OF INTENT TO AWARD`, SF Bay Conservation
   Commission, close `08/13/2026 3:00PM PDT`, status `Posted`.
4. The responsive page contains hidden and visible copies with duplicate
   element IDs. A text locator's first match was hidden while its second match
   was visible. Therefore unqualified DOM text/count evidence is unsafe.
5. Clicking the visible transformed event-ID cell did not expose a clean detail
   URL in this reproduction. The existing fail-closed identity rule remains:
   a visible row without a verified business unit/detail URL makes that unit
   incomplete and cannot support a complete receipt.

## Files to inspect

- `knowledge/agents/procurement/procedures/scan-caleprocure.md`
- `docs/ACTIVE-WORK.md`
- `docs/PROJECT-MAP.md`
- `docs/ENGINEERING-CHANGELOG.md`
- this request

Inspect the complete working-tree diff from commit
`ba726e7cbda03e35cf63d7d1b732ced5339f95e4`. Do not reopen accepted migration
115, the deployed R7 receipt-correlation source, or the separately blocked
migration-116 proposal work unless this procedure delta contradicts them.

## Procedure correction under review

For every release-owned keyword, the procedure now requires:

1. click visible `Clear Criteria` and prove the visible Event Name input empty;
2. fill the exact keyword in the visible Event Name input;
3. click the explicit visible `Search` button—fill or Enter is not completion;
4. wait using bounded snapshots, never `networkidle`;
5. prove the visible input still holds the keyword and read only the visible
   result summary and visible grid;
6. ignore hidden duplicate summaries, rows, and IDs;
7. omit ambiguous/failed keywords from `observed_units`, producing `partial`;
8. retain the existing fail-closed stable-identity rule; and
9. remove the contradictory note that said business-unit codes were not needed.

The continuity documents record the deployed hashes/config, packaging
boundary, exact mechanical pass, outcome failure, public-browser root cause,
and the gate that review/proposal/source expansion remain off.

## Required review

Return `GO`, `CHANGES REQUIRED`, or `BLOCKED`, then:

1. verify the procedure action sequence against the reproduced public UI facts;
2. audit whether visible-only evidence is defined tightly enough to prevent
   default-table, hidden-row, hidden-summary, or stale-keyword false receipts;
3. audit whether the existing business-unit/detail-URL requirement remains
   achievable and fail-closed after a positive row appears;
4. identify any way the agent can still report all nine units observed without
   executing nine visible searches;
5. confirm the continuity documents distinguish host-receipt success from
   business/outcome failure and correctly describe the knowledge packaging
   boundary;
6. specify any exact blocking edits or tests;
7. decide whether the procedure may be committed, installed byte-exact, and
   exercised with one natural canary while review remains disabled; and
8. report exact commands run, environment limitations, remaining owner
   decisions, elapsed time, and cost.

Convergence requires that a complete natural receipt mean nine explicit visible
search actions, nine visible result-state inspections, and stable identity for
every submitted row. A zero-row batch is legitimate only when those actions
visibly produced nine zero-result states. Mechanical receipt correctness alone
is not procurement success.
