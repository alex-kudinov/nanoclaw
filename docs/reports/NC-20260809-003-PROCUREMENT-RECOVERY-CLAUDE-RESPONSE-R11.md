# NC-20260809-003 — R10 blocker closure and canary authorization, Claude R11

- Round: R11, responding to
  `docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CODEX-REQUEST-R11.md`
- Author: Claude Code (Opus 5), NanoClaw company-OS owner role
- Date: 2026-08-10T00:38Z–01:04Z
- Review root: `/private/tmp/nanoclaw-nc-20260809-003`; deployed runtime
  `ba726e7`; diff base `ba726e7cbda03e35cf63d7d1b732ced5339f95e4`
- Change class: C0 review. No production, database, browser, network, vault, or
  secret access; no `.env*`, credential, session, browser-profile, row, or
  task-payload content read; nothing implemented, committed, or deployed.

Labels: `FACT` = verified in this worktree this round with a citation ·
`REPRODUCED` = I ran the command and observed the output · `INFERENCE` ·
`RECOMMENDATION` · `RESIDUAL` = accepted limitation.

---

# Verdict: GO

R10's sole blocker is closed, and I verified it by **executing the resolution
logic against every equivalent spelling** rather than by reading the code. All
eight spellings that resolve to the same container directory are suppressed;
the two that survive resolve to genuinely different directories and cannot
shadow anything.

The three non-blocking procedure recommendations are all incorporated, and two
of them are implemented better than I specified: the ref rule now demands a
**fresh** snapshot per keyword (which also defends against stale refs after AJAX
re-render — a hazard I did not raise), and the normalization rule is applied at
the detail-page check as well as the lookup, which I had not asked for and which
closes a consistency gap I missed.

Commit, immutable build, collection-only deployment, and one fourth natural
positive-control canary may proceed with review disabled.

Three non-blocking items follow. Per this request's instruction I am not
converting any of them into a blocker: none has a reachable failure path under
the current tracked configuration, and two are documentation accuracy rather
than behavior.

---

## 1. Alias suppression, verified against actual resolution

`FACT`. `src/container-runner.ts:157-163`:

```ts
const rawContainerPath = mount.containerPath || path.basename(mount.hostPath);
const normalizedContainerPath = path.posix
  .normalize(`/${rawContainerPath}`)
  .replace(/\/+$/, '');
return normalizedContainerPath !== '/knowledge';
```

`FACT`. `||` now matches the resolver exactly (`src/mount-security.ts:248`),
which was the empty-string divergence. `path.posix.normalize` collapses `./`,
duplicate separators, and trailing `/.`; the explicit `replace(/\/+$/, '')` is
required because Node preserves a normalized trailing slash — the detail R11
records Codex hitting, and correcting rather than asserting around.

`REPRODUCED` — I evaluated both sides of the boundary for twelve spellings: the
plan's normalized target, `mount-security`'s validity predicate
(`:202-219`: rejects `..`, leading `/`, empty), and the resolved container
target `` `/workspace/extra/${raw}` `` (`:357`).

| Configured target | Normalizes to | Suppressed | Resolves to |
| --- | --- | --- | --- |
| `knowledge` | `/knowledge` | ✅ | `/workspace/extra/knowledge` |
| `knowledge/` | `/knowledge` | ✅ | same directory |
| `./knowledge` | `/knowledge` | ✅ | same directory |
| `.//knowledge` | `/knowledge` | ✅ | same directory |
| `knowledge//` | `/knowledge` | ✅ | same directory |
| `knowledge/.` | `/knowledge` | ✅ | same directory |
| `./knowledge/./` | `/knowledge` | ✅ | same directory |
| `''` (basename `knowledge`) | `/knowledge` | ✅ | same directory |
| `' knowledge'` | `/ knowledge` | not suppressed | `/workspace/extra/ knowledge` — a **different** directory |
| `Knowledge` | `/Knowledge` | not suppressed | `/workspace/extra/Knowledge` — different on the Linux container FS |

`INFERENCE`. **Eight of eight aliasing spellings are suppressed, and the two
survivors are not aliases** — they name distinct directories inside the
container, so neither can shadow the release-owned mount. The suppression is now
co-extensive with same-path collision, which is precisely the claim
`docs/RELEASE-INTEGRITY.md:30-37` makes. The document and the code agree; that
was the substance of B-4.

### 1.1 `N-8` — nested targets are not suppressed · non-blocking

