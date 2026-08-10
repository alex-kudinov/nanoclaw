# NC-20260809-003 — R9 dispositions, portal-native identity, and release-owned knowledge, Claude R10

- Round: R10, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R10.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-10T00:29Z–00:56Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`; deployed runtime
  `ba726e7`; diff base `ba726e7cbda03e35cf63d7d1b732ced5339f95e4`
- Change class: C0 review. No production, database, browser, network, vault, or
  secret access; no `.env*`, credential, session, browser-profile, row, or
  task-payload content read; nothing implemented, committed, or deployed.

Labels: `FACT` = verified in this worktree this round with a citation ·
`REPRODUCED` = I ran the command and observed the output · `INFERENCE` ·
`RECOMMENDATION` · `RESIDUAL` = accepted limitation.

---

# Verdict: CHANGES REQUIRED

**One blocking edit**, two lines, in a function already under review.

B-1, B-2, and B-3 are all correctly implemented. The portal-native identity
workflow is a real solution to the problem R9 predicted would fail — it removes
the expected-partial outcome rather than working around it, which is better than
what I asked for. The release-owned knowledge mount closes the integrity
asymmetry at its root, and I verified its trust assumption holds rather than
taking it on faith.

The blocker is narrow and specific: `RELEASE-INTEGRITY.md` now asserts that the
host *"suppresses any mutable configured mount targeting the same container
path,"* but the suppression filter compares a raw string where
`mount-security.ts` normalizes one. Three spellings of the same container path
survive the filter and are then mounted **after** the release-owned mount, so
mutable bytes would win at exactly the boundary this change exists to protect.
It cannot fire with the current tracked configuration — I checked — so this is
drift risk, not a live bug. But the document makes a guarantee the code delivers
only for one exact spelling, and the fix is two lines in code already open.

Everything else is non-blocking, and §6 records the one thing that improves
rather than degrades: the fourth canary is **no longer expected to fail.**

---

## 1. B-1, B-2, B-3

### B-1 — payload contract · **correct**

`FACT`. `knowledge/agents/procurement/procedures/scan-caleprocure.md:152-157`:

> `observed_units`: every host-planned keyword for which you clicked the visible
> `Search` button and then read a visible result summary or visible no-results
> message for that exact keyword. Page load alone is **not** observation. Omit
> a keyword whose search action, exact input, or visible result state you cannot
> prove even when the page loaded. Zero visible results count as observed only
> when the search executed and its visible zero-result state was read.

`INFERENCE`. Canary 3's behavior no longer satisfies this. The old wording was
met by a loaded page and an inspection; the new wording requires a click and an
exact-keyword visible state, and the "even when the page loaded" clause closes
the precise loophole that made the old text true for a scan that never ran.

### B-2 — visible selection · **correct, with an ordering nit**

`FACT`. `:57-63` adds ref-based resolution: `agent-browser snapshot -i` refs for
`Clear Criteria`, `Event Name`, and `Search`; the accessibility snapshot for the
summary and grid; multiple candidates or unestablished visibility → ambiguous →
omit.

`INFERENCE` — `N-1`, non-blocking. The rule is **item 6**, after items 1–3 have
already told the agent to click `Clear Criteria`, fill the input, and click
`Search`. An agent executing the numbered list in order performs all three
interactions before reaching the rule governing how to resolve them. Move the
ref rule ahead of item 1, or fold "resolve by ref" into items 1–3 directly.
Instruction documents are executed top-down.

### B-3 — partial retry · **correct**

`FACT`. `:185-190` splits the two cases exactly: `failed` retried once with
byte-identical evidence resumes the same ledger row; `partial` may not be
retried in-scan because the run key is task-bound, identical evidence
reproduces the same missing units, and corrected evidence is rejected as a
changed batch; report and stop; an operator rerun issues a new token.

`FACT`. That matches the deployed mechanics: `115:276-284` (resume) and
`115:270-275` (changed-batch raise).

---

## 2. Identity workflow audit

`FACT`. `:114-130` — open the visible `Look up businessUnit` control by ref;
find lookup rows whose department name exactly equals the result row's agency;
exactly one match → candidate, zero or many → ambiguous; construct
`https://caleprocure.ca.gov/event/{BU}/{AUC_ID}`; accept only when the visible
`Event Details` page repeats the exact event ID and department (and title when
available); otherwise report the keyword incomplete.

