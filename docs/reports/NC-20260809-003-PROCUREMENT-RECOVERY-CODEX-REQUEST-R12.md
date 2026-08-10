# NC-20260809-003 Procurement Recovery — Codex Request R12

## Objective

Audit the fourth natural CaleProcure canary failure and decide the smallest
architecture that can make collection stable, reliable, and useful. Four
model-driven browser attempts have now failed the business outcome. Do not
recommend another prompt edit or longer timeout unless you can identify a new,
bounded mechanism that makes the result falsifiable.

Write only:

`docs/reports/NC-20260809-003-PROCUREMENT-RECOVERY-CLAUDE-RESPONSE-R12.md`

Do not edit any other artifact.

## Authority and boundaries

Apply `CLAUDE.md`, the continuity documents, `docs/RELEASE-INTEGRITY.md`,
`groups/procurement/CLAUDE.md`, the R9-R11 request/response chain, and the
current diff. Never read `.env*`, credentials, databases, logs, browser/session
profiles, task result payloads, or customer/operational row content. The facts
below are aggregate, non-secret evidence. Review, every commercial decision,
proposal advancement, submission, registration, terms acceptance, signature,
and customer commitment remain off or named-human-only.

## New production facts

- R11 returned GO for commit/build/deploy/canary with review disabled.
- Commit `ec62c3003aaae652712164f47b3c5c7efbc9f5d3` is live; exact code root and
  archive-attested Procurement procedure are verified; Slack/Gmail are healthy.
- Collection is `1`; review is `0`.
- Canary task `nc-20260809-003-caleprocure-canary-4` was claimed exactly once.
- Aggregate terminal evidence: one `error` task-run, duration 1,235,396 ms,
  `had_result=false`, `container_timeout=true`, zero source-run receipts.
- No task payload or container/browser log was read.
- The configured group timeout is 900,000 ms, but
  `effectiveContainerTimeoutMs` returns `max(configured timeout,
IDLE_TIMEOUT + 30,000)`. Production's default `IDLE_TIMEOUT` is 1,200,000 ms,
  so the actual ceiling was 1,230,000 ms.

## Four-run pattern

1. Natural canary 1: slow run, no source receipt; scheduler once-row also
   queued twice (later fixed).
2. Natural canary 2: no source receipt despite procedure adjustments.
3. Natural canary 3: exact host receipt mechanically passed 9/9 but falsely
   reported zero opportunities because filling Event Name did not click Search.
4. Natural canary 4: archive-owned explicit-Search/visible-only/portal-identity
   procedure; timed out with no result and no source receipt.

Independent direct public-browser reproduction reliably executes Search and
finds current event `0000039985`, business unit `3820`. An operator-assisted
host adapter canary accepted the same row and completed 9/9 coverage. Therefore
the public source and host adapter are viable; natural model-driven browser
orchestration is the repeatedly failing layer.

## Candidate direction

Move CaleProcure acquisition out of the model turn into deterministic,
host-owned browser automation. The collector should own the nine planned
queries, visible-state assertions, pagination bounds, portal-native business
unit/detail verification, schema construction, run identity, timeouts, and one
typed batch call. The Procurement agent should assess only receipted rows and
produce review-card recommendations; it should not be the scraping engine.

Possible implementation surfaces to assess:

1. a host job using an explicitly pinned browser automation dependency and the
   existing dedicated Procurement Chrome/CDP endpoint;
2. a deterministic wrapper around the existing `agent-browser` binary, only if
   its selectors/output can be parsed and tested without model judgment; or
3. an official API/feed replacement if a current first-party CaleProcure
   endpoint can be proven (do not browse the internet in this review).

The existing source-candidate report separately recommends SAM.gov official API
as the next source after closure. Do not activate a new source now.

## Required response

Return `GO`, `CHANGES REQUIRED`, or `BLOCKED` on the proposed deterministic
collector direction. Provide:

1. the evidenced root-cause statement and what is still unknown without logs;
2. whether to repair the timeout-floor contract now and exact semantics;
3. the recommended implementation surface and why alternatives are weaker;
4. a smallest end-to-end contract, module/file plan, tests, rollout gates,
   rollback, and observability;
5. how to prove the collector actually executed each search and reconcile
   reported row counts against submitted rows;
6. how to create a durable positive control after event `0000039985` closes;
7. whether collection should remain enabled while the legacy agent path is
   paused; and
8. remaining owner decisions, exact review commands, time, and cost.

No implementation or production action in this round. Preserve the exact
Claude session and write only the named response file.
