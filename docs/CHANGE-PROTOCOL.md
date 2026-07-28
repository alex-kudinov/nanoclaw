# NanoClaw cross-client change protocol

Status: active operating contract
Version: 1.2
Last updated: 2026-07-28
Applies to: Claude Code, Codex, humans, and other engineering agents
Purpose: keep one reviewable project history and prevent client-private context
from becoming operational truth

## 1. Shared continuity files

Every collaborator uses the same tracked surfaces:

| File | Purpose | Update timing |
| --- | --- | --- |
| `CLAUDE.md` | canonical repository operating instructions | when repository-wide rules change |
| `AGENTS.md` | Codex entry point into the Claude-owned model | when Codex entry/behavior changes |
| `docs/PROJECT-MAP.md` | reconciled architecture, authority, risks, operations | when implemented system shape or verified baseline changes |
| `docs/ACTIVE-WORK.md` | active claims plus ready-for-review/commit/release work | before and during non-trivial work |
| `docs/ENGINEERING-CHANGELOG.md` | entry-append-only change and verification record | when a change reaches a handoff/review/release boundary |
| `docs/COMPANY-OS-IMPROVEMENT-PLAN.md` | proposed prioritized improvement roadmap | when an initiative is approved, reprioritized, completed, or rejected |
| relevant source-of-truth document | behavior, schema, runbook, prompt, security, decision | in the same change as the implementation |

Claude memories, Codex memories, chat transcripts, ignored handoffs, Slack
threads, and local databases can supply evidence. They are not the shared
engineering record until the relevant non-secret facts are written to a tracked
surface above.

## 2. Task identity

Every non-trivial change receives a stable ID:

```text
NC-YYYYMMDD-NNN
```

Examples:

- `NC-20260723-001`
- `NC-20260723-002`

Use one ID across:

- `docs/ACTIVE-WORK.md`;
- branch or worktree notes;
- commits and pull requests where practical;
- engineering changelog entry;
- migration/deployment/incident evidence;
- handoff messages.

Do not reuse an ID for unrelated work.

A change is **non-trivial** and requires an active-work row when any is true:

- it is C2 or higher;
- it edits source, schema, configuration, prompts, or an authoritative document;
- it touches external state;
- it spans or may outlive one client session;
- another collaborator could reasonably overlap with it.

Pure read-only answers and single-session exploration that change no tracked or
external state need no row. A typo/format-only C1 edit may use one compact row
and changelog entry; do not use “trivial” to hide a policy or behavior change.

### ID allocation

1. Refresh the shared working copy or fetch the shared remote as appropriate.
2. Find the maximum `NNN` already used for the date in `ACTIVE-WORK` and
   `ENGINEERING-CHANGELOG`.
3. Allocate the next number.
4. The ID is locally reserved when its row is written in a shared working copy.
   It is cross-machine reserved only when the claim is committed and pushed.
5. If a merge/push collision uses the same ID for different work, renumber the
   later unpublished task and update all of its references. Never merge two
   meanings under one ID.

### Visibility modes

- **Same working copy:** Claude Code and Codex see tracked and untracked local
  edits immediately. An active row is visible without a commit.
- **Different working copies or machines:** only fetched, committed, and pushed
  continuity records are shared. Before relying on overlap protection, fetch
  and integrate the remote; commit and push the active-work claim on the
  collaboration branch before source edits.
- If authorization, offline state, or another blocker prevents sharing the
  claim, label the row and handoff `local-only`. Do not assert cross-machine
  visibility.
- Pushing remains an external state change: follow the user's branch/review
  instructions and never push merely because this protocol exists.

## 3. Required workflow

### Before the first edit

1. Confirm this protocol version and refresh the current working copy/shared
   remote for the applicable visibility mode.
2. Read `CLAUDE.md`, `AGENTS.md`, `docs/PROJECT-MAP.md`, this protocol,
   `docs/ACTIVE-WORK.md`, and every changelog entry referencing the task's
   files, systems, or predecessor IDs.
3. Inspect branch, HEAD, worktree, and relevant live/schema state read-only.
4. Create or update an `ACTIVE-WORK` row containing:
   - task ID;
   - short outcome;
   - owner/client;
   - branch/worktree and base commit;
   - status;
   - scope and likely files;
   - risk/change class;
   - next action.
