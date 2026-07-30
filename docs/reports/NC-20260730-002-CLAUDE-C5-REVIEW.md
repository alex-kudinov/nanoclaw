# NC-20260730-002 — Independent C5 review of the fail-closed healer action boundary

- Date: 2026-07-30T19:02Z
- Reviewer: Claude Code 2.1.220
- Model / effort: `claude-opus-5[1m]` (Opus 5, 1M context), maximum effort
- Account label: `info-tandem` (label only; no token, key, or credential value
  was read, printed, or transmitted)
- Repository state: branch `codex/continuity-reconciliation`, HEAD `04292cd`,
  65 changed paths across four concurrent tasks
- Change class reviewed: C5 — host command, daemon restart, and
  self-modification authorization
- Implementer: Codex. This review changed no implementation code.

## VERDICT: CHANGES REQUIRED

The safety slice is well built and does what it claims almost everywhere. The
any-non-bot approval fallback is gone, replaced by an explicit operator
allowlist that fails closed when unset. Executable proposals are host-bound to
an epoch, a one-time nonce, and a bounded timestamp; model-supplied binding
fields are stripped unconditionally. Every executing path claims its work with a
single conditional `UPDATE` before acting, so a replayed Slack reaction cannot
double-execute. `runApprovals` — previously ungated — is now behind the same
default-off boundary as everything else. Denial coverage in the tests is
genuinely thorough rather than decorative. All recorded verification reproduced
exactly on this machine.

Three things need to change before this is committed and dark-deployed, and none
of them is large:

1. Deploying this change **turns off the healer's only availability function**.
   `restartDaemon()` is now behind the same switch as arbitrary model-authored
   shell, and that switch ships `0`. The fast healer is live today and does
   restart a dead daemon; after this deployment it will only post to Slack. That
   is a defensible trade, but it is not stated where the deployment decision is
   made, and the restart is a fixed host-authored command that deserves its own
   lever (P1-1).
2. The implementation path never re-evaluates trust at the final boundary, while
   the command path does. The task's headline invariant — recheck at execution,
   not at proposal — holds for one of its two executors (P1-2).
3. Four accuracy defects in the shared record, where the changelog claims
   slightly more than the code delivers (P2-2, P2-4, P2-5, P2-6).

Nothing found here is a live exposure. Every action path is default-off and the
tracked template ships both gates at `0`.

---

## 1. Scope and evidence

### Task-owned files inspected

`src/healer/action-policy.ts` (new, whole file) and `action-policy.test.ts`;
`src/healer/approval.ts` (whole file); `src/healer/remediation.ts` (whole file);
`src/healer/implement.ts` (whole file); `src/healer/remediate.ts` (whole file);
`src/healer/trust.ts` (whole file); `src/healer/orchestrator.ts` (whole file);
`src/healer/collector.ts:218-306` (restart gate);
`setup/launchd/com.nanoclaw.healer.fast.plist`;
`docs/SELF-HEALING-COMPLETION-PLAN.md` (new); `docs/SECURITY.md` diff;
`docs/ACTIVE-WORK.md` and `docs/ENGINEERING-CHANGELOG.md` NC-20260730-002
entries. Test names enumerated for `action-policy`, `approval`, `implement`,
`remediation`, `trust`, `orchestrator`, `collector`.

### Read for cross-checking, outside the task's own diff

`src/healer/agentic.ts` (whole file), `src/healer/investigate.ts:30-45`,
`:130-175`, `src/healer/diagnose.ts:36-45`, `src/healer/incident-store.ts:47-66`,
`src/healer/index.ts`. These matter because the task's central claim is that one
boundary now covers every host action; establishing that required inventorying
every execution site in the module, including files this task did not touch.

### Not inspected, by instruction

`.env*`, OAuth/token contents, `store/`, runtime databases, `data/`, sessions,
browser profiles, production incident rows, Slack state. No live PostgreSQL,
Slack, launchd, or Claude call was made. No incident was mutated, no reaction
consumed, no service touched.

### Explicitly out of scope — concurrent tasks in the same worktree

