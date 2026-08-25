# NC-20260825-001 — Independent Relationship Context design review R1

## Objective

Review the proposed Relationship Context control-plane design for material
architecture, authority, identity, data-model, privacy, Plutio projection,
capability, evaluation, rollout, and rollback defects. Report only findings
that could make a later implementation unsafe, misleading, incomplete, or
unable to satisfy the program item.

## Authority

Use this order:

1. `PROGRAM.md` and the accepted Company OS boundaries.
2. Current source and current tracked schema for implemented mechanics.
3. `docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md` for the accepted lifecycle design
   patterns that Relationship Context should reference rather than duplicate.
4. `docs/RELATIONSHIP-CONTEXT-CONTROL-PLANE.md`, which is the candidate under
   review.

The candidate is allowed to identify current implementation drift. It must not
pretend a target design is already implemented.

## Accepted facts and boundaries

- This is a C1 design/read-only audit item. No schema, provider, customer,
  runtime, deployment, communication, or production mutation is authorized.
- `business_v2.parties.id` is proposed as the internal join key, while native
  provider identities remain authoritative for their facts.
- Email is not immutable identity and ambiguous email must fail closed.
- Plutio is proposed as an operator-facing projection, not canonical identity
  or rich event authority.
- Minions must receive purpose-filtered packs through one host-owned,
  deny-by-default capability and never direct provider credentials.
- The handoff's live PostgreSQL counts are historical until refreshed. This
  host has no local `nanoclaw_business`, and production SSH refresh was
  unavailable. Do not convert those counts into current claims.
- Encharge exists as a global toolbox integration but is not included in this
  NanoClaw project. Do not assume a supported adapter exists.
- Exact live student-lifecycle code is on a different Git lineage from this
  dirty primary checkout; the design explicitly records that boundary.
- Owner decisions on freshness, retention, exact Plutio fields/backfill scope,
  capability scopes, and Heffl disposition must remain decisions. Do not invent
  acceptance.

## Allowed read paths

- `PROGRAM.md`
- `docs/RELATIONSHIP-CONTEXT-CONTROL-PLANE.md`
- `docs/STUDENT-LIFECYCLE-CONTROL-PLANE.md`
- `src/identity-join.ts`
- `src/booking-host-write.ts`
- `src/plutio-outbox-reaper.ts`
- `data/business/migrations/nanoclaw-v2/03_parties.sql`
- `data/business/migrations/nanoclaw-v2/11_helpers.sql`

Do not read `.env*`, credentials, auth/session stores, raw customer data,
runtime databases, handoffs other than the facts summarized above, or unrelated
dirty files. Do not use Bash, web, MCP, or provider tools.

## Required review questions

1. Does the design preserve native source authority while giving Company OS a
   coherent internal Party/context role?
2. Does identity resolution correctly fail closed for shared/reused/unverified
   identifiers, provider scopes, merges, and splits?
3. Are the fact envelope, projections, freshness, conflict, and query receipt
   contracts sufficiently deterministic and privacy-minimized?
4. Is the capability request/response and candidate group matrix enforceable
   host-side without turning context into action authority?
5. Is the Plutio projection/backfill/reconciliation design safe against drift,
   uncertain writes, operator edits, over-broad scope, and rollback damage?
6. Does the sequence separate design, implementation, migration, provider
   writes, deployment, live verification, and natural outcomes?
7. Are any completion-condition domains missing: relationship, appointments,
   products/payments, learning, communications, attribution, consent, open
   work, source authority/freshness, minion query receipts, Plutio population,
   privacy, implementation slices, tests, rollout, or rollback?

## Response contract

Write only:

`docs/reports/NC-20260825-001-CLAUDE-DESIGN-REVIEW-RESPONSE-R1.md`

Use this form:

- Verdict: `NO MATERIAL FINDINGS` or `MATERIAL FINDINGS`.
- Findings ordered by consequence, each with severity, exact candidate section,
  evidence from an allowed source, why it matters, and a bounded correction.
- Owner decisions that remain genuinely required.
- Do not restate the design, create a speculative backlog, edit the candidate,
  or review unrelated repository work.
