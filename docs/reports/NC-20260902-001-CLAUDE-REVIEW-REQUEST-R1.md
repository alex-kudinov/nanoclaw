# NC-20260902-001 — bounded implementation review request R1

## Objective

Review the durable correction for a production Sales knowledge-source defect.
Report only material findings: bugs, unsafe authority inversions, fail-open
behavior, release/activation gaps, or tests that can pass while the production
defect remains.

Write the response only to:
`docs/reports/NC-20260902-001-CLAUDE-REVIEW-RESPONSE-R1.md`.

## Accepted incident facts

- Exact live release `8df61d98c9e46ac63bf7de7850e3e7decbaa9560`
  mounted its release-owned `knowledge/agents/sales` directory.
- That directory contained the exact stale instructions "PRE-LAUNCH / in
  development", "no public student price", and interest-only routing.
- The operational Mini checkout already contained live/enrolling AACS facts,
  a current `SCHEDULE.md`, and two learned corrections for this error.
- The release had no Sales `SCHEDULE.md` and only 49 learned lessons versus 97
  operational lessons.
- The public/current source says Coaching Supervision Mastery is live,
  AACS-accredited, and enrolling; inaugural cohort October 7, 2026 through
  February 10, 2027; $3,996 inaugural and $4,796 regular tuition.
- Procurement's directory contains executable browser procedures and must
  remain manifest-covered/release-owned. Ordinary business KBs, schedules, and
  learned corrections are operational projections that must update between
  software releases.

Do not reopen those facts unless the implementation contradicts them.

## Intended design

1. Restrict release-owned knowledge precedence to an explicit Procurement
   allowlist. Every other configured knowledge mount remains operational.
2. Package only `knowledge/agents/procurement`, eliminating plausible stale KB
   decoys from the release.
3. Keep immutable facts/catalogs and sync code in the release, but make the
   detector read the operational Sales KB that Sales actually consumes.
4. Add a raw-byte-hash-bound Coaching Supervision Mastery catalog/minion pack,
   exact checkout expectations, and forbidden stale claims. Inject it into all
   tracked KBs and preserve it through ordinary regeneration.
5. Make release build check all tracked consumers. Make activation check the
   operational consumer with the target release's exact sync code/catalogs.
   Activation must remain read-only: backup/injection is an explicit deployment
   step before dry-run/apply.
6. Add a replay case for the incident without approving or sending customer
   communication.

## Non-objectives and protected boundaries

- No customer email, Slack post, approval, checkout/provider mutation, schedule
  change, schema change, migration, or historical replay.
- Do not weaken Procurement procedure integrity or the three-pointer release
  activator.
- Do not inspect `.env`, credentials, auth/session stores, runtime databases,
  customer records, unrelated dirty work, or private tool settings.
- Do not edit implementation. This is review-only; write only the response.

## Allowed source artifacts

1. `src/container-runner.ts` and `src/container-runner.test.ts`
2. `src/program-facts-drift.ts` and `src/program-facts-drift.test.ts`
3. `tools/sync-program-facts.py` and
   `tools/tests/test_sync_program_facts.py`
4. `scripts/build-release.mjs`, `src/program-facts-release-source.test.ts`, and
   `tools/validate-knowledge.sh`
5. `src/release-activation-exec.ts` and
   `src/release-activation-exec.test.ts`
6. `facts/catalogs/coaching-supervision-mastery.json` and
   `facts/catalogs/coaching-supervision-mastery.minion.md`
7. `knowledge/agents/sales/KNOWLEDGE.md`,
   `evals/sales/request-first-cases.json`, and
   `src/sales-prompt-contract.test.ts`
8. `docs/MINION-FRAMEWORK.md`, `docs/PROJECT-MAP.md`, and
   `docs/RELEASE-INTEGRITY.md`

## Verification already performed

- Canonical injection/check: 13 tracked KBs, pass.
- Pure current-products detector: 5 guarded domains, 0 findings.
- Focused TypeScript: 5 files / 92 tests, pass.
- Python sync/catalog/alternate-target: 8/8, pass.
- Typecheck, formatting, shell syntax, Python syntax, and documentation
  continuity: pass.
- Email-critical: 30 files / 748 tests, pass.
- Independent runner: 8 files / 45 tests, pass.
- Full host: 315 pass files, 10 skipped, 3,394 tests passed, 32 skipped, two
  failures. Both exact failures reproduce on untouched base `59fbdbea`:
  `cnpc-prompt-contract` wrapper-literal expectation and date-stale Trafft
  projection fixture.
- Negative effective-target check rejects the unsynchronized operational
  checkout before activation.

## Review questions

1. Can Sales or another ordinary minion still resolve the packaged stale KB
   instead of its configured operational knowledge mount?
2. Can Procurement's mutable configured alias shadow the release procedure?
3. Can catalog, pack, checkout expectations, or stale claims drift while sync,
   detector, build, or activation still passes?
4. Can the activation preflight mutate operational knowledge, use the wrong
   release's sync code, or pass against a non-effective target?
5. Can weekly KB regeneration remove the AACS block after deployment?
6. Does removing broad `knowledge/` packaging omit another required immutable
   runtime input?
7. Is rollback behavior and the operational synchronization sequence truthful?

## Required response format

- `GO` or `CHANGES REQUIRED`.
- Material findings only, ordered by consequence, with exact file/evidence
  references and the smallest adequate correction.
- Explicitly state when there are no material findings.
- Do not add speculative backlog, style preferences, or restate the packet.