`NC-20260730-003` (Procurement: migration 114, `src/procurement-*`,
`groups/procurement/*`, `src/host-router.ts`, `src/ipc.ts`,
`src/classify-ipc-handlers.ts`, `src/gmail-ipc-policy.*`, `agent_docs/*`,
`container/agent-runner/src/ipc-mcp-stdio.ts`, `src/fixtures/`);
`NC-20260730-001` (`docs/PROCUREMENT-RESURRECTION-PLAN.md`); and the user-owned
`knowledge/**`, `scripts/copiers/**`, `src/markdown-to-email-html*` changes.
None were reviewed, modified, staged, or reverted. The one place they touch this
review is §6.

---

## 2. Verification independently reproduced

Repository root, pinned runtime, outside the restricted sandbox:

| Check | Result |
| --- | --- |
| `node --version` (pinned) | `v22.23.2`, matches `.nvmrc` |
| `npm run typecheck` | pass |
| Healer suite (`vitest run src/healer`) | **20 files / 193 tests passed** |
| Full repository suite | **130 files / 1,661 tests passed** |
| `npm run docs:continuity-check` | pass — 22 active/ready rows, 22 changelog entries |
| `npm run format:check` (`src/**/*.ts`) | pass — all files Prettier-clean |
| `git diff --check` | pass, exit 0 |

Every figure recorded by Codex reproduced exactly. Two stale claims in the
neighbouring `NC-20260730-003` changelog entry are now resolved and should be
amended when that task is next touched: continuity is no longer blocked (the
NC-20260730-002 changelog entry exists, 22/22), and the repository-wide
formatting check is no longer blocked by `src/healer/*` — all healer files pass
Prettier.

### Does the denial coverage exercise the threat model?

Yes, and it is the strongest part of the change. `action-policy.test.ts` covers
default-off, missing epoch, missing operators, quiet-as-kill-switch, plural and
legacy operator keys with no broad fallback, stale-epoch and disabled bindings,
TTL expiry, TTL bounding, and the two-switch implementation requirement.
`approval.test.ts` covers the absent non-bot fallback, unnamed-user rejection,
lost atomic claim (replay), stale epoch, expired approval, final-boundary
trust/class/kind recheck, and atomic rejection. `implement.test.ts` covers both
gates, stale binding, nonce already consumed by another poller, missing token,
and green-PR-to-`needs_human`. `collector.test.ts:245` covers the new
restart gate. `trust.test.ts:52` covers missing/refuting/failed/unparsable
review. `orchestrator.test.ts:139-201` covers all four refuter outcomes.

Gaps, each tied to a finding: no test that an implement dispatch is refused when
trust degraded after arming (P1-2); no test that `autoRun` redacts (P2-2, it
does not); no test of the verify-loop/implement-poller interaction (P2-1).

---

## 3. Host-execution inventory

The task's central claim is that one boundary covers every healer host action.
Every execution site in `src/healer/`:

| Site | What it runs | Gated by the new boundary? |
| --- | --- | --- |
| `approval.ts:176` | `runShell(model-authored command)` | **Yes** — policy, operator, epoch, nonce, TTL, trust, atomic claim |
| `remediate.ts:67` | `runShell(allowlisted rerun)` | **Yes** — policy + `HEALER_AUTO_REMEDIATE` + allowlist + breaker + atomic claim |
| `implement.ts:134` | `bash -lc` → detached `claude -p … bypassPermissions` | **Yes** — policy + `HEALER_IMPLEMENT_ENABLED` + nonce + atomic claim |
| `collector.ts:229` | `launchctl kickstart -k gui/$uid/com.nanoclaw` (fixed) | **Yes** — newly gated (see P1-1) |
| `agentic.ts:74` | `claude -p … --permission-mode bypassPermissions` | **No** — diagnosis, deliberately outside the gate (see P2-3) |
| `diagnose.ts:38` | `git log --oneline -12`, fixed args | n/a — read-only, no model input |
| `alert.ts:39` | alert dispatch, fixed args | n/a |

Four of the five consequential paths are correctly enclosed. The fifth is the
subject of P2-3.

