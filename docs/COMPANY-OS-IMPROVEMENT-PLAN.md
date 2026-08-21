# NanoClaw company operating system improvement plan

Status: active strategic roadmap, twice adversarially reviewed and
source-verified
Validated baseline: repository commit `cd78ad2` plus the disclosed dirty
worktree, 2026-07-29
Reactivation baseline: verified documentation/deployment lineage `9e4977a`,
2026-08-15
Scope: functionality, architecture, agent quality, security, privacy, data,
reliability, performance, operations, developer experience, governance,
continuity, and business value
Authority: this is a plan, not implemented state

Implementation state is governed by `docs/ACTIVE-WORK.md` and factual evidence
in `docs/ENGINEERING-CHANGELOG.md`. This roadmap links to those records; it
does not promote local source, a passing test, or a deployment into a stronger
state. `NC-20260815-007` reactivates and re-sequences the roadmap but changes no
runtime, schema, prompt, configuration, deployment, or external system.

## 0. Reactivation decision and current baseline

### One roadmap, separately gated implementation

The Company OS plan is the single strategic roadmap for the always-on control
model. New ideas are reconciled into this document rather than maintained as a
parallel Spark, agent-platform, or automation plan. Implementation remains a
series of narrow `NC-YYYYMMDD-NNN` tasks, each with its own owner, authority,
acceptance evidence, rollback, review, deployment, and live-verification
boundary.

The document split is deliberate:

| Surface                          | Owns                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------- |
| this plan                        | target architecture, priorities, dependencies, stage gates, and outcome measures |
| `docs/ACTIVE-WORK.md`            | current owner, exact status, scope, overlap, and next action                     |
| focused design/runbook documents | schemas, protocols, acceptance cases, activation, and recovery                   |
| `docs/ENGINEERING-CHANGELOG.md`  | factual implementation, commit, migration, deployment, and live evidence         |

### Evidence-state vocabulary

- **implemented** — the scoped plan outcome and required verification are
  complete according to its linked task record;
- **partial** — useful mechanics exist, but the plan outcome or universal
  boundary is incomplete;
- **deployed_unverified** — a linked slice is live but still lacks its named
  verification or outcome gate;
- **still proposed** — no current evidence establishes the planned outcome;
- **superseded** — a later recorded decision replaces the item. No program item
  is classified as superseded at this baseline.

### Conservative implementation inventory — 2026-08-15

This inventory is intentionally conservative. Narrow controls do not become
company-wide merely because one workflow implements them.

| Program item                         | Evidence state | Current evidence and next gate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0.0 blast-radius reduction          | partial        | Gmail containment is `deployed_unverified` under `NC-20260729-004`; healer Gate A is `deployed_unverified` under `NC-20260730-002`. Procurement CDP isolation, the universal external-write brake, and all other named boundaries remain open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| P0.1 runtime contract                | partial        | `NC-20260728-005` restored a pinned Node 22 test baseline; `NC-20260731-003` put production on Node 22.23.2; release/runtime enforcement has advanced, but review and live-verification gates remain task-specific.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| P0.2 host-owned capabilities         | partial        | Gmail, Procurement, CNPC, grader delivery, and selected business flows use typed host boundaries. `NC-20260816-010` removes Trafft credentials from enforced Booking while retaining its then-used Plutio family; `NC-20260816-011` adds the dark Booking-to-Plutio host adapter with opaque durable references, archive-derived values, safety enforcement, and replay receipts. Exact release `13ca192` under `NC-20260816-012` deploys shared reschedule identity and proves a visible remote marker plus no-write replay after the HTML-comment candidate failed closed. `NC-20260816-013` wires initial/replay enqueue behind successful-agent plus exact-persisted-interaction gates and removes Booking's direct Plutio procedure. Its authorized normal-ingress canary exposed and contained scheduled-task exit, PostgreSQL receipt-cast, and operational-checkout reaper-launcher defects; release `02ce48f` repaired all three and exact active release `999f2a4` preserves them. The controlled row replay returned `already_recorded` with durable receipts and the duplicate webhook left counts stable. A fresh post-fix natural lifecycle observation remains open because the first event required operator recovery, so no full P0.2 credit is claimed. Company-wide adapter migration and red-team proof also remain open.                                                                                                                                                                                                                                                                                                                                                                                                              |
| P0.3 capability manifests            | partial        | `NC-20260816-004` adds one strict tracked manifest for each operative group, a deterministic matrix, default-off launch/MCP/host-operation projection, and stale warm/adoption revocation. `NC-20260816-006` live-verifies Campanero; exact release `ba5fe74` under `NC-20260816-010` live-verifies Booking as the second selective canary with Trafft absent and required DB/Plutio names present. NC-013 narrows Booking to `business_db`, removes its Plutio/toolbox mounts, and has installed secret/mount-negative proof. Exact active release `999f2a4` preserves that projection after the corrective rollouts; the durable Booking receipt and duplicate ingress replay now pass. One fresh post-fix natural lifecycle observation remains pending. Other groups, egress enforcement, broader raw-secret removal, and action-value ceilings remain open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P0.4 unforgeable approval            | partial        | Durable pending-send, Procurement action-card, grader receipt, and healer proposal bindings prove the pattern. `NC-20260816-002` implements a dark content-free universal envelope plus mutation/replay tests, but legacy domains do not yet supply it and enforcement is not activated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| P0.5 safety controller               | partial        | The `NC-20260816-002` controller remains default-off; exact release `d32fda08` deploys and live-verifies a dry-run-first, auto-restored production transaction across Gmail send/reply, Slack, Courses SMTP projection, Plutio, Stripe, and Hive/Firestore with no external write, queue mutation, or Hive retry consumption. `NC-20260816-004` adds next-turn stale warm/adoption revocation when manifest enforcement is enabled. Immediate in-flight interruption, standalone-script/remaining-integration coverage, per-action ceilings, and automatic demotion remain open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P0.6 trusted build and supply chain  | partial        | Release provenance and exact-runtime checks are deployed for the current email lineage; immutable workflow pins, least privilege, dependency/secret controls, and the skill-PR boundary remain incomplete.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P0.7 live security model             | partial        | Security authorities have been reconciled for Gmail, Procurement, healer, grader, and release work, but the implementation-verified whole-system threat model and machine-control checks remain incomplete.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P1.1 durable work ledger             | partial        | Procurement, CNPC, webhook, grader, approval, and receipt tables demonstrate durable patterns. `NC-20260815-010` supplies the Mailman/Sales foundation; `NC-20260816-001` applies it and proves bounded shadow/replay; `NC-20260816-014/015` add and deploy its read-only exception report. `NC-20260816-016/017` add, deploy, and live-verify the second Campanero host-job contract: five exact runs, 15 events, five receipts, duplicate-only replay, and unchanged source/email parity. SQLite remains authority; recurring observation and either workflow's promotion remain open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| P1.2 process catalog                 | still proposed | Agent and subsystem inventories exist, but the deliberately small company-process catalog with owners, sources, classes, SLOs, and closure conditions has not been accepted.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| P1.3 scheduling ownership            | partial        | SQLite tasks, host jobs, launchd, n8n, and reapers are observable in places. `NC-20260816-016/017` define and live-prove one immutable `job_run_logs.id` execution contract without controlling it, while exposing the `already_running` durability gap. `NC-20260817-001` adds the normalized occurrence/replay contract across five trigger kinds; exact release `baed66d` under `NC-20260817-002` applies its append-only store and live-proves one natural scheduled-task boundary plus duplicate-only replay without controlling the task, then expires config back to disabled. `NC-20260817-003/004` add and deploy dark the source-definition and cursor/gap target with stable owner/alert keys, but register no live definition. Recurring definitions, skipped attempts, launchd, n8n, reapers, other adapters, and the populated trigger inventory remain incomplete.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| P1.4 three service indicators        | partial        | Exact release `265622bd` preserves NC-005's first 30-day Sales baseline—15 accepted, 13 completed, two incomplete, 86.67% completion, and 29m01.725s/6h16m18.994s/9h25m12.618s p50/p95/max latency—plus NC-20260820-006's dark, admin-only, append-only outcome-quality receipt. The third rate is coverage-aware: 13 exact `external_acknowledged` customer-visible outcomes currently have zero assessments and 13 missing receipts, so no numerator, denominator, or rate is published. Revisions supersede rather than rewrite history; internal exceptions remain ineligible. NC-20260820-007 live-deploys a default-off, single-receipt host producer with explicit short-lived plan/apply gates. NC-20260820-008 adds the separately default-off operator UX: one complete private packet is assembled only when exact ledger, SQLite action/draft, routed request, Gmail delivery, and outcome receipts agree; named-UID reactions alone choose the bounded classification before generic approval routing. NC-20260820-009 adds a release-bound atomic config/restore transaction and proves all 13 current candidates reconstruct into one complete message before activating exactly one packet. Live activation caught that cross-group `company-os` provenance woke Chief; the correction stores only this operator packet and its acknowledgments as Chief-owned host echoes while leaving actionable exception handoffs unchanged. There is no Gmail search, agent/model decision, bulk/default-clean mode, customer message, remediation, or external action authority. Natural authorized assessment coverage and a statistically useful time series remain open before setting an objective or calling all three indicators operational. |
| P1.5 operational telemetry           | partial        | Health, watchdog, release identity, queue, and receipt evidence exist. `NC-20260816-014/015` add and live-prove the compact Mailman/Sales exception surface; NC-017 adds a proven host-job source. Exact release `a2e6d35` activates NC-018's first combined recurring brief for one owner-confirmed operator, and active release `baed66d` preserves it; its first natural Chief delivery, exact named acknowledgment, and threaded receipt are durable with aggregate health and fail-closed state. Normalized correlation, weekly quality/cost evidence, and wider coverage remain incomplete.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| P1.6 backup/restore/continuity       | still proposed | Release rollback artifacts exist, but approved RPO/RTO, encrypted data backups, isolated restore evidence, and a current disaster-recovery runbook do not form one verified control.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P1.7 ingestion loss windows          | partial        | Webhook inbox/reaper patterns are durable. `NC-20260817-003` implements the generic source-watermark contract: monotonic CAS advance, complete accepted/rejected accounting, gap freeze, exact-gap reconciliation, append-only history, and zero agent grants pass disposable PostgreSQL rehearsal. `NC-20260817-004` applies migration 122 and deploys it dark. `NC-20260817-005/006` add the proposal-only full-snapshot proof and resumable content-free shadow. `NC-20260817-008/009` add, deploy, and naturally prove immutable receipts plus current cursor holdback. `NC-20260817-010` accounts for 3,041 retained IDs as 23 terminal, 1,675 recoverable, and 1,343 unknown without a Gmail call. `NC-20260817-013` applies migration 123 dark. `NC-20260818-001` live-proves one source/bootstrap/version-1 current state. `NC-20260818-002` applies migration 124 and live-proves a stable terminal mailbox audit over 85,076 IDs: 67 accepted, 39 rejected, and 84,970 unknown. `NC-20260818-003` adds the local receipt-backed cursor-alignment and crash-safe normal-advance/natural-404 freeze candidate; its disposable PostgreSQL proof commits one alignment, allows only exact SQLite crash catch-up, records one gap with the prior cursor fixed, and blocks ordinary advance while open. Exact deployment/activation, a natural 404, full-snapshot recovery, `gap_reconciled`, watermark-age alerts, and label-poll expiry remain open.                                                                                                                                                                                                                                                                                                 |
| P1.8 migration discipline            | partial        | Ordered tracked `business_v2` migrations and structure-only schema checks exist; checksums, fresh-database CI, portability, and universal migration/restore gates remain incomplete.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P1.9 canonical identity and lineage  | partial        | Party-scoped authorization, entry/email resolution, and canonical Slack lead threads improved lineage; first-touch and cross-process lineage are not universal.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P1.10 privacy and records governance | still proposed | Data is protected by scoped roles and handling rules in places, but classification, retention, deletion, legal hold, and subject-access operations are not one accepted system.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| P1.11 shared evaluation harness      | partial        | Sales has request-first fixtures and grader has calibrated contract/corpus work; there is no shared versioned runner joining behavior, safety, cost, and outcome evidence across agents.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| P1.12 minimum decision envelope      | partial        | Action IDs, run context, receipts, release identity, and policy evidence exist in selected paths; prompt/knowledge/model/tool/policy versions are not uniformly bound to every work item and action.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| P1.13 knowledge and learning         | partial        | Bounded regeneration, fact-drift, and conflict controls exist; promotion/quarantine/provenance are not enforced uniformly across every operative knowledge copy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| P1.14 risk-adjusted autonomy         | partial        | Autonomy policy/ledger/hold mechanics exist, but promotion is not yet governed by sampled outcome evidence, common thresholds, and automatic demotion across workflows.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| P2.1 measurement before architecture | partial        | Focused workflows collect useful test and operational evidence; no stable workload/cost baseline yet justifies broad architecture changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| P2.2 scheduling fairness             | partial        | Per-group serialization, concurrency, warm workers, and capacity controls exist; priority classes and SLO-backed fairness remain incomplete.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| P2.3 containers and networks         | partial        | Container limits and role mounts exist, but measured right-sizing and default-deny, destination-scoped network policy do not.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P2.4 context and spend               | partial        | Role context, task context, model settings, and bounded prompts exist in selected paths; task-specific context manifests and host-selected execution profiles are not one versioned contract.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P2.5 database tuning                 | still proposed | Tuning is incident-specific; workload-backed index/query/retention policy is not a program.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| P2.6 modular-monolith decomposition  | still proposed | Helpers have been extracted opportunistically, but no further decomposition is authorized without a measured ownership, testability, reliability, or performance blocker.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| P2.7 typed configuration             | partial        | Typed policy modules, setup code, and examples exist, but effective configuration still spans environment, SQLite JSON, launchd, code, and local state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| P2.8 safe integration environment    | partial        | Focused fixtures, synthetic canaries, and extensive tests exist; a reusable side-effect-free environment covering the two pilot workflows remains incomplete.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| P2.9 explicit releases               | partial        | Exact release provenance and code/state-root checks are live on the current email lineage; those controls are not yet universal release and recovery proof for every workflow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| P2.10 exception inbox                | partial        | `NC-20260816-014/015` implement and live-prove the smallest SELECT-only ledger exception report; NC-017 adds the second workflow. Exact release `a2e6d35` and live migration 120 activate NC-018's separate durable reason cases and deduplicated Chief delivery for one owner-confirmed operator while retaining zero workflow authority. `NC-20260820-002` deploys the third workflow in exact release `8344524c`: live program-facts drift created stable item 21, one owner-review case, and Chief brief 10; a second Campanero-scheduled observation did not duplicate the Sales alert. Exact release `bab154cb` deploys NC-20260820-003's source-bound Chief work packets and exact Sales-email handoff hydration without Gmail search. The next natural brief posted three packets and woke Chief, but the only public output was an unbound root summary while the packet run ended privately. Exact release `f6089cce` and live migration 129 deploy `NC-20260821-001`'s content-free posted/picked-up/attempt-finished bindings, threaded non-resolution receipt, exact replay suppression, and removal of the redundant summary wake. A later natural cycle posted three changed-source packets; all three were durably picked up, attempted successfully, and receipted with zero failures and no protected core-work or customer-email mutation. Owner source correction and exact clean source-resolution remain separate. Routing actions, dead-letter/credential/policy coverage, and any volume-justified work panel remain open.                                                                                                                                                                                                         |
| P2.11 relationship timeline          | partial        | `business_v2`, interactions, canonical lead keys, and thread anchoring provide parts of the timeline. `NC-20260820-004` deploys a bounded source-first slice across the website, n8n, Inbox, and Sales: the already-persisted contact entry referrer is reduced to a path/hostname context and propagated with the inquiry, rather than reconstructed later. Exact structural/runtime proof passes; one genuine submission remains the outcome gate. One reconciled party/work/action/outcome view remains incomplete, and this slice deliberately excludes full Chaos journey lookup.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| P2.12 functional closure             | partial        | Procurement, CNPC, grader, Sales, and Contador now have stronger closed-loop pieces. `NC-20260820-002` deploys program-facts completion as one exact clean-detector receipt, with immediate owner-review blocking and explicit recurrence. Live drift opened the item/case and repeated scheduling deduplicated correctly; owner correction plus the exact clean closure receipt remains pending. `NC-20260820-004` deploys the source-bound entry-page path that removes one avoidable contact-form clarification hop, while missing context fails open and gives no new send or commercial authority. Its exact system proof passes; natural contact proof remains pending. The reported broken daily Sales follow-up task must remain disabled until a policy-led redesign unifies active-lead next actions, unsigned proposals, and unpaid invoices without resurfacing the same ineligible party every day. Every remaining process still needs an explicit completion definition, receipt, exception path, and outcome check.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| P2.13 management briefs              | partial        | Existing digest generators remain separate, but exact release `a2e6d35` activates NC-018's first bounded recurring urgent-attention brief directly from the shared pilot ledger's exception projection. One natural Chief brief, exact named acknowledgment, and threaded receipt are durable. Exact release `bab154cb` deploys NC-20260820-003's missing brief-to-work dispatch: tracked packets wake Chief and carry bounded exact source context while retaining attention-only acknowledgment. Runtime/schema/prompt verification is complete; the next natural packet, accepted/completed trends, weekly/monthly outcomes, cost/quality, links, and broader process coverage remain open.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 1. Executive recommendation

