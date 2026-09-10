# Independent bounded implementation review

Review the local Bookkeeper enrollment contract against the accepted contract
in `docs/BOOKKEEPER-ENROLLMENT-CONTRACT.md`. Report material correctness or
authority failures only, with precise references and reproductions. Write your
verdict to `docs/reports/NC-20260906-006-CLAUDE-RESPONSE-R1.md` and stop.

Allowed reads (paths relative to this isolated repository):
- `src/bookkeeper-enrollment-contract.ts`
- `src/bookkeeper-enrollment-contract.test.ts`
- `docs/BOOKKEEPER-ENROLLMENT-CONTRACT.md`
- If necessary, read only relevant named command implementations in
  `src/student-enrollment-foundation.ts` and `src/academy-capacity.ts`.

The first three artifacts total about 45k characters. Stay bounded; no broad
archaeology. No Bash, network, MCP, web, secrets, .env, credentials, session
stores, customer records, data dumps, unrelated files, or production access.
Write only the named response. Source changes and tests are Codex's job.

Accepted owner scope: local, synthetic, unwired composition; no production
database/schema/runtime/provider/Sheet action, history replay/reconciliation,
deployment, payment/refund, or communication. Commit/push and governance
reconciliation are authorized after review. Do not reopen strategy or infer
production authority. The host receives authenticated evidence and exact
catalog/Party context through a FUTURE adapter; the current pure function does
not authenticate a provider. Its authority parameter is trusted host context,
never model-controlled. Verify this boundary is honest and fails closed.

Existing engines are canonical: enrollment orders/seats/enrollments/typed
entitlements/finance/class assignments/outbox/exceptions; capacity commitments
count already received promises even above capacity, expire at block end, and
are consumed into exact assignments without double counting. There is no
temporary checkout reservation or live website dependency in this strategy.
The legacy live payment/roster/website-commitment path remains unwired here;
its future replacement is explicitly gated. One fully settled funding receipt
or owner grant and one explicit starting class per seat are the supported
contract; installment schedules and multi-receipt commercial alias discovery
are not silently inferred.

Check: malformed/unverified/duplicate/conflicting source, changed participant
or funding facts, payer separation, partial sponsor orders, catalog binding,
grant role, capacity/assignment rollback and occupancy, exact replay, future
state, versioned projection preview/readback, durable owned exceptions,
immutable inputs, and whether tests expose material gaps.

Verification before review: focused 124/124 (37 new cases), pinned Node 22.23.2
typecheck passed. Full root: 3,657 passed, 32 skipped, two unrelated predecessor
failures (CNPC wrapper-literal assertion and date-sensitive Trafft freshness).
Source now also rejects expired blocks and noncanonical source identities;
final focused/full runs will follow review corrections. No production action.

Output: `NO MATERIAL FINDINGS` or prioritized verified findings with file/line,
consequence, and minimal correction. Do not restate the packet or propose a
speculative backlog. Sonnet, high effort, fresh bounded session.