I checked `implement.ts:124` specifically for shell injection, because the
script interpolates a model-derived task into a single-quoted `bash -lc` string.
`buildTask(...).replace(/'/g, "'\\''")` is the correct POSIX single-quote
escape, and `branch` is `healer/fix-<bigint>`. **No injection exists** — the
construction is sound.

---

## 4. Findings

Severity: **P0** catastrophic/security blocker · **P1** commit- or
deploy-blocking · **P2** important, deferrable with explicit acceptance ·
**P3** improvement. No P0 was found.

---

### P1-1 · Gating `restartDaemon()` behind the model-shell switch removes the healer's only live availability function at deployment

**Confirmed** — evidence-supported. Deployment-decision blocker, not a code
defect.

**Files.** `src/healer/collector.ts:226-239`, `:280-304`;
`src/healer/action-policy.ts:51-69`;
`setup/launchd/com.nanoclaw.healer.fast.plist:9-10`.

**Violated invariant.** None stated. This is the trade-off the review exists to
surface before the deploy authorization named in the task's next action.

**Failure scenario.** `checkDaemon()` previously issued a capped
`launchctl kickstart -k` on a stale heartbeat. It now runs only when
`healerActionsEnabled()`, which requires `HEALER_ACTIONS_ENABLED=1`, a non-empty
epoch, **and** a named-operator allowlist. The tracked template ships
`HEALER_ACTIONS_ENABLED=0` and defines neither `HEALER_OPERATOR_UIDS` nor
`HEALER_ACTION_EPOCH`, so after a dark deployment the restart can never fire. The
recorded starting state confirms the fast healer and digest are live today, so
this removes a behaviour that is currently in production. If the daemon dies at
03:00, NanoClaw stays down until a human reads `#gru-incidents`.

The gate collapses two very different risk classes. `restartDaemon()` takes no
model input at all — `execFile('launchctl', ['kickstart','-k',`gui/${uid}/com.nanoclaw`])`,
fixed argv, uid from `process.getuid()`, already capped by `MAX_RESTARTS` and
already idempotent. It is precisely the "typed host-owned action with validated
arguments, idempotency and caps" that `docs/SECURITY.md` and the completion plan
name as the *precondition* for re-enabling actions. Requiring it to wait behind
the same switch as `bash -lc <model string>` inverts that reasoning.

The completion plan does say restart "must remain behind the global action gate;
controlled recovery canary still required," so the choice is disclosed. What is
not disclosed is the consequence at the point of decision: neither the
`ACTIVE-WORK` next action nor the changelog's outcome list says that dark
deployment disables daemon auto-restart. A reader of those two surfaces would
reasonably believe this change is purely additive safety.

**Do tests detect it?** The gate is tested (`collector.test.ts:245`,
"does not restart when the global healer action gate is off") — the behaviour is
intended and verified. Nothing tests or records the availability consequence.

**Smallest safe correction.** Either:

- split the lever: `HEALER_RESTART_ENABLED` (default **on**, covering only the
  fixed `launchctl` argv and the existing cap), leaving
  `HEALER_ACTIONS_ENABLED` (default off) for every model-authored path. Roughly
  ten lines plus one test, and it preserves the safety win exactly; or
- keep one gate and record the trade-off explicitly in `ACTIVE-WORK`, the
  changelog, and the deploy authorization, with a named human owner for
  daemon-down recovery until the restart canary lands.

**Blocks this commit?** It blocks the **deployment authorization**, not the
commit. Do not dark-deploy until this is decided one way or the other.

---

### P1-2 · The implementation path never re-evaluates trust at the final boundary, while the command path does

**Confirmed** — evidence-supported. Latent while `HEALER_IMPLEMENT_ENABLED=0`.

**Files.** `src/healer/implement.ts:82-100` (`loadImplementable`), `:144-200`
(`dispatch`); compare `src/healer/approval.ts:254-260`;
`src/healer/trust.ts:59-79`.

**Violated invariant.** The task's own headline: "re-check trust, class, proposal
kind, and action state at final approval execution rather than relying only on
proposal-time state," and the changelog's "rechecked policy/trust/class/fix/review
at the final boundary."

