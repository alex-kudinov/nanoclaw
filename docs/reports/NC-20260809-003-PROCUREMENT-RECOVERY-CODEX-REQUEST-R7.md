# NC-20260809-003 Procurement Recovery — Codex Request R7

## Objective

Review the bounded collection-canary recovery delta after two natural
CaleProcure runs falsely appeared successful without a host source-run receipt.
Determine the smallest safe implementation that makes scheduled Procurement
scan completion truthful and exactly-once, without weakening the already
accepted human-only commercial boundary.

Write only:

`docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R7.md`

Do not edit source, tests, migrations, prompts, continuity files, or any other
artifact in this round.

## Authority and protected boundaries

Read, in order:

1. `CLAUDE.md`
2. `docs/PROJECT-MAP.md`
3. `docs/ACTIVE-WORK.md` (`NC-20260809-003` only)
4. `docs/CHANGE-PROTOCOL.md`
5. relevant current entries in `docs/ENGINEERING-CHANGELOG.md`
6. `groups/procurement/CLAUDE.md`
7. migration 115 and the current Procurement implementation

Never read or transmit `.env*`, credentials, OAuth/session/browser-profile
state, database row content, task result payloads, local MCP settings, or other
secret/restricted material. Public opportunity metadata and aggregate counts
below are authorized evidence.

The user authorized deployment and operational testing. These remain
human-only: registration, acknowledgement, terms acceptance, pricing/customer
commitments, signatures, attestations, and submissions. A named human must type
every `DECIDE` and `ADVANCE` command; no model or operator may impersonate one.

## Accepted facts — do not reopen

- Commit `9aa23b4e7c394145487baabb64873beb5d321617`, migration 115, and its
  immutable release are live under Node 22.23.2.
- Collection is enabled; review remains disabled. The legacy daily task is
  paused.
- R4 accepted migration 115's opportunity -> decision -> pursuit -> `passed`
  closure. `proposal_ready` and `submitted` remain unreachable until a later,
  separately reviewed migration 116.
- Proposal/source R6 is `CHANGES REQUIRED`; its action-card/event-ledger,
  drift, canonical-JSON, version/receipt, and expiry-predicate findings remain
  accepted. This round must not implement migration 116.
- A scheduler/container success is not business completion. A CaleProcure scan
  is complete only with a post-start host source-run receipt whose release-owned
  planned units are all observed and whose missing-unit count is zero.

## New production evidence

1. Natural canary 1 (`rescan caleprocure`) exceeded the old five-minute
   timeout, then was queued twice because the due `once` task retained
   `next_run` while the first container ran. Both task runs recorded scheduler
   `success`; neither wrote any PostgreSQL source run, card, or pursuit.
2. Natural canary 2 ran exactly once after an operational pause-on-pickup
   workaround. It again recorded scheduler `success` and wrote no source run,
   card, or pursuit.
3. The exact model result payloads remain unread and out of scope. The absence
   of a host receipt is sufficient to reject both business-success claims.
4. Independent public browser inspection completed all nine release-owned
   keywords. Eight returned zero visible results. `facilitation` returned one
   current row: event `0000039985`, `NOTICE OF INTENT TO AWARD`, SF Bay
   Conservation Commission, closing 2026-08-13 15:00 PDT. CaleProcure retained
   a hidden stale row after zero-result searches, and `networkidle` never became
   a safe load condition.
5. The host adapter correctly rejected the first operator-assisted payload
   because stable identity requires a business unit. An authoritative public
   agency link establishes business unit `3820`. The corrected, explicit
   operator-assisted adapter canary created source run 4 with status `complete`,
   planned 9, observed 9, missing 0, observations seen/new 1/1, and one
   opportunity. This proves the adapter/database path only; it is not natural
   agent proof.
6. Production currently has zero active containers. The corrected procedure
   is installed with SHA-256
   `d0bd484a0848a1db067ea3cd8d542f83acd0a095f5327da61a20443ab33022e5`.

## Current uncommitted delta to inspect

- `src/task-scheduler.ts`
- `src/task-scheduler.test.ts`
- `src/procurement-task-completion.ts`
- `src/procurement-task-completion.test.ts`
- `src/index.ts`
- `knowledge/agents/procurement/procedures/scan-caleprocure.md`
- `scripts/register-procurement.ts`

The current delta:

- clears `next_run` for a `once` task before container execution;
- validates the two exact Procurement scan prompts after container completion;
- turns a missing/incomplete source receipt into a task error and sends a fixed
  `[SCHEDULED TASK NOT COMPLETE]` correction;
- raises Procurement spawn timeout from 300000 to 900000 ms;
- replaces `networkidle`, rejects hidden stale rows/default-table extraction,
  requires exact payload keys, requires a stable business-unit/event identity,
  and requires an ingest call even for a complete zero-row scan.

## Codex-discovered defects/questions in the current delta

Treat these as claims to verify, not instructions to agree:

1. The output callback forwards model result text before post-run receipt
   validation. A later correction is truthful eventually but still emits an
   initial false-green message. Receipt-required task final text should likely
   be buffered and delivered only after validation succeeds.
2. The validator accepts any complete CaleProcure source run whose
   `started_at >= taskStart`. It is not causally correlated to the scheduled
   task. An operator-assisted or other concurrent run could satisfy it.
3. Procurement work is serialized within one group queue in the normal daemon,
   but that does not prevent direct adapter calls or a second daemon instance.
   Decide whether task/run correlation must be host-owned now and specify the
   least invasive trustworthy mechanism.
4. Clearing `next_run` before execution prevents the observed one-daemon
   duplicate but is not an atomic database claim across daemon instances.
   Determine whether the repository's one-daemon invariant is sufficient or a
   database claim state is required now.
5. The exact two-prompt matcher is narrow. Determine whether it is the correct
   release-owned scope and how to prevent harmless prompt wording drift from
   silently bypassing receipt validation.

## Required response

Return one of `GO`, `CHANGES REQUIRED`, or `BLOCKED`, followed by:

1. a finding table with severity, exact file/line evidence, and disposition;
2. a concrete safe contract for task-to-source-run correlation;
3. the correct final-text delivery order for receipt-required tasks;
4. whether the one-time task fix is adequate under current daemon invariants;
5. exact source/test/doc changes required before a release;
6. exact focused and full validation commands;
7. whether a third natural CaleProcure canary may run after that release and
   what exact evidence qualifies it as passed;
8. confirmation that review must remain off until the natural scan passes;
9. any unresolved owner decision (do not invent one), elapsed time, and cost.

Convergence means no scheduler success or user-facing final-success text can be
produced without a causally attributable complete host receipt, while ordinary
non-Procurement scheduled tasks retain current behavior.