| Threat | Handling | Verdict |
| --- | --- | --- |
| Duplicate agency names in the lookup | ">1 match → ambiguous" | ✅ |
| False pairing (wrong BU + valid AUC_ID) | The detail page must repeat **both** the event ID and the department. A wrong BU that still resolves shows a different department | ✅ — the department check is what makes this sound; the event-ID check alone would not be |
| Stale/renamed department in the lookup | Grid name ≠ lookup name → zero matches → ambiguous → partial | ✅ fail-closed |
| Detail mismatch | Explicit reject → incomplete | ✅ |
| **Uniqueness scoped to the viewport** | "exactly one **visible** row matches" | ⚠️ `N-2` |

`INFERENCE` — `N-2`, non-blocking but the strongest item in this section,
because it is the same failure shape as the bug this whole round exists to fix.
*"Exactly one visible row matches"* is a statement about what is rendered, not
about the lookup table. If that table paginates or virtualizes, a second
matching row off-screen makes the uniqueness claim false, and the agent
proceeds with a **confidently wrong** BU rather than declaring ambiguity. The
detail-page department check catches the resulting mismatch, so the system still
fails closed — but the procedure would be asserting a count it did not measure,
which is exactly what "Showing Results" taught this project not to do.

`RECOMMENDATION`. Use the lookup's own filter/search to narrow to the exact
department name and require its **reported result count** to be exactly 1, not
merely that one visible row matches. Same fix, same reasoning as the main
search.

`INFERENCE` — `N-3`, non-blocking. Exact string equality between the grid's
agency and the lookup's department is brittle: any whitespace, case, or
punctuation difference yields zero matches → partial → and per B-3 that run
cannot be retried in-scan, so it costs an operator rerun. Permitting trim,
internal whitespace collapse, and case-insensitive comparison would remove most
false partials while remaining non-inferential. Substring, fuzzy, and
abbreviation matching must stay forbidden — those are inference and would
reintroduce exactly the risk the never-infer rule exists to block.

---

## 3. Nine units at both boundaries

**Verified at both.**

`FACT` — browse boundary: `:46-56` (clear → prove empty → exact fill → click
`Search` → bounded wait → confirm the input still holds the exact keyword,
visible summary/grid only) and the three-fact paragraph at `:66-72`.

`FACT` — payload boundary: `:152-157`, quoted in §1.

`INFERENCE`. The two now state the same requirement in the same terms, which was
the entire substance of B-1. An agent can no longer satisfy Step 2 loosely and
have Step 4 accept it, or satisfy Step 4's letter without the Step 2 actions.

---

## 4. Release-owned mount plan

| Dimension | Finding | Verdict |
| --- | --- | --- |
| Traversal | `groupFolder` gated by `/^[A-Za-z0-9_-]+$/` (`src/container-runner.ts:129`) before any path use; `path.resolve` of three literal segments cannot escape | ✅ tested |
| Symlink | `fs.statSync` **follows** symlinks (`:144-146`), so a symlinked group directory would be accepted | ⚠️ `N-4` |
| **Shadowing / duplicate target** | Filter compares a raw string that `mount-security` normalizes | ❌ **B-4, blocking** |
| Allowlist bypass | The release mount skips `validateAdditionalMounts` deliberately | ✅ justified — see below |
| Read/write | `readonly: true` (`:155`); replaces a mount already configured read-only | ✅ |
| Missing directory | Returns `{ knowledgeMount: null, additionalMounts }` unchanged | ✅ tested |
| main / non-main | Plan is `isMain`-independent; remaining mounts still carry `isMain` into validation | ✅ `N-6` |
| Older-release rollback | Fallback preserved when the release lacks the directory | ✅ tested |

`FACT` — the allowlist bypass is sound, and I verified its premise rather than
assuming it. `codeRoot = process.env.NANOCLAW_CODE_ROOT || process.cwd()`
(`src/container-runner.ts:184-188`), and
`docs/RELEASE-INTEGRITY.md:216-218` records that **production startup refuses a
`NANOCLAW_CODE_ROOT` outside the verified release**, with `/health.release`
reporting `codeRoot` and `codeRootMatchesRelease`. Both plists set the variable
(`launchd/com.nanoclaw.plist:32`, `setup/launchd/com.nanoclaw.plist:18`). So the
mount's host path is derived from a startup-verified release root plus a
regex-validated group folder — not from operator input — and skipping the
external allowlist is a narrow, defensible exemption rather than a hole.

### 4.1 B-4 — the suppression filter does not normalize · **blocking**

`FACT`. `src/container-runner.ts:157-161`:

```ts
additionalMounts: additionalMounts.filter((mount) => {
  const containerPath = mount.containerPath ?? path.basename(mount.hostPath);
  return containerPath !== 'knowledge';
}),
```

