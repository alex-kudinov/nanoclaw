# Read-only student product catalog reconciliation packet

Status: the corresponding Company OS candidate was registered at revision 247.
This packet is ready to dispatch only after Astra reorients, activates/claims the
item, and allocates a new `NC-YYYYMMDD-NNN` execution ID. It was prepared by
`NC-20260907-003` and has not been executed.

## Outcome

Produce a privacy-minimized, source-bound disposition inventory for every
selected active sellable item/variant and its typed relationships across website,
Stripe, Plutio, Heartbeat, Student Roster, curriculum, schedule, and Company OS
catalogs. Resolve technical facts from authoritative sources. Convert business
ambiguity into explicit owner decisions that block only the affected population.

The result is the evidence prerequisite for
`work:student-product-identity-coverage-rollout`. It creates no catalog, provider,
roster, checkout, student, payment, capacity, migration, runtime, schedule,
communication, or `.program` mutation.

## Routing and starting state

- Parent: Astra, strategy and acceptance.
- Worker: one explicit `gpt-5.6-sol` / `high` / `fork_turns: "none"` execution
  writer following `docs/MODEL-ROUTING-POLICY.md`; no recursive Codex delegation.
- Review: Claude Code Sonnet/high, bounded and secret-free through the installed
  `work-with-claude` procedure.
- Worktree: create a clean isolated worktree from the then-current accepted
  NanoClaw lineage. Preserve every dirty primary checkout.
- Program: before dispatch, Astra reorients on current primary `.program` state,
  claims only the accepted `work:student-product-catalog-source-reconciliation`
  item, and records the worker binding. Sol reads that binding and does not edit
  `.program`. After Sol returns evidence, Astra alone reconciles the portfolio.
  Neither role assumes revision 246 or this packet's proposed status is current.
- Registration: add and push the allocated repository Active Work task row before
  writing evidence or source changes; this is not a second `.program` claim.

## Authoritative sources to inspect

Inspect current source paths and supported read surfaces; do not reuse the dated
47/37 snapshot as current truth.

1. NanoClaw:
   - `facts/catalogs/student-entitlements-v1.json` and schema;
   - `facts/catalogs/student-product-bindings-v1.json`;
   - `docs/STUDENT-ENTITLEMENT-CATALOG.md`;
   - `docs/STUDENT-PRODUCT-IDENTITY.md`;
   - `scripts/audit-student-product-identity.mjs`;
   - current Product Map and Student Roster structure/read-only values through
     the established toolbox, retaining no student rows in Git or review packets.
2. Tandemweb and localized publishing sources:
   - current source-controlled checkout catalog and every active sale mode;
   - language/locale variants and the owning publish workflow;
   - exact offer slug, active state, displayed terms, cohort fields, Stripe
     product/price/account identifiers, and required post-purchase destination.
3. Stripe, both accounts, through supported read-only tooling:
   - products, prices, payment-plan structure, active/archive status, metadata,
     and effective relationships needed to distinguish offer and agreement;
   - no customer/payment population export beyond the minimum aggregate or
     known-case evidence needed to resolve a relationship.
4. Plutio through supported read-only tooling:
   - item, proposal/contract template, invoice/payment-plan, and participant
     relationship references; do not treat a display label as identity.
5. Heartbeat through documented server APIs/read surfaces:
   - community-scoped group/course/native IDs and the relationship type each
     can actually prove; do not use private routes, browser automation, UI export,
     or group membership as purchase, class-assignment, or progress authority.
6. Curriculum, assessment, and schedule authorities:
   - accepted course/program facts for inclusions;
   - exact accepted schedule/delivery-block evidence where an offer selects a
     dated class;
   - CoachGrader only for assessment relationships, never enrollment identity;
   - preserve existing certificate, consent, and action gates.
7. Current Company OS portfolio and accepted decisions, especially the capacity
   simple-sync decision. Older reservation/hold design is historical evidence,
   not current implementation direction.

Do not read credential stores, auth files, raw browser histories, unrelated
private data, database dumps, or unsupported provider endpoints. Never print or
store secret values. Keep person-level evidence out of tracked artifacts; use
opaque IDs, hashes, counts, and separately protected temporary working files only
when a known-case relationship truly requires them.