**Failure scenario.** `runApprovals` calls `isActionable(inc)` immediately before
executing, which re-runs `isTrustworthy` — evidence trust **and** a passed
adversarial review. The implementation path does neither. `loadImplementable`
filters in SQL on `confidence IS DISTINCT FROM 'low' AND cause_or_symptom =
'root_cause'` — that is `hasEvidenceTrust` only, with the review requirement
dropped — and `dispatch()` rechecks `fixApprovalIsCurrent` (epoch, nonce, TTL)
but never re-reads trust at all.

Today the review requirement is enforced indirectly: `proposeFix` arms a nonce
only when `isTrustworthy(inc)` holds, and `fixApprovalIsCurrent` requires a
nonce. So a never-reviewed diagnosis cannot reach dispatch. But the enforcement
is a side effect of nonce issuance rather than a boundary check, and it does not
survive a *change* in trust: `saveDiagnosis` can update `review` on a
re-diagnosis while `proposed_fix` retains its binding, and `dispatch` would still
spawn the pipeline on a diagnosis that has since been refuted. The doc comment on
`loadImplementable` claiming "TRUST-GATED (Phase 4)" describes a gate that lists
only two of the three conditions.

**Do tests detect it?** No. `implement.test.ts` covers both switches, stale
bindings, and lost claims; nothing degrades trust between arming and dispatch.

**Smallest safe correction.** Two lines in `dispatch()`, before the claim:

```ts
if (!isTrustworthy(inc)) return false;
```

plus the matching `review` condition in `loadImplementable`'s filter, and one
test that arms a proposal then flips `review.refuted` to `true`.

**Blocks this commit?** Yes — it is two lines, and it is the invariant this task
exists to establish. Shipping a final-boundary recheck that covers one of two
executors misrepresents the boundary.

---

### P2-1 · The verify loop can close an implement-dispatched incident as `verified_fixed` while its detached pipeline is still editing the repository

**Confirmed** — evidence-supported. Latent while implementation is off.

**Files.** `src/healer/remediate.ts:118-141` (`verifyRemediating`, `VERIFY_QUIET_MS
= 6 * 60_000`); `src/healer/implement.ts:122-141` (`spawnPipeline`), `:203-257`
(`pollResults`), `:9-13` (header comment).

**Failure scenario.** `dispatch()` leaves the incident at `status='remediating'`
with `applied_action.kind='implement_dispatched'`. Two pollers then read that
row. `pollResults` waits for the `HEALER_IMPLEMENT_DONE:` marker and requires
`status='remediating'`. `verifyRemediating` loads *every* `remediating` incident
and, if it has not recurred and `Date.now() - actedAt > 6 minutes`, sets it
`resolved` / `verified_fixed`.

A dev-pipeline run that implements a fix, adds a test, runs the full suite and
opens a draft PR will routinely exceed six minutes. When it does, the verify loop
closes the incident first; `pollResults` then matches nothing, so the draft PR is
never reported to `#gru-incidents`. The incident reads as verified-fixed while a
detached `claude -p … bypassPermissions` process is still writing to the
operational checkout and pushing a branch.

The module header states "each run is time-boxed and its outcome polled from a
completion marker." The polling exists; **the time-box does not** —
`spawnPipeline` passes no `timeout` to `spawn`, unlike `runAgenticClaude`
(180s default) and `runShell` (120s). An unbounded detached run is the reason the
six-minute window is reachable at all.

**Do tests detect it?** No. `implement.test.ts:264` covers "leaves a
still-running pipeline untouched" for `pollResults` alone; no test runs the
verify loop against an implement-dispatched row.

**Smallest safe correction.** Exclude implement-dispatched rows from
`verifyRemediating` — `loadOpen('remediating', …)` filtered by
`applied_action->>'kind' <> 'implement_dispatched'`, or an explicit status such
as `implementing` — and give `spawnPipeline` an actual timeout so the header
comment becomes true.

**Blocks this commit?** No, but fix it before the implementation gate is ever
considered for enablement.

---

