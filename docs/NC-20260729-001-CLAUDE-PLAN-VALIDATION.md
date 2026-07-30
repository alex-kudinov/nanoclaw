# NC-20260729-001 — Claude validation task: Company-OS v2 upgrade plan

Status: planned
Owner/client: Claude Code
Model requirement: latest available Opus, maximum effort
Change class: C1 documentation and read-only repository validation
Output: `docs/reports/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md`

Suggested invocation from the repository root:

```bash
claude --model opus --effort max
```

Then instruct Claude:

```text
Execute docs/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md exactly as written.
```

## Objective

Adversarially validate the proposed NanoClaw Company-OS v2 direction before any
implementation work begins. Confirm current-state claims against source, reject
unsupported conclusions, identify missing risks or functionality, challenge
scope and sequencing for a one-engineer company, and recommend the smallest
credible high-leverage first six-week slice.

This is not an implementation task.

## Start here

Read, in order:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `docs/PROJECT-MAP.md`
4. `docs/ACTIVE-WORK.md`
5. `docs/CHANGE-PROTOCOL.md`
6. the latest relevant entries in `docs/ENGINEERING-CHANGELOG.md`
7. `docs/COMPANY-OS-IMPROVEMENT-PLAN.md`
8. `docs/ARCHITECTURE.md`
9. `docs/SECURITY.md`
10. `docs/REQUIREMENTS.md`
11. `docs/SELF-HEALING-DESIGN.md`
12. `docs/SELF-HEALING-ORCHESTRATED-DIAGNOSIS.md`

Then inspect the implementation and focused tests needed to verify every claim
below. Do not infer live enablement from source or a tracked launchd template.

## Safety and scope

- Preserve the existing dirty worktree.
- Do not edit application source, prompts, schemas, migrations, configuration,
  launchd services, knowledge, or runtime state.
- Do not start the daemon, run setup, deploy, restart services, send messages or
  email, approve actions, modify schedules, rotate credentials, or write
  production data.
- Do not print or summarize secret values, customer data, raw logs, database
  rows, OAuth material, session files, or backup contents.
- Read ignored/sensitive artifacts only structurally when absolutely necessary;
  their contents are not required for this review.
- The OneDrive Drop redesign is separately owned as `NC-20260728-007`; do not
  incorporate or modify it.
- Write only the required report and shared lifecycle documentation.

## Current proposal to validate

Keep one deployable modular monolith. Do not add more agents or split NanoClaw
into microservices. Create four explicit internal systems:

1. ingress plus an immutable event/work ledger;
2. durable work state plus a priority scheduler;
3. policy, approval, and typed host capability gateways around isolated role
   agents;
4. evidence, evaluation, learning, healing, and release controls.

External systems remain authoritative for facts they originate. The work ledger
owns process state and reconciliation, not all business data.

### Proposed bounded intelligence loops

Learning:

```text
observation -> candidate lesson -> provenance check -> offline evaluation
-> human approval -> limited canary -> outcome monitoring
-> promotion or rollback
```

Healing:

```text
detect -> correlate -> investigate -> adversarially refute
-> classify authority -> propose or bounded remediation
-> verify -> resolve, rollback, or escalate
```

Self-improvement:

```text
incident/backlog proposal -> disposable worktree -> scoped implementation
-> tests and relevant evaluations -> Codex and Claude review -> draft PR
-> human merge -> canary deployment -> outcome validation
```

Self-improvement may propose and create a draft PR. It may not merge, deploy,
or modify the live/shared operational checkout.

## Claims that require source verification

Verify, correct, or reject each:

1. The Sales autonomy sweep starts whenever Slack is available, defaults to
   Sales, and can promote a category after 15 approved-unchanged drafts into a
   120-minute hold-and-auto-approval path. Pricing and payment issues remain
   guarded, but other outbound C3 categories do not require outcome/evaluation
   evidence.
2. The tracked fast-healer launchd template enables code implementation. The
   implementation path requires a human reaction but can create/switch a branch
   in the current checkout, invoke Claude with bypassed permissions, and push a
   draft PR. Whether that template is loaded live is not established.
3. `learn_lesson` appends directly into operative `LEARNED.md` before its
   asynchronous contradiction check completes.
4. Agent containers can receive group-scoped PostgreSQL credentials plus raw
   integration credentials, including some combination of Stripe, Plutio,
   Trafft, Bonfire, Obsidian, email, and related systems.
5. Procurement can connect through CDP to a persistent Chrome instance on the
   host.
6. There is no one final-boundary global external-write safe mode.
7. Skill CI executes a manifest-provided command with shell `eval`.
8. Runtime enforcement is incomplete: the root CI follows `.nvmrc`, while
   `package.json` and skill workflows still permit or select Node 20.
9. Gmail history expiry can create an unmeasured ingestion gap.
10. At least one webhook path lacks a stable upstream event ID for intentional
    retry deduplication.
11. A recent successful outbound email lacked a canonical business interaction
    because source-thread lineage was absent.
12. Process truth is fragmented across SQLite, PostgreSQL, Slack, Gmail,
    schedules, Markdown, agent sessions, n8n, and external business systems.
13. Ignored source sync-conflict files and operational backups are present in
    the repository directory. Treat this as a hygiene/exposure risk without
    reading secret contents or claiming they are committed.

Record exact supporting file/line evidence in the report.

## Proposed backlog to challenge

### Wave 0 — brakes and containment

- Suspend new Sales L2 auto-send promotion until evaluation/outcome gating
  replaces approval streaks.
- Put healer implementation into dark mode and redesign it around disposable
  worktrees and non-interpolated execution.
- Add one host-level external-write safe mode.
- Add per-capability volume, recipient, money, publication, and retry ceilings.
- Make learned rules quarantined candidates rather than immediate operative
  instructions.