NanoClaw should evolve as a **controlled company operating system built around a
modular monolith**, not as a collection of increasingly autonomous prompts and
not as a conventional microservice platform.

The system already has valuable foundations:

- agents are isolated in lightweight virtual machines;
- business responsibilities are separated into named roles;
- consequential email paths have host-side guards;
- SQLite and PostgreSQL provide durable state;
- retries, reapers, circuit breakers, warm containers, and restart adoption
  address real operational failures;
- the repository has extensive tests and operational knowledge;
- human approval is already part of several workflows;
- the recent cross-session IPC theft defect now has a targeted filter and
  regression tests.

The next stage should not begin by adding more agents. It should establish five
system-wide capabilities:

1. **A trusted action gateway** so agents never need raw business credentials
   and every consequential action is authorized, idempotent, and audited.
2. **A durable work ledger** so every company process has one visible state,
   owner, deadline, evidence trail, and exception path.
3. **An evaluation and observability layer** that measures quality, latency,
   cost, risk, and business outcomes per workflow.
4. **A reproducible release and recovery system** with one supported runtime,
   green CI, versioned migrations, encrypted backups, and restore drills.
5. **A governance model for autonomy** in which permissions expand only after
   statistically useful quality evidence and remain bounded by action class.

Until those foundations exist, new automation should default to read-only,
analysis, or draft mode.

## 2. Outcome to optimize

The desired end state is:

> Every important operational event becomes a durable work item. The right
> agent receives only the data and capabilities it needs, produces an
> evidence-backed proposal or action, crosses an explicit policy boundary, and
> leaves a complete record of what happened, why, at what cost, and with what
> business outcome.

This creates a company OS rather than a chatbot fleet.

### 2026-08-21 strategic reset: outcomes are the proving ground for smarter automation

The roadmap is not a platform-building program with business workflows attached
later. Its next work is organized around three outcome lanes:

1. **Inbox to resolution** — understand the complete source event, route it to
   one accountable owner, perform or propose the bounded next action, and prove
   closure from the authoritative source.
2. **Revenue follow-up** — maintain one current case for each lead, proposal,
   and collectible invoice; act only when Tandem has the ball; stop on reply,
   payment, signature, terminal rejection, or a verified cadence boundary.
3. **Management by exception** — surface only work that is blocked, stale,
   failed, awaiting judgment, or missing an outcome; ensure a responsible
   minion picks it up, attempts a bounded resolution, and checks the source for
   closure.

Every implementation slice must pass a **dual delivery gate**:

| Required gain       | Question the task must answer                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| business outcome    | Which delay, error, missed opportunity, or human hop becomes measurably better?                                                      |
| automation gain     | Which manual observation, routing, lookup, drafting, execution, reconciliation, or follow-up step is removed or made exception-only? |
| minion intelligence | Which source-bound context, decision rule, reusable capability, evaluation, or correction receipt makes the next case better?        |

An outcome-only manual containment can be accepted as a temporary incident
control, but it is not completion of a Company OS capability. A generic
substrate, adapter, ledger, dashboard, or new agent without a natural
outcome-path receipt is dark foundation, not a completed capability. New
horizontal platform work is deferred unless one of the three lanes proves it
is the smallest blocker to the next business outcome.

### Autonomy promotion ladder

Each lane advances through the same bounded levels:

1. **observe** — capture complete source context and authoritative identity;
2. **recommend** — propose the next action with evidence and abstain on gaps;
3. **approval-execute** — bind one operator-visible decision to one exact action;
4. **low-risk autonomous** — perform only a narrow, reversible action class
   with deterministic policy and durable receipts;
5. **adapt** — use correction and outcome evidence to improve selection or
   drafting without widening authority.

Promotion requires natural-path evidence for completion, duplicate rate,
operator correction/reversal rate, human correction minutes, cost/latency, and
rollback. Approval volume or a run of uncorrected drafts is not sufficient.

### North-star outcomes

| Outcome           | Target direction                                              |
| ----------------- | ------------------------------------------------------------- |
| Work completeness | no important inbound event silently disappears                |
| Action safety     | no consequential action bypasses policy or approval           |
| Data integrity    | one canonical party/process record, no hidden state islands   |
| Reliability       | known SLOs, bounded recovery, proven restores                 |
| Decision quality  | agent recommendations are evaluated against real outcomes     |
| Human leverage    | people handle exceptions and judgment, not repetitive routing |
| Cost efficiency   | cost per successfully completed work item decreases           |
| Change safety     | every release is reproducible, reviewable, and reversible     |

### Non-goals

- Do not split the host into microservices without measured isolation or scaling
  need.
- Do not introduce Kubernetes, Kafka, or a large workflow platform as a default.
- Do not add a visual dashboard merely to appear enterprise-grade.
- Do not replace PostgreSQL, SQLite, Markdown knowledge, or Apple Container
  before their limits are measured.
- Do not grant an agent a broad credential or shell path to avoid building a
  narrow host capability.
- Do not promote autonomy based only on the absence of user corrections.

## 3. Priority model

| Priority | Meaning                                                |
| -------- | ------------------------------------------------------ |
| P0       | Required before expanding autonomy or business scope   |
| P1       | Required for dependable company-wide operation         |
| P2       | Improves scale, cost, usability, or strategic leverage |
| P3       | Optional optimization after evidence supports it       |

Every initiative should be accepted only when it has:

- a stable `NC-YYYYMMDD-NNN` task ID and active-work owner;
- an accountable owner;
- a user/business outcome;
- a technical and safety boundary;
- measurable acceptance criteria;
- a migration and rollback strategy;
- operational telemetry;
- documentation and runbook updates;
- a factual engineering-changelog entry at each review/release boundary so
  Claude Code and Codex see the same current state and next action.

## 4. Current-state assessment

### 4.1 Strengths to preserve

1. **Isolation-first architecture.** Untrusted content is processed inside
   Apple Container VMs rather than directly as the login user.
2. **Host-mediated effects.** IPC provides a natural place for enforcement.
3. **Role separation.** Mailman, Inbox, Sales, Booking, Contador, Certifier,
   Courses, Grader, Procurement, Newsroom, Social, Chief, and others have
   explicit business responsibilities.
4. **Operational learning.** The code contains fixes for feedback loops,
   duplicate processing, stale threads, token failures, and restart behavior
   derived from real incidents.
5. **Durable business model direction.** `business_v2` provides a path away from
   email-address identity and disconnected business tables.
6. **Good test density.** The current Git-visible `src/` tree contains 106 test
   files and 131 non-test TypeScript files, plus an independently tested agent
   runner. Counts are a maintenance signal, not proof of security coverage.
7. **Explicit human approval.** Sales, certification, course distribution, and
   social workflows already distinguish proposals from execution.
8. **Small-system preference.** The project resists infrastructure fashion and
   is willing to solve the measured problem.

### 4.2 Material gaps

#### Security and authority

- Agent containers receive raw Claude, PostgreSQL, Plutio, Trafft, Stripe,
  Google Sheets, Obsidian, email, Bonfire, and other credentials according to
  group role.
- Agent network egress is unrestricted.
- Procurement can connect to a logged-in host Chrome CDP endpoint.
- The active Claude CLI uses `--dangerously-skip-permissions`.
- Agent tools are implemented in one broad MCP server; capability exposure is
  not yet generated from a central least-privilege policy.
- At the validated baseline, every group could invoke the complete `gmail_*`
  family. `gmail_send` made party enforcement conditional on a model-supplied
  `leadId`, while `gmail_reply` skipped recipient and CC validation and test
  routing. `NC-20260729-004` is the deployed host-containment task for these
  defects; its dirty production source/prompt checkout remains a separate
  convergence concern.
- The dedicated Procurement Chrome profile is a real control, but its
  unauthenticated CDP bridge is on the shared Apple Container gateway and is
  reachable by every agent VM if the bridge is live.
- The tracked fast-healer launchd template enabled implementation even though
  the implementation source says it should ship dark. That path runs an
  agentic host Claude process against the operational checkout.
- The security document still describes WhatsApp, ephemeral containers, and
  Anthropic-only credential exposure, which no longer matches implementation.
- Human-approval displays can be influenced by model-produced context unless
  every approval card is rendered from host-owned action data.

#### Reliability and continuity

- The Mac Mini, its Apple Container runtime, and local SQLite state remain
  important single points of failure.
- Backup existence, encryption, retention, RPO/RTO, and restore-test evidence
  are not managed as one control system.
- Work scheduling is spread across in-process timers, SQLite tasks, host jobs,
  launchd, n8n, and remote services.
- Gmail history expiry can reset the push baseline with a possible data-loss
  window.
- Nothing currently populates the canonical `source_thread_id` lineage used to
  bootstrap party resolution for the first outbound interaction.
- A tracked repository-hygiene launchd job references a missing cleanup script;
  ownership/inventory alone therefore cannot prove scheduled work is executable.
- File IPC, local sessions, and adopted-container sidecars are host-local.
- There is no verified warm-standby/failover process for the whole operating
  system.

#### Build and change safety

- `.nvmrc` pins Node 22, CI runs Node 20, and the current workstation shell
  runs Node 26.5.0.
- The production Mac Mini was separately recorded running Node 25.8.2, so no
  currently observed authoring/production runtime matches the pin.
- Node 20 is end-of-life as of the current review date. Node 22 and Node 24 are
  LTS; Node 26 is a valid current release but does not enter LTS until October 2026. The workstation is therefore on a real but inappropriate pre-LTS line
  for the current native-module baseline.
- CI runs only on pull requests to `main`, not as the universal push/release
  gate.
- GitHub Actions use movable version tags rather than reviewed commit SHAs.
- Several workflows receive write permissions or GitHub App credentials.
- There is no repository-wide lint rule, coverage threshold, dependency-review
  gate, secret scan, SBOM, container-image scan, or signed release provenance.
- The npm advisory audit could not be verified in this review.

#### Architecture and maintainability

- `src/index.ts`, `src/db.ts`, `src/container-runner.ts`,
  `src/group-queue.ts`, and `src/ipc.ts` each exceed 1,000 lines.
- One composition root directly owns many unrelated recurring processes.
- Configuration is distributed across environment reads, code defaults,
  SQLite JSON, launchd files, ignored local files, and group prompts.
- Current, target, historical, and superseded documents coexist with uneven
  status labels.
- The project map records an older dirty/ahead snapshot; it is evidence, but
  not self-refreshing.

#### Data and workflow truth

- Process state can exist in SQLite, PostgreSQL, Gmail labels, Slack threads,
  Plutio, Trafft, Sheets, Markdown files, n8n, and third-party systems.
- `docs/DATA-MODEL.md` is labeled unimplemented even though substantial
  `business_v2` mechanics now exist.
- Schema changes are an accretion of SQL files rather than one versioned,
  checksummed migration chain exercised in CI.
- Group support files and some operational schemas historically lived outside
  Git; recent ignore changes reduce accidental artifacts but do not define a
  deliberate portable configuration package.
- PII classification, retention, deletion, legal hold, and subject-access
  procedures are not one documented system.

#### Agent quality and business value

- Prompt, knowledge-pack, model, toolset, and policy versions are not uniformly
  recorded with each work item.
- There is no shared offline evaluation harness for all agents.
- Autonomy promotion is based substantially on clean approvals, which can miss
  silent errors, selection effects, and downstream business harm.
- Knowledge learning can amplify bad corrections or poisoned content despite
  conflict checks.
- `learn_lesson` publishes before its asynchronous contradiction result and the
  mounted/shared copies do not reliably carry the same contested state.
- Token/cost, human time saved, conversion impact, rework, complaint rate, and
  other business outcomes are not one causal measurement chain.

## 5. Target operating architecture

Keep one host process, but divide it into explicit internal planes:

```text
                        COMPANY EVENTS
      Slack | Gmail | webhooks | schedules | people | integrations
                              |
                              v
                   Ingress + normalization plane
                              |
                    durable event/work ledger
                              |
              policy-aware router and priority scheduler
                              |
                  isolated role-specific agent run
                              |
                   proposed structured action(s)
                              |
                policy + approval + idempotency gate
                              |
             host-owned capability adapters / credentials
                              |
                     external business systems
                              |
                  result, evidence, cost, outcome
```

### Internal planes

1. **Ingress plane** — validates source identity, normalizes events, deduplicates,
   and writes the durable event.
2. **Work plane** — owns work-item state, owner, SLA, priority, dependencies,
   retry count, and exception status.
3. **Agent plane** — receives a scoped task, context pack, and capability
   manifest in an isolated VM.