`FACT` — `REPRODUCED`. `knowledge/procedures` normalizes to
`/knowledge/procedures`, is not suppressed, passes `isValidContainerPath`, and
resolves to `/workspace/extra/knowledge/procedures` — **inside** the
release-owned mount, where a bind mount would shadow that subtree with mutable
bytes.

`INFERENCE` — not a blocker, and I want to be explicit about why rather than
leaving it implicit. There is no reachable failure path: no tracked
configuration mounts anything under `knowledge/…`
(`scripts/register-procurement.ts:30-46` uses `knowledge`,
`vault-procurement`, `agent_docs`), and `RELEASE-INTEGRITY.md` claims
suppression of a mount targeting *"the same container path"* — a nested path is
a different path, so the document does not overclaim. This is hardening against
a configuration nobody has written.

`RECOMMENDATION`. One-line generalization when this file is next touched:

```ts
return (
  normalizedContainerPath !== '/knowledge' &&
  !normalizedContainerPath.startsWith('/knowledge/')
);
```

---

## 2. Regressions

`FACT` — `REPRODUCED`: `npx vitest run src/container-runner.test.ts` →
**1 file / 27 tests, all pass**, independently reproducing R11's count (24 → 27).

`FACT`. The `it.each` block covers exactly the three aliases: empty target,
trailing slash, and `./` prefix, each asserting both that the release mount is
planned at `/workspace/extra/knowledge` **and** that `additionalMounts` is
emptied. The empty case uses `hostPath: '/operations/knowledge'`, so its
basename genuinely resolves to `knowledge` — the test-design correction R11
describes. Retaining the strict assertion instead of relaxing it was the right
call; a test that passed on a basename of anything else would have proven
nothing.

`INFERENCE`. Coverage is now: exact target, three aliases, old-release fallback,
unsafe group folder. That is the full decision surface of
`planReleaseOwnedInstructionMounts` except the nested case in §1.1, which is
untested because it is unimplemented.

`RECOMMENDATION` — carried, still non-blocking: a `buildVolumeMounts`-level
assertion that no two entries resolve to the same container path. It guards the
invariant rather than one filter, and would catch any future mount added at a
colliding target without anyone remembering this round.

---

## 3. Procedure changes

### 3.1 Instruction ordering — **correct, and improved**

