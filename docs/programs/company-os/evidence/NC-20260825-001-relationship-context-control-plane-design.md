# NC-20260825-001 — Relationship Context control-plane design evidence

Date: 2026-08-25
Program item: `work:relationship-context-control-plane-design`
Change class: C1 internal design and read-only audit

## Outcome

`docs/RELATIONSHIP-CONTEXT-CONTROL-PLANE.md` is the owner-reviewable design for
one host-owned, capability-scoped Party Context service. It defines:

- canonical internal Party identity plus scoped provider references and
  temporal identifier claims;
- source authority, effective/observed time, freshness, conflict, unknown,
  stale, denied, and unavailable behavior;
- normalized facts and deterministic relationship, appointment, commercial,
  communication, learning, attribution, consent, and open-work projections;
- the `party_context_get` request/response, deny-by-default minion matrix, and
  content-minimized query receipts;
- Plutio field discovery, operator projection, versioned sync/readback,
  conflict handling, exact population manifest, rollback, and usefulness gate;
- privacy/retention, implementation slices, tests, shadow evaluation, rollout,
  rollback, and separately gated source/runtime/provider actions.

## Handoff and program verification

- Checkpoint:
  `handoffs/2026-08-25-1226-relationship-context-control-plane.md`.
- Saved branch and HEAD match the current checkout:
  `codex/continuity-reconciliation` at
  `51185a5db6690807a821030d632c628340d0fb05`.
- `programctl validate`, `status`, and `check-handoff` passed at saved revision
  89; the item was the sole eligible unclaimed item.
- `NC-20260825-001` was registered before design edits, the item was claimed at
  revision 90, and eight distinct commitments were attached at revision 91.
- The disclosed heavily dirty shared checkout remains heavily dirty. Unrelated
  source, prompt, runtime, operations, and provider work was preserved.

## Current-contract audit

- `src/identity-join.ts` treats Plutio as identity authority and email as the
  durable join key. `best_party_by_email` deterministically picks one Party
  when an email is shared, rather than returning ambiguity.
- `booking-host-write.ts` and the Trafft sweeper create durable, deduplicated
  booking interactions. Webhook-only form answers are retained, but there is
  no typed current-appointment projection or persistent Trafft-customer Party
  reference.
- Party creation enqueues identity-only Plutio sync. The current outbox/ref
  model has no projection version/hash, field-level readback/conflict receipt,
  or useful relationship context population.
- Gmail has exact message/thread identity and outbound receipts but no unified
  Party communication projection; Stripe/payment, Heartbeat/lifecycle,
  consent/Encharge, Chaos attribution, and open-work state remain separate
  domain contracts.
- Exact live lifecycle commit `8e475e036ad6` is present in Git and supplies
  reusable event/projection/reconciliation patterns, but its lifecycle files
  are not present in this checkout HEAD. The design distinguishes live release
  lineage from current checkout source.

## Evidence freshness and unavailable refreshes

The handoff's PostgreSQL aggregates are historical evidence from its prior
read-only audit. This host has no local `nanoclaw_business`, and the supported
SSH toolbox cannot refresh production because `SSH_HOST` is not configured.
No current production aggregate is claimed.

The project toolbox contract was inventoried read-only. Plutio, Trafft,
Heartbeat, Stripe, and Chaos read capabilities are included; Encharge exists
globally but is not included for NanoClaw. A Plutio person-custom-field
discovery attempt failed before provider access because the project environment
file is not shell-parseable. No provider data changed, and the design forbids
using historical Plutio field IDs.

## Independent review and correction

Claude Sonnet/high bounded R1 used session
`820a17dc-4bc7-40ea-b858-275486d4015c` and found three material gaps:

1. no migration/activation gate between the live Booking email-first writer and
   the proposed fail-closed resolver;
2. new Party-scoped identity/context records were not explicitly included in
   merge/write-guard semantics;
3. the legacy `parties.source_provider/source_id` pair had no transition rule.

All three were corrected. The design now keeps current Booking behavior
historical during dark work, measures divergence, requires a separately
authorized exact-Trafft-reference/ambiguity-hold slice, and blocks context
authority until its backlog is reconciled. Migration B covers every new
Party-scoped table in merge/guard semantics and tests. The legacy source pair
becomes first-seen compatibility provenance, is backfilled into scoped refs,
loses resolver authority, is drift-tested/deprecated, and is removed only after
caller migration proof.

Bounded Sonnet/high R2 used session
`80435092-e464-4022-9875-24cd902ab8da`. It closed R1 findings 1 and 3 and left
one minor missing merge-test clause for observations/projections/query receipts.
That bounded correction was applied mechanically. No unresolved material
review finding remains.

Measured review usage:

- R1: 7 unique model calls; 106,559 cache-create, 390,156 cache-read, and
  16,213 output tokens; maximum context 115,125, above the bounded 100k target.
- R2: 4 unique model calls; 60,032 cache-create, 122,172 cache-read, and 7,839
  output tokens; maximum context 60,034, no warning.

Review artifacts:

- `docs/reports/NC-20260825-001-CLAUDE-DESIGN-REVIEW-REQUEST-R1.md`
- `docs/reports/NC-20260825-001-CLAUDE-DESIGN-REVIEW-RESPONSE-R1.md`
- `docs/reports/NC-20260825-001-CLAUDE-CORRECTION-REVIEW-REQUEST-R2.md`
- `docs/reports/NC-20260825-001-CLAUDE-CORRECTION-REVIEW-RESPONSE-R2.md`

## Verification

- design coverage search includes every named completion-condition domain;
- targeted likely-secret scan over the design/review artifacts returned no
  finding;
- `git diff --check` passes for task-owned files;
- Node 22.23.2 is available at `/opt/homebrew/opt/node@22/bin/node` and was used
  for documentation continuity verification;
- the first continuity run found this task's missing detail section plus the
  pre-existing NC-20260822-015/016/017 detail/changelog and NC-20260824-008
  changelog gaps; the task-owned detail and changelog records were then added;
- final `programctl validate`, `status`, and `render` pass at revision 93 with
  no findings and no active or eligible item;
- the final pinned-Node continuity run contains no `NC-20260825-001` finding.
  It still reports only the pre-existing NC-20260822-015/016/017 missing detail
  or changelog records and the NC-20260824-008 missing changelog record.

## Boundary

No application source, schema, group behavior, provider record, customer
record, Plutio field/backfill, communication, runtime, deployment, production
database, credential, or business outcome changed. Build, migration, provider
population, minion activation, deployment, live verification, and natural
outcomes remain separately governed work.
