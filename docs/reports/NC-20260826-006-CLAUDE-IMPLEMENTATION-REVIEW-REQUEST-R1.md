# NC-20260826-006 — bounded implementation review R1

Review mode: independent bounded review, Sonnet/high.

## Objective

Review the local default-off client/customer relationship projection for
material correctness, identity/authority, privacy, concurrency, idempotency,
and operational defects. Report only findings that could cause a false client
claim, omit an active Party, expose private data, churn/corrupt projections,
break startup/health, or make the release/rollback boundary false.

Write the response only to:

`docs/reports/NC-20260826-006-CLAUDE-IMPLEMENTATION-RESPONSE-R1.md`

Do not edit implementation, tests, authority documents, configuration, Git, or
runtime state. Do not use Bash, web, MCP, provider access, `.env`, credentials,
auth stores, local databases, or unrelated repository files.

## Authority order and accepted decisions

1. `.program/decisions/decision-relationship-context-client-relationship-projection-2026-08-26.json`
2. `docs/RELATIONSHIP-CONTEXT-CONTROL-PLANE.md` as summarized and narrowed by
   the task decision/runbook
3. `docs/RELATIONSHIP-CONTEXT-CLIENT-PROJECTION.md`
4. implementation and tests

Accepted facts that must not be reopened:

- The exact base is pushed NC-005 final evidence
  `13c855db8db0dc61b2e652609d21569c7d75d742`; production currently runs the
  earlier exact NC-005 release `d5375964`.
- Live Party counts are 1,430 active people and seven active organizations.
- Exact current Stripe observations show 62 Parties with at least one latest
  succeeded PaymentIntent and five of those with a latest active subscription.
- All nine active client, two student, and 1,317 prospect role rows have empty
  metadata and no source/accepted-decision receipt. They are recorded labels,
  not positive client authority.
- Plutio contract/project/invoice discovery failed before provider access
  because the shared toolbox environment file is not parseable. No credential
  or value was inspected or changed. Active engagement must remain unknown.
- A paid customer is not necessarily an active coaching client. The projection
  must preserve that distinction.
- No migration is needed: migration 137 already owns the projection table,
  constraints, merge handling, and admin-only permissions.
- The global query capability remains disabled with no group/minion grants;
  this worker grants no consumer or action.

## Allowed read paths

1. this request
2. `.program/decisions/decision-relationship-context-client-relationship-projection-2026-08-26.json`
3. `docs/RELATIONSHIP-CONTEXT-CLIENT-PROJECTION.md`
4. `src/relationship-context-client-projection.ts`
5. `src/relationship-context-store.integration.test.ts`
6. `src/relationship-context-store.ts`
7. `src/index.ts`

The response path is the only allowed write path.

## Implementation map

- `relationship.client_status.v1` is one fixed projection per active canonical
  Party, including persons and organizations.
- The worker keyset-pages Party IDs in a transaction, uses latest observation
  per exact Stripe source record, and writes through the existing repository.
- A process in-flight guard plus PostgreSQL transaction advisory lock prevents
  overlap. Per-Party role/Stripe watermarks prevent unrelated global churn.
- Summary precedence is paid customer, recorded client, recorded student,
  recorded prospect, unknown. Only succeeded PaymentIntent or active
  subscription makes `customer_or_client=true`.
- All version-1 projections are partial and keep active engagement unknown.
- Health exposes aggregate counts/status only and fixes
  `consumerEnabled=false`.
- The flag is separately default-off and the timer is fire-and-forget,
  overlap-guarded, and unref'ed.

## Evidence already produced

- focused relationship/wiring/setup tests: 33/33 pass;
- client projection/wiring subset: 9/9 pass;
- pinned Node 22.23.2 typecheck and build pass;
- documentation continuity and capability checks pass;
- disposable PostgreSQL: 5/5 pass, including 1,400+ Party multi-page run,
  persons and organization, latest subscription-state change, role
  addition/removal, only-one-Party version advancement, full coverage,
  exact replay with zero version churn, and prohibited-value readback;
- no production write, release, configuration change, provider action, Party
  merge, role/source-ref change, communication, or minion activation occurred.

Full root, independent runner, final secret/diff checks, commit/release, and
deployment are intentionally after this review.

## Questions

1. Can the SQL select a wrong or stale Stripe state, double-count a source
   record, omit an active Party, or mishandle merge/current Party lineage?
2. Can per-Party watermark/upsert behavior cause global churn, missed evidence
   change, stale missing codes, or false zero-change replay?
3. Is transaction/advisory-lock/in-flight behavior actually sufficient across
   startup/timer overlap and multiple daemon instances?
4. Can any projection value, watermark, health field, log, or error expose
   identity, source object IDs, customer data, or arbitrary provider content?
5. Can recorded role labels accidentally become positive client authority?
6. Are source failure, incomplete source refresh, freshness, or unavailable
   Plutio evidence represented truthfully enough for a live release?
7. Are startup, default-off configuration, health, release, and rollback claims
   supported by the implementation?
8. Do the PostgreSQL tests miss a material evidence-transition, concurrency,
   merge, privacy, or scale case?

## Response contract

Write material findings only, ordered by consequence. For each finding give:

- severity;
- exact file and line/evidence;
- causal failure mode;
- smallest safe correction and acceptance test.

If there are no material findings, write exactly `NO MATERIAL FINDINGS` plus at
most one short paragraph stating what load-bearing paths were checked. Do not
provide a speculative backlog, style suggestions, restatement, or approval for
provider/customer actions.