4. **Policy plane** — decides whether a proposed action is denied, held,
   approved, auto-executable, or escalated.
5. **Capability plane** — holds credentials and performs narrow, typed external
   operations.
6. **Evidence plane** — records prompt/knowledge/model/tool/policy versions,
   decisions, results, costs, and business outcomes.
7. **Operations plane** — health, SLOs, deployment, backup, restore, incident,
   and capacity evidence.

These are conceptual responsibilities, not seven implementation frameworks.
For a one-engineer system, group them into three internal modules by default:

1. **Ingress and work** — ingress, normalization, ledger, routing, scheduling.
2. **Agent and authority** — agent execution, policy, approval, capabilities.
3. **Evidence and operations** — audit, telemetry, health, release, recovery.

The migration/admin role is a separate operator trust context even if it uses
the same repository and executable. This is an intentional exception to the
one-daemon runtime, not a hidden second application service.

### First-class control objects

The architecture should make five contracts explicit. They may share storage
and code, but their authority must not be conflated:

1. **Task — what should happen.** A durable unit of intent with source event,
   business entity, owner, state, priority, deadline, dependencies, input
   references, context manifest, and completion definition.
2. **Trigger — when a task should be created or resumed.** Time/cron, Gmail,
   Slack, webhook, topic, and business-condition adapters normalize external
   facts into a common trigger record. A trigger may request work; it does not
   perform the consequential action itself. A schedule is one trigger type.
3. **Skill — how work is attempted.** A versioned procedure package declaring
   inputs, outputs, allowed capabilities, knowledge/context dependencies,
   model compatibility, evaluation pack, owner, and rollback. Installing or
   selecting a skill does not grant action authority.
4. **Action envelope — whether a mutation may occur.** A host-owned proposed
   action binds work item, action class, exact target, normalized arguments or
   content hash, idempotency key, policy version, approval requirements,
   ceilings, expiry, and current resource version. Agents propose; the host
   authorizes and executes through a narrow capability.
5. **Receipt — what actually happened.** Requested, policy-decided, approved,
   attempted, externally acknowledged, reconciled, and outcome-validated are
   separate facts. A receipt binds the external result back to the exact task,
   trigger, skill version, action envelope, and evidence.

Required invariants:

- changing a trigger does not silently change the skill or action authority;
- changing a skill invalidates approval when its action bytes or material
  inputs change;
- a successful agent turn is not a completed task without the task's defined
  receipt and closure condition;
- retries reuse the same idempotency identity or fail closed;
- the host chooses capability exposure and execution profile; prompts may not
  self-select more authority, cost, or depth;
- every child task has a durable parent, bounded budget/deadline, scoped
  context, and join/cancellation semantics before multi-agent delegation is
  treated as dependable work.

## 6. P0 program: establish control before expansion

### P0.0 Immediate blast-radius reduction

These changes precede the broader P0 program and should be attempted in the
first 48 hours, with normal testing and rollback:

1. Authorize every `gmail_*` IPC operation from the directory-derived source
   group, quarantine denials, and add a negative test per capability family.
2. Resolve outbound parties on the host; fail closed when the intended To/CC
   recipient or Gmail-derived reply target cannot be proved from host data.
   Apply test routing to both sends and replies and limit reads/threads to
   host-assigned resources.
3. Set the tracked fast-healer template to
   `HEALER_IMPLEMENT_ENABLED=0`; verify separately whether the unit is loaded
   and enabled on the Mac Mini. Move implementation into a disposable worktree
   before considering re-enablement.
4. Keep C4/C5 actions in explicit manual mode and suspend Sales L2 promotion in
   code or service configuration. Verify zero enabled autonomy channels from a
   running daemon; an `.env` edit is not evidence because the current autonomy
   knobs do not load from that file.
5. Isolate the existing dedicated Procurement profile's CDP bridge at the
   network boundary or retire it. Do not treat a dedicated profile as network
   isolation.
6. Remove shell `eval` from the skill-validation workflow; contain the
   intentionally PR-controlled execution with `permissions: contents: read`,
   no secrets, and no `${{ }}` interpolation inside `run:`.
7. Add temporary outbound amount, recipient, publication, and rate ceilings at
   final execution boundaries.
8. Confirm live SQLite databases are excluded from every file-sync root.
9. Repair the user-level Claude permission deny rules surfaced by Claude Code
   2.1.217: current warnings say `Write(...)` patterns do not enforce file
   protection and must use the supported `Edit(...)` matcher. Perform this as a
   separately reviewed machine-configuration change.

**Acceptance:**

- an unauthorized group cannot invoke or read through any `gmail_*` operation;
- unknown recipients, unassigned threads/messages, and arbitrary CCs fail
  closed; send and reply test routing are both proven;
- healer implementation is off in tracked configuration and its live state is
  separately evidenced;
- the operator can prove high-impact actions are manual or disabled from the
  running service state;
- no unrelated agent VM can reach the Procurement CDP bridge;
- skill-PR execution is accepted only on an ephemeral, read-only-permission
  runner with no secrets and no expression interpolation inside `run:`;
- sync configuration does not include `store/`, `data/`, or active SQLite/WAL;
- the temporary controls and their removal conditions are recorded.

### P0.1 Align and enforce the runtime contract

**Problem:** Node 22 is pinned locally, Node 20 is used in CI, and Node 26 is
active on the workstation. Native bindings have already failed under this
drift.

**Actions:**

1. Select one production/development LTS line. The lowest-risk immediate repair
   is Node 22 because it matches `.nvmrc`; Node 24 should be tested in the same
   compatibility matrix and may be selected instead if the native/runtime suite
   passes. Do not standardize production on Node 26 before its LTS transition.
2. Set `package.json#engines`, `.nvmrc`, CI, launchd environment, container
   builder, developer bootstrap, and documentation to the same exact major.
3. Add a startup refusal or high-severity health failure when the runtime major
   differs.
4. Add `npm run doctor` that reports runtime, native ABI, Apple Container,
   image, schema, configuration, and dependency state without exposing values.
5. Run CI on pull requests and pushes to protected `main`.

**Acceptance:**

- local, CI, build, and production report the same major;
- CI fails when `.nvmrc`, `package.json#engines`, workflow runtime, container
  build, or service runtime declarations diverge;
- `better-sqlite3` loads and the full root suite passes;
- a deliberate wrong-major test fails before daemon startup;
- the supported runtime and upgrade policy are documented.

### P0.2 Replace raw agent credentials with host capabilities

**Problem:** VM isolation protects the host, but secrets placed inside the VM
are available to the LLM's shell and to prompt-injected tool use.

**Actions:**

1. Inventory every secret by owner, system, scope, rotation, current consumer,
   and consequence of compromise.
2. Classify capabilities as read, draft, write, send/publish, financial,
   identity/admin, or destructive.
3. Move third-party credentials to host-owned typed adapters. Agents request
   operations such as `stripe.lookup_customer`, `plutio.draft_proposal`, or
   `gmail.propose_reply`; they do not receive API keys.
4. Give PostgreSQL access through host queries/procedures or short-lived,
   operation-scoped credentials. Remove admin/migration credentials from the
   runtime daemon.
5. Keep Claude authentication as the documented temporary exception, measure
   exposure, and isolate it from general Bash where the CLI permits.
6. Rotate every credential after its old container injection path is removed.
7. Add automated assertions that forbidden secret names are absent from the
   container environment.

**Acceptance:**

- before credential extraction work, no group can invoke a capability outside
  its declared set and negative tests cover each group/capability family;
- a tool-enabled red-team agent cannot recover business-system credentials
  through documented environment, filesystem, `/proc`, child-process,
  adapter-error, response, or log attacks;
- capability calls are typed, group-scoped, logged, and deny by default;
- adapter values are policy-checked as well as verbs: destination, amount,
  identity, resource scope, volume, and rate cannot exceed the manifest;
- migrations require a separate operator role/process;
- secret rotation and emergency revocation are proven.

### P0.3 Create one capability manifest per agent

**Problem:** role prompts explain boundaries, but MCP exposure and host checks
must enforce them mechanically.

**Actions:**

1. Add a tracked declarative manifest per agent:
   inputs, data domains, mounts, model, tools, action classes, approval policy,
   network policy, timeout, resource limit, owner, and SLO.
2. Generate `--allowedTools`, MCP registration, mounts, and action-policy rules
   from that manifest.
3. Fail startup on prompt/manifest/registration drift.
4. Produce a human-readable permissions matrix in CI.
5. Add negative tests proving every agent cannot call every non-owned
   capability.
6. Until manifests generate the surface, keep an explicit host-side operation
   matrix for `gmail_*` and quarantine every denied request.

**Acceptance:**

- no capability exists only because it happened to be present in a shared MCP;
- a permissions diff is reviewable in every PR;
- non-main agents have the minimal functional surface;
- unused/dormant integrations are not exposed.
- the interim Gmail matrix is enforced at the host and cannot be widened by a
  prompt or model-authored handoff.

### P0.4 Make approval unforgeable

**Problem:** a human-in-the-loop control fails if untrusted/model-controlled text
can misrepresent the action being approved.

**Actions:**

1. Store a canonical proposed-action object on the host before displaying it.
   For the first slice, extend the existing `pending_sends` record with the
   normalized recipient, thread/work-item identity, and SHA-256 body hash
   instead of designing a second approval subsystem.
2. Render approval cards exclusively from host-owned fields: action type,
   exact destination, exact amount/content hash, data scope, expiration,
   policy result, and rollback properties.
3. Bind reactions/buttons to a random nonce, user identity, work item, action
   hash, and expiration.
4. Revalidate policy and current state immediately before execution.
5. Invalidate approval on any material mutation.
6. Separate “approve draft quality” from “authorize external execution.”
7. Add two-person approval for financial, credential, deletion, and broad
   publish actions only when a real independent second approver exists. Until
   then, use explicit named-human authorization, a mandatory cooldown, strict
   limits, and an after-action notification; do not claim a fictional
   separation of duties.

**Acceptance:**

- copied text or model output cannot create a valid approval;
- a versioned adversarial suite proves stale, replayed, wrong-user,
  wrong-thread, expired, concurrent, and post-approval-mutated actions fail
  closed;
- the audit record reconstructs exactly what was authorized and executed.

### P0.5 Add one safety controller and autonomy ceilings

**Actions:**

1. Implement one host kill switch for all external writes while retaining
   read-only processing.
2. Add per-system, per-agent, and per-action-class circuit breakers.
3. Cap action volume, recipients, money, and retry count per time window.
4. Keep irreversible, credential, public-broadcast, and high-value financial
   actions permanently human-authorized unless governance explicitly changes.
5. Automatically demote autonomy on guard failure, complaint, rollback,
   anomalous volume, missing telemetry, or evaluator regression.
6. Implement kill, circuit, hold, veto, and demotion behavior through one
   controller with documented trigger precedence and state transitions. Do not
   build overlapping demotion subsystems.

**Acceptance:**

- an operator can enter safe mode without stopping evidence collection;
- a drill proves `gmail_send`, `gmail_reply`, the courses SMTP bypass, Slack
  outbound, Plutio/Stripe host writes, and Hive/Firestore mutation all refuse
  while inbound processing and evidence collection continue;
- a compromised/noisy agent cannot exceed bounded blast-radius limits;
- autonomy never advances when quality evidence is missing.

### P0.6 Restore a trusted build and supply-chain baseline

**Actions:**

1. Pin GitHub Actions to reviewed full commit SHAs and declare minimum
   `permissions` in every workflow/job.
2. Review workflows that use GitHub App credentials or write to `main`; move
   generated updates to reviewed PRs where practical.
3. Replace shell `eval` of skill-provided test commands with a parsed allowlisted
   command model.
4. Add secret scanning and dependency review first. Add container-image
   scanning when its findings have a remediation owner. Defer SBOM generation
   and signed provenance until external distribution, compliance needs, or a
   concrete supply-chain decision justifies their maintenance cost.
5. Add a reviewed dependency-update bot with grouped, tested updates.
6. Perform the blocked npm advisory review through an explicitly approved
   process and record its date/result, rather than assuming zero findings.
7. Establish branch protection: review, green CI, no direct human pushes,
   signed/tagged releases where useful.

**Acceptance:**

- CI has least privilege and immutable third-party action references;
- the skill workflow declares `permissions: contents: read`, receives no
  secrets, and contains no `${{ }}` interpolation inside a `run:` block;
  arbitrary PR-controlled execution on its ephemeral runner is explicitly
  accepted and contained;
- release inputs, dependency inventory, and image digest are reproducible;
- critical advisories have an owner and remediation SLA.

### P0.7 Rewrite the live security model

Replace `docs/SECURITY.md` with an implementation-verified threat model covering:

- Slack, Gmail, webhook, browser, document, and peer-agent prompt injection;
- raw/remaining credential paths;
- Apple Container and mount boundaries;
- unrestricted and target network access;
- host Chrome CDP exposure;
- file IPC authentication and replay;
- MCP/capability authorization;
- approval integrity;
- supply-chain and skill-transform risks;
- PII, logs, sessions, knowledge, and backups;
- healer/self-modification and autonomy;
- incident detection, containment, recovery, and rotation.
- user-level Claude/Codex permission-rule validity and machine-local tool
  configuration.

Use NIST SSDF as the secure-development frame and OWASP's prompt-injection and
excessive-agency guidance for agent controls. Treat Apple Container 0.x as a
version-pinned dependency because upstream states that minor releases may be
breaking before 1.0.

## 7. P1 program: make work durable and observable

### P1.1 Introduce a durable work ledger

Create a PostgreSQL `work_items` model (or validate an equivalent existing
model) with:

- immutable source event ID and deduplication key;
- work type, business entity, owner agent, human owner, priority, and SLA;
- state: received, validated, queued, running, waiting_external,
  waiting_approval, blocked, completed, cancelled, failed, dead_letter;
- current attempt, lease, heartbeat, retry policy, and next action time;
- parent/child/dependency relationships;
- proposed action IDs and approval IDs;
- final result, evidence, cost, and business outcome;
- timestamps and append-only transition history.

Keep channel messages and agent sessions as views/interfaces, not workflow
truth. The ledger owns **process state**, not external business facts: Stripe,
Trafft, Gmail, Plutio, and other systems remain authoritative for the facts
they originate. The ledger references and reconciles those facts.

**Acceptance:**

- every inbound event is either rejected with reason or represented by one
  work item;
- daily source reconciliation proves `observed = accepted + rejected` and
  alerts on any unexplained discrepancy;
- no work is “in progress” only because a Slack thread implies it;
- operators can query overdue, stuck, retrying, awaiting approval, and
  dead-letter work across all agents;
- transitions use optimistic concurrency or leases to prevent double execution.

### P1.2 Create the company process catalog

Catalog only the two processes entering the first ledger pilot: inbound
Mailman → Sales → Mailman work and its approval/send close. For each, document:

- trigger and source;
- business owner and technical owner;
- inputs and data classification;
- responsible agent and capability manifest;
- deterministic rules versus model judgment;
- outputs and systems changed;
- approval and escalation rules;
- SLA/SLO;
- idempotency and deduplication key;
- exception/dead-letter handling;
- reconciliation process;
- success and business-value metric.

Generate the wider catalog from ledger and scheduler data once those systems can
keep it current. Do not hand-maintain a thirteen-process catalog that has no
forcing function.

### P1.3 Consolidate scheduling ownership

Inventory every timer, internal task, job, launchd unit, n8n workflow, cloud
trigger, and external schedule. For each, assign exactly one scheduling owner
and one durable run ledger.

Add:

- stable job/run IDs;
- concurrency policy: allow, forbid, replace, or queue;
- missed-run behavior;
- jitter and backoff;
- lease/heartbeat;
- retry budget;
- dead-letter and manual replay;
- execution deadline;
- output size/retention;
- dependency health;
- owner and alert route.

Avoid introducing a new scheduler until the inventory proves the existing host
runner cannot meet requirements.

### P1.4 Define three service-level indicators

For Mailman and Sales, begin with only:

- accepted-versus-completed work;
- end-to-end completion latency;
- customer-visible defect/reversal rate.

Derive objectives from a measured baseline rather than guessing. Add another
indicator only when it has an owner and changes an operational decision.

### P1.5 Build operational telemetry without a dashboard project

1. Standardize structured event names and correlation fields:
   `event_id`, `work_item_id`, `attempt_id`, `agent`, `group`, `thread`,
   `action_id`, `approval_id`, `external_id`, `model`, and `release`.
2. Add trace spans around queue, container, Claude, tool, database, and external
   calls.
3. Record counters/histograms in a lightweight local/exportable format.
4. Generate:
   - live status/doctor output;
   - daily exception brief;
   - weekly reliability/quality/cost brief;
   - incident timeline bundle.
5. Redact PII and secrets before log write, not only at display time.
6. Separate audit retention from debug-log retention.

### P1.6 Establish backup, restore, and continuity controls

Define per asset:

| Asset                      | Backup method                                      | Initial RPO            | Initial RTO       |
| -------------------------- | -------------------------------------------------- | ---------------------- | ----------------- |
| PostgreSQL business data   | encrypted logical + tested physical/managed backup | business decision      | business decision |
| SQLite host state          | transactionally consistent SQLite backup API       | business decision      | business decision |
| tracked source/config      | Git remote + protected history                     | near-zero after merge  | hours             |
| non-secret portable config | versioned export package                           | daily/change-triggered | hours             |
| knowledge sources          | versioned/encrypted according to sensitivity       | daily                  | hours             |
| secrets/OAuth              | recreate/rotate; do not ordinary-file sync         | documented             | hours             |
| sessions/logs              | explicit retention decision                        | optional               | not guaranteed    |

Run quarterly restore drills into an isolated environment and record:

- backup selected;
- checksum/decryption success;
- schema/application compatibility;
- restored row/file counts;
- end-to-end read-only test;
- actual RPO/RTO;
- gaps and owners.

At least one drill must restore a transactionally consistent backup captured
during active writes, run the read-only workflow acceptance suite, and meet
leadership's approved RPO/RTO. A successful file extraction alone is not a
restore test.

Create a warm-spare runbook only after deciding which local state is essential
to failover. Do not call Syncthing a database replication system.

### P1.7 Close ingestion data-loss windows

- On Gmail history expiry, perform a bounded reconciliation scan rather than
  accepting an unmeasured gap.
- Reconcile source systems against the work ledger using watermarks and
  immutable external IDs.
- Make every webhook and poll path converge to the same deduplication contract.
- Alert on watermark age, not only process liveness.
- Add periodic “source count versus accepted/rejected/work-item count”
  accounting.

## 8. P1 program: data integrity and privacy

### P1.8 Establish migration discipline

1. Choose one migration directory and naming scheme.
2. Store immutable, ordered migrations with checksums.
3. Record applied version/checksum in PostgreSQL.
4. Run migrations against a fresh ephemeral PostgreSQL instance in CI.
5. Test forward migration, compatibility window, backfill, validation, and
   rollback/restore.
6. Generate schema reference docs from the migrated schema.
7. Detect drift between repository migrations and live schema.
8. Separate application runtime roles from migration/admin roles.

Reconcile `docs/DATA-MODEL.md` with implemented `business_v2`; split it into
“current model,” “remaining migration,” and “historical rationale.”

### P1.9 Enforce canonical identity and lineage

- Complete canonical-party use in every write path.
- Introspect all foreign keys in tests so merge redirects cannot omit a new
  table.
- Record source system, external ID, observed time, ingest time, confidence,
  and transformation version for imported facts.
- Preserve raw source references without making raw third-party systems the
  workflow authority.
- Create reconciliation reports for Plutio, Trafft, Stripe, Sheets, Hive, and
  other mirrors.

### P1.10 Define privacy and records governance

Create a one-page inventory of the data classes actually processed, their
storage locations, sensitivity, and current consumers. Obtain one leadership
decision for retention and use it to constrain logs, evaluation fixtures,
knowledge packs, and backups. Redact evaluation data and keep raw PII out of
routine metrics now. Defer automated legal hold, subject-access, generalized
deletion/export, and a full records program until a contract, regulator, or
measured operational need requires them.

## 9. P1 program: agent quality and safe autonomy

### P1.11 Build one evaluation harness

Build the shared harness shape for Mailman and Sales first. Expand to another
agent only after the initial pack catches a real regression or blocks an unsafe
change. The eventual versioned evaluation pack can contain:

Implementation checkpoint (`NC-20260815-008`): the approved-email boundary now
has the first deterministic, synthetic-only incident corpus. It replays dropped
handoff recovery, model/entity drift, immutable approval binding, and missing
identity/thread failures through production functions, and pins the existing
schema/restart/replay/ambiguity/session/receipt regressions into the release
gate. This is the first slice of `EVAL-001`, not completion of the broader
Mailman/Sales model-quality, injection, or business-outcome harness.

Deployment checkpoint (2026-08-16): exact release `cfcfaae` is active and
live-verified after the drain gate was cleared through an explicitly authorized,
receipt-bound recovery of the blocked customer action. That recovery exposed
two natural-path defects: the watchdog fallback omitted Mailman's required
`[APPROVED-REPLY]` marker, and the immutable host replay does not bind/preserve
the card's visible CC. The recovery produced one Gmail receipt with the approved
headers, but it was manual and therefore is not natural-path outcome proof. A
separate runtime slice must encode and fix both defects before the next approved
email can close that gate. The same preflight also exposed live-release
knowledge contamination, preserved it recoverably, and restored the verified
artifact; this remains direct evidence for the R1 state-root separation work.

Deployment checkpoint (`NC-20260815-009`, 2026-08-16): exact release
`12c2b049` and its reviewed Mailman instructions are live after an immutable
build, independent verification, real-work drain, and guarded activation.
Host-generated Chief fallbacks carry Mailman's executable marker; the approval
envelope binds ordered visible CC recipients; ambiguous, duplicate,
hidden-copy, and malformed recipient headers fail closed; and the 2026-08-15
marker/CC incident is release-blocking. At 2026-08-16T13:59Z, a later natural
approved action completed normal fallback, Mailman execution, exact Gmail
acknowledgment, and one original-thread closure without manual repair. That
closes this slice's outcome gate while leaving the broader injection, blinded
quality, and multi-workflow evaluation harness open.

- golden successful cases;
- ambiguous cases requiring escalation;
- known incident regressions;
- malformed and duplicate inputs;
- direct and indirect prompt injections;
- hostile documents/web pages/emails;
- cross-agent spoofing and handoff confusion;
- wrong-recipient/wrong-thread cases;
- stale knowledge and factual contradictions;
- unavailable/slow external dependencies;
- prohibited action requests;
- cost/context stress cases.

Score:

- task correctness;
- evidence/factual accuracy;
- policy compliance;
- tool selection and argument accuracy;
- escalation quality;
- tone/format where relevant;
- side-effect safety;
- latency and cost.

Run deterministic guard tests on every PR. Run the relevant offline evaluation
before model, prompt, knowledge, capability, or autonomy changes. A model-based
judge may assist triage but cannot alone authorize autonomy promotion.

### P1.12 Record a minimum decision envelope

Initially record:

- source/work/attempt/action IDs;
- model;
- prompt hash;
- application release;
- proposed action, policy result, final result, latency, tokens, and cost.

Add knowledge-pack, lesson, toolset, and policy hashes only when the relevant
artifact is versioned and the added evidence has demonstrated diagnostic value.

Do not turn the evidence system into a second product. Set storage and runtime
overhead budgets and sample low-risk runs if full capture is not justified.

### P1.13 Harden knowledge and learning

1. Separate authoritative facts, policy, approved examples, learned heuristics,
   and temporary context.
2. Give every learned item provenance, author, evidence, scope, confidence,
   review state, expiration, and supersession link.
3. Never let an untrusted inbound artifact directly become durable instruction.
4. Require human review for policy/fact changes and high-impact lessons.
5. Test knowledge compilation for omission, contradiction, duplication, and
   stale-source drift.
6. Retain source fragments so regeneration is reproducible and reversible.
7. Evaluate retrieval/context selection; stop mounting giant knowledge packs
   when a smaller scoped pack produces equal quality.

### P1.14 Replace approval streaks with a simple risk-adjusted gate

Begin with three gates for reversible C2 actions:

1. sampled correctness exceeds a defined threshold and minimum sample size;
2. zero severe incidents during a defined observation window;
3. the action is reversible, bounded, and continuously monitored.

Keep C3+ actions human-authorized until leadership explicitly changes the
action-class policy. More mature evidence may later include:

- statistically useful volume;
- correctness from sampled human review;
- corrections and guard failures;
- downstream reversals/complaints;
- business outcomes;
- prompt/model/knowledge stability;
- dependency health;
- time since last incident;
- novelty/out-of-distribution score;
- action reversibility and maximum impact.

The safety controller owns promotion/demotion state. Demotion is immediate for
defined severe events. Continue random human review after promotion to detect
silent drift. Define the scorer, minimum sample, confidence/defect threshold,
and review workload before enabling promotion.

## 10. P2 program: performance and cost

### P2.1 Measure before changing architecture

Build a 30-day baseline by agent/workflow:

- queue p50/p95/p99;
- cold/warm start;
- model latency;
- tool/API latency;
- container peak memory/CPU;
- retries, timeouts, and cancellations;
- input/output/context tokens;
- cost per attempt and successful item;
- cache/context-pack hit rate;
- human wait and rework.

Do not optimize synchronous file reads, polling, container size, or database
queries without showing their contribution to an SLO or cost problem.

### P2.2 Improve scheduling fairness

Extend `GroupQueue` with measured, bounded policies:

- interactive, customer-facing, financial, batch, and maintenance priority
  classes;
- reserved capacity for urgent/customer work;
- per-group concurrency and rate limits;
- aging so low-priority work cannot starve;
- deadline/cancellation propagation;
- per-dependency circuit limits;
- backpressure before spawning containers;
- explicit status for capacity wait versus dependency wait.

Test with a deterministic queue simulator and the historical noop-swarm
incident.

### P2.3 Right-size containers and networks

1. Use recorded peak memory by agent; set peak plus safety margin.
2. Test lower CPU/memory limits under real document/browser workloads.
3. Pin and qualify Apple Container versions; upstream is pre-1.0.
4. Complete the P0 default-deny egress work and refine isolated networks by
   trust/integration class.
5. Route permitted egress through a policy proxy where the operational burden
   is justified.
6. Remove hard-coded DNS and bridge addresses from code; validate configuration
   at startup.
7. Add a compatibility smoke suite for every Apple Container upgrade.

### P2.4 Reduce LLM context and spend

- assemble task-specific context packs rather than full role corpora;
- cache deterministic facts and external lookups with freshness metadata;
- use deterministic code for classification, reconciliation, and validation;
- batch compatible reads but not unrelated approvals/actions;
- choose model per action using evaluation evidence;
- set token/time budgets and early-exit rules;
- record paid-fallback use and budget by workflow;
- detect loops and repeated tool calls before cost escalates.

### P2.5 Tune databases from workload evidence

- capture slow-query samples and `EXPLAIN (ANALYZE, BUFFERS)` in safe test data;
- index work-ledger, watermark, external-ID, canonical-party, and SLA queries;
- bound connection pools across host and concurrent agents;
- remove runtime admin access;
- batch append-only interactions and classification writes where safe;
- establish SQLite WAL/checkpoint/backup/size health metrics;
- test lock contention and crash recovery.

## 11. P2 program: architecture and developer experience

### P2.6 Decompose the modular monolith internally

Do not create services or a target module taxonomy in advance. Extract a typed
internal boundary only when a current safety, testability, or delivery change is
materially blocked by the existing file boundary. Acceptance then focuses on:

- no circular dependency increase;
- clear ownership and public interfaces;
- unchanged behavior under characterization tests;
- faster focused tests;
- easier dependency substitution.

### P2.7 Create a typed configuration system

1. Define one Zod schema for non-secret and secret configuration metadata.
2. Distinguish required, optional, defaulted, deprecated, secret, and
   machine-specific keys.
3. Generate `.env.example`, operator reference, and startup diagnostics.
4. Validate group JSON, launchd values, runtime version, paths, and external
   prerequisites before start.
5. Move hard-coded channel IDs, IPs, DNS, and machine paths into validated
   deployment profiles where they are operational configuration rather than
   business logic.
6. Hash the effective non-secret configuration into run/release evidence.

### P2.8 Build a safe local/integration test environment

Provide one command that creates:

- temporary SQLite;
- ephemeral PostgreSQL migrated from zero;
- fake Slack and Gmail adapters;
- deterministic external-service stubs;
- synthetic non-PII fixtures;
- isolated IPC/container directories;
- safe capability adapter implementations;
- controlled clock and scheduler.

Add test layers:

1. pure unit and guard tests;
2. repository/schema tests;
3. workflow contract tests;
4. agent offline evals;
5. Apple Container smoke tests on a macOS runner;
6. deployment canary tests.

Fix shared temporary paths so parallel tests cannot delete each other's state.

### P2.9 Make releases explicit

Create a release manifest containing:

- Git commit/tag;
- Node/npm versions;
- lockfile hash;
- application and agent-runner versions;
- container image digest;
- schema version;
- prompt/knowledge/capability versions;
- Apple Container version;
- test/eval/security evidence;
- migration and rollback instructions.

Deploy through staged gates:

1. build and verify;
2. database compatibility check;
3. read-only/safe-mode startup;
4. health and dependency readiness;
5. one canary agent/workflow;
6. gradual enablement of writes/autonomy;
7. post-deploy reconciliation.

## 12. P2 program: functionality and company leverage

### P2.10 Build a single exception inbox

The most valuable operator interface is not a general dashboard. It is a
prioritized exception queue containing:

- work waiting for approval;
- overdue/stuck items;
- guard/policy blocks;
- identity ambiguity;
- data contradictions;
- failed reconciliation;
- expiring credentials;
- repeated dependency failures;
- autonomy demotions;
- dead-letter work.

Support read-only query through Claude/Codex and a compact Slack brief. Add a
web UI only if volume makes Slack/query interaction inadequate.

An alert is not dispatch. `NC-20260820-003` deploys the process repair for
the current exception loop by posting one tracked, cross-group work packet per
visible item so Chief wakes and triages it. Email-backed packets resolve the
ledger's opaque action key through host-owned SQLite/Slack lineage and attach a
bounded exact inbound handoff. Missing or conflicting identity fails closed;
the design does not grant Gmail search, thread discovery, reply, send, approval,
or work-state authority. Deployment verification is complete; natural packet,
Chief pickup, and email-source outcome validation remain separate.

The next natural brief proved delivery and pickup but also exposed the missing
last mile: three packets woke Chief, while the visible response was an unbound
summary-level note and the packet run recorded its conclusion only privately.
`NC-20260821-001` adds a content-free `posted → picked_up → attempted|failed`
trail plus one threaded attempt receipt. The summary is a Chief-owned echo and
does not start a redundant run. Successfully attempted unchanged fingerprints
are not redispatched daily; unresolved source cases remain visible in the
operator brief. The receipt proves an agent turn, never source resolution or
business action.

### P2.11 Create a unified party and relationship timeline

Expose one evidence-backed timeline for a person/organization:

- identity and aliases;
- roles and relationships;
- inquiries and pipeline stages;
- emails/meetings/bookings;
- proposals and contracts;
- payments/refunds;
- enrollments/engagements;
- course/grading/certification;
- support/escalations;
- consent/preferences;
- open work and next best action.

Every entry must show source and freshness. Agents should never reconstruct
this by ad hoc unions or broad searches.

`NC-20260820-004` is the first source-first context slice under this principle:
WordPress already persisted the page immediately preceding `/contact-us/` but
did not forward it. The bounded repair strips query/fragment data, propagates
the path (or external hostname) through the existing webhook and Inbox handoff,
and lets Sales resolve only an explicit page-relative reference. Missing
context never blocks the inquiry; broad Chaos journey lookup, inferred intent,
commercial authority, and autonomous email remain excluded.

### P2.12 Add process-specific functional closure

For each agent, move from “can perform tasks” to a closed operational loop:

| Domain          | Closure requirement                                                       |
| --------------- | ------------------------------------------------------------------------- |
| Mailman         | every eligible email classified/reconciled or visibly excepted            |
| Inbox           | every qualified inquiry has canonical identity, owner, next step          |
| Sales           | every active opportunity has evidence-backed next action and SLA          |
| Booking         | source and business record reconcile; changes/cancellations handled       |
| Contador        | payment/refund/roster/ledger reconcile with explicit exceptions           |
| Certifier       | eligibility evidence, approval, issuance, delivery, and audit close       |
| Courses         | attendance/recap approval/distribution state is durable                   |
| Grader          | rubric version, evidence, calibration, review, completion are durable     |
| Procurement     | opportunity qualification through submission/outcome is tracked           |
| Newsroom/Social | source, review, rights, approval, publish, performance close              |
| Chief           | exceptions and decisions route to accountable owners and close            |
| Healer          | incident evidence, containment, approval, remediation, verification close |

`NC-20260821-002` begins the next Sales closure milestone with containment and
process authority, not scheduler repair. The live `task-followup-daily` row is
paused after ten consecutive failed completion-contract runs; it must not be
resumed as the replacement. `docs/SALES-FOLLOWUP-OPERATING-MODEL.md` defines
one durable work queue across exact Sales conversations, unsigned proposals,
and overdue receivables while preserving Sales/Contador/relationship-owner
authority. Each case carries canonical identity, current owner, eligibility
reason, last inbound/outbound/action evidence, next eligible business date,
message class, confirmed attempt history, stop/suppression, escalation, and a
terminal outcome. An unchanged daily scan remains the same case and cannot
create a new top-level item. An explicit named-human rejection is terminal:
the exact Sales case is cancelled and its bound pipeline entry must become
canonical `lost` with read-back proof; silence or expiry creates no duplicate
daily card. Exact release `a939af5a` and live, empty, admin-only migration 130
deployed the first default-off, no-send foundation. Exact release `6b9b5f27`
and live migration 131 add content-free rejection semantics while remaining
unwired. Source shadow, backlog disposition, presentation,
drafts, sends, and scheduler activation remain separate gates.

### P2.13 Build management briefs from the ledger

Generate:

- daily: urgent approvals, customer risks, failures, deadlines;
- weekly: funnel, delivery, quality, reliability, costs, learning;
- monthly: business outcomes, automation ROI, control health, capacity, debt;
- quarterly: autonomy review, threat model, restore drill, vendor/dependency
  risk, roadmap decisions.

Briefs must link to evidence and distinguish observation, inference, and
recommendation.

## 13. Governance and ownership

### Roles

Assign named accountability for:

- company OS product owner;
- runtime/architecture owner;
- security and credential owner;
- data/schema/privacy owner;
- each business process;
- each agent and knowledge pack;
- production operations/on-call;
- evaluation/autonomy approval;
- third-party vendor/integration.

One person may hold several roles, but the responsibilities must be explicit.

### Change classes

| Class                            | Examples                                                     | Minimum gate                                                               |
| -------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| C0 read-only                     | query, summarize, diagnose                                   | logging and data access policy                                             |
| C1 internal draft                | draft email/report/proposal                                  | evaluation + human review as needed                                        |
| C2 reversible write              | label, CRM note, task state                                  | policy + idempotency + audit                                               |
| C3 external communication        | send email, publish social                                   | recipient/content guard + approval/autonomy gate                           |
| C4 financial/contractual         | refund, invoice, contract, certificate                       | named-human authorization, limits, cooldown; two-person only when staffed  |
| C5 destructive/identity/security | delete, merge identity, rotate credentials, broad permission | named-human procedure + backup/rollback; independent approval when staffed |

### Decision records

Use short ADRs for:

- runtime major and upgrade cadence;
- host capability gateway;
- work-ledger ownership;
- approval/authorization model;
- network/egress design;
- migration system;
- backup/RPO/RTO;
- evaluation and autonomy policy;
- telemetry/retention;
- failover strategy.

## 14. Delivery roadmap

Effort assumes one primary engineer/operator with AI assistance and is
capacity-based, not a promise of calendar completion. The initial draft's
one-to-two-week Wave 0 was not credible for this staffing model. Re-estimate
after every wave and stop when the next control costs more than the risk it
reduces.

The week/month labels below are retained as historical sizing from the
validated plan. The 2026-08-15 reactivation uses dependency gates, not elapsed
calendar time, and starts from the conservative inventory in section 0.

### Reactivated implementation order

The original R0-R5 dependency model remains useful, but it no longer authorizes
horizontal completion for its own sake. As of 2026-08-21 its disposition is:

| Slice | Current disposition                  | Outcome-lane rule                                                                                        |
| ----- | ------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| R0    | complete                             | Keep the evidence vocabulary and tracked continuity contract.                                            |
| R1    | partial; finish only direct blockers | Add safety/capability controls only when required by the next lane action or autonomy promotion.         |
| R2    | partial; use the existing ledger     | Close missing transition/receipt gaps encountered by a lane; do not expand schemas merely for coverage.  |
| R3    | partial; adapter-on-demand           | Add a trigger/source/skill adapter only for a selected lane and prove replay plus natural ingress.       |
| R4    | active outcome surface               | Use exception pickup/attempt receipts, then finish authoritative source closure and human-hop reduction. |
| R5    | deferred                             | Reconsider deeper/delegated execution only after lane evaluations prove a quality, cost, or SLO need.    |

The immediate ordered work is therefore: complete source context and bounded
reply behavior for inbox-to-resolution; activate the redesigned follow-up
process first in read-only shadow and operator-reviewed disposition; then turn
exception attempts into detector-verified source closure. Additional generic
agents, a general dashboard, broad autonomous sending, and execution-depth
machinery remain deferred.

| Slice                               | Outcome                                                                                                                                | Entry gate                                                                                 | Exit gate                                                                                                                        |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| R0 — rebaseline                     | one current strategic roadmap and conservative evidence inventory (`NC-20260815-007`)                                                  | documentation-only authority                                                               | continuity/diff checks pass; owner can choose the next bounded task from tracked files                                           |
| R1 — finish safety prerequisites    | capability manifests, one action envelope/safe-mode contract, and healer Gate B/C typed-action separation                              | reconcile active overlapping Gmail, release, Procurement, CNPC, grader, and healer tasks   | negative capability tests, mutation/replay tests, safe-mode drill, actions default off, and separately recorded deployment state |
| R2 — prove the work ledger          | Mailman → Sales → approval → Mailman → Gmail receipt is one durable parent work item with transitions, reconciliation, and closure     | R1 final-send/action boundary is accepted; exact pilot schema/design receives its own task | restart/retry/duplicate/blocked/success cases reconcile to one work item and no stage is inferred from agent prose               |
| R3 — normalize triggers and skills  | time, Gmail, webhook, topic, and condition adapters create/resume tasks through one contract; selected procedures are versioned skills | R2 ledger semantics stable enough to receive multiple sources                              | trigger replay/deduplication and skill-version rollback tests pass; trigger, skill, and authority changes remain independent     |
| R4 — operate by exception           | compact exception brief and minimal operator work panel show blocked, stale, waiting-approval, failed, and outcome-missing work        | R2 transition/receipt data is trustworthy and R3 adds source/run identity                  | operator can resolve or route exceptions without reading raw logs or treating a dashboard as process truth                       |
| R5 — evidence-gated execution depth | host-selected deterministic/fast/deep profiles plus durable bounded parent/child tasks                                                 | shared evaluations, cost/latency telemetry, cancellation, and joins are proven             | deeper or delegated execution improves named quality/cost/SLO measures without widening action authority                         |

R1 checkpoint: `NC-20260815-008` made deterministic approved-email incident
replay release-blocking, and `NC-20260815-009` repaired and deployed the
fallback-marker and approval-bound CC execution path as exact release
`12c2b049`. A later natural approved action completed the normal fallback,
Mailman execution, exact Gmail receipt, and one original-thread closure without
manual recovery, closing both tasks' named customer-path gate. Other R1
capability-manifest, universal action-envelope/safe-mode, and healer decisions
remain open; no ledger promotion may bypass them.

R1 control-layer checkpoint: `NC-20260816-002` implements the versioned
content-free envelope and dynamic global/per-system brake. Gmail holds
before its execution claim; Slack denials do not queue; new Courses containers
lose both SMTP secrets and mount; Plutio mutation and Stripe processors deny
before child invocation; aggregate health and focused refusal/mutation/replay
tests exist. `NC-20260816-007` deploys exact release `ab2ace1` and live-verifies
the production transaction: it checks release/drain/channel/queue health,
backs up and atomically arms the global brake, denies all six installed Gmail
send/reply, Slack, Courses SMTP, Plutio, and Stripe calls before every external
client/child/outbox tripwire, restores the exact prior configuration, and
leaves production aggregates unchanged. Action controls are again default-off.
`NC-20260816-008` extends that same final-boundary contract to Hive/Firestore:
the composite classification operation and direct conversation mutations deny
before Firebase initialization, the inline classification stays retryable, the
reaper holds without attempt/dead-letter mutation or alert, and the installed
no-network drill gains a seventh denial. Exact release `d32fda08` is deployed;
the live drill returned seven `global_safe_mode` denials, crossed no tripwire,
restored the exact environment, and left email, job, Hive, Plutio, and Chaos
aggregates unchanged.
`NC-20260816-009` extends the same control to the host Things bridge. The
direct `/add-todo` function denies before fetch in global or Things-only safe
mode, while the existing Slack-facing wrapper returns false so the caller adds
no success reaction. The installed no-network drill now expects an eighth
denial across seven systems and includes an injected Things-fetch tripwire.
Exact release `47019c9` is deployed; the live drill returned all eight
`global_safe_mode` denials, crossed no tripwire, restored the exact environment,
and left email, job, Hive, Plutio, and Chaos aggregates unchanged. No real
Things task or Slack reaction occurred.

Full P0.4/P0.5 still requires domain envelope
adoption, standalone-script and remaining-integration coverage, immediate
in-flight interruption, ceilings, and demotion.

R1 capability checkpoint: `NC-20260816-004` adds strict manifests for all 17
tracked operative groups, generates a path-free permissions matrix, projects
exact Claude/MCP tools plus declared mounts and runtime ceilings when enabled,
constrains recognized host IPC, and fingerprints launches so stale warm or
adopted containers cannot receive another turn. Global enforcement remains off;
`NC-20260816-006` selectively activates Campanero, and `NC-20260816-010`
selectively adds Booking with a credential-family gate. P0.3 therefore remains
partial pending the remaining groups, destination-scoped egress, raw-credential
retirement, action-value/rate limits, and automatic demotion evidence.

R1 staged-activation checkpoint: `NC-20260816-006` adds the missing per-group
rollout selector and narrows Campanero to its authoritative jobs-only tool
surface. This prevents the first canary from implicitly activating every
registered agent or failing on legacy dynamic folders. Combined release
`2987070` is now health-verified in production with only Campanero selected.
The exact live projection contains no Claude tools, only MCP `jobs`, only the
related host operation, and read-only declared mounts; the deployed image
returned the exact live 22-job inventory while Bash and undeclared MCP tools
were absent. Zero-work, email-action, job/task non-interference, and recoverable
release/environment/runner rollback artifacts close this first-agent checkpoint.
Expansion beyond Campanero remained a separate milestone.

R1 second-agent checkpoint: `NC-20260816-010` adds strict business credential
families to all manifests and a final fail-closed stdin allowlist. Exact release
`ba5fe74` is live with only Campanero and Booking selected and global enforcement
off. The installed real-configuration verifier proves Booking receives none of
the three configured Trafft credential names while retaining all required
business DB and Plutio names; it performs no network or database call. Health,
queues, email evidence, and scheduled-task aggregates remained unchanged.
Plutio remains intentionally available for the tracked canceled/rescheduled
procedure until a host-owned replacement receives its own business-path gate.

R1 Booking host-boundary checkpoint: `NC-20260816-011` adds the replacement as
an unwired dark path. Only archived canceled/rescheduled Trafft events can form
an action; the durable outbox stores opaque identity, dispatch re-loads the
archive and derives values host-side, Plutio mutation passes through the common
safety controller, and a stable remote marker supports replay-safe recovery.
The Booking prompt/manifest and Plutio projection remain unchanged. Promotion
is separate and requires the shared flattened reschedule-identity repair, a
natural business-path canary, and empirical proof that Plutio preserves the
marker before the container credential/mount is removed.
Exact release `63ed4aa` is live with this path still dark. The installed
injected canary proves first-pass/replay/denial logic without DB, child, or
network calls, while live email/task/Plutio aggregates and selective capability
configuration remain unchanged. That closes the dark foundation checkpoint;
it does not close the promotion, raw-secret removal, or outcome gate.

