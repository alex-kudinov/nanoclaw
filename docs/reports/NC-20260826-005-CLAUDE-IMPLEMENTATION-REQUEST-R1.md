# NC-20260826-005 bounded implementation review R1

## Review contract

Review the local implementation of default-off, read-only Relationship Context
adapters for both Stripe accounts, exact archived contact-form submissions, and
verified Chaos visitor links. Report only material correctness, identity,
privacy, replay, failure-isolation, scale, or release-boundary findings. Do not
edit implementation files and do not broaden the task. Write the response only
to:

`docs/reports/NC-20260826-005-CLAUDE-IMPLEMENTATION-RESPONSE-R1.md`

Order findings by consequence. For each finding name the exact file/line or
function, violated invariant, realistic failure mode, and smallest acceptable
correction. If no material finding remains, say `NO MATERIAL FINDINGS`.

## Authority and objective

Authority order is the accepted decision, current code/schema mechanics, the
current source runbook, then tests/evidence. The objective is to extend the
already-live provider-neutral migration-137 Party Context without changing its
core contracts or granting a minion/action.

Accepted source rules:

- Stripe customer IDs are account-scoped. An existing exact ref remains exact;
  otherwise one customer email must be unique inside that Stripe account and
  resolve to one canonical Party. Duplicate, missing, unmatched, or ambiguous
  identity is terminal legacy. Payment/subscription facts attach only through
  an exact customer ref.
- Contact form uses the immutable host webhook-inbox row as the exact source
  record because current n8n strips the Gravity Forms entry ID. Submitted email
  is transient and must resolve to one Party. Persist only bounded entry-page
  and timing evidence.
- Chaos requires one stable visitor interaction Party and agreeing handled
  verified-inbox Party evidence. Browsing alone never binds. Later disagreement
  conflicts a prior active ref.
- Persist no raw payload, email, name, company, message, amount/card/address,
  metadata, intent summary, IP/device/session/referrer, form field, or browsing
  history.
- No provider/customer/form/Chaos write, Party merge, communication, consent,
  payment/refund/contract action, checkout/lifecycle/Circle/legacy-receiver
  change, query grant, or broad minion access.
- Source collection is default off, non-blocking, overlap-guarded, per-source
  transaction isolated, aggregate-only in health, and fixed
  `consumerEnabled=false`.

## Exact allowed artifacts

Read only these eight artifacts plus this request:

1. `.program/decisions/decision-relationship-context-stripe-contact-chaos-enrichment-2026-08-26.json`
2. `docs/RELATIONSHIP-CONTEXT-STRIPE-CONTACT-CHAOS.md`
3. `src/relationship-context-source-enrichment.ts`
4. `src/relationship-context-source-enrichment.test.ts`
5. `src/relationship-context-store.integration.test.ts`
6. `src/index.ts` (only imports, `/health.relationshipContext`, and source-runner startup block)
7. `src/relationship-context-contract.ts`
8. `src/relationship-context-store.ts`

Do not read `.env*`, credentials, auth/session stores, raw databases, provider
responses, unrelated reports, or the dirty primary checkout. Do not use Bash,
web, MCP, or provider tools. The only allowed write is the response artifact.

## Implementation under review

- One new source module declares three ordinary manifests/fact catalogs,
  transient Stripe GET pagination, exact source tiers, terminal legacy,
  conflict/ref recovery, minimized facts, per-source health, and the scheduled
  runner.
- Stripe verifies the credential handles resolve to two distinct account IDs;
  only an account-ID hash is persisted. It scans at most 100 pages per object
  family and refuses incomplete snapshots.
- Contact/Chaos read at most 5,000 host-ledger rows and refuse incomplete
  snapshots before registration or evidence writes.
- Stripe network collection finishes before PostgreSQL transactions. Each
  account/contact/Chaos reconciliation gets its own transaction.
- The existing query flag and all group grants remain unchanged/off.
- No database migration is introduced.

## Verification evidence

- pinned Node 22.23.2 format, typecheck, and build: pass;
- focused source/manifest/identity/page/provider/wiring suites: 16/16 pass;
- disposable PostgreSQL store suite: 4/4 pass, including exact refs/facts,
  terminal legacy, conflicting Chaos evidence, exact replay, and negative PII
  readback;
- migration-137 SQL integration: pass;
- full root: 3,309 pass / 29 skip; sole failure is the known unrelated CNPC
  source-wrapper literal assertion reproduced on the prior exact lineage;
- independent agent-runner package: build and 45/45 pass;
- documentation continuity/capability check: pass;
- current source is uncommitted, unreleased, undeployed, and has performed no
  provider mutation.

## Load-bearing review questions

1. Can any source bind the wrong Party, silently reactivate a different-family
   conflict, or retain an unsafe ref after evidence changes?
2. Can replay create observation/projection churn, stale freshness, duplicate
   legacy occurrences, or non-idempotent health?
3. Can malformed/incomplete provider or database input cause partial writes,
   cross-source rollback, unbounded work, or retry hazards?
4. Can any raw identifier or PII escape into facts, receipts, health, logs,
   errors, docs, or the release?
5. Do account scoping, provider authority, fact effective/observed time, and
   freshness remain truthful?
6. Are the SQL queries/loops safe for the discovered 173/624 customers,
   412/1,013 payment intents, 14/32 subscriptions, 191 contact rows, and 1,331
   Chaos interactions, including future growth to the documented caps?
7. Does startup/release preserve default-off/no-consumer/non-interference and
   make rollback truthful?

Do not reopen accepted strategy, request owner decisions, or propose adjacent
features unless a concrete material defect makes the current implementation
unsafe or incapable of its stated objective.
