# NC-20260826-004 — Provider identity reconciliation correction review R2

Resume Claude Sonnet/high session `b75c6b3a-b801-481d-98ea-c62c099a3e29`.
Review only the R1 findings and the bounded corrections below. Do not use Bash,
network, databases, provider tools, credentials, runtime stores, or out-of-
packet files. Do not edit source. Write the response to
`docs/reports/NC-20260826-004-CLAUDE-CORRECTION-REVIEW-RESPONSE-R2.md`.

## Allowed packet

1. `docs/reports/NC-20260826-004-CLAUDE-IMPLEMENTATION-REVIEW-RESPONSE-R1.md`
2. `src/relationship-context-store.ts`: `resolveExternalRef` and
   `bindExternalRef` in both repositories
3. `src/relationship-context-provider-reconciliation.ts`:
   `bindExternalRefOrRecordConflict`, Plutio loop/query, and Encharge bind loop
4. `src/relationship-context-trafft-shadow.ts`: customer/appointment bind
   loops, actual-count readback, and `classifyTrafftIdentityWithClient`
5. `src/relationship-context-provider-reconciliation.test.ts` collision test
6. `src/relationship-context-store.test.ts` merge read test
7. `src/relationship-context-store.integration.test.ts` limited-window,
   missing-customer, pre-rebind appointment merge, 1,400-row scale/replay, and
   conflict-isolation portions

## Corrections to verify

1. Each Plutio, Encharge, Trafft-customer, and Trafft-appointment bind catches
   only a different-family external-ref conflict, writes an explicit
   `external_ref_conflict` exception, and continues; other errors still abort.
2. Classification groups every appointment ID, including missing customer ID,
   multiple customer IDs, zero/multiple Parties, source/ref mismatch, and
   ordinary uncorroborated history. Every unresolved appointment is terminal
   legacy with a distinct evidence tier.
3. An unresolved appointment first calls `ensureIdentityException`; the
   terminal update must affect exactly one row, so classification cannot be
   counted without persistence even outside the ingestion limit.
4. Both repositories now canonicalize `resolveExternalRef`; PostgreSQL
   `bindExternalRef` canonicalizes once and uses `INSERT ... RETURNING` instead
   of three post-write reads.
5. Steady-state Plutio and Trafft loops skip same-Party existing refs. A
   disposable 1,400-row first run finishes below 10 seconds and replay below 2
   seconds while preserving one different-family conflict and all valid refs.
6. Tests cover per-row collision isolation, direct pre-rebind canonical read,
   missing-customer legacy, ingestion-limit-excluded exception durability, and
   scale/replay. Focused 31/31, typecheck, and PostgreSQL 3/3 pass.

Return `NO MATERIAL FINDINGS` only if every R1 material/scale/test issue is
closed without weakening identity, privacy, transaction, or provider-action
boundaries. Otherwise cite exact remaining material issue and bounded fix.