R1 Booking marker-gate result: `NC-20260816-012` makes the shared Trafft
extractor recognize the archived flattened reschedule-start field, removes the
adapter-only identity workaround, and packages a dry-run-first installed
canary bound to the exact hostname and full immutable release. The canary may
upsert only one stable synthetic Plutio person, append its marker only when
absent, require exactly one marker on readback, and hard-block the replay
activity writer. Local exact-runtime, focused, broad, email-critical, runner,
type, format, release, install, and activation gates pass in exact release
`ed957d3`. The bounded real first pass retained one synthetic person/activity,
but Plutio removed the HTML-comment digest while preserving visible activity
text. Readback found zero markers and stopped before replay or a second write.
This is a negative empirical result, not promotion evidence. The owner has now
authorized one corrective entry, and the locally verified replacement emits
visible text-only `[nanoclaw-booking:<sha256>]`. Exact release `13ca192` is now
live; the correction read back exactly one marker and immediate replay returned
`already_recorded` without calling the activity writer. Health and all named
NanoClaw aggregates remained stable. At the NC-012 boundary this closed the
marker prerequisite, not promotion, and assigned natural ingress, durable
outbox receipt, procedure/manifest cutover, and container Plutio removal to the
separate NC-013 milestone. The current NC-013 state follows.

R1 Booking cutover deployment: `NC-20260816-013` wires both the initial
receiver and inbox reaper to the durable host adapter, but only after a
successful container result and an exact lifecycle interaction whose
archive-derived key, appointment, and event type all match. This corrects the
pre-existing behavior that marked returned container errors handled and avoids
the older appointment-only dedup collision with the original booking. The
Booking prompt/procedure, manifest, generated matrix, registration source, and
side-effect-free verifier now remove direct Plutio credentials and mounts
together. A dry-run-first registration helper provides exact-host/release
confirmation and rollback snapshots. Initial release `77064e9` passed fresh
bundle verification plus a separate disposable operational-root
remove/idempotency/restore rehearsal, then activated on the Mini after a clean
Booking drain and an exact two-mount registration transaction. Prompt,
registration, and LaunchAgent rollback artifacts are preserved. One healthy
Node 22.23.2 listener reports the exact verified release, and installed
negative proof shows only `business_db`, `knowledge`, and `agent_docs`, with
all configured Trafft/Plutio source names and legacy mounts absent.

The later authorized normal-ingress canary created the expected archived event,
synthetic party, lifecycle interaction, durable party/activity work, and remote
activity, but it exposed three release-boundary failures instead of being
papered over as a pass: scheduled tasks stayed warm after emitting success and
caused one retry/two Booking notices; the post-write PostgreSQL metadata query
needed an explicit text cast; and the 15-minute Plutio launcher executed the
dirty operational checkout rather than immutable release code. The host gate
was recovered against exact persisted state to stop further agent retries.
Release `67f16d5` fixed the runner and cast and rebuilt/refreshed the production
runner boundary. Release `02ce48f` added the compiled reaper CLI, bundled the
Plutio launcher, and made that launcher verify and execute launchd's release
and Node selections; exact active release `999f2a4` preserves those controls.
The controlled activity-row retry read
the existing marker as `already_recorded`, persisted all opaque receipts and
interaction metadata, and emptied the queue without a second remote activity.
The authorized duplicate webhook returned HTTP 200 with stable counts. R1's
capability and replay controls are therefore live-verified; because the first
normal event required recovery, one fresh post-fix natural lifecycle remains
the outcome gate before claiming the slice fully complete.

R2 foundation checkpoint: `NC-20260815-010` defines the exact
Mailman/Sales pilot contract and implements host-only typed transitions plus
PostgreSQL migration 118. The schema excludes raw customer content,
the existing SQLite approved-email action ledger remains execution authority,
and no agent receives access. `NC-20260816-001` implements the next bounded
step: a default-off, fail-open host observer that projects only exact action and
receipt facts. Migration 118 and immutable release `55c97d5` are live-verified:
four eligible actions reconcile as three complete outcomes plus one named
source gap, and the next cycle is duplicate-only. This completes the first R2
shadow-proof milestone, not R2 as a whole; workflow dependency/promotion and a
second pilot process remain separate gates. `NC-20260816-014` adds the next R2
evidence surface: a bounded read-only report that reconciles item, event, and
receipt structure and classifies waiting, blocked, failed, stale, source-gap,
deadline, and outcome-missing work. `NC-20260816-015` deploys it and proves one
full production read with unchanged ledger/email fingerprints. It is not
daemon-wired, supplies no resolution action, and does not bypass the R3 trigger
or R4 operator-workflow gates.

R2 second-pilot local checkpoint: `NC-20260816-016` selects Campanero host-job
runs because the role is already constrained to the jobs-only host boundary.
Migration 119 widens the ledger under workflow-specific identity checks, and
an injected projector maps one immutable SQLite `job_run_logs.id` through
accepted, execution-started, exact successful outcome or exact failed-run
receipt. The type excludes output/error/log/script/environment content and the
projector is not imported by the daemon. The migration is not applied, the
existing report remains `sales_email`-only, and no job/schedule/Campanero or
production state changes. Production schema, bounded observation/parity,
multi-workflow reporting, trigger normalization, and authority remain separate
gates.

R2 second-pilot activation complete: `NC-20260816-017` applies migration 119
and deploys the read-only SQLite source reader, exact-confirmation fixed-window
CLI, and workflow-specific report in release `999f2a4`. One closed five-run
window produced 5 items/15 events/5 receipts, replay was duplicate-only, the
job report had zero exceptions, and source/job/task/email parity held. The CLI
remains unscheduled/default-off. Recurring briefs, acknowledgment/resolution,
trigger normalization, and workflow promotion are later gates.

R3 trigger-contract dark checkpoint: `NC-20260817-001` defines one strict,
content-free occurrence envelope for time/schedule, Gmail, webhook, topic, and
business-condition sources. Versioned definition, occurrence, and semantic
hashes make exact delivery replay duplicate-only and same-identity fact drift a
hard conflict. Migration 121 adds one admin-only append-only table;
the injected host store performs no task, work-ledger, skill, capability,
approval, or action mutation. Disposable PostgreSQL proves all five kinds,
exact replay, conflict refusal, append-only enforcement, zero non-admin grants,
populated rollback refusal, and empty rollback. NC-002 subsequently applied the
schema for one bounded source; other adapters, watermarks, inventory, task
wiring, and authority promotion remain later R3 gates.

R3 first-adapter activation: exact release `baed66d` under `NC-20260817-002`
deploys a default-off,
fail-isolated observer after the existing SQLite scheduled-task claim. One
exact task ID and intended boundary are configured through a release-bound,
redacted, backup-producing transaction; only hashed schedule facts reach the
admin-only trigger store. After drained migration/dark deployment, one natural
`2026-08-17T14:00:00.000Z` claim inserted exactly once and exact replay was
duplicate-only. Configuration was expired back to disabled with 1 matched/1
applied/0 failures retained in health. Ambient Sales-email shadow and existing
exception-loop changes were separately attributable; the trigger path created
no task, work transition, message, or action. Other source families, recurring
definitions, watermarks, loss recovery, and authority promotion remain open.

R3 source-inventory/watermark dark checkpoint: `NC-20260817-003` adds migration
122 plus an unwired typed host store. Immutable source
definitions bind adapter version, cursor/recovery mode, freshness/window
budgets, owner, and alert route without an enable or authority field. Versioned
cursor state advances only across monotonic, completely accounted ranges;
append-only gap events freeze the old cursor, and only exact-gap reconciliation
can resume. Focused tests and disposable PostgreSQL prove exact replay,
changed-fact/stale-version/regression refusal, gap freeze/reconciliation,
append-only enforcement, guarded rollback, and zero agent grants.
`NC-20260817-004` applies the migration and deploys exact release `070cde38`
dark after a drained backup/activation sequence. The live source, event, and
state tables remain empty and admin-only; no runtime imports the store. Gmail's
existing history-expiry loss window remains open pending a source-specific
adapter gate.

R3 inbound-Gmail reconciliation dark checkpoint: `NC-20260817-005` adds a
pure, injected proposal layer for the inbound push source only. A history 404
maps to a content-free gap proposal that preserves the prior cursor. A
reconciliation proposal requires an unfiltered, Spam/Trash-inclusive full
mailbox snapshot to reach a terminal page inside 20 pages, exact durable
accepted/rejected evidence for every unique message ID, a stable before/after
profile history head, and fixed age/freshness budgets. Synthetic tests cover
success, deterministic replay, and fail-closed head, pagination, candidate,
accounting, source, age, and freshness cases. The module does not call Gmail,
register/bootstrap a source, write a watermark, change the current 404 reset,
or cover label correction. Current rejection evidence and mailbox-size handling
remain explicit activation blockers.

R3 inbound-Gmail resumable-shadow checkpoint: `NC-20260817-006` adds the
unwired exact Google profile/list wrapper and migration 123's admin-only
snapshot/page/candidate target. The wrapper omits query and label filters,
includes Spam/Trash, returns IDs only, and exposes no message read or write
method. The shadow advances at most 20 pages per invocation, retains one opaque
active continuation token plus append-only token hashes and per-ID
accepted/rejected receipts, rechecks the profile head before every resume and
after terminal listing, and reuses NC-005's final proof. Disposable PostgreSQL
completes 10,001 candidates across 21 pages, returns replay-stable completion,
enforces append-only receipts and admin-only grants, refuses populated
rollback, and permits empty rollback. `NC-20260817-013` applies that exact
migration dark after a natural drain and verified mode-0600 backup. All three
production tables are empty/admin-only, with the expected constraints, six
indexes, and two append-only triggers. No production source, Gmail call,
cursor, 404 path, recovery, task, or action is changed. Real production shadow
observation is still an activation blocker.

R3 inbound-Gmail disposition checkpoint: `NC-20260817-008` adds the
real-ingestion accounting producer/reader required by the shadow. Every current
ordinary acceptance or deterministic rejection receives one immutable,
content-free SQLite receipt; exact replay converges and changed replay
conflicts. The push cursor stays fixed if any enumerated candidate is
unaccounted, and a non-terminal page 20 fails before processing. Exact durable
ordinary inbound rows bridge receipt-write splits across restart; direct-route
staging rows also require the exact routed marker. Neither uses the in-memory
cache as evidence, and outbound rows cannot bridge. `NC-20260817-009` hardens
cursorless scans around 36 verified unresolved legacy staging rows and deploys
exact release `263ac7c4` after a WAL-safe SQLite backup. The additive table and
two append-only triggers, service, channels, queues, and non-interference are
live-verified. The first safety poll returned zero Gmail candidates, so no
receipt was naturally created in the initial window. Later natural proof closes
the checkpoint with 18 unique receipts: three ordinary inbound persists, ten
rule auto-archives, and five own-outbound rejections. The current process has
67 successful push/safety cycles with zero receipt, processing, or cursor-hold
failures. The current 404 reset, migration 123, reconciliation source/runtime,
tasks, messages, and action authority remain unchanged.

R3 retained-host coverage checkpoint: `NC-20260817-010` adds a
default-off, explicitly bounded audit over the union of current terminal
receipts and exact SQLite Gmail-channel IDs. SQLite is opened read-only and
selects no content/address fields; direct-route evidence comes from an
always-rolled-back PostgreSQL read-only transaction and requires exactly one
routed `rules-runner-v1` row. The audit double-reads both sources, refuses
duplicates, contradictions, drift, and truncation, and emits only aggregate
terminal/recoverable/unresolved categories plus fingerprints. It prints
`mailboxComplete=false` and `gmailQueried=false`: IDs retained only by Gmail
remain outside this gate. Production aggregate proof accounts for 3,041
retained IDs as 23 terminal receipts, 1,675 recoverable IDs, and 1,343 unknown
IDs with an identical pre/post protected-state fingerprint. No receipt, cursor,
source, shadow, task, message, or action authority changed.

R3 inbound-Gmail dark-schema checkpoint: `NC-20260817-013` drains ordinary
work naturally, validates a recoverable PostgreSQL backup, and applies only
release-bound migration 123. The live snapshot/page/candidate tables are
empty, owned by `nanoclaw_admin`, and have zero non-admin grants. Protected
work/source/classification state is unchanged; the daemon and exact release
remain live without restart. Source registration/bootstrap and every live
Gmail shadow or recovery behavior remain later gates.

R3 inbound-Gmail source-bootstrap checkpoint: `NC-20260818-001` adds and
separately invoked host CLI for exactly `mailbox:primary:inbound-v1`. It opens
SQLite read-only/query-only, accepts a SHA-256 cursor fingerprint instead of a
raw cursor argument, checks a fresh canonical observation and cursor stability
before/inside/after the transaction, and atomically registers the immutable
source plus one zero-count bootstrap event. Real SQLite dry-run proof is byte-
stable and content-redacted; disposable PostgreSQL 16.15 proves drift rollback,
one source/event/version-1 state, and duplicate-only replay. Production then
installs exact candidate `1b70de94` without daemon activation, validates a
complete unfiltered affected-schema backup, and records exactly that 1/1/1
state with duplicate-only replay. SQLite remains query-only, shadow counts stay
0/0/0, and protected work/service evidence is unchanged. Live shadow, Gmail
reads, 404 recovery, and cursor authority remain separate gates.

R3 inbound-Gmail runtime-freeze checkpoint: `NC-20260818-003` adds a
default-freeze candidate plus a task-bound one-shot alignment CLI after live
preflight found SQLite ahead of the bootstrapped Company OS watermark. The CLI
walks only chronological `messageAdded` history, filters at the fixed SQLite
target, requires every in-range ID to have an immutable accepted/rejected
receipt, and records one generic advance only while SQLite remains query-only
and exact inside the transaction. Active runtime preflights both authorities,
records generic normal advances before SQLite, allows exact one-step SQLite
catch-up after a committed split, and durably freezes the prior cursor on a
natural 404. Focused tests and disposable PostgreSQL prove drift refusal,
crash catch-up, one gap, and blocked advancement while open. Deployment,
natural-404 evidence, reconciliation, and label-poll recovery remain separate.

R4 first operator-loop checkpoint: exact release `a2e6d35` activates
`NC-20260816-018` with live migration 120, an additive host-only
case/brief/event ledger, and recurring Chief-channel delivery over
both proven sources. It claims before posting, refuses incomplete reports and
ambiguous retries, accepts only an exact check reaction from a configured Slack
UID, and keeps acknowledgment separate from source-derived resolution.
Disposable PostgreSQL proves daily deduplication, append-only history,
reopened-occurrence isolation, exact acknowledgment, and no source-ledger
cardinality change. Production has one owner-confirmed operator; the first
bounded run opened three reason cases and durably posted one naturally sourced
brief with zero source-work/email/job/task/channel-definition side effects.
The named check-reaction and threaded receipt are now live-verified with all
protected source fingerprints unchanged. Later natural source resolution
remains governed by the task evidence; routing/resolution action and a general
work panel are not part of this checkpoint.