`FACT`. The code that actually resolves the mount does it differently.
`src/mount-security.ts:248` uses `mount.containerPath || path.basename(...)`,
and `isValidContainerPath` (`:202-219`) rejects only `..`, a leading `/`, and
empty — it does **not** normalize. The final target is
`` `/workspace/extra/${resolvedContainerPath}` `` (`:357`).

Three spellings therefore survive the filter and still land on
`/workspace/extra/knowledge`:

| Configured `containerPath` | Filter (`??`, raw compare) | mount-security | Result |
| --- | --- | --- | --- |
| `''` | `'' ?? …` → `''` → kept | `'' \|\| basename` → `knowledge` | duplicate |
| `'knowledge/'` | kept | valid → `/workspace/extra/knowledge/` | duplicate |
| `'./knowledge'` | kept | valid → `/workspace/extra/./knowledge` | duplicate |

`FACT`. The release-owned mount is pushed at `:368` and the validated
configured mounts at `:388`. **The survivor is mounted last**, so under every
common container runtime the mutable operational bytes take precedence over the
manifest-covered ones — the exact inversion this change exists to prevent.

`FACT`. Not reachable with the current tracked configuration:
`scripts/register-procurement.ts:33` sets `containerPath: 'knowledge'` exactly,
so today's filter works. This is configuration-drift risk.

`INFERENCE` — why it still blocks. `docs/RELEASE-INTEGRITY.md` now states the
host *"suppresses any mutable configured mount targeting the same container
path."* That is a categorical claim; the code honors one spelling. A documented
integrity guarantee that holds only for a particular way of writing a config
value is the same class of defect as a receipt that is true only on the happy
path — and this delta's whole purpose is to make the container provably consume
archive bytes.

**Required edit** — align the filter with the code that resolves the mount:

```ts
additionalMounts: additionalMounts.filter((mount) => {
  const raw = mount.containerPath || path.basename(mount.hostPath);
  return path.posix.normalize(`/${raw}`) !== '/knowledge';
}),
```

`||` matches `mount-security.ts:248`; normalizing under a leading slash collapses
`./`, trailing slashes, and duplicate separators. Alternatively, suppress after
validation by comparing the final `/workspace/extra/...` target — equivalent, and
arguably clearer about what is being deduplicated.

### 4.2 Non-blocking mount notes

`INFERENCE` — `N-4`. `fs.statSync` follows symlinks, so
`knowledge/agents/<group>` as a symlink would be mounted from wherever it
points. Unreachable in a release tree — `scripts/build-release.mjs:116-118`
throws on any non-regular-file input — but reachable in a dev/fallback
`codeRoot` where `NANOCLAW_CODE_ROOT` is unset. Use `fs.lstatSync`, or
`fs.realpathSync` plus a containment assert under `codeRoot`. This mirrors the
posture already applied elsewhere in this subsystem and costs one line.

`INFERENCE` — `N-6`. The plan ignores `isMain`, so a main group with a matching
`knowledge/agents/<folder>` directory now also bypasses the allowlist for that
one path. Acceptable — the bytes are read-only and manifest-covered — but it is
a behavior change for main groups that the tests do not cover.

---

## 5. Builder and `FILES.sha256` coverage

**Verified end to end, by enumeration rather than by inspection of intent.**

`FACT`. `scripts/build-release.mjs:103` adds `knowledge` to the `git ls-files`
input set, alongside `container`, `groups`, `launchd`, `setup/launchd`.

`FACT`. `FILES.sha256` is generated by a recursive walk of the entire staged
bundle that hashes **every regular file** except the manifest itself, and throws
on any non-file entry (`:129-149`). Packaged knowledge files are therefore
covered without needing a special case.

`FACT` — the packaged set equals the mounted set. `git ls-files
knowledge/agents/procurement` and `find knowledge/agents/procurement -type f`
both return exactly five files:
`KNOWLEDGE.md`, `procedures/edge-cases.md`, `procedures/scan-caleprocure.md`,
`procedures/scan-workflow.md`, `procedures/scrape-workflow.md`. No untracked or
ignored file exists under that path, and `build-release.mjs:21-27` refuses to
build a tree with untracked files at all, so the archive cannot present a subset
of what the checkout mount would have shown.

`FACT` — the mount is path-compatible, so no prompt or procedure edit is needed.
The release mount targets `/workspace/extra/knowledge` from
`codeRoot/knowledge/agents/<group>`, which is the identical layout the
configured mount produced (`register-procurement.ts:32-34`,
`hostPath: 'knowledge/agents/procurement'`, `containerPath: 'knowledge'`).
`groups/procurement/CLAUDE.md:191` reads
`/workspace/extra/knowledge/procedures/scan-caleprocure.md` and the procedure
reads `/workspace/extra/knowledge/KNOWLEDGE.md`; both resolve unchanged.

