# NC-20260826-004 — Provider identity reconciliation review R1

Review independently with Claude Sonnet/high. Do not use Bash, network,
databases, provider tools, credentials, `.env*`, runtime stores, or files
outside the allowed packet. Do not edit source. Write the response to
`docs/reports/NC-20260826-004-CLAUDE-IMPLEMENTATION-REVIEW-RESPONSE-R1.md`.

## Accepted outcome

Connect every defensible Trafft, Plutio, and Encharge identity through explicit
evidence tiers, then durably classify every unresolved remainder `legacy`.
Provider-native fact authority remains scoped. No provider/contact/consent/
campaign/Plutio write, Party merge, customer communication, payment/contract
action, broad minion access, or adjacent runtime change is authorized.

## Allowed packet

NanoClaw:

1. `.program/decisions/decision-relationship-context-best-effort-identity-reconciliation-2026-08-26.json`
2. `docs/RELATIONSHIP-CONTEXT-PROVIDER-RECONCILIATION.md`
3. `src/relationship-context-provider-reconciliation.ts`
4. `src/relationship-context-provider-reconciliation.test.ts`
5. `src/relationship-context-provider-toolbox.test.ts`
6. `src/relationship-context-trafft-shadow.ts`
7. `src/relationship-context-trafft-shadow.test.ts`
8. `src/relationship-context-store.integration.test.ts`
9. `scripts/prepare-encharge-identity-snapshot.ts`
10. `.toolbox/registry.json` limited to `encharge-read`
11. `.toolbox/tools/encharge/bulk-get-people.sh`
12. `src/relationship-context-contract.ts` and
    `src/relationship-context-store.ts` only as unchanged contract context

Toolbox:

13. `/Users/xbohdpukc/dev/toolbox/shared/encharge/tools/encharge/people.sh`
    limited to the `bulk-get` branch
14. `/Users/xbohdpukc/dev/toolbox/shared/encharge/lib/lib_encharge.py` limited
    to `bulk_get_people_to_file`
15. `/Users/xbohdpukc/dev/toolbox/shared/encharge/registry.json` limited to the
    `people` entry
16. `/Users/xbohdpukc/dev/toolbox/shared/encharge/tests/test_people_bulk_get.py`

## Evidence already passed

- focused NanoClaw 30/30 and typecheck;
- disposable PostgreSQL 2/2;
- toolbox bulk-get 6/6, shell/JSON validation, registry 24/24;
- aggregate-only live preflight: 1,374 Plutio refs; 1,242 unique Encharge
  matches with one shared email refused; 173 Trafft customers/400 appointments,
  projected 159/358 connected and 14/42 legacy.

## Review questions

1. Can any Plutio, Encharge, or Trafft identifier bind to the wrong canonical
   Party through ambiguity, duplicate provider IDs, merge lineage, stale input,
   inconsistent customer history, or transaction ordering?
2. Does the implementation truthfully distinguish source-created,
   Plutio-corroborated, Encharge-corroborated, conflicting, and legacy evidence?
3. Can a replay reopen legacy exceptions, rewrite immutable observations,
   duplicate projections, or produce unstable counts/receipts?
4. Can raw email/name/phone/address/IP/provider payload, credentials, or values
   outside bounded consent state reach the sanitized snapshot, database,
   logs, health, receipts, or review artifacts?
5. Does NanoClaw expose any Encharge mutation/send capability despite the
   least-privilege wrapper?
6. Are provider failure, partial batch, malformed snapshot, existing-output,
   and different-family ref conflicts fail-closed and recoverable?
7. Are transaction size, sequential ref writes, scheduler cost, and the
   exception-update loop safe for the measured 1,374/1,242/422 scale?
8. Do tests prove the load-bearing negative paths and the accepted completion
   condition? Report only material correctness, identity, privacy, authority,
   durability, or operability findings; cite exact file/line and a bounded fix.