### P2-2 · Auto-rerun writes unredacted command output to the incident audit, unlike the approval path

**Confirmed** — evidence-supported.

**Files.** `src/healer/remediate.ts:74-80`; compare
`src/healer/approval.ts:177-185`; `src/healer/incident-store.ts:47-60`.

**Violated invariant.** The changelog's "recorded exact approvers, redacted
command/output audit data," stated without qualification.

**Failure scenario.** `applyApproved` records `command: redact(cmd)` and
`out: redact(res.out)`. `autoRun` records `command: cmd` and `out: res.out` raw.
`res.out` is the last 500 bytes of arbitrary command stdout/stderr — for a rerun
of a failing job that is exactly where a token, connection string, or bearer
header tends to appear. It lands in `business_v2.incidents.applied_action` and
flows into the Slack digest surface. The redactor is a best-effort pattern list
(`sk-`, `xox[baprs]-`, JWT shape, `bearer`, `password|secret|token|api_key`
assignments), so applying it is not a guarantee — but omitting it on one of two
sibling paths is an avoidable gap.

**Do tests detect it?** No.

**Smallest safe correction.** Wrap both values in `redact()`, matching
`approval.ts`. One line.

**Blocks this commit?** No — but it is a one-line change on a C5 audit surface.

---

### P2-3 · `HEALER_INVESTIGATE_BASH=1` grants the ungated diagnosis path raw Bash under `bypassPermissions`, contradicting the module's own "every host action" claim

**Confirmed** — evidence-supported. Disclosed in the completion plan, not
reconciled in `SECURITY.md` or the policy module.

**Files.** `src/healer/investigate.ts:34-39` (`investigateTools`);
`src/healer/agentic.ts:66-88` (`spawnClaude`, always
`--permission-mode bypassPermissions`, `cwd: process.cwd()`);
`src/healer/action-policy.ts:1-15`; `docs/SECURITY.md` (new paragraph);
`docs/SELF-HEALING-COMPLETION-PLAN.md:90`.

**Violated invariant.** `action-policy.ts`'s header: "Anything that can execute a
host command, automatically rerun work, or dispatch the code-implementation
pipeline must pass this boundary." And the new `SECURITY.md` sentence: "No raw
model-authored shell command is eligible for production enablement."

**Failure scenario.** Diagnosis is deliberately outside the action gate, which is
right for a read-only investigator. But the investigator is a headless
`claude -p` run that *always* uses `--permission-mode bypassPermissions` in the
operational checkout with the rotated OAuth token in its environment; the only
thing making it read-only is the `--allowedTools "Read Grep Glob"` string.
Setting `HEALER_INVESTIGATE_BASH=1` changes that string to
`"Read Grep Glob Bash"`, and the sole remaining restraint is a natural-language
`READ_ONLY_RULE` in the prompt — model instruction, which this repository's own
trust model classifies as "untrusted proposals; never authority."

The investigator's prompt is built from `inc.raw_context` (redacted daemon log
lines). Log content can carry attacker-influenced text — an email subject, a
customer name, a webhook payload echoed into an error — so this is a
prompt-injection surface as well as a configuration one. `HEALER_QUIET=1` does
stop it (`orchestrator.ts:38-43`), so a complete kill switch exists;
`HEALER_ACTIONS_ENABLED=0` does not.

The completion plan says the flag "remains off unless a real command-level
read-only need appears," and the tracked template does not set it. So the risk
is latent and acknowledged. The defect is that two authority documents now state
a stronger boundary than the code provides.

**Do tests detect it?** Not applicable — it is a configuration escape hatch.

**Smallest safe correction.** Either fold the flag under the action gate
(`HEALER_INVESTIGATE_BASH` effective only when `healerActionsEnabled()`), or
amend `action-policy.ts`'s header and the `SECURITY.md` paragraph to name the
diagnosis Bash opt-in as the one host-command path outside the boundary, with
`HEALER_QUIET` identified as its only kill switch.

**Blocks this commit?** No — accept as a documented residual, but reconcile the
two documents in this commit.

---

### P2-4 · The adversarial-review gate is keyed on exact free-text sentinel strings produced in a file this task did not touch

