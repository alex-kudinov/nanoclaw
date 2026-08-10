# NC-20260809-003 — Final collector delta review, Claude R15

- Round: R15, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R15.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-10T02:30Z–02:52Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`; base/live commit
  `ec62c3003aaae652712164f47b3c5c7efbc9f5d3`
- Change class: C0 bounded review of the post-R14 delta only. No production,
  database, browser, network, vault, or secret access; no `.env*`, credential,
  session, browser-profile, log, row, or task-payload content read; nothing
  implemented, committed, or deployed.

Labels: `FACT` = verified in this worktree this round with a citation ·
`REPRODUCED` = command run and output observed · `INFERENCE` ·
`RECOMMENDATION`.

---

# Verdict: GO for commit and immutable shadow deployment

M-6 is closed exactly as recommended, and the split Codex chose — structural
metadata aborts globally, content mismatch fails per-unit — is the right one for
a reason worth stating: it mirrors the boundary migration 115 already draws.
No blocker or high regression. One documentation nit, no code change required.

R14's empirical gates are unchanged, including shadow gate 1: **prove the CLI
exits on its own without terminating host Chrome** before anything else is
believed.

---

## 1. M-6 closure

`FACT`. `src/procurement-caleprocure-collector.ts:186-208` now separates two
cases that were previously one `fail()`:

```ts
if (!Number.isSafeInteger(observed.resultCount) || observed.resultCount < 0 ||
    !Number.isSafeInteger(observed.pagesVisited) || observed.pagesVisited < 1) {
  fail(`CaleProcure result metadata is invalid for …`, output);   // global
}
if (observed.rows.length !== observed.resultCount) {
  output.diagnostics.push({ …, status: 'failed', error: 'reconciliation_failed' });
  continue;                                                        // per-unit
}
```

`FACT`. `CaleProcureUnitDiagnostic.error` gains `'reconciliation_failed'`
alongside `'row_budget_exceeded'` and `'identity_verification_failed'`, so all
three per-unit failure classes are now uniform in shape and in effect.

`FACT` — `REPRODUCED`. The three-unit regression asserts the exact behavior I
asked for: `observedUnits` is `['first', 'third']`, and the middle unit is
diagnosed `status: 'failed'`, `resultCount: 1`, `extractedRows: 0`,
`error: 'reconciliation_failed'`. Later independently observable units survive.

---

## 2. Does this mislead coverage, receipts, or diagnostics? — No

`FACT` — traced through the write path, not inferred:

- the failed unit is appended only to `diagnostics`; it never enters
  `coverage.observedUnits` or `coverage.evidence`, so
  `fn_complete_procurement_source_run_v2` derives it as missing and the receipt
  is `partial` (`115:396-405`);
- the `continue` fires **before** `verifiedRows` is built, so the unit
  contributes no rows and no detail navigations;
- diagnostics retain the discrepancy itself, which is what an operator needs to
  tell pagination from a hidden-row artifact.

`INFERENCE` — the degenerate case is also safe, and I checked it because it is
the one way a per-unit rule could hide a systemic break. If **all nine** units
failed reconciliation, `observedUnits` would be empty, the receipt `partial`
with nine missing, and `runCaleProcureJob` (`job:99-104`) would throw on the
non-`complete` status and exit non-zero. It cannot present as a benign partial.

`INFERENCE` — and it would be caught earlier anyway. A systematically broken
grid extractor fails `readBaseline`'s own reconciliation
(`port:311-315`) before any keyword runs, which is precisely the job the
unfiltered baseline control was added to do. The layering works: control first,
then per-unit content.

---

## 3. Should invalid metadata stay a global abort? — Yes

`INFERENCE`. The two cases differ in *what they are evidence of*, and the split
tracks that difference rather than severity:

- **Invalid metadata** (`NaN`, negative count, `pagesVisited < 1`) is not an
  observation about the portal. It means the port produced values outside its
  own declared type invariants — the extraction layer is malfunctioning.
  Continuing would mean trusting the next eight observations from the same
  broken layer, and any coverage claimed afterwards would be unsound.
- **A count/row mismatch** is a well-formed observation about *this keyword's*
  page: the summary and the grid disagree. Pagination, a partially rendered
  grid, or a retained hidden row all produce it, and none of them says anything
  about the next keyword.

`FACT` — this is the same boundary migration 115 already draws.
`fn_complete_procurement_source_run_v2` **raises** on structurally invalid
coverage evidence (`115:363-390`) but **derives** `partial` for missing units
(`:396-405`). Structure is rejected; content is recorded. The collector now
reads the same way at its own layer, which is why I would not move the line.

---

## 4. Regressions

**None at blocker or high.** The delta is additive to one union type and
converts one `fail()` into a diagnostic plus `continue`; no other implementation
path changed, and the surrounding order (echo check → metadata → reconciliation
→ budget → identity) still runs cheapest-and-most-structural first.

`FACT` — one documentation nit, no code change needed. `extractedRows` now
carries two meanings across diagnostic kinds: for `reconciliation_failed` it is
`observed.rows.length` (rows actually pulled from the grid, which is the
informative value there), while for `row_budget_exceeded` and
`identity_verification_failed` it is hard-coded `0` (rows contributed to the
batch). Both are defensible; the field comment should say which is which so a
future reader does not sum them.

`FACT` — `REPRODUCED`. Documentation continuity passes — 48 active/ready task
rows, 44 changelog entries — and `git diff --check` is clean, so the continuity
additions describing the collector, the retired container/Bonfire path, and the
shadow gates do not break the tracked-status contract.

---

## 5. Gates — unchanged

R14 §6 stands in full. Restating only the order-critical items:

1. **Shadow gate 1 — the CLI exits on its own, and host Chrome keeps running.**
   Still the first thing to prove. `close()` (`port:457-465`) closes both pages
   and deliberately does not call `browser.close()`, so the `connectOverCDP`
   WebSocket is the only handle I cannot account for; with `process.exit()`
   correctly removed, an open handle turns a successful run into a
   `timeout`. If it hangs, add `await this.browser.close()` — that disconnects
   the client without owning the launchd Chrome — and re-run.
2. Two units with different result totals produce different observations — the
   B-1 disproof, still non-negotiable.
3. **New empirical value from this delta:** no unit reports
   `reconciliation_failed`. If one does, that is the pagination evidence M-3
   predicted, and `pagesVisited: 1` must be revisited before live.
4. Baseline non-zero; `facilitation` yields event `0000039985` with BU `3820`;
   an induced failure preserves earlier units; no Chrome tab growth.

**Live** is unchanged: one `complete` receipt with nine observed units and zero
missing; `0000039985` present with no operator assistance; a `complete`
nine-unit zero-row run while that event is visible remains **forbidden**; review
gate stays `0`.

`INFERENCE`. Event `0000039985` closes **2026-08-13** — three days out — so the
live positive-control gate must be exercised before then or re-established
against whatever is open at that point. Unit tests passing does not advance any
of these.

---

## 6. Commands, files, limitations, time, cost

### Commands

| Command | Result |
| --- | --- |
| `npx vitest run` × 6 focused files | `REPRODUCED` — **47 tests / 6 files pass** (identity 3, collector 8, container-runner 28, job-path 3, browser-port 4, job 1), matching R15's count; the collector file still reports 8, consistent with the old rejection test being replaced one-for-one |
| `npm run docs:continuity-check` | `REPRODUCED` — pass, 48 rows / 44 entries |
| `git diff --check` | `REPRODUCED` — clean |
| `git status --porcelain`, `git diff --stat ec62c30`, `grep`, `sed`, `date` | Read-only |

Files read this round: `src/procurement-caleprocure-collector.ts` (changed
region and diagnostic type), `src/procurement-caleprocure-collector.test.ts`
(the three-unit regression), `src/procurement-browser-port.ts` (`close`,
`readBaseline`), `src/procurement-caleprocure-job.ts` (non-complete path), the
R14 request/response, and this request. Everything else is carried from R13/R14
and was not re-read.

### Limitations

`FACT`. The sandbox continues to decline the pinned Node 22.23.2 binary, so
`better-sqlite3`-dependent suites cannot run here; I did not run
`npm run typecheck`, the 2,006-test root suite, the host build, or the runner
suite. The six focused files have no native dependency and ran under ambient
Node v26.6.0. Those five results remain Codex's to attest.

`FACT`. No CDP endpoint was reachable from this review, so shadow gate 1 and the
pagination question (§5.3) remain empirically open by design, not by omission.

### Response file

`FACT`. Exactly one file was created:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R15.md
```

No source, test, script, migration, prompt, procedure, continuity file, or other
report was edited. The exact Claude session was preserved.

### Owner decisions

**No new owner decision, and none introduced by this delta.** OD-5 remains
resolved (container browser access retired; Bonfire acquisition paused with no
replacement, recorded). OD-4 is answered by execution pending the live gates.
**OD-1**, **OD-2**, **OD-3** remain open, migration-116-scoped, fail-closed, and
untouched.

### Elapsed time and cost

Approximately 22 minutes wall-clock, 2026-08-10T02:30Z–02:52Z: reading the
post-R14 delta and its regression, three verification runs, and one file write.
This CLI wrapper exposes a cumulative session budget rather than a per-round
figure; it read **$8.47 of $15** immediately before this write, so this round's
marginal cost is not separately observable and is not estimated.
