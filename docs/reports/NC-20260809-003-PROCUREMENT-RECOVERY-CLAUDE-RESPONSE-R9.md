# NC-20260809-003 — CaleProcure procedure correction and fourth-canary readiness, Claude R9

- Round: R9, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R9.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-10T00:15Z–00:42Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`; deployed runtime
  `ba726e7`; diff base `ba726e7cbda03e35cf63d7d1b732ced5339f95e4`
- Change class: C0 review. No production, database, browser, network, vault, or
  secret access; no `.env*`, credential, session, browser-profile, row, or
  task-payload content read; nothing implemented, committed, or deployed.

Labels: `FACT` = verified in this worktree this round with a citation ·
`REPRODUCED` = I ran the command and observed the output · `INFERENCE` ·
`RECOMMENDATION` · `RESIDUAL` = accepted limitation, not a defect to fix.

---

# Verdict: CHANGES REQUIRED

Three blocking edits, all small, all inside the file already being changed.

The correction is aimed at the right target and its diagnosis is correct — fill
without click was the root cause, and the Step 2 rewrite fixes it. But the
correction stops at Step 2. **Step 4 — the section that defines the field the
host actually consumes — still carries the pre-correction contract**, and its
current wording is satisfied word-for-word by exactly what canary 3 did. An
agent composing the ingest payload reads Step 4, not Step 2.

The other two blockers are of the same kind: the correction states requirements
that the reproduced UI facts show an agent cannot mechanically satisfy
(`visible`), and it leaves in place a retry instruction that is now a
guaranteed dead end precisely because the correction makes `partial` a routine
outcome.

Beyond the blockers, §4 and §5 contain the two findings I think matter most for
what happens after this round: the fourth canary as currently gated is
**expected to fail**, and the only working detector of a fake scan expires in
three days.

---

## 1. Action sequence against the reproduced UI facts

`FACT`. Step 2 (`knowledge/agents/procurement/procedures/scan-caleprocure.md:45-60`)
now reads: `Clear Criteria` → confirm input empty → fill exact keyword → click
visible `Search` → bounded snapshot wait → confirm input still holds the keyword
and read only visible summary/grid → extract from visible rows → paginate →
repeat.

| Reproduced fact (R9 §"Independent public-browser reproduction") | Procedure coverage | Verdict |
| --- | --- | --- |
| 1 — default state exposes `Event Name`, `Clear Criteria`, `Search`, and an unfiltered `Showing Results 1-320 of 320` | `:65-67` "never treat that default table as the result of a planned unit" | ✅ |
| 2 — filling `Event Name` does **not** execute a search; default visible state can coexist with stale hidden `Showing Results 0 of 0` | `:49-50` explicit click required, Enter not accepted; `:77-79` hidden summaries are never evidence | ✅ — this is the root-cause fix and it is correct |
| 3 — clicking `Search` yields visible `Showing Results 1 of 1` and the `0000039985` row | `:51-58` bounded wait then visible-only read | ✅ |
| 4 — duplicate element IDs; a text locator's **first** match was hidden while its second was visible | `:54-57` requires visible-only evidence but gives **no technique** to obtain it | ❌ **B-2** |
| 5 — clicking the transformed event-ID cell did not expose a clean detail URL | `:104-108`, `:113-115` fail-closed identity rule retained | ⚠️ fail-closed but not achievable — §4 |

`FACT`. Procedure item 9 from the request is done: the Gotchas note that said
business-unit codes were "Not needed for our purposes" is replaced at `:222-225`
with the requirement and the never-infer-from-agency-name rule. That note
directly contradicted Step 3 and removing it was necessary.

`INFERENCE`. The sequence itself is right and I would not restructure it. The
`Clear Criteria`-first ordering matters more than it looks: without it, a failed
fill leaves the *previous* keyword in the box, and step 5's "input still contains
the exact keyword" check would pass against stale state. Clearing first and
proving empty makes that check meaningful rather than decorative.

---

## 2. Blocking edits

### B-1 — Step 4 still defines `observed_units` by the pre-correction standard

`FACT`. `:130-133`:

> `observed_units`: every host-planned keyword **whose requested result pages
> actually loaded and were inspected**. Never include a keyword that timed out,
> failed, or was skipped. Empty results still count as observed **when the page
> loaded successfully**.

`FACT`. In canary 3 the page loaded, the agent inspected it, nothing timed out,
nothing was skipped, and results were empty. **Every clause of that definition
was satisfied while zero searches executed.** The host recorded planned 9,
observed 9, missing 0.

`INFERENCE`. This is the decisive gap. Step 2's new three-fact rule
(`:62-68`) is stated where the agent *browses*; `observed_units` is composed
where the agent *submits*. Step 4 is the operative contract for the field the
host consumes, and it is unchanged from the version that produced the failed
canary. Leaving it as-is means the correction can be fully honored in Step 2 and
still silently bypassed in Step 4.

**Required edit** — replace the `observed_units` bullet so it restates the
action requirement, not the page-load requirement:

> `observed_units`: every host-planned keyword for which you clicked the visible
> `Search` button and then read a visible result summary or visible no-results
> message for that exact keyword. Page load alone is **not** observation, and a
> keyword whose search action or visible result state you cannot prove must be
> omitted even though the page loaded. Zero visible results still count as
> observed when the search was executed and its visible zero-result state read.

### B-2 — "visible" is required but never operationalized

`FACT`. The word "visible" appears in eight places between `:46` and `:82`, and
the reproduction proves the failure it must prevent: *"A text locator's first
match was hidden while its second match was visible."*

`FACT`. The procedure supplies no mechanism. `:55-57` says only that hidden
copies "are never evidence." An agent that queries by text gets the hidden match
first and has no stated way to know.

`INFERENCE`. A requirement an agent cannot mechanically satisfy is an
aspiration, not a control. The procedure already uses `agent-browser snapshot -i`
(`:18`), which is the interactive/ref-bearing form — the mechanism exists and is
simply not prescribed for this purpose.

**Required edit** — add to Step 2, after the current item 5:

> Resolve every element by its interactive snapshot ref, never by raw page text.
> Take `agent-browser snapshot -i` and act on the ref for the visible
> `Clear Criteria`, `Event Name`, and `Search` elements. This page renders
> responsive duplicates with identical element IDs, so a text match may resolve
> to a hidden copy. If a snapshot yields more than one candidate for the results
> summary or the grid, or if you cannot establish which candidate is visible,
> the state is ambiguous: omit that keyword from `observed_units` and do not
> guess.

### B-3 — the `partial` retry instruction is now a routine dead end

`FACT`. `:161-162`: *"`partial` or `failed` must be reported and retried with
the same run key and exact batch evidence."*

`FACT`. Under the deployed host token (`ba726e7`), the run key is fixed for the
whole task run, and migration 115 makes both retry directions terminal:

- **Same evidence** — `fn_begin_procurement_source_run_v2` resumes the
  `partial` row (`115:276-284`), re-ingest recomputes the identical missing set,
  and `fn_complete_procurement_source_run_v2` derives `partial` again
  (`115:396-405`). A no-op loop with no path to `complete`.
- **Corrected evidence** — a changed `batch_hash` raises
  *"procurement run key % was reused with different evidence"* (`115:270-275`).

`INFERENCE`. I flagged this narrowing in R8 §2.4 as an acceptable trade because
`partial` was then an exceptional outcome. **This correction changes that.**
`:67-68` now instructs the agent to produce `partial` whenever action or
visible-state proof is ambiguous, and `:113-115` again for an unverifiable
business unit. `partial` becomes an expected result, and the documented recovery
for it cannot work.

**Required edit** — split the two cases at `:161-162`:

> `failed` may be retried once with the same run key and byte-identical batch
> evidence; that path resumes the same ledger row. `partial` may **not** be
> retried within this scan: the run key is task-bound, and resubmitting the same
> evidence reproduces the same missing units while corrected evidence is
> rejected as a changed batch. Report the missing units and the reason to Slack
> and stop. The operator re-runs the task, which issues a new host token.

---

## 3. Can the agent still report nine units without nine visible searches?

**Yes. Necessarily, and no procedure edit changes it.**

`FACT`. `observed_units` and `coverage_evidence` are container-supplied.
`fn_complete_procurement_source_run_v2` validates only that every observed unit
is host-planned, that evidence keys exactly match observed units, and that
`resultCount` and `pagesVisited` are well-formed integers (`115:371-390`). The
numbers themselves are never checked against anything.

`INFERENCE` — and this is the part worth sitting with: **canary 3's report was
internally consistent and structurally valid.** Nine planned units, nine
observed, zero missing, well-formed evidence, zero rows. No host-side check,
existing or proposed, would have rejected it. The procedure now adds obligations
an honest agent will follow, and the host still cannot distinguish an honest
zero-row scan from a fabricated one.

What actually caught it was the **absence of a known-live row**. The positive
control is the detector — the only one that exists. That is the thread running
through §4 and §5.

`RECOMMENDATION` — one host-side invariant is available with no schema change
and closes a real hole, though not this one. Cross-check `resultCount` against
submitted rows per keyword: for each observed unit `u`, the number of rows whose
`search_keyword` set includes `u` must be consistent with `evidence[u].resultCount`
(bounded above by the two-page cap). Today a unit may report `resultCount: 1`
and submit no row, which is exactly the shape the business-unit rule produces
(§4) — so the agent that silently drops an inconvenient row gets a clean
`complete` receipt while the honest agent gets `partial`. That inversion should
not be left standing. Source change, next round, not blocking.

---

## 4. Business-unit identity: fail-closed, but not achievable

`FACT`. `:104-108` requires every row to carry `business_unit` or a verified
clean URL containing the same BU/event pair, and `:113-115` makes an
unverifiable BU a unit-level incompleteness. `:222-225` forbids inferring it from
the agency name.

`FACT`. The reproduction (R9 §5) states that clicking the visible transformed
event-ID cell **did not expose a clean detail URL**. The BU `3820` for event
`0000039985` was established earlier from "an authoritative public agency link"
— a human research step, not a reproducible grid interaction.

`INFERENCE` — the consequence, stated plainly because it determines what the
fourth canary means:

1. `facilitation` returns the one visible positive row.
2. The agent cannot obtain its BU by any prescribed, reproducible route.
3. `:113-115` requires reporting that unit incomplete.
4. `facilitation` is omitted from `observed_units` → `missing_units` non-empty →
   `fn_complete_procurement_source_run_v2` derives `partial` (`115:401-405`).
5. `validateProcurementTaskCompletion` requires `status = 'complete'` and
   rejects it → `[SCHEDULED TASK NOT COMPLETE]`.

**The fourth canary, run as specified while `0000039985` is live, is expected to
produce `partial` and fail.** That would be the system behaving *correctly* —
fail-closed on an identity it cannot verify — but read cold it looks identical
to a regression.

`RECOMMENDATION` — two things, neither of which weakens the identity rule:

1. **Record the expected outcome before the run.** State in the canary plan that
   a `partial` naming `facilitation`, together with a Slack report of one
   visible row at `Showing Results 1 of 1` for that keyword, is a **pass on the
   procedure correction** and a fail only on identity. Otherwise a correct
   fail-closed result gets debugged as a bug.
2. **Give the agent one reproducible BU attempt sequence** before it gives up —
   read the row's link `href` from the interactive snapshot ref rather than
   clicking; if absent, check the pagination/detail control for a
   `/event/{BU}/{AUC_ID}` path; if still absent, declare the unit incomplete.
   Today the procedure says "open the event detail or an authoritative agency
   link" (`:107-108`), which is not an executable instruction for an agent.

`INFERENCE`. I am not proposing an agency→BU lookup. A wrong BU corrupts
`source_key` and therefore the stable identity of every future observation of
that opportunity; the never-infer rule is correct and should stay.

---

## 5. The detector expires 2026-08-13

`INFERENCE`. Combining §3 and §4 produces the finding I most want on the record.

- While `0000039985` is live, a truthful scan yields `partial` (§4), which fails
  the gate.
- After it closes on **2026-08-13**, all nine keywords return zero, a nine-unit
  zero-row `complete` receipt becomes achievable — and simultaneously
  **unfalsifiable**, because there is no longer any live row whose absence would
  reveal a broken scan (§3).

So the canary can pass cleanly only once the sole evidence that it means
anything has disappeared. That is three days away.

`RECOMMENDATION` — establish a **durable positive control** before then, so
liveness stops depending on whichever opportunity happens to be open. The
cheapest form that requires no schema change and no new IPC field: add one broad
control keyword to `CALEPROCURE_PLANNED_UNITS`
(`src/procurement-source-config.ts:10-20`) chosen to return results
essentially always, and assert host-side that the control unit reports
`resultCount > 0` and contributes at least one row. The validator's set-equality
check already compares against `plannedCaleProcureUnits()`
(`src/procurement-task-completion.ts:70, 79-81`), so the release contract
follows automatically from the constant.

That combination — a control unit plus the §3 `resultCount` cross-check — is the
first arrangement in this whole sequence that would make a fabricated nine-unit
receipt *detectable by the host* rather than by luck. Source change, next round.
It should not gate this procedure correction, but it should not drift either: on
2026-08-14 the current detector is gone.

---

## 6. Continuity documents

`FACT` — the host-receipt/business-outcome distinction is recorded correctly and
in the right words, in all three documents:

- `docs/ACTIVE-WORK.md` — *"Its source/task correlation and scheduler behavior
  therefore pass, but it reported zero observations/opportunities and missed the
  known public positive control, so the business outcome fails."*
- `docs/ENGINEERING-CHANGELOG.md` — *"only the scheduler/correlation/receipt
  mechanics pass; the procurement outcome fails."*
- `docs/PROJECT-MAP.md` — *"source run 5 was correctly bound to its task and
  reported all nine units observed, yet returned zero opportunities and missed
  the current positive control."*

`FACT` — `REPRODUCED`: `npm run docs:continuity-check` passes (48 active/ready
task rows, 44 changelog entries); `git diff --check` is clean; the active-work
status remains the legal `deployed_unverified`.

### 6.1 The packaging boundary is described accurately but filed in the wrong place

`FACT`. The boundary appears once, at `docs/ACTIVE-WORK.md:190-194`: *"The
release archive does not package `knowledge/`, so the separately tracked
reviewed procedure was installed byte-exact after backing up its prior bytes."*
It is absent from `docs/ENGINEERING-CHANGELOG.md`, `docs/PROJECT-MAP.md`,
`docs/RELEASE-INTEGRITY.md`, and `scripts/build-release.mjs`.

`FACT` — I verified the boundary against the packaging code rather than
accepting the claim. `scripts/build-release.mjs:92-105` packages `dist/` plus
tracked `.nvmrc`, `package.json`, `package-lock.json`, `container/`, **`groups/`**,
`launchd/`, `setup/launchd/`, plus two release scripts. `knowledge/` is not in
that list. The claim is exactly correct.

`INFERENCE` — but it exposes something larger than a filing question.
**`groups/` is inside the release manifest; `knowledge/` is outside it.** Both
are agent-governing instruction bytes, and
`groups/procurement/CLAUDE.md:191` delegates directly to the unpackaged file:
*"Read `/workspace/extra/knowledge/procedures/scan-caleprocure.md`."* A
manifest-covered, integrity-verified prompt hands control to bytes the manifest
does not cover, and `/health` cannot attest them. The release system's identity
guarantee has a hole positioned exactly where this round's correction lives —
which is also why Codex is hand-carrying a procedure SHA-256
(`d0bd484a…` in the R7 round) that no tooling verifies.

`RECOMMENDATION` — three steps, in increasing scope:

1. **Now, non-blocking:** record the installed procedure's SHA-256 in
   `docs/ENGINEERING-CHANGELOG.md`, not only in `ACTIVE-WORK.md`. ACTIVE-WORK is
   pruned when a task completes; the changelog is the durable record, and a
   hand-verified byte identity that survives nowhere is not continuity.
2. **Next round:** state the packaging boundary in `docs/RELEASE-INTEGRITY.md`
   as a standing property — release manifests cover `groups/` and not
   `knowledge/`, therefore procedure bytes are operator-asserted.
3. **Then:** add `knowledge` to the `git ls-files` list at
   `scripts/build-release.mjs:95-104` and close the asymmetry. One line, and it
   makes the next procedure change manifest-covered instead of hand-hashed.

---

## 7. Decision on commit, install, and the fourth canary

**After B-1, B-2, and B-3 only**, the procedure may be committed, installed
byte-exact on the production host, and exercised with one natural
collection-only canary. Review stays disabled.

`FACT`. Nothing in this delta touches source, migrations, gates, or any
`DECIDE`/`ADVANCE` path. Review remains gated on
`PROCUREMENT_REVIEW_ENABLED === '1'` plus epoch plus at least one operator UID
(`src/procurement-policy.ts:28-43`), unchanged. Human-only authority is not
expanded.

Sequence: apply B-1..B-3 → commit → install byte-exact after backing up the
prior bytes → **record the installed SHA-256 in the changelog** (§6.1) →
canary.

**Fourth-canary evidence.** The R7 §7 items stand; these are the ones this round
changes:

| # | Evidence |
| --- | --- |
| 1 | Exactly one task run; receipt `run_key` equals `t.<taskId>.<startMs>` for that run |
| 2 | The Slack report shows a **per-keyword** visible result state for all nine units — this is the first canary where the procedure requires it and the first that can show the correction worked |
| 3 | `facilitation` reports a visible `Showing Results 1 of 1` and names event `0000039985` |
| 4 | **Either** the row is submitted with business unit `3820` from a verified link and the run is `complete`, **or** `facilitation` is reported incomplete and the run is `partial` — see §4, both are correct outcomes of the procedure, only the first passes the gate |
| 5 | No `complete` receipt is produced with nine zero-result units while `0000039985` is visible. That combination is now the specific disproof |
| 6 | Review still off; `/health` reports the intended commit |

`INFERENCE` — item 5 is the sharpest single assertion available. Before this
round, "nine observed, zero rows" was ambiguous. With a known-live row and a
procedure that requires clicking `Search`, that exact combination becomes
positive evidence that the searches did not execute.

---

## 8. Commands, environment, owner decisions, time, cost

### Commands run

| Command | Result |
| --- | --- |
| `npm run docs:continuity-check` | `REPRODUCED` — pass, *"48 active/ready task rows, 44 changelog entries"* |
| `git diff --check` | `REPRODUCED` — clean |

Also `git log --oneline`, `git status --porcelain`, `git diff --stat ba726e7`,
`git diff ba726e7 -- <path>`, `grep`, `sed`, `date`. Read-only. No database,
network, browser, container, production, or deployment access, and no browser
reproduction of my own — CaleProcure was not contacted from this session.

### Environment limitation

`FACT`. No test or typecheck run was warranted: this delta changes one Markdown
procedure and three continuity documents, with no TypeScript touched
(`git diff --stat ba726e7` shows 4 files, all `.md`). The Node 22.23.2 ABI
limitation from R7/R8 is therefore not load-bearing this round.

`INFERENCE`. The reproduced browser facts in the request are Codex's, not mine.
I verified the procedure text against them and verified the packaging claim
against `scripts/build-release.mjs`; I did not independently re-observe the
CaleProcure UI, and none of my findings depend on doing so.

### Changed files

Exactly one file created, inside the review root:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R9.md
```