**Confirmed** — evidence-supported.

**Files.** `src/healer/trust.ts:59-66`; `src/healer/investigate.ts:138`, `:154`,
`:173`.

**Failure scenario.** `hasPassedReview` decides a C5 authorization by comparing
`review.reason` against two string literals — `'refuter unavailable'` and
`'unparseable refutation'`. Those literals are produced in `investigate.ts`,
which carries no marker tying it to this control and was not modified by this
task. Any future reword — adding a detail, changing casing, appending an error
code — silently converts "the refuter never ran" into "the adversarial review
passed," which flips `isTrustworthy` to true and makes the proposal ✅-actionable.
A control that fails open on a copy-edit is the wrong shape for a C5 boundary.

**Do tests detect it?** `trust.test.ts:52` asserts the current literals, so the
regression would be caught *if* someone changed `trust.ts`. It would not be
caught by a change to `investigate.ts`, which is where the strings live.

**Smallest safe correction.** Give `Refutation` a typed outcome —
`status: 'passed' | 'refuted' | 'unavailable' | 'unparsable'` — set at the three
producers, and have `hasPassedReview` test `status === 'passed'`. Keep `reason`
as free text for humans. Roughly fifteen lines.

**Blocks this commit?** No.

---

### P2-5 · A refuted diagnosis can still become auto-actionable, so "refuting review → manual-only" overstates the change

**Confirmed** — evidence-supported. The behaviour is intentional and tested; the
claim describing it is inaccurate.

**Files.** `src/healer/orchestrator.ts:80-103` (`synthesize`);
`src/healer/trust.ts:59-66`; changelog bullet "made failed, missing, refuting,
or unparsable adversarial review manual-only"; `orchestrator.test.ts:145`.

**Failure scenario.** When the refuter returns `refuted: true`, `synthesize`
runs a tie-breaker `investigate(inc)`. If that run yields a confident root-cause
verdict, the code adopts the tie-breaker's verdict — including its
`fix.command` — and writes a **host-authored** review object
`{ refuted: false, reason: 'independent tie-breaker confirmed an evidenced root
cause' }`. That reason is not one of the two sentinels, so `hasPassedReview`
returns true and the proposal is ✅-actionable. A refuting review therefore does
*not* force manual-only; it forces a rerun that can overturn it.

Two design observations worth a decision rather than a fix:

- the tie-breaker is the same `investigate()` function with the same prompt, not
  an independent method or model. "Independent" in the stored reason describes a
  fresh process, not a different perspective;
- the code comment concedes that v1 "does not semantically diff free-text
  causes," so a confident tie-breaker is *assumed* to corroborate the original
  thrust. The refuted cause and the tie-breaker cause are never compared. Adopting
  the tie-breaker's own verdict limits the damage, but a 2-of-3 majority in which
  the third vote is never checked against the disputed claim is a weak
  adversarial gate for a path that ends in `bash -lc`.

**Do tests detect it?** Yes — `orchestrator.test.ts:145` asserts exactly this
path. The behaviour is deliberate; only the changelog sentence is wrong.

**Smallest safe correction.** Reword the changelog bullet to "a failed, missing,
or unparsable adversarial review is manual-only; a refuted verdict requires a
confident independent tie-breaker before it can be actioned." Separately, record
the free-text-cause comparison as a Gate B item in the completion plan.

**Blocks this commit?** No — fix the wording in this commit.

---

### P2-6 · `applied_action` is a single last-write-wins column, not an audit log

**Confirmed** — evidence-supported.

**Files.** `src/healer/remediation.ts:152-161` (`recordAction`);
`src/healer/approval.ts:137-198`; `src/healer/implement.ts:158-194`.

**Failure scenario.** Every claim and every result writes the same
`applied_action` jsonb column. `applyApproved` writes `approval_claimed`, then
overwrites it with `approved_apply`; `dispatch` writes `implement_claimed`, then
`implement_dispatched`. The final row therefore records the outcome but not the
claim, and a second action on the same incident erases the first. For a C5
boundary whose stated purpose is "recorded exact approvers, redacted
command/output audit data," the audit is one mutable cell.