`INFERENCE` — `N-7`, a transition fact worth stating plainly. The live release
`ba726e7` does **not** package `knowledge/`, so the running container still uses
the configured mutable mount and its hand-installed bytes. The convergence
requirement — *"the active container must consume the same procedure bytes
attested by the release archive"* — becomes true only once the next release is
built and activated. The fourth canary will therefore be the **first run in this
programme whose instruction bytes are provably archive-attested**, and that is
worth recording as its own evidence item rather than assuming it.

`INFERENCE`. This also resolves R9 §6.1 by implementing the deepest of my three
suggestions rather than the interim one. Recording the installed procedure's
SHA-256 in the changelog is now moot for future releases — `FILES.sha256`
carries it — and `RELEASE-INTEGRITY.md:30-37` documents the boundary and the
fallback. I withdraw that recommendation for anything after this release.

---

## 6. What improved: the canary is no longer expected to fail

`INFERENCE`. R9 §4 predicted the fourth canary would produce `partial`, because
`facilitation` would surface the positive row and no reproducible path existed
to its business unit. The lookup-plus-detail workflow removes that prediction —
BU `3820` is obtainable from the portal itself, without inference — so a
`complete` run that discovers and stably identifies event `0000039985` is now
achievable. That is a better answer than the "record the expected failure" path
I proposed, and it is the right one: it fixes the gap instead of documenting it.

`INFERENCE`. R10's convergence rule also operationalizes R9 §5's disproof
directly: *"a complete nine-zero run while that event remains visible is
forbidden."* That is now the specific falsifier, stated as a gate rather than as
an observation.

`RESIDUAL` — unchanged and still the deepest limitation: `observed_units`,
`resultCount`, and `pagesVisited` remain container-reported, and
`fn_complete_procurement_source_run_v2` checks only their structure
(`115:371-390`). The procedure adds obligations, not host verification. Event
`0000039985` closes **2026-08-13**; after that a nine-unit zero-row `complete`
receipt becomes unfalsifiable again. The two R9 recommendations still stand as
next-round work: cross-check `resultCount` against submitted rows per keyword,
and establish a durable positive control. Neither gates this delta.

---

## 7. Tests, documentation, and the decision

### 7.1 Tests

`FACT` — `REPRODUCED`: `npx vitest run src/container-runner.test.ts` →
**1 file / 24 tests, all pass**, independently reproducing Codex's count. The
three new cases cover release-owned precedence with configured-mount
suppression, old-release fallback, and unsafe group-folder rejection.

`RECOMMENDATION` — two additions, the first tied to B-4:

1. A suppression case per divergent spelling — `containerPath: ''`,
   `'knowledge/'`, `'./knowledge'` — each asserting the configured mount is
   dropped. These fail today and pass after the B-4 fix.
2. A `buildVolumeMounts`-level assertion that no two entries resolve to the same
   container path. That guards the invariant itself rather than one filter, and
   would catch any future mount added at a colliding target.

### 7.2 Documentation

`FACT` — `REPRODUCED`: `npm run docs:continuity-check` passes (48 active/ready
rows, 44 changelog entries); `git diff --check` is clean, including the latest
documentation additions that Codex flagged as needing a rerun.

`FACT`. `docs/ENGINEERING-CHANGELOG.md` records the R9 verdict, the three
corrections, the portal-native identity resolution, and the release-integrity
follow-up as distinct facts, and continues to separate mechanical pass from
outcome failure. `docs/RELEASE-INTEGRITY.md:30-37` states the packaging
boundary, the read-only release mount, the suppression rule, and the
older-release fallback. `docs/ACTIVE-WORK.md` remains `deployed_unverified`.

`RECOMMENDATION` — one wording change, tied to B-4. If the filter is fixed as in
§4.1, `RELEASE-INTEGRITY.md`'s "suppresses any mutable configured mount
targeting the same container path" becomes accurate as written. If for any
reason the fix is deferred, that sentence must be narrowed instead — the
document may not claim a guarantee broader than the code.

### 7.3 Decision

**After B-4 only**, this delta may be committed, built as an immutable release,
deployed collection-only, and exercised with one natural positive-control
canary. Review stays disabled.

`FACT`. Nothing in this delta touches migrations, gates, or any
`DECIDE`/`ADVANCE` path. Review remains gated on
`PROCUREMENT_REVIEW_ENABLED === '1'` plus epoch plus at least one operator UID
(`src/procurement-policy.ts:28-43`). Human-only authority is unchanged.