R4 detector-to-remediation checkpoint: `NC-20260820-002` implements and deploys
`OPS-003` for the deterministic program-facts detector. It does not listen to
or scrape the Sales Slack warning. One exact scheduled run instead atomically
records a normalized `business_condition` occurrence, ensures one stable
`program_facts_drift` work item, appends content-minimized evidence, and routes
drift as `fact_authority:owner_review_required`. The existing report and Chief
loop therefore picks the source exception up on its next complete tick.
Unchanged findings are deduplicated, changed evidence re-alerts, a clean rerun
is the only completion receipt, and recurrence reopens the same item. Exact
release `8344524c`, migration 125, active mode, and the compiled 08:00 CT job
are live. A direct canary created item 21, one Sales alert, the owner-review
case, and Chief brief 10; a subsequent Campanero scheduler run added observation
2 without duplicate alerting. No automatic fact, knowledge, product, website,
email, or source correction is authorized. Owner source correction followed by
an exact clean scheduled receipt remains the R4 closure milestone.

Each slice receives one or more separate `NC-YYYYMMDD-NNN` tasks only when work
starts. Do not reserve future IDs, combine these slices into one implementation
branch, or let R3-R5 bypass unfinished R1/R2 controls.

### Wave 0: containment and proof (week 1–6)

One primary engineer/operator, sequentially. Each week must reach its exit gate
before the next begins.

**Week 1 — close the outbound-email and healer holes.**

- group-scope every `gmail_*` operation and quarantine denials;
- host-resolve the party and fail closed for unknown To/CC recipients;
- apply recipient validation and test routing to replies;
- restrict thread/message/search access to host-issued work resources;
- ship `HEALER_IMPLEMENT_ENABLED=0` in the tracked template and read-only check
  the live Mac Mini unit.

Exit gate: an unauthorized `gmail_send` is quarantined; an unknown reply CC is
blocked; test mode redirects send and reply; healer implementation is off in
tracked and installed configuration. `NC-20260729-004` has satisfied the
technical denial/restart-grant and healer gates in production. A genuine or
test-routed success remains outcome verification, not a reason to weaken the
controls.

**Week 2 — brakes and build integrity.**

- global external-write safe mode at every named boundary, plus recipient,
  volume, money, retry, and time-window ceilings;
- suspend L2 in code/service configuration and verify from the running daemon;
- contain skill-PR execution, remove `eval`, minimize workflow permissions, and
  eliminate expression interpolation inside `run:`;
- enforce one Node LTS major across engines, CI, startup, launchd, build, and
  developer workflow;
- keep sync-conflict copies out of the build graph and either ship or remove the
  missing repository-hygiene job.

Exit gate: a recorded safe-mode drill; full suite green under one enforced
major; no conflict copies in the build; every tracked scheduled unit has an
executable target and visible last-exit status.

**Week 3 — bind approval to execution.**

- store the approved normalized recipient, thread/work-item identity, and body
  hash in the existing pending-send record;
- refuse replay, stale, superseded, wrong-thread, wrong-user, and post-approval
  mutation.

Exit gate: the 2026-07-23 regeneration incident replay fails closed.

**Week 4 — make learning reviewable.**

- write self-authored lessons to quarantine;
- require explicit promotion into the operative mounted artifact;
- carry provenance/review/contested state consistently to agent and shared
  copies;
- correct messages and headers that currently claim stronger review than the
  implementation provides.

Exit gate: a self-authored lesson is invisible to every agent until promoted.

**Week 5 — stop silent loss.**

- populate `source_thread_id` on inbound classification;
- perform bounded reconciliation after Gmail history expiry and alert on
  watermark age;
- inventory recurring execution with an executability probe, last run, and last
  exit—not ownership alone.

Exit gate: forced history expiry produces a measured, recovered gap, and the
execution inventory detects a deliberately broken unit.

**Week 6 — one ledger pilot and one evaluation pack.**

- implement Mailman → Sales → Mailman work items by reusing the proven
  `webhook_inbox`/watermark/reaper shape;
- add correlation IDs and one compact daily exception brief;
- transcribe the seven documented incidents plus direct/indirect
  prompt-injection cases into the first evaluation pack. `NC-20260815-008`
  supplies the deterministic approved-email subset; prompt-injection and
  blinded response-quality cases remain.

Exit gate: deliberately reverting a Week-1 guard makes the pack fail.

No new autonomous writes during Wave 0. The earlier “move one recurring send
path behind a host adapter” item returns to Wave 1: Weeks 1–2 close its immediate
email risk more cheaply. If Node 24 passes the same native/deployment suite,
leadership may select it instead of Node 22; the exit gate is one enforced LTS
line.

### Wave 1: authority and reproducibility (week 7–12)

| Deliverable                                          | Priority | Exit gate                                             |
| ---------------------------------------------------- | -------- | ----------------------------------------------------- |
| per-agent capability manifests                       | P0       | generated tools/mounts/policy; negative tests         |
| host action gateway for highest-risk credentials     | P0       | Stripe/Plutio/Gmail send path has no raw agent secret |
| unforgeable approval objects/cards                   | P0       | replay/mutation/wrong-user tests pass                 |
| migration chain + ephemeral PostgreSQL CI            | P1       | fresh DB reaches current schema automatically         |
| safe integration-test harness                        | P1       | key workflows run without real side effects           |
| secret/dependency controls; justified image scanning | P0/P1    | findings have owners and remediation SLAs             |

### Wave 2: durable operations (month 4–6)

| Deliverable                                          | Priority | Exit gate                                                     |
| ---------------------------------------------------- | -------- | ------------------------------------------------------------- |
| work ledger and transition history for two workflows | P1       | process state is durable and source facts reconcile           |
| scheduler/run consolidation                          | P1       | duplicates and missed runs are observable/replayable          |
| SLOs and daily exception brief                       | P1       | 30-day baseline and alert thresholds                          |
| Gmail/source reconciliation                          | P1       | history-expiry gap is bounded and recoverable                 |
| encrypted backups + first restore drill              | P1       | measured RPO/RTO and corrective actions                       |
| shared agent evaluation harness                      | P1       | Mailman and Sales catch a known incident/injection regression |

### Wave 3: quality, scale, and business closure (month 7–12)

| Deliverable                                | Priority | Exit gate                                                           |
| ------------------------------------------ | -------- | ------------------------------------------------------------------- |
| minimum decision-envelope versioning       | P1       | high-impact actions can be reproduced/explained                     |
| risk-adjusted autonomy model               | P1       | promotions use sampled outcome evidence                             |
| exception inbox with party/work drill-down | P2       | operators manage blocked work and inspect its evidence in one place |
| queue priorities and capacity tuning       | P2       | customer SLO met under batch load                                   |
| context/cost optimization                  | P2       | lower cost without eval regression                                  |
| selective modular-monolith decomposition   | P2       | extract only where current work is blocked by file boundaries       |

### Wave 4: continuity and strategic leverage (after month 12, evidence-gated)

- tested warm-spare/failover only if cold restore cannot meet approved RTO;
- complete privacy/retention workflows;
- quarterly autonomous-control certification;
- extend business KPI/ROI only after one process has a stable baseline;
- extend the exception interface only when its observed volume justifies it;
- model/provider resilience only after tool-use evaluations show parity;
- retire duplicated state, dead integrations, and superseded documentation.

## 15. Measurement system

### Safety

- unauthorized action attempts;
- approval replay/mutation failures;
- guard/policy block rate;
- credential exposure tests;
- secret age and rotation compliance;
- prompt-injection evaluation pass rate;
- autonomy demotions and severe incidents.

### Reliability

- availability and dependency readiness;
- accepted versus completed work;
- duplicate and lost-event rate;
- queue and completion percentiles;
- retry/dead-letter/stale work;
- restore success and measured RPO/RTO;
- deployment rollback rate.

### Quality

- eval pass rate by agent/version;
- human correction and sampled defect rate;
- factual contradiction rate;
- wrong-recipient/thread/entity rate;
- downstream reversal/complaint rate;
- calibration agreement for grader/judgment workflows.

### Performance and cost

- container memory/CPU high water;
- cold/warm start;
- model/tool/database latency;
- tokens and paid fallback;
- cost per completed work item;
- operator minutes per item;
- rework and exception handling time.

### Business value

Use the chain:

```text
investment → adoption → process behavior → delivery/quality
           → customer/business outcome → economic value
```

Do not call correlation causal proof. Use baselines, comparison cohorts where
possible, change logs, seasonality controls, and qualitative validation.

Examples:

- lead response time → qualified-call rate → proposal/conversion;
- payment reconciliation time → unresolved exceptions → cash accuracy;
- grading turnaround → learner completion → certification;
- inbox automation → human time saved without missed/incorrect routing;
- proposal follow-up → reply/conversion versus appropriate comparison;
- unified Sales/Plutio follow-up → eligible work completed, repeat-no-op rate,
  reply/signature/payment outcomes, and overdue exposure by policy class;
- incident detection → time to containment and recurrence.

## 16. Risk register

| Risk                                                                      | Current severity               | Main treatment                                                                         |
| ------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| any container can invoke mailbox read/send operations                     | critical at validated baseline | host operation matrix, resource grants, quarantine, negative tests (`NC-20260729-004`) |
| recipient/CC/thread policy can be selected or bypassed by model fields    | critical at validated baseline | host-resolved party, fail-closed final guard, assigned-resource checks                 |
| prompt injection uses raw credentials                                     | critical                       | host capability gateway + egress policy                                                |
| every agent VM can reach the Procurement CDP bridge if live               | critical                       | isolated network/binding or retire bridge                                              |
| healer implements against the operational checkout                        | critical if live-enabled       | tracked default off; verify live unit; disposable worktree                             |
| unrestricted agent egress enables exfiltration                            | critical                       | default-deny egress + destination/action policy                                        |
| forged/misleading approval                                                | critical                       | host-rendered hashed action + nonce                                                    |
| wrong recipient/thread/entity                                             | critical                       | final-boundary guards + canonical IDs + tests                                          |
| local-host loss                                                           | high                           | RPO/RTO, encrypted backups, restore drills                                             |
| runtime/CI mismatch                                                       | high                           | one enforced LTS contract                                                              |
| skill/workflow supply-chain compromise                                    | high                           | remove `eval`, pin actions, least permissions, review                                  |
| invalid machine-level Claude deny rules                                   | high                           | migrate to supported matcher and test denied paths                                     |
| silent work loss/duplicate                                                | high                           | durable work ledger + reconciliation                                                   |
| Gmail history expiry creates an unmeasured gap                            | high                           | bounded reconciliation + watermark-age alert                                           |
| autonomy/risk controls depend on model tags or unloaded environment knobs | high                           | host-derived class; typed effective config; live-state test                            |
| split canonical identity or schema drift                                  | high                           | finish identity invariants, migrations, drift gate                                     |
| knowledge poisoning/fact drift                                            | high                           | provenance, review, eval, scoped packs                                                 |
| runaway loop/cost                                                         | high                           | volume budgets, loop detector, circuit breaker                                         |
| solo-operator approval/alert fatigue                                      | high                           | action ceilings, batching, attention SLO, fewer gates                                  |
| Apple Container breaking upgrade                                          | medium-high                    | version pin + compatibility smoke                                                      |
| Mac Mini capacity starvation                                              | medium-high                    | queue classes + right-sizing                                                           |
| stale documentation causes unsafe action                                  | medium-high                    | status headers + generated references                                                  |
| privacy over-retention                                                    | medium-high                    | inventory, retention, deletion, access logs                                            |
| over-automation without value                                             | medium                         | causal measurement chain and stage gates                                               |

## 17. Ordered implementation-ticket backlog

The numbering is a stable planning key, not an `ACTIVE-WORK` task ID. The
section-0 inventory is the current status authority for the roadmap; the older
2026-07-29 checkpoint below is retained because it explains the ordering and
the containment work already attempted.

Implementation checkpoint (2026-07-29):

- `TEST-001` is implemented by `NC-20260728-005`: the pinned Node 22 root
  baseline is green at 124 files / 1,595 tests.
- `OPS-001` is partially implemented: `.nvmrc`, CI, shared instructions, and
  validation use Node 22; startup/launchd enforcement and a future Node 24
  decision remain.
- `DATA-001` is partially implemented: the ordered PostgreSQL migration source
  is now portable and tracked; a schema-version table, fresh-database CI, and
  completion of canonical-identity invariants remain.
- The Claude/Codex continuity controls are implemented by
  `NC-20260723-002`/`NC-20260728-004`; they improve delivery governance but do
  not imply that the security, disaster-recovery, telemetry, or autonomy
  tickets below are complete.
- `SEC-011`/`SEC-012` are implemented, validated, committed, and deployed by
  `NC-20260729-004`. Live denial and restart-grant canaries passed; the task
  remains `deployed_unverified` until an explicitly approved real or
  test-routed success path is observed.

1. `SEC-011` — authorize `gmail_*` by source group and host-assigned resource;
   quarantine denials and add negative tests.
2. `SEC-012` — host-resolve party/recipient, fail closed, validate reply CC,
   and apply test routing to replies.
3. `SEC-013` — tracked and installed healer implementation defaults are now
   off; next move any future implementation into a disposable worktree before
   considering re-enablement.
4. `SEC-007` — approved email now binds a host action ID, normalized recipient,
   work/thread identity, exact subject/body hash, execution stages, and Gmail
   receipt (`NC-20260802-009`). Complete the remaining named-operator, nonce,
   expiry, displayed-card authorization binding, and typed-listener/proposal
   convergence recorded in `NC-20260802-010` before calling SEC-007 closed
   across the Company OS.
5. `SEC-004` — named first-drill boundary complete under `NC-20260816-007` for
   Gmail send/reply, Slack, Courses SMTP projection, Plutio, and Stripe;
   `NC-20260816-008` deploys and live-verifies Hive/Firestore refusal with
   retry-preserving hold semantics.
   Continue through Things, Chaos, container-exposed writes, and standalone
   tools before calling the controller universal.
6. `SEC-009` — isolate or retire the shared-gateway Procurement CDP bridge.
7. `CICD-002` — contain skill-PR execution and remove shell `eval`.
8. `OPS-001` — enforce one selected LTS runtime in CI, startup, launchd, and
   documentation.
9. `TEST-001` — preserve the green root baseline and isolate temporary test directories.
10. `SEC-002` — generate complete secret-to-consumer inventory without values.
11. `SEC-008` — move one highest-risk raw credential behind a host adapter and
    prove cutover, rollback, and rotation.
12. `SEC-010` — implement default-deny egress for one pilot agent, then expand.
13. `CICD-001` — run CI on protected `main`, pin Actions SHAs, and declare
    minimum workflow permissions.