The state machine itself is correct — `recoverStaleClaims` keys on the
`*_claimed` kinds and stops matching once the result is written, which is the
intended handoff. The gap is durability of the record, not correctness of the
flow.

**Smallest safe correction.** Append to an `incident_actions` child table (or a
jsonb array) instead of overwriting, in the Gate C slice. Note it in the
completion plan now.

**Blocks this commit?** No.

---

### P3 items

1. **Reject should win over approve in `emojiVerdict`.** `approval.ts:57-67`
   returns whichever verdict Slack lists first, so an operator who reacts ✅ and
   then adds ❌ without removing the ✅ may still approve. `replyVerdict:69-83`
   already checks dismiss patterns first. Scan for a reject across all reactions
   before considering approvals, matching the reply path.
2. **`HEALER_APPROVAL_TTL_MS=""` yields 60 s, not the 24 h default.**
   `action-policy.ts:109-116` — `Number('')` is `0`, which is finite, so the
   clamp floors it at `MIN_APPROVAL_TTL_MS`. It fails short, which is the safe
   direction, but an empty value in a plist would silently make every proposal
   expire in a minute. Treat empty as unset.
3. **Epoch rotation is not a kill switch for the auto-rerun path.**
   `remediate.ts:49-66` claims work without reading `policy.epoch`, so rotating
   the epoch invalidates Slack-signal paths only. `HEALER_ACTIONS_ENABLED=0` is
   the lever there. Worth one sentence in the completion plan so an operator
   reaching for the epoch during an incident knows what it does and does not stop.
4. **The stale-claim window depends on an implicit timeout relationship.**
   `approval.ts:104-119` recovers `*_claimed` rows older than 5 minutes, which is
   safe today only because `runShell` caps at 120 s (`remediation.ts:38`). Nothing
   states the dependency; raising the shell timeout past 5 minutes would let the
   recovery sweep disarm a command that is still executing, after which the
   post-run `WHERE status='triaging'` update silently matches zero rows. Add the
   constraint as a comment and, ideally, derive one bound from the other.
5. **Amend the stale claims in the `NC-20260730-003` changelog entry** noted in
   §2: continuity and repository-wide formatting both pass now.

---

## 5. Positive findings worth preserving in the record

Recorded because a C5 review that lists only defects misrepresents the change.

- The any-non-bot approval fallback is genuinely gone, with a test asserting its
  absence (`approval.test.ts:50`).
- Every executing path claims its work with a single conditional `UPDATE` before
  acting, and each has a lost-claim test. Replay of a Slack reaction cannot
  double-execute.
- `bindProposal` (`remediation.ts:210-230`) strips model-supplied `action_epoch`,
  `approval_nonce`, and `approval_created_at` unconditionally before optionally
  issuing host values — the right default, and it means a model cannot smuggle a
  binding through the diagnosis JSON.
- Legacy rows are handled safely: the seven pre-existing `awaiting_approval`
  incidents carry no nonce, so if actions are ever enabled they fail
  `fixApprovalIsCurrent` and are disarmed to `needs_human` rather than executed.
- `checkDaemon` alerts loudly and specifically when it declines to restart
  because the gate is off (`collector.ts:299-303`) — the failure is not silent.
- `docs/SELF-HEALING-COMPLETION-PLAN.md` is unusually honest: it states that
  diagnosis can take as long as the job interval, that implementation runs in the
  operational checkout, and that raw model shell is not eligible for enablement.

---

## 6. Documentation and shared-record consistency

`docs/SECURITY.md`, `docs/PROJECT-MAP.md`, `docs/SELF-HEALING-{DESIGN,PHASE0-SPEC,
ORCHESTRATED-DIAGNOSIS,COMPLETION-PLAN}.md`, `docs/ACTIVE-WORK.md`, and
`docs/ENGINEERING-CHANGELOG.md` were checked against the code.