Sequence: apply B-4 (+ the §7.1 tests) → `npm test` full on pinned Node →
`npm run release:build` → `release:verify` → activate → confirm `/health`
reports the new commit **and `codeRootMatchesRelease`** → canary.

**Fourth-canary evidence**, updated for this delta:

| # | Evidence |
| --- | --- |
| 1 | Exactly one task run; receipt `run_key` equals `t.<taskId>.<startMs>` |
| 2 | `/health.release` shows `codeRootMatchesRelease` true — the first run whose procedure bytes are archive-attested (`N-7`) |
| 3 | Per-keyword visible result state reported for all nine units |
| 4 | `facilitation` reports visible `Showing Results 1 of 1` and names event `0000039985` |
| 5 | The row carries business unit `3820`, obtained by lookup-plus-detail, and the run is `complete` — **or** the run is `partial` naming a concrete visible identity reason |
| 6 | **Forbidden:** a `complete` nine-unit zero-row run while `0000039985` is visible |
| 7 | Review still off |

---

## 8. Commands, environment, owner decisions, time, cost

### Commands run

| Command | Result |
| --- | --- |
| `npm run typecheck` | `REPRODUCED` — pass |
| `npm run format:check` | `REPRODUCED` — *"All matched files use Prettier code style!"* |
| `npm run docs:continuity-check` | `REPRODUCED` — pass, 48 rows / 44 entries |
| `git diff --check` | `REPRODUCED` — clean (the rerun Codex requested) |
| `npx vitest run src/container-runner.test.ts` | `REPRODUCED` — **24/24 pass** |

Also `git status --porcelain`, `git diff --stat ba726e7`,
`git diff ba726e7 -- <path>`, `git ls-files`, `find`, `grep`, `sed`, `wc -l`,
`date`. Read-only. No database, network, browser, container, production, or
deployment access; CaleProcure was not contacted from this session.

### Environment limitation

`FACT`. Unlike R7–R9, the Node ABI limitation did **not** bite this round:
`src/container-runner.test.ts` has no `better-sqlite3` dependency, so all 24
tests ran under my ambient Node v26.6.0. This is the first round in which I have
independently reproduced Codex's focused-test claim in full rather than relying
on the pinned run.

`FACT`. I did not run `npm test` (full suite) — it includes the
`better-sqlite3`-dependent files that fail under Node 26, and the sandbox
continues to decline the pinned Node 22.23.2 binary. The full suite remains
Codex's to verify before release.

`INFERENCE`. The browser facts in the request are Codex's reproduction. I
verified the procedure text against them and verified the packaging and
`codeRoot` claims against source; no finding here depends on re-observing the
portal.

### Changed files

Exactly one file created, inside the review root:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R10.md
```

`FACT`. No source, test, script, migration, prompt, procedure, continuity file,
or other report was edited. The eight modified paths are Codex's delta and I
touched none of them.

### Remaining owner decisions

**No new owner decision arises from this round.** B-4 and every `N-` item is a
determinate engineering correction.

Three remain open from R6 — all migration-116-scoped, all fail-closed
configuration, none blocking this delta or the canary:

| ID | Decision | Status |
| --- | --- | --- |
| **OD-1** | Who may `APPROVE` / `RECORD-SUBMISSION` — `PROCUREMENT_APPROVER_UIDS`, defaulting empty | Open, 116-scoped |
| **OD-2** | Must the approver differ from the packet assembler | Open, 116-scoped |
| **OD-3** | Outcome follow-up window and maximum evidence age | Open, 116-scoped |

`INFERENCE` — the contingent decision I flagged in R9 has **narrowed but not
closed**. The identity workflow means a `complete` run that discovers
`0000039985` is now achievable, so the owner may not have to choose between a
zero-row receipt and holding review. But if the canary still returns `partial`,
or slips past 2026-08-13, the choice returns unchanged: accept an unfalsifiable
zero-row `complete` as the gate for enabling review, or hold review until a
durable positive control exists. Raise it when the canary returns, not before.

### Elapsed time and cost

Approximately 27 minutes wall-clock, 2026-08-10T00:29Z–00:56Z: reading the
working-tree diff from `ba726e7` across eight files plus the mount-security and
release-integrity sources, five verification commands, and one file write. The
last observable session budget reading was **$5.70 of $15** at the start of R9;
the counter is cumulative across the session rather than per-round, and this
round's exact marginal cost is not observable from inside the session and is not
estimated.
