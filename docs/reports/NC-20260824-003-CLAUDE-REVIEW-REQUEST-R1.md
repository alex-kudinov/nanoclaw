# NC-20260824-003 bounded review request

## Objective

Review the source-controlled repair that prevents NanoClaw Sales/minions from
denying verified French, Japanese, or Spanish Mentor Coaching Foundations
availability. Report material correctness, authority, regression, or safety
findings only.

## Accepted current facts

Do not reopen these release facts; they were verified before implementation:

- Spanish course release record: 25 Published / 0 Draft.
- Japanese course release record: 25 Published / 0 Draft and complete product
  journey verified.
- French course release record: 27 Published / 0 Draft; first natural purchase
  canary remains pending but availability is live.
- On 2026-08-24, the dedicated French, Japanese, and Spanish public sales pages
  each returned HTTP 200 and contained their dedicated checkout product key.
- These facts prove localized asynchronous Foundations products only. They do
  not prove localized live Standard Path delivery or translated official ICF
  MCS recognition.

## Authority and boundaries

- Current owner instruction and the accepted NC-20260824-003 decision govern.
- Provider/public evidence outranks the pinned catalog; the catalog outranks
  generated KB copies and model memory.
- Allowed change: catalog/pack, deterministic injection/checking, runtime drift
  detection, focused tests, and authority documentation.
- Forbidden: customer reply, Slack/email send, provider/course/enrollment/
  payment/translation/entitlement/price/customer mutation, or external action.
- Claude may write only the named response file and may not edit source.

## Review paths (exactly eight)

1. `facts/catalogs/mcs-foundations-locales.json`
2. `facts/catalogs/mcs-foundations-locales.minion.md`
3. `facts/programs.yaml`
4. `tools/sync-program-facts.py`
5. `tools/tests/test_sync_program_facts.py`
6. `tools/validate-knowledge.sh`
7. `src/program-facts-drift.ts`
8. `src/program-facts-drift.test.ts`

Do not read whole unrelated files or use MCP/external tools.

## Questions that matter

1. Is the pack byte-hash-bound to the exact catalog consistently in Python and
   TypeScript, including newline/encoding behavior?
2. Does injection remain idempotent, replace stale blocks, reach all tracked
   KBs after generic propagation, and fail closed on missing/malformed inputs?
3. Does the runtime detector reject missing, stale-hash, wrong-revision,
   incomplete-language, or non-exact Sales KB state without weakening existing
   Practitioner facts?
4. Does generic knowledge validation exclude only correctly paired canonical
   blocks, while still reaching the exact catalog checks?
5. Is the Sales wording direct and accurate without overclaiming localized live
   cohorts, ICF recognition, pricing, enrollment, or natural-purchase proof?
6. Are the tests sufficient for the load-bearing failure modes?

## Verification already run

- Python injection/catalog tests: 4/4 passed.
- TypeScript program-facts focused suites: 24/24 passed.
- Exact inject/check across all 13 tracked KBs: passed twice/idempotent.
- Typecheck, build, shell syntax, docs continuity, capability check, and diff
  check: passed.
- Full root suite: 3,210 passed / 19 skipped / the unchanged CNPC
  source-wrapper literal failure.
- Generic KB validation now reaches and passes both canonical-facts checks; its
  pre-existing baseline still reports four non-site/stale prices, six taxonomy
  path strings, and the missing historical llms-full hash.

## Response contract

Write only `docs/reports/NC-20260824-003-CLAUDE-REVIEW-RESPONSE-R1.md`.
Order findings by severity with exact path/line evidence. If none exist, state
`NO MATERIAL FINDINGS` and briefly name the invariants checked. Do not produce
a speculative backlog or repeat the request.