14. `DR-001` — backup inventory, approved RPO/RTO, and one isolated restore
    drill.
15. `DATA-001` — ordered PostgreSQL migration baseline, canonical-identity
    invariants, and schema version table.
16. `DATA-002` — fresh PostgreSQL migration and FK-introspection tests in CI.
17. `SEC-005`/`SEC-006` — generate per-agent tool, mount, action, and network
    policy from one manifest after the interim Gmail matrix is proven.
18. `REL-002` — implement work-item transitions and source reconciliation for
    Mailman and Sales only. `NC-20260815-010` implements the state/receipt/schema
    foundation; `NC-20260816-001` applies the production schema and completes
    the bounded shadow evidence with three outcomes, one explicit source gap,
    and duplicate-only replay; `NC-20260816-014` adds the bounded integrity and
    exception report; and `NC-20260816-015` deploys it and verifies one full
    production read without state change. Any authority promotion remains an
    explicit, separate boundary.
19. `REL-001` — inventory schedules and probe target existence, last run, and
    last exit status.
20. `EVAL-001` — incident/injection regression pack for Mailman and Sales.
    `NC-20260815-008` implements the deterministic approved-email incident
    subset and makes it release-blocking; injection, blinded model quality, and
    natural-path outcome evidence remain open.
21. `DATA-003` — add and validate the PostgreSQL expression index for exact
    `interactions.metadata->>'thread_id'` authorization lookups.
22. `SEC-014` — replace group-global Gmail resource sets with a durable,
    bounded, work-item-scoped grant ledger and explicit revocation.
23. `OBS-003` — define quarantine metrics, alert thresholds, retention, and an
    operator review/replay runbook.
24. `REL-003` — define one normalized trigger contract for time, Gmail,
    webhook, topic, and business-condition sources; make schedules a trigger
    subtype and require replay/deduplication evidence. `NC-20260817-001` adds
    the dark contract, durable store, and synthetic five-family replay/conflict
    proof. Exact release `baed66d` under `NC-20260817-002` applies the store and
    live-proves one default-off scheduled-task boundary plus duplicate-only
    replay, then expires config. `NC-20260817-003` adds the dark
    inventory/watermark target with fail-closed gap semantics;
    `NC-20260817-004` applies and deploys that empty admin-only schema without
    runtime wiring. `NC-20260817-005` adds the local proposal-only inbound-Gmail
    full-snapshot contract. `NC-20260817-006` adds the exact read-only wrapper
    and unapplied resumable shadow target, with synthetic/disposable proof past
    10,000 candidates, but performs no live read, registration, bootstrap,
    cursor write, or recovery. NC-008/009 add and live-prove durable current-
    ingestion rejection accounting; NC-013 applies migration 123 dark; and
    NC-20260818-001 registers/bootstraps one inbound source with exact replay;
    NC-20260818-002 live-proves the gap-independent mailbox audit; and
    NC-20260818-003 adds the exact alignment plus crash-safe normal-advance/404-
    freeze candidate. Deployment/natural-404 proof, full recovery,
    label-poll recovery, recurring definitions,
    other adapters, and task create/resume wiring remain separately gated.
25. `CAP-001` — define versioned skill packages with declared inputs, outputs,
    context, capability dependencies, compatible execution profiles,
    evaluation pack, owner, and rollback; skill selection never grants an
    action.
26. `REL-004` — add durable parent/child task relationships, budgets,
    deadlines, cancellation, and join semantics before using subagents for
    unattended company work.
27. `OPS-002` — let the host select deterministic, fast, or deep execution
    profiles from task class and evaluation evidence; prompts cannot raise
    their own model, budget, tools, or action authority.
28. `UX-001` — build the smallest ledger-backed exception brief/work panel for
    waiting approval, blocked, stale, failed, dead-letter, and
    outcome-unvalidated work; retain source-system links and receipts.
    `NC-20260816-014` implements the read-only Mailman/Sales brief and
    `NC-20260816-015` deploys/live-verifies one bounded invocation.
    exact release `a2e6d35` activates `NC-20260816-018` with recurring Chief
    delivery, exact named-operator attention acknowledgment, and source-derived
    case resolution for both proven pilots. One natural brief, exact named
    acknowledgment, and threaded receipt are durably verified.
    Exact release `bab154cb` deploys `NC-20260820-003` source-bound Chief work
    packets and exact Sales-email hydration without Gmail search; natural packet
    and Chief-pickup proof remain pending. Later source resolution, dead-letter and wider-process coverage,
    operator routing/resolution actions, and any volume-justified work panel
    remain open.
29. `REL-005` — make the host-generated approved-email fallback conform to
    Mailman's executable marker contract, and bind every operator-visible
    recipient header, including CC, into the immutable action before execution.
    `NC-20260815-009` implements and deploys the runtime/regression slice as
    exact release `12c2b049`; a later natural approved action completed the
    normal fallback, Mailman execution, exact Gmail receipt, and original-thread
    closure without manual recovery.
30. `OPS-003` — convert deterministic detector findings from notify-only
    messages into durable source work that the common exception loop can pick
    up, deduplicate, route, and resolve from exact source evidence rather than
    Slack text. `NC-20260820-002` implements and deploys the first
    `program_facts_drift` slice with replay, changed-finding, clean-close, and
    recurrence semantics. Exact release `8344524c`, migration 125, active mode,
    a live drift item/Chief brief, and a real Campanero scheduler replay are
    proven. Owner source correction, clean-rerun closure, the next natural
    08:00 CT observation, and broader detector coverage remain separately
    gated.

Deferred until evidence requires them: broader process catalog, general UI,
full party timeline, per-process ROI program, broad privacy automation, and
file decomposition not blocking a current change. `SEC-001`, `OBS-001`, and
the minimum data-class/retention decision remain required supporting work but
do not displace the ordered implementation backlog above.

## 18. Decisions required from leadership

1. Which actions must remain permanently human-authorized?
2. What dollar, recipient, and publication limits require an independent second
   approver, and who can actually fill that role?
3. What are acceptable RPO and RTO for customer, financial, and operational
   data?
4. Which data classes have legal/contractual retention requirements?
5. Is the Mac Mini allowed to remain the production single host after restore
   controls, or is warm failover required?
6. Should the immediate enforced LTS line be Node 22 or Node 24 after the same
   native and deployment compatibility suite?
7. Should Mailman and Sales be the first two work-ledger conversions, or does
   current incident/business evidence identify a riskier pair?
8. What sampled defect/complaint threshold blocks autonomy promotion?
9. What monthly spend or cost-per-item requires automatic throttling?
10. Who owns the company OS, security, data, and each business process?
11. Is fast-healer implementation intentionally live anywhere before
    disposable-worktree isolation?
12. Does the Procurement Bonfire browser path justify an isolated network, or
    should the path be retired?
13. Which named Slack user IDs may authorize C3+ execution?
14. Will the courses SMTP bypass be retired behind the host Gmail capability,
    or explicitly accepted with independent policy and ceilings?
15. Is any silent Gmail ingestion gap acceptable, or is bounded reconciliation
    mandatory?

### Working defaults adopted for the containment program

Pending a later explicit reversal, `NC-20260729-004` and subsequent planning use
these conservative defaults:

- this document is the single Company OS strategy; adjacent architecture ideas
  are reconciled here and implemented as separately gated tasks;
- Task, Trigger (including Schedule), Skill, Action Envelope, and Receipt are
  separate contracts. A prompt, trigger, or installed skill grants no external
  write authority;
- Mailman → Sales → approval → Mailman → Gmail receipt remains the first
  shared-work-ledger pilot unless a newer incident supplies a documented,
  higher-risk replacement;
- execution profiles and durable parent/child agent work wait for shared
  evaluation, cost/latency telemetry, cancellation, and join evidence;
- healer implementation remains off until disposable-worktree isolation and
  live verification;
- Procurement browser access must be network-isolated or retired;
- only named operators may authorize C3+ actions;
- the courses SMTP bypass is scheduled for retirement behind the host
  capability rather than accepted as a permanent parallel sender;
- Gmail ingestion has zero acceptable silent loss: history expiry requires
  bounded reconciliation and an alert.

## 19. External control references

The plan uses these current primary references as guardrails, not as a claim of
formal compliance:

- NIST SP 800-218, Secure Software Development Framework:
  https://csrc.nist.gov/pubs/sp/800/218/final
- NIST SSDF publications, including the generative-AI community profile:
  https://csrc.nist.gov/Projects/ssdf/publications
- OWASP LLM06:2025, Excessive Agency:
  https://genai.owasp.org/llmrisk/llm062025-excessive-agency/
- OWASP AI Agent Security Cheat Sheet:
  https://cheatsheetseries.owasp.org/cheatsheets/AI_Agent_Security_Cheat_Sheet.html
- GitHub Actions security hardening:
  https://docs.github.com/en/code-security/tutorials/secure-your-organization/protect-against-threats
- Node.js release status:
  https://nodejs.org/en/about/previous-releases
- Apple Container project status and compatibility warning:
  https://github.com/apple/container
- Apple Container isolated-network guidance:
  https://github.com/apple/container/blob/main/docs/how-to.md

## 20. Validation status

This plan was produced from repository evidence and primary security
references, then adversarially reviewed by Claude. The validation challenged:

- incorrect current-state claims;
- security risks or mitigations missed;
- unnecessary enterprise complexity;
- sequencing/dependency errors;
- operational impracticality for a small company;
- missing functionality or business-value opportunities;
- acceptance criteria that cannot actually be verified.

Claude's suggestions were checked against source and incorporated only when
supported. The method, model/CLI, accepted corrections, rejected suggestions,
and remaining judgment are recorded below.

### Claude validation record

**Date:** 2026-07-23
**Validator:** Claude Code 2.1.217, model alias `opus`, high effort
**Method:** tool-disabled, sessionless, budget-capped `--print` review from an
isolated temporary working directory. Claude received only this non-secret plan
through standard input and had no repository, MCP, file, browser, or shell
tools. The first sandboxed request failed with `ENOTFOUND`; the approved network
retry completed and returned a bounded adversarial review.

**Accepted and incorporated:**

- the original timeline was not credible for one primary engineer;
- immediate containment must precede the multi-month control program;
- Procurement access to a general logged-in host Chrome profile and unrestricted
  egress were under-prioritized;
- shell `eval` in skill validation is a high-leverage early removal;
- one credential adapter should prove cutover, rollback, and rotation before
  generalizing the pattern;
- the seven conceptual planes should compile into three internal modules;
- kill switches, circuit breakers, holds, and autonomy demotion should be one
  safety controller with precedence;
- work ledger means process-state authority and reconciliation, not ownership
  of facts originating in Stripe, Trafft, Gmail, or other systems;
- initial SLOs, evaluations, work-ledger conversion, and decision-envelope
  capture should be deliberately narrow;
- model judges cannot alone authorize autonomy;
- two-person controls are valid only when a real second approver exists;
- SBOM/provenance, broad refactoring, full config generation, warm failover, and
  broad evaluation can wait for evidence;
- approval, restore, credential-isolation, autonomy, and ledger acceptance
  criteria need adversarial cases and explicit counts/thresholds.

**Rejected or corrected after verification:**

- Claude claimed Node 26 did not exist in July 2026. Official Node sources show
  Node 26.5.0 is the current release; it is real but not yet LTS. Node 22 and
  Node 24 are LTS, and Node 20 is EOL.
- Claude inferred that Syncthing may currently replicate live SQLite. The
  repository's `.stignore` explicitly excludes `store/` and `data/`; the plan
  retains a verification ticket because root-level sync configuration is
  machine state, but does not claim active database replication.
- Claude proposed Stripe as necessarily the first credential adapter. The plan
  leaves the choice to the verified secret/action inventory; Gmail-send,
  Stripe, or another adapter may present the highest actual risk.
- Claude's numerical estimate of roughly 20 person-quarters was not evidence-
  based. The capacity criticism was accepted, not that specific estimate.

**Additional validator finding:**

Claude Code emitted warnings that user-level deny rules using `Write(...)` do
not match current file-permission checks and should use the supported
`Edit(...)` matcher. No machine settings were changed during this review. The
plan treats repair and a deny-path test as a separate P0 machine-configuration
action.

### Source-connected Claude validation record

**Date:** 2026-07-29
**Validator:** Claude Code, `claude-opus-5[1m]` (Opus 5, 1M context), maximum
effort
**Report:** `docs/reports/NC-20260729-001-CLAUDE-PLAN-VALIDATION.md`
**Disposition:** accept with changes

Unlike the July 23 plan-only review, this validator read the implementing
source, tests, workflows, launchd templates, schemas, group prompts, and
continuity record. It verified all thirteen challenged current-state claims,
rejected none, and materially corrected the sequencing:

- group authorization, fail-closed recipient/reply controls, and the tracked
  healer flag precede Node and CI work;
- the dedicated Procurement profile exists, but shared-gateway CDP reachability
  is the unresolved boundary;
- approval binding enters the six-week slice;
- schedule inventory must prove executability;
- the work-ledger pilot should reuse the existing durable inbox/reaper pattern;
- governance mass is reduced to two process pilots, three core service
  indicators, a minimum decision envelope, and evidence-triggered expansion.

The report also identified the courses SMTP bypass, unloaded autonomy controls,
model-selected risk categories, missing `source_thread_id`, Gmail history loss,
compiled sync conflicts, and the non-portable migration wrapper. Those findings
are now represented in the ordering, risks, acceptance criteria, tickets, and
leadership defaults above.

**Remaining judgment:**

The document intentionally remains comprehensive so the company can see the
whole risk and capability landscape. Only Immediate Containment and the first
current wave are commitments. Later waves are option sets that require
re-baselining, measured need, and explicit leadership decisions.

### Reactivation record

**Date:** 2026-08-15

**Task:** `NC-20260815-007`

**Method:** documentation-only reconciliation against the verified `9e4977a`
lineage, current project map, active-work register, change protocol, linked
engineering-changelog evidence, the 2026-07-29 source-connected validation,
and the current plan. No live system was queried for this reactivation, and
local uncommitted implementation claims were not promoted beyond their
recorded state.

**Decisions incorporated:**

- retain one Company OS strategic roadmap and reject a parallel Spark plan;
- implement the roadmap through independently scoped and reversible tasks;
- add explicit Task, Trigger, Skill, Action Envelope, and Receipt contracts;
- keep the Mailman/Sales approved-email path as the first shared ledger pilot;
- sequence safety boundaries before ledger expansion, triggers/skills before
  operator UX, and evidence before execution profiles or subagent graphs;
- replace calendar-led reactivation with dependency gates while retaining the
  earlier estimates as historical sizing;
- classify every program item conservatively and link state to shared task and
  changelog evidence rather than plan prose.

**Not authorized or performed by this task:** source, test, schema, migration,
prompt, configuration, service, deployment, browser, database, Slack, Gmail,
or other external-system changes. Every runtime slice above still requires a
new task ID, overlap check, focused design, acceptance/rollback contract, and
the authority appropriate to its change class.
