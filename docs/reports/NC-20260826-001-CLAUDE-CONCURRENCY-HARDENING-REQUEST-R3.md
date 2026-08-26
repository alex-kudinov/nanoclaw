# NC-20260826-001 — Assignment concurrency hardening review R3

Use Claude Sonnet with high effort. Review only the transaction-lock hardening
added after R2. Do not edit files, run Bash, inspect secrets, or access external
systems. Return the complete response report.

## Prior result

R2 returned `NO MATERIAL FINDINGS` and noted one non-material boundary: two
concurrent admin inserts for the same assignment scope could validate against
the same prior row under READ COMMITTED.

## Hardening

`fn_validate_relationship_owner_assignment` now acquires:

```sql
pg_advisory_xact_lock(
  hashtextextended(NEW.scope_type || ':' || NEW.scope_key, 0)
)
```

before reading the current assignment. This serializes only the exact
scope for the transaction. Hash collision can over-serialize but cannot weaken
authority. No runtime writer, role grant, action boundary, or other source is
changed.

## Allowed packet

Read only:

1. this request;
2. `docs/reports/NC-20260826-001-CLAUDE-CORRECTION-REVIEW-RESPONSE-R2.md`;
3. `data/business/migrations/nanoclaw-v2/138_relationship_owner_authority.sql`;
4. `src/relationship-owner-migration.test.ts`.

## Questions

1. Does the lock actually serialize concurrent inserts for the same exact
   scope through commit/rollback?
2. Can the lock create an authority bypass, deadlock cycle, missing-extension
   dependency, or unsafe cross-scope effect?
3. Does it preserve the initial three-lane seed and later exact-supersession
   validation?

Respond `Verdict: NO MATERIAL FINDINGS` or give the exact material finding,
evidence, bounded fix, and missing test.