`FACT`. `knowledge/agents/procurement/procedures/scan-caleprocure.md:48-52` now
places ref resolution **before** the numbered list, and items 1 and 3 act on
refs (*"Click the visible `Clear Criteria` ref"*, *"Click the visible `Search`
ref"*). Item 9 closes the loop: *"Continue with a fresh snapshot and
`Clear Criteria`, then the next keyword."*

`INFERENCE`. The per-keyword **fresh** snapshot is better than what I asked for.
I raised ordering only — an agent shouldn't be told how to resolve controls
after it has already clicked them. Requiring a new snapshot each iteration also
prevents acting on refs invalidated by the AJAX re-render that follows every
search, which is a distinct failure mode on this page and one I did not name.

### 3.2 Lookup-wide uniqueness — **correct**

`FACT`. `:119-127`: use the lookup's own filter, *"require its visible reported
result count to be exactly 1"*; if no filter or count exists, *"prove global
uniqueness across every lookup page"*; otherwise ambiguous. Step 3 adds:
*"Zero, multiple, hidden-only, or off-page-unchecked matches are ambiguous."*

`INFERENCE`. This converts the viewport observation into a measured count, with
an explicit fallback that still fails closed — the exact fix, and the phrase
"off-page-unchecked" names the failure I was worried about rather than merely
excluding it by implication.

### 3.3 Name normalization — **correct, and extended**

`FACT`. `:123-125`: *"Compare names after trimming, collapsing internal
whitespace, and ignoring case only. Substring, fuzzy, abbreviation, and inferred
matches are forbidden."*

`FACT` — `:128-131` applies the same rule at the verification step: the detail
page must repeat the exact event ID and *"same normalized department name."*

`INFERENCE`. I recommended normalization only at the lookup. Applying it at both
ends closes a gap I missed: normalized matching at the lookup with strict
equality at the detail page would have produced ambiguity for exactly the rows
the normalization was introduced to accept. Both boundaries now use one rule.

`FACT` — cosmetic only: the continuation line at `:129` (`` Details` page repeats
… ``) begins at column 0 inside a numbered item. CommonMark lazy continuation
renders it correctly; it is merely inconsistent with the surrounding
indentation. No action required.

---

## 4. Release-owned knowledge boundary

`FACT` — re-verified this round, not carried forward on assertion:

- `scripts/build-release.mjs:103` includes `knowledge` in the tracked input set.
- `FILES.sha256` is built by a recursive walk hashing every regular file in the
  staged bundle, throwing on any non-file entry (`:129-149`), so packaged
  knowledge needs no special case.
- The packaged set equals the mounted set: `git ls-files` and `find` both return
  the same five files under `knowledge/agents/procurement`, and the builder
  refuses a tree with untracked files (`:21-27`).
- The mount's trust premise holds: `codeRoot` is
  `NANOCLAW_CODE_ROOT || process.cwd()` (`src/container-runner.ts:184-188`), and
  `docs/RELEASE-INTEGRITY.md:216-218` records that production startup refuses a
  `NANOCLAW_CODE_ROOT` outside the verified release, with `/health.release`
  reporting `codeRootMatchesRelease`.
- Path compatibility is unchanged, so no prompt edit is needed:
  `groups/procurement/CLAUDE.md:191` reads
  `/workspace/extra/knowledge/procedures/scan-caleprocure.md`, which resolves
  identically under the release mount.

`INFERENCE` — the transition point stands as recorded in R10 `N-7`. Live
`ba726e7` does not package `knowledge/`, so today's container still consumes the
configured mutable mount. The requirement *"the active container must consume
the procedure bytes attested by the release archive"* becomes true only once the
next release is activated, which makes the fourth canary the first run in this
programme whose instruction bytes are archive-attested. Confirming
`codeRootMatchesRelease` at activation is what proves it.

---

## 5. Documentation accuracy · non-blocking

### 5.1 `N-9` — the two authority documents now disagree on this task's status

`FACT`. `docs/ACTIVE-WORK.md` changed the `NC-20260809-003` status from
`deployed_unverified` to `validating`. `docs/ENGINEERING-CHANGELOG.md` still
reads `State: deployed_unverified`.

`FACT`. `npm run docs:continuity-check` passes: `validating` is a legal value
(`scripts/check-doc-continuity.mjs:36-46`) and the checker validates the
ACTIVE-WORK vocabulary, not cross-document agreement.

`INFERENCE`. Of the two, `deployed_unverified` is the more truthful: migration
115 and immutable release `ba726e7` are live in production and their outcome is
unverified, which is exactly what that value means. `validating` describes
implementation-complete-pending-evidence and understates that production already
carries this task's code. The ACTIVE-WORK scope cell still states the live facts
in the adjacent column, so nothing is lost — but the two documents should not
report different states for one task ID, and the checker will not catch it.

`RECOMMENDATION`. Restore `deployed_unverified` in ACTIVE-WORK, or change the
changelog to match. I would restore ACTIVE-WORK.

### 5.2 `N-10` — a stale test count in the changelog

`FACT`. `docs/ENGINEERING-CHANGELOG.md` records *"1 file / 24 tests pass"* for
the release-integrity follow-up; the tree now has 27 in that file, and the
following bullet adds *"Three regressions cover those aliases"* without a
figure.

`INFERENCE`. Defensible as a point-in-time record, but this entry describes a
single unshipped delta rather than a sequence of verified states, so a reader
reconciling it against the tree finds 27 where the document says 24. This is the
same class as the unreproducible "8 files / 64 tests" figure corrected in R6.

`RECOMMENDATION`. State 27 in the same edit that records R11.

---

## 6. Decision and canary

**Commit, immutable build, collection-only deployment, and one fourth natural
positive-control canary may proceed. Review stays disabled.**

`FACT`. Nothing in this delta touches migrations, gates, or any
`DECIDE`/`ADVANCE` path. Review remains gated on
`PROCUREMENT_REVIEW_ENABLED === '1'` plus epoch plus at least one operator UID
(`src/procurement-policy.ts:28-43`). Human-only authority is unchanged and
unexpanded.

Sequence: commit → `npm test` full on pinned Node 22.23.2 → `release:build` →
`release:verify` → activate → confirm `/health` reports the new commit **and
`codeRootMatchesRelease`** → canary.

**Fourth-canary evidence:**

| # | Evidence |
| --- | --- |
| 1 | Exactly one task run; receipt `run_key` equals `t.<taskId>.<startMs>` |
| 2 | `/health.release` shows `codeRootMatchesRelease` true — first archive-attested procedure bytes (§4) |
| 3 | Per-keyword visible result state reported for all nine units |
| 4 | `facilitation` reports visible `Showing Results 1 of 1` and names event `0000039985` |
| 5 | Either the row carries business unit `3820` obtained by filtered-lookup-plus-detail and the run is `complete`, **or** the run is `partial` naming a concrete visible search/identity reason |
| 6 | **Forbidden:** a `complete` nine-unit zero-row run while `0000039985` is visible |
| 7 | Review still off |

`RESIDUAL` — unchanged and unaffected by this delta. `observed_units`,
`resultCount`, and `pagesVisited` remain container-reported, and
`fn_complete_procurement_source_run_v2` validates only their structure
(`115:371-390`). Event `0000039985` closes **2026-08-13**; after that a nine-unit
zero-row `complete` receipt is unfalsifiable again. The two standing
recommendations — cross-check `resultCount` against submitted rows per keyword,
and establish a durable positive control — remain next-round work and gate
nothing here.

---

## 7. Commands, environment, owner decisions, time, cost

### Commands run

| Command | Result |
| --- | --- |
| `npx vitest run src/container-runner.test.ts` | `REPRODUCED` — **27/27 pass** |
| `npm run typecheck` | `REPRODUCED` — pass |
| `npm run format:check` | `REPRODUCED` — *"All matched files use Prettier code style!"* |
| `npm run docs:continuity-check` | `REPRODUCED` — pass, 48 rows / 44 entries |
| `git diff --check` | `REPRODUCED` — clean |
| `node -e` alias-resolution evaluation | `REPRODUCED` — §1 table; computation only, no file touched |

Also `git status --porcelain`, `git diff --stat ba726e7`,
`git diff ba726e7 -- <path>`, `git ls-files`, `find`, `grep`, `sed`, `date`.
Read-only. No database, network, browser, container, production, or deployment
access; CaleProcure was not contacted from this session.

`INFERENCE`. All five of Codex's verification claims reproduce exactly under my
runtime. That is the second consecutive round in which the focused-test claim
was fully independently verifiable.

### Environment limitation

`FACT`. `src/container-runner.test.ts` has no `better-sqlite3` dependency, so
all 27 tests ran under ambient Node v26.6.0. I did **not** run `npm test` (full
suite): it includes `better-sqlite3`-dependent files that fail under Node 26
with `NODE_MODULE_VERSION 127 … requires 147`, and the sandbox continues to
decline the pinned Node 22.23.2 binary. The full suite before release remains
Codex's to verify.

`INFERENCE`. The browser facts in R9–R11 are Codex's reproduction. I verified
the procedure text against them and verified the mount, packaging, and
`codeRoot` claims against source; no finding here depends on re-observing the
portal.

### Changed files

Exactly one file created, inside the review root:

```
?? docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R11.md
```

`FACT`. No source, test, script, migration, prompt, procedure, continuity file,
or other report was edited. The eight modified paths are Codex's delta and I
touched none of them. The session was preserved throughout.

### Remaining owner decisions

**No new owner decision arises from this round.** `N-8`, `N-9`, and `N-10` are
determinate engineering and documentation corrections, none with a reachable
failure path under the current configuration.

Three remain open from R6 — all migration-116-scoped, all fail-closed
configuration, none blocking this delta or the canary:

| ID | Decision | Status |
| --- | --- | --- |
| **OD-1** | Who may `APPROVE` / `RECORD-SUBMISSION` — `PROCUREMENT_APPROVER_UIDS`, defaulting empty | Open, 116-scoped |
| **OD-2** | Must the approver differ from the packet assembler | Open, 116-scoped |
| **OD-3** | Outcome follow-up window and maximum evidence age | Open, 116-scoped |

`INFERENCE` — the contingent decision first raised in R9 is still contingent and
still unresolved. If the fourth canary returns `partial`, or slips past
2026-08-13 when the positive control closes, the owner must choose between
accepting an unfalsifiable zero-row `complete` as the gate for enabling review
and holding review until a durable positive control exists. Raise it when the
canary returns, not before.

### Elapsed time and cost

Approximately 26 minutes wall-clock, 2026-08-10T00:38Z–01:04Z: reading the diff
from `ba726e7` across eight files plus `mount-security.ts` and
`RELEASE-INTEGRITY.md`, six verification runs, and one file write. The last
observable session budget reading was **$5.70 of $15** at the start of R9; the
counter is cumulative across the session rather than per-round, and this round's
exact marginal cost is not observable from inside the session and is not
estimated.
