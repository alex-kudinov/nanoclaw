# NC-20260906-003 Gate D Capacity review — R1

## Review mode

Bounded independent review. Use Sonnet/high. Report material findings only,
ordered by consequence, with exact file/line evidence. Do not edit source or
run commands. Write only the requested response artifact.

## Objective

Review the Gate D Academy Capacity operator implementation for correctness,
transaction safety, least privilege, privacy minimization, idempotency,
concurrency, and fidelity to the accepted boundary.

The host—not the minion—is the only parser, policy, database, clock, actor,
transaction, and receipt authority. The Capacity minion submits exact typed
orders. A mutation must record a request/final receipt, lock affected pools,
invoke the already-reviewed pure engine, persist only its compare-and-swap
delta, reload database state, and return a content-minimized receipt. A denial
must not leave a partial domain mutation.

## Accepted facts that must not be reopened

- Migrations 142-143 and the exact 40-assignment production shadow are already
  live and verified. This review is of the new Gate D layer only.
- ACC September 7 is 21/12 sold out; MCS September Thursday is 5/12 open;
  MCS September Friday is 13/12 sold out; January Thursday is 1/12; January
  Friday is 0/12.
- Rita is settled in January Thursday and is not an exception.
- Three source exceptions remain intentionally held: Friday 13 versus prior
  owner count 12, one ACC Module 1 funding source, and one roster/Heartbeat
  alias.
- `src/academy-capacity.ts` is the accepted pure deterministic command engine.

## Hard non-objectives

No checkout or Tandemweb/public cutover; provider/Sheet write; customer or
waitlist message; automatic waitlist approval/promotion; refund; payment;
certificate; direct minion database access; or assignment/capacity authority
cutover. Do not propose any of these as a fix.

## Exact review sources

Review only this request and these five sources:

1. `src/academy-capacity-operator-store.ts`
2. `src/academy-capacity-ipc-handlers.ts`
3. `data/business/migrations/nanoclaw-v2/144_academy_capacity_operator_pilot.sql`
4. `capabilities/capacity.json`
5. `groups/capacity/CLAUDE.md`

The accepted authority summary is in this packet; do not broaden into other
docs, providers, credentials, `.env`, auth stores, production data, or Git
history.

## Implementation map

- Migration 144 creates admin-only privacy-minimized operator cases,
  append-only requested/final receipts, and one operator view. Populated
  rollback refuses evidence deletion.
- The store derives `capacity:host` and current time, advisory-locks the case,
  handles exact replay, records the requested receipt, uses a savepoint, locks
  one or two affected pools in stable ID order, reconstructs canonical state,
  invokes the pure engine, persists only changed rows with expected versions,
  reloads state for summary, and records a final hash-bound receipt.
- Exact reads expose inventory and enrollment/assignment/exception keys only;
  no name, email, payer, amount, or provider payload.
- IPC derives the caller from its directory, requires the exact `capacity`
  group and source container, strictly rejects unknown fields, derives
  actor/time on host, and has a separate fail-closed mutation switch.
- The capability has no credential family, network, Bash, filesystem write,
  general message tool, or provider tool. Waitlist staging cannot approve,
  send, accept, or convert.
- The disposable worker seeds the exact 5-block/40-assignment shadow and proves
  a simultaneous one-seat race, replay/conflict/stale behavior, manual
  release, FIFO join/stage, one-active-offer refusal, transfer, withdrawal,
  reconciliation, exceptions, grants, receipts, privacy marker absence, and
  populated rollback refusal.

## Verification evidence

- The runner/IPC wiring, disposable worker, configuration tooling, and docs are
  intentionally represented by the verification evidence below rather than
  loaded into this bounded session.
- Focused Gate D suites: 40/40 passed.
- Disposable result: exactly 1 last-seat winner + 1 stale review; 13 cases,
  26 receipts, 3 review cases, zero `@` markers in summaries, 0 non-admin
  grants, 11/11 migration-144 objects admin-owned, populated rollback refused.
- Pinned typecheck and build pass.
- Agent runner build and 45/45 tests pass.
- Documentation continuity/capability generation and diff check pass.
- Full root: 3,582 passed / 32 skipped; only the unchanged CNPC wrapper-literal
  assertion and date-sensitive Trafft status expectation fail.

## Questions to answer

1. Can any malformed, unauthorized, replayed, stale, concurrent, or failed
   request create a partial or over-capacity domain mutation?
2. Are pool lock ordering and compare-and-swap semantics sufficient for every
   implemented command, especially last-seat reservation and cross-pool
   transfer?
3. Can the minion obtain or exercise database/provider/message authority, or
   smuggle identity/content/instructions into a trusted field or receipt?
4. Can waitlist staging send, approve, accept, convert, or otherwise imply a
   customer action?
5. Do replay, denial, readback, case, receipt, and rollback semantics tell the
   truth under failure?

## Required response

Write
`docs/reports/NC-20260906-003-CLAUDE-CAPACITY-GATE-D-RESPONSE-R1.md`.

Use either `NO MATERIAL FINDINGS` or a concise numbered list. For each finding,
state severity, exact evidence, consequence, and smallest safe correction.
Do not restate the implementation and do not add speculative backlog.