**Accurate on every deployment-state claim.** No document asserts commit,
deployment, migration, live verification, or business outcome that did not occur.
`SECURITY.md` correctly records both flags at `0` and states that the installed
unit was not changed; the completion plan's "Deployment truth" row correctly
separates live installed jobs from local source. The `NC-20260729-004`
containment is described as deployed and is not re-claimed by this task.

**Inaccuracies found:** P1-1 (deployment consequence of gating restart is not
recorded where the deploy decision is made), P2-2 (unqualified redaction claim),
P2-3 (two documents state a stronger boundary than the code), P2-5 (refuting
review is not manual-only), plus the P2-1 header comment claiming a time-box that
`spawnPipeline` does not implement.

**Resumability.** A new session can reconstruct what changed, why, what is
authoritative, what was verified at which level, and what remains open, entirely
from tracked files. `docs/CHANGE-PROTOCOL.md:292-306` is satisfied.

**Unrelated dirty files — confirmed preserved.** No `git reset`, `checkout --`,
`clean`, `stash`, formatting pass, generated-file rewrite, or dependency install
was run. `git status --short` reported 65 paths before this review and 65
afterwards, plus this new report. The `NC-20260730-001`, `NC-20260730-003`,
knowledge, copier, and email-renderer changes are untouched. Nothing was staged
or committed.

---

## 7. Residual risks, explicitly deferred

1. **Raw model-authored shell remains the design's core exposure.** After every
   gate passes, `applyApproved` still runs `bash -lc <model string>` with a login
   shell, the daemon's full environment, and `cwd` = the operational checkout.
   This change makes that *authorized*; it does not make it *contained*. The task
   states this and defers it to Gate C — correctly, and the completion plan's
   "no raw model-authored shell is eligible for production enablement" is the
   right commitment.
2. **Trust is model-derived.** `isTrustworthy` reduces to: a model claimed high or
   medium confidence at a root cause, and a second model run did not say
   `refuted: true`. That is a reasonable heuristic and a poor authorization
   primitive. It is the gate standing between a diagnosis and a shell command.
3. **Implementation still runs in the operational checkout.** `spawnPipeline`
   does `git checkout -b healer/fix-<id>` in `process.cwd()`. This worktree
   currently holds 65 uncommitted paths across four concurrent tasks. Enabling
   implementation before the disposable-worktree move risks concurrent human and
   Codex work, not only security — a further reason the gate must stay off.
4. **Diagnosis remains synchronous inside a 5-minute job** while a single
   investigation is allowed 300 s (`investigate.ts:31`). Already recorded as
   Gate B.
5. **No global external-write safe mode** still spans the whole system.
6. **Runtime drift** persists: `.nvmrc` pins 22, the authoring shell is 26.5.0,
   the production host was recorded at 25.8.2. Every check here was pinned to 22.

---

## 8. Does the evidence support committing?

**Yes, after P1-2 and the four documentation corrections** — and the dark
deployment must not be authorized until P1-1 is decided.

The change is a clear net improvement on a C5 boundary that previously accepted
any non-bot Slack user and left `runApprovals` entirely ungated. Holding it back
to perfect the audit log or the trust typing would leave the weaker boundary in
place for no benefit. What must not happen is deploying it without deciding what
the operator loses: today a stale heartbeat restarts the daemon, and after this
deployment it does not.

Recommended order: apply the P1-2 recheck and the P2-2 redaction (three lines
total), correct the four documentation statements, decide P1-1 explicitly, rerun
typecheck, the healer suite, the full suite, `format:check`,
`docs:continuity-check`, and `git diff --check` under pinned Node 22, then commit
with actions still off.

---

## 9. Statement of no production change

No production change was performed by this review.

No commit, stage, push, branch, deployment, service start/stop/restart, launchd
load or unload, migration, production write, credential read or rotation,
schedule change, Slack message, reaction, approval, incident mutation, action
epoch, or operator configuration occurred. No live external system was contacted.
No secret, token, session file, database row, log body, or backup content was
read, printed, or transmitted. No implementation code was edited. Every command
run was read-only apart from the three permitted documentation writes and the
test/build toolchain's own output inside ignored paths.

The account label used for this session is `info-tandem`, recorded as a label
only.