5. Check all active entries for overlapping files or external systems.
6. If overlap is material, coordinate before editing. Do not assume a different
   client abandoned its work.
7. Confirm every authoritative file the change will create or modify is
   Git-trackable. If a required migration, group procedure, runbook, or schema
   source is ignored, repair the tracking policy before implementation; a local
   runtime copy is not portable source authority.
8. Activate the Node version pinned by `.nvmrc` before installing/rebuilding
   native dependencies or interpreting TypeScript test failures.

### While working

1. Update the active entry when scope, owner, status, risk, or next action
   changes materially.
2. Keep implementation and authoritative documentation in the same change.
3. Record durable architecture/security/data decisions as an ADR or in the
   named authoritative design document; do not leave the decision only in chat.
4. Record verification as it occurs, distinguishing:
   - local static/build evidence;
   - tests/evaluations;
   - migration evidence;
   - deployment evidence;
   - live end-to-end evidence.
5. Never put secret values, raw customer data, tokens, credential-bearing URLs,
   or unnecessary PII in continuity files.
6. If work touches external state, record the exact environment and whether the
   operation was read-only, dry-run, staged, or applied.
7. Tracked schema references are structure-only. Never generate or paste live
   sample rows into repository documentation.
8. If retrospective registration is unavoidable because unregistered work is
   discovered, label it explicitly, preserve the evidence limit, and register a
   separate reconciliation task before making the first repair edit.

### At handoff, review, or interruption

The active entry must be sufficient for another client to continue without the
private conversation. Record:

- current status and outcome achieved;
- branch and current branch HEAD so the exact `base..HEAD` range is known;
- files changed;
- decisions made and unresolved;
- commands/checks run and their results;
- current deployment/migration state;
- rollback or recovery position;
- blockers and exact next action.

Keep interrupted or blocked work in `ACTIVE-WORK`. Do not mark it complete.
Set owner to `unassigned` only when the work is explicitly available for
pickup. A resuming client changes owner to itself and adds a UTC-dated pickup
note before editing.

### At completion

1. Update every affected authoritative surface using the matrix below.
2. Add a new entry under `Unreleased` in `ENGINEERING-CHANGELOG.md`.
3. Include the task ID, outcome, affected systems, verification, deployment
   state, rollback note, and documentation updated.
4. Remove the item from the active table or move it to the
   `Ready for review/commit/release` table until the applicable boundary is
   crossed.
5. The changelog is append-only at entry granularity: never delete or rewrite
   factual history. Lifecycle fields may be amended in place with a dated UTC
   addendum. After commit, add the commit hash. After deployment, append
   environment, time, health, and end-to-end evidence. Never rewrite a build as
   a deployment or a deployment as a successful business outcome.
6. If the work implements an improvement-plan item, update that item's status
   and link the task ID/evidence.

## 4. Documentation impact matrix

| Change type | Required shared updates |
| --- | --- |
| host/runtime mechanics | source, focused tests, active work, changelog; project map/architecture if shape changes |
| agent/group behavior | `groups/<group>/CLAUDE.md`, support knowledge/workflow, eval cases, active work, changelog |
| IPC/tool/capability | protocol types, authorization tests, security model, project map, active work, changelog |
| database schema | Git-tracked ordered migration, structure-only generated schema reference, data-model/current-state docs, validation/rollback, changelog |
| configuration/environment | typed/config reference or `.env.example`, setup/runbook, deployment profile, changelog |
| security boundary/control | threat model, negative tests, runbook/rotation impact, risk register/plan, changelog |
| channel/integration | architecture/project map, setup and recovery runbook, contract tests, changelog |
| scheduler/job | owner, schedule source, retry/idempotency/replay behavior, operations docs, changelog |
| deployment/service | release evidence, service/runbook changes, rollback, verified live health, changelog |
| incident fix | incident timeline/root cause, regression test, affected design/runbook, changelog |
| knowledge/facts | authoritative source, provenance, generated packs, drift/eval evidence, changelog |
| documentation-only | active work and changelog if it changes operating behavior or decisions |

If a row is not applicable, the changelog may say `not applicable` with a short
reason. Silence is not evidence.

## 5. Status vocabulary

Use only these active-work states:

- `planned` — scoped but not started;
- `in_progress` — currently being changed;
- `blocked` — cannot proceed; blocker and next decision recorded;
- `validating` — implementation complete, evidence still being gathered;
- `ready_for_review` — local work complete, awaiting review/commit;
- `ready_for_deploy` — reviewed/committed, not deployed;
- `deployed_unverified` — deployment occurred, verification incomplete;
- `complete` — required implementation, documentation, and verification done;
- `cancelled` — stopped intentionally with reason and residual state recorded.

`complete` never means “ran out of time,” “code compiles,” or “Claude/Codex said
it looks correct.”

Owner values are `Codex`, `Claude Code`, `human`, a specific named collaborator,
or `unassigned`. `blocked` and `validating` retain their owner unless explicitly
offered for pickup. For C3+ work, `complete` requires a recorded
`deployed_unverified` step followed by live verification, or an explicit
deployment-not-applicable reason.

## 6. Change and risk classes

Use the company-OS classes:

- `C0` read-only analysis;
- `C1` internal draft/documentation;
- `C2` reversible internal write;
- `C3` external communication/publish;
- `C4` financial/contractual;
- `C5` destructive, identity, credential, or security-boundary change.

For code changes, also state the highest affected operational class. A small
code diff that can send money is still C4.

## 7. Changelog entry template

```markdown
### NC-YYYYMMDD-NNN — Short outcome

- Date:
- Owner/client:
- State:
- Commit/PR:
- Change class:
- Affected systems:
- Outcome:
- Files:
- Verification:
- Deployment/migration:
- Rollback/recovery:
- Documentation:
- Follow-ups:
```

Use factual evidence. Do not paste full logs or private conversations.
Use UTC ISO-8601 timestamps for dates and addenda. Use the active-work status
vocabulary for `State`. Every open follow-up must become a `planned`
active-work row with an owner or be explicitly declined with a reason.

## 8. Active-work entry template

```markdown
| NC-YYYYMMDD-NNN | outcome | Codex/Claude Code/human/unassigned | branch @ base | status | C0-C5 | files/systems | next action | UTC timestamp |
```

The row is an index. Add a short detail subsection below the table when the
next collaborator needs more than one line.

## 9. Conflict and recovery rules

- Git-tracked files are shared; ignored runtime state is not.
- Across different working copies, continuity authority requires a fetched
  committed/pushed record. A local-only edit is not a remote claim.
- Never resolve a conflict by deleting another collaborator's changes without
  provenance.
- Prefer separate branches/worktrees for overlapping implementation.
- If both clients changed the same authority file, reconcile meaning before
  accepting a textual merge. Use the relevant ADR/current-design decision and
  record the reconciliation in the changelog.
- Changelog conflicts under `Unreleased` are resolved by preserving both
  entries and their dated addenda.
- If continuity files disagree with code or live schema, mark the discrepancy
  and verify it; do not silently “fix” evidence.
- If an external action occurred without a changelog entry, add a retrospective
  entry labeled as such and state the evidence limits.
- If a task is resumed after a long gap, revalidate HEAD, active work, schema,
  configuration, and live state before relying on the old next action.
- An active claim unchanged for seven days is stale, not abandoned. Verify the
  branch/owner first; only then may a dated update set it to `unassigned`.

## 10. Definition of documented

A change is properly documented only when a new Claude Code or Codex session
can answer, from tracked files:

1. What changed and why?
2. Which source is authoritative now?
3. Which files, agents, data, and external systems are affected?
4. What risks and permissions changed?
5. What evidence passed or failed?
6. Was it committed, migrated, deployed, and live-verified?
7. How can it be rolled back or recovered?
8. What remains open, and who owns the next action?

If any answer exists only in the originating chat, the handoff is incomplete.

Before handoff, run:

```bash
npm run docs:continuity-check
```

CI runs the same check. It verifies that both client entry points and the
project map reference the shared files; the protocol is versioned; active task
rows use valid IDs/statuses/UTC timestamps and do not claim `complete` while
still requiring commit/review/verification/deployment; review-boundary tasks
have canonical changelog states; named group operating support and ordered
business migrations are Git-tracked; schema references contain no live sample
rows; schema refresh applies the sanitizer; and CI uses `.nvmrc`.
