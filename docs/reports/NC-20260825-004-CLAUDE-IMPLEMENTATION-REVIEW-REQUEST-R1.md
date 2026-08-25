# NC-20260825-004 — Relationship Context production rollout review R1

## Review contract

Use Sonnet/high bounded review. Report material findings only, ordered by
consequence, with exact file/line evidence and the smallest correction. Do not
edit source, inspect secrets, access providers/databases/network, run Bash, or
reopen the accepted control-plane architecture. Write only the named response.

Response:
`docs/reports/NC-20260825-004-CLAUDE-IMPLEMENTATION-REVIEW-RESPONSE-R1.md`

## Objective

Review the production-bound delta that deploys migration 137 and runs a
credential-free Trafft host-ledger shadow. The shadow must normalize existing
source-bound appointment evidence while refusing to inherit the legacy
email-selected Party identity. Query/minion capability stays disabled.

## Authority and accepted facts

1. Current production is exact healthy release `8e475e03`; the branch directly
   contains it plus the independently reviewed NC-003 foundation.
2. Migration 137 is absent in production. Production has core PostgreSQL
   `sha256(bytea)` but not the optional `pgcrypto` extension.
3. The existing ledger has 419 Trafft interactions; historical customer-ID to
   Party mapping is consistent but all 1,420 Party email rows are unverified.
   That consistency is evidence only, never identity authority.
4. The accepted implementation stores exact appointment-reference observations
   with null Party identity, creates `needs_identity`, and produces no Party
   projection. `RELATIONSHIP_CONTEXT_ENABLED` remains `0` and no grant issuer is
   wired.
5. Provider writes, raw payloads, customer communication, Plutio writes,
   credentials, broad minion access, and changes to checkout/lifecycle/legacy
   boundaries are forbidden.

## Allowed source packet

Read only:

1. this request;
2. `docs/RELATIONSHIP-CONTEXT-PRODUCTION-ROLLOUT.md`;
3. `src/relationship-context-trafft-shadow.ts`;
4. `src/relationship-context-trafft-shadow.test.ts`;
5. `src/relationship-context-store.integration.test.ts`;
6. `src/index.ts` only the import, health, and shadow-scheduler additions;
7. `src/webhook-server.ts` only the `relationshipContext` health type;
8. `data/business/migrations/nanoclaw-v2/137_relationship_context_dark.sql`
   only the legacy receipt-hash expression.

The underlying NC-003 contract/store/resolver implementation is accepted and
out of scope unless this delta demonstrably violates its callable contract.

## Load-bearing questions

1. Can any shadow row attach to or project onto a Party without an exact
   external ref or independently verified claim?
2. Are source rows minimized before JavaScript and persistence, with no raw
   payload, email, phone, name, custom answer, or credential path?
3. Are pagination limits, batch completeness, replay, updates, transaction
   failure, registration state, and health truthful and fail-closed?
4. Does startup/scheduling remain inert by default and failure-isolated when
   enabled? Can it delay or crash the host, overlap ticks, or misreport health?
5. Does the migration now work on production PostgreSQL without `pgcrypto`
   while retaining deterministic 64-hex SHA-256 provenance?
6. Is `RELATIONSHIP_CONTEXT_ENABLED=0` sufficient to keep all query/minion
   consumption denied after shadow activation?
7. Do the tests prove the material claims, including PostgreSQL null Party,
   zero projections, minimized value, registration, and replay?

## Response format

- `Verdict: NO MATERIAL FINDINGS` when all load-bearing claims hold; otherwise
  `Verdict: MATERIAL FINDINGS`.
- For each finding: consequence, exact evidence, failing scenario, bounded fix,
  and missing acceptance test.
- List source ambiguities separately; do not infer owner decisions.