`FACT`. No source, test, migration, prompt, procedure, continuity file, or other
report was edited. The four modified paths
(`docs/ACTIVE-WORK.md`, `docs/ENGINEERING-CHANGELOG.md`, `docs/PROJECT-MAP.md`,
`knowledge/agents/procurement/procedures/scan-caleprocure.md`) are Codex's delta
and I touched none of them.

### Remaining owner decisions

**No new owner decision arises from this round.** B-1..B-3 are determinate
procedure corrections; §3, §5, and §6.1 are engineering recommendations with
right answers.

Three decisions remain open from R6, all migration-116-scoped, all fail-closed
configuration, and **none blocks this procedure change or the fourth canary**:

| ID | Decision | Status |
| --- | --- | --- |
| **OD-1** | Who may `APPROVE` / `RECORD-SUBMISSION` — `PROCUREMENT_APPROVER_UIDS`, defaulting empty | Open, 116-scoped |
| **OD-2** | Must the approver differ from the packet assembler | Open, 116-scoped |
| **OD-3** | Outcome follow-up window and maximum evidence age | Open, 116-scoped |

`INFERENCE` — one item is heading toward becoming an owner decision and is not
one yet. If the fourth canary produces the expected `partial` (§4) and
`0000039985` closes on 2026-08-13, the owner will face a real choice: accept a
zero-row `complete` receipt as the gate for enabling review, or hold review
until a durable positive control exists (§5). I am not raising it now because it
is contingent on a canary that has not run. It should be raised the moment that
canary returns.

### Elapsed time and cost

Approximately 27 minutes wall-clock, 2026-08-10T00:15Z–00:42Z: reading the
working-tree diff from `ba726e7`, the full current procedure, the release
packaging script, two verification commands, and one file write. The session's
observable budget counter read **$5.70 of $15** at the start of this round,
cumulative across the session rather than per-round. Exact per-round token
accounting is not observable from inside the session and is not estimated.