## Required inventory record

For each selected sellable item or source-only counterpart, record:

- source, source revision/hash/fetched-at time, variant and locale;
- program key; offer key/version; bundle/component key/version;
- explicit treatment: `enrollment`, `component_service_fulfillment`,
  `non_student_sale`, `grant_free_access`, `retired_historical`, or `unresolved`;
- sale mode and frozen commercial/agreement terms;
- every provider relationship as provider + account/community + object type +
  native ID + relationship type + effective period + evidence;
- required fulfillment and projection destinations;
- dated delivery-block/pool relationship when applicable;
- disposition: `source_bound`, `legacy_dispositioned`, or `unresolved`;
- owner, safe holding behavior, evidence needed, expiry/review trigger; and
- whether deterministic publication must pass, is grandfathered within an exact
  scope, or is blocked.

Provider objects may relate many-to-one or one-to-many with offers. A shared
Heartbeat group never reverse-maps to a purchase. A Stripe product/price requires
account scope and may need exact checkout/contract context. An installment plan
is one agreement/order with several obligations and receipts. MCS dated checkout
slugs and `mcs-full` must be reconciled explicitly; absence from one checkout
snapshot is not evidence of retirement.

## Deliverables

Using the allocated execution task ID, write:

1. a tracked aggregate evidence report under
   `docs/programs/company-os/evidence/` with source hashes/freshness, counts,
   relationship and treatment coverage, conflicts, and safe holds;
2. a machine-readable aggregate/disposition artifact under `docs/reports/` that
   contains no names, emails, raw provider payloads, secret-bearing URLs, or live
   sample rows;
3. proposed versioned catalog/binding changes as a reviewable diff only after the
   read-only baseline is complete; do not publish or apply them in this task
   unless the dispatch explicitly adds that authority;
4. a decision brief containing only unresolved business meaning or authority,
   with owner, evidence, affected population/phase, and safe hold;
5. exact proposed `.program` evidence/delta for Astra to apply separately; and
6. verification and Claude review artifacts under the repository's normal report
   naming convention.

## Acceptance checks

- Every selected active website item has exactly one explicit treatment and one
  disposition; source-only counterparts are linked or held, never assumed absent.
- All provider bindings are typed and scoped. Conflicting or ambiguous native
  IDs produce owned holds rather than a guessed offer.
- One agreement with multiple installment receipts is represented once; the
  inventory contains no receipt-to-new-order rule.
- Service allowances remain separate from training-program seats and rosters.
- Required schedule/pool and projection destinations are explicit where relevant.
- The staged coverage ratchet is measured by source/offer/variant/locale and no
  legacy allowlist expansion is hidden.
- The accepted committed-seat simple-sync policy remains intact; no synchronous
  checkout reservation, short-lived hold, or live NanoClaw checkout dependency
  appears in a proposed current contract.
- Counts and source hashes reproduce from sanitized inputs; the existing audit
  tool still exits 2 for active gaps under `--require-active-coverage` until the
  corresponding population is genuinely covered.
- Focused validators, JSON/schema checks, link checks, `git diff --check`, and
  `npm run docs:continuity-check` pass under pinned Node.
- Claude Sonnet/high finds no unresolved material issue, or verified findings are
  corrected and load-bearing changes re-reviewed.

## Stop and escalation conditions

Stop the affected population and send Astra a concise evidence-backed decision
request when sources contradict on commercial meaning, curriculum inclusion,
payment-plan state, participant authority, or dated-class/capacity meaning.
Continue independent populations when their evidence is complete.

Stop the task for missing read authority, unsupported provider surfaces, source
instability that defeats a stable snapshot, unexpected personal-data exposure, or
an overlap with another active writer. Do not work around a missing supported API
with browser automation or private endpoints. Two materially different attempts
at the same blocker trigger escalation rather than a guessed disposition.

## Return to Astra

Return in no more than 500 words: worker ID and actual model/effort, task/branch/
base/final revisions, selected source window and hashes, aggregate coverage by
ratchet state, unresolved decisions, files and checks, Claude round/findings/
corrections/usage, and explicit confirmation that no provider, student, payment,
roster, checkout, schedule, capacity, communication, migration, deployment, or
`.program` write occurred.