- Disable general host Chrome CDP; retain only a dedicated procurement profile
  if the workflow is justified.
- Remove CI shell `eval`.
- Finish Node 22 enforcement.
- Inventory and safely quarantine sync-conflict files, environment backups,
  dumps, and build backups.
- Reconcile stale architecture, security, runtime, environment, and legacy-data
  documentation.

### Wave 1 — company operating kernel

- Pilot a common event/work ledger for Mailman and Sales.
- Add transition history, leases, retries, dependencies, deadlines, approval
  state, reconciliation, and dead letters.
- Inventory secrets and capabilities, then move one high-risk recurring
  integration behind a typed host adapter.
- Add tracked per-agent capability manifests that generate tools, mounts,
  network, model, resource, and action policy.
- Create host-owned proposed-action objects binding exact content, recipient,
  nonce, hash, expiration, identity, and policy version.
- Converge Gmail, webhook, poll, and reconciliation paths on one deduplication
  contract.
- Close outbound-interaction/source-thread lineage gaps.
- Inventory all timers, host jobs, launchd, n8n, and remote schedules.
- Add end-to-end correlation identifiers and evidence.
- Establish encrypted backups and perform an isolated restore drill with
  measured RPO/RTO.

### Wave 2 — safe intelligence

- Build a shared Mailman/Sales evaluation pack containing known incidents,
  prompt injection, wrong-recipient/thread, stale-fact, dependency-failure, and
  cost-stress cases.
- Record a minimum decision envelope: model, prompt hash, release, action,
  policy result, latency, tokens, and cost.
- Implement candidate/evaluate/approve/canary/promote/monitor/rollback learning.
- Replace approval streaks with sampled correctness, severe-incident,
  reversibility, and observation-window gates with immediate demotion.
- Restrict autonomous remediation to typed, idempotent, allowlisted operations;
  no model-supplied arbitrary shell.
- Add deterministic verification, recurrence, and rollback policy.
- Require isolated worktrees, scoped tools, tests, relevant evaluations, dual
  AI review, human merge, canary, and outcome validation for generated fixes.

### Wave 3 — faster and leaner

- Establish a 30-day latency, cost, token, memory, and retry baseline.
- Replace unnecessary polling with event wakeups plus periodic reconciliation.
- Add priority classes, urgent reserved capacity, aging, deadlines, and
  backpressure.
- Make warm-container retention adaptive by group, demand, memory pressure, and
  observed follow-up probability.
- Build task-specific context packs with source and freshness metadata.
- Move repeatable classification, reconciliation, parsing, and validation into
  deterministic code.
- Route models by measured quality and cost per action class.
- Extract behavior from the five largest modules behind typed interfaces,
  without creating new services.
- Add typed configuration and a read-only doctor command.
- Add release manifests, schema compatibility, canary startup, rollback, and
  post-deploy reconciliation.
- Add bounded log rotation, retention, write-time redaction, and separate
  audit/debug lifecycles.

### Wave 4 — functional leverage

- One prioritized exception inbox.
- One evidence-backed party and relationship timeline.
- End-to-end closure contracts for each business process.
- Evidence-linked daily and weekly management briefs.
- Safe Slack/CLI operator status and control before considering a web UI.
- Per-process automation ROI measurement.

## Proposed first six-week slice

1. Suspend unsafe autonomy promotion and isolate healer implementation.
2. Add the global external-write safe mode.
3. Remove CI `eval` and finish Node 22 enforcement.
4. Convert direct lesson writes into reviewed candidates.
5. Build the capability inventory and move one recurring send path behind a
   host adapter.
6. Introduce the minimum event/work ledger for Mailman -> Sales -> Mailman.
7. Add correlation evidence and a compact exception brief.
8. Build the first Mailman/Sales regression and prompt-injection evaluation
   pack.

## Review questions

Answer explicitly:

1. Is the modular-monolith operating-kernel direction correct?
2. Which current risks are overstated, understated, unsupported, or missing?
3. Does the backlog materially improve speed, leanness, effectiveness, and
   functionality, or does it mostly add governance overhead?
4. Which items should be deleted, merged, split, or reordered?
5. Is the six-week slice credible for one primary engineer/operator?
6. Which five changes have the highest combined safety and business leverage?
7. What measurable exit gate should block broad implementation?
8. What should remain permanently human-authorized?
9. Where should deterministic code replace model judgment?
10. Which architecture decision, if made incorrectly, would be hardest to
    reverse?

## Required report

Write `docs/reports/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md` with:

1. executive verdict;
2. verified, corrected, and rejected current-state claims;
3. critical corrections;
4. missing risks or functionality;
5. sequencing changes;
6. overengineering challenges;
7. acceptance-criteria corrections;
8. five highest-leverage improvements;
9. revised six-week slice;
10. leadership decisions;
11. final disposition: accept, accept with changes, or reject.

For every finding include:

- severity: critical, high, medium, or low;
- basis: evidence-supported, architectural judgment, or requires live
  verification;
- exact repository evidence where applicable;
- recommended change to the backlog.

Do not modify `docs/COMPANY-OS-IMPROVEMENT-PLAN.md` during validation. The human
and Codex will reconcile accepted findings afterward.

## Completion and handoff

After writing the report:

1. update `NC-20260729-001` in `docs/ACTIVE-WORK.md` with the actual status,
   model/version, files inspected, and exact next action;
2. append a factual `NC-20260729-001` entry or dated addendum to
   `docs/ENGINEERING-CHANGELOG.md`;
3. run `npm run docs:continuity-check`;
4. run `git diff --check`;
5. do not commit or push unless the user separately authorizes it.
