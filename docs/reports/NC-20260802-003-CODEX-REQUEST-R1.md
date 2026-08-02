# NC-20260802-003/004/005 Codex request to Claude — architecture review R1

## Objective

Adversarially review the proposed implementation boundaries for the next three
NanoClaw Company-OS slices before Codex writes production code:

1. `NC-20260802-003`: one validated release-activation operation that changes
   the release code root and expected full commit together, retains rollback,
   and reloads launchd once;
2. `NC-20260802-004`: a durable SQLite Heartbeat submission index keyed only by
   the real Heartbeat submission ID, recording Slack delivery, grader verdict,
   Heartbeat writeback, source observation, record version, and append-only
   transitions without storing submission bodies or feedback;
3. `NC-20260802-005`: a deterministic coordinator that drains live Modules 1-5
   work with at most five Slack roots, exposes all outstanding roots as one poll
   batch, and unlocks Module 6 only when all eight prerequisites were explicitly
   observed approved in Heartbeat during the current run.

The response must identify blocking design defects, missing invariants, unsafe
authority assumptions, and the smallest implementable file/API/test plan.

## Non-objectives and owner boundaries

- Do not edit implementation, prompts, schemas, service definitions, external
  skills, or toolbox files in this round.
- Do not deploy, restart launchd, modify an installed plist, write production
  SQLite/PostgreSQL, call Slack/Heartbeat, send messages, or issue certificates.
- Do not invent a Heartbeat API. The signed-in browser remains the source/read
  and write surface; a browser operator supplies observations and confirms
  writebacks.
- Do not broaden the fixed grader upload capability or use Slack/receipts as
  workflow truth.
- Do not make the coordinator an autonomous student-facing actor.

## Authority order

Read these tracked sources in order:

1. `CLAUDE.md`
2. `docs/PROJECT-MAP.md`
3. `docs/ACTIVE-WORK.md`, especially NC-001 through NC-005
4. `docs/CHANGE-PROTOCOL.md`
5. `docs/RELEASE-INTEGRITY.md`
6. latest NC-001/002 entries in `docs/ENGINEERING-CHANGELOG.md`
7. `agent_docs/messages-db-schema.md`
8. `groups/grader/CLAUDE.md`
9. `src/db.ts`, `src/grader-file-message.ts`, `scripts/build-release.mjs`,
   `scripts/verify-release.mjs`, `setup/launchd/com.nanoclaw.plist`
10. `docs/COMPANY-OS-IMPROVEMENT-PLAN.md` sections P1.1, P2.9, and grader closure

The external operator procedure is evidence, not repository authority:

- `/Users/xbohdpukc/Sync/Codex-Shared/personal-skills/heartbeat-grade-submissions/SKILL.md`
- its `references/decision-rules.md`, `batch-ledger.md`, and
  `approval-index.md`

## Forbidden sources

Do not read or transmit `.env*`, Claude settings, credentials/auth stores,
browser profiles, local session transcripts, live database rows, Slack file
URLs, student submission content, feedback, or unrelated dirty-checkout files.

## Accepted facts

- Production code identity is `23ffb07d47512ae9c889a87328ff71dc38b443f8`.
- Deployment documentation is committed at `0f20224` on the release lineage.
- This branch is an isolated continuation at `0f20224`; the original shared
  checkout is heavily dirty and must not be touched.
- Production uses Node 22.23.2 and launchd legacy unload/load behavior.
- The grader upload canary and duplicate replay passed without OAuth changes.
- Heartbeat is authoritative for submission status and course completion.
- `store/messages.db` is the local operational SQLite control plane.
- A natural wall-clock container timeout remains a separate NC-002 observation.

## Proposed implementation direction to challenge

### Release activation

- Add a host-side activation library plus an explicit CLI.
- Preflight the candidate release manifest, Node pin, compiled artifact,
  dependency resolution, plist structure, and target paths before mutation.
- Render the executable path, `NANOCLAW_CODE_ROOT`, and
  `NANOCLAW_EXPECTED_RELEASE_COMMIT` into one candidate plist.
- Validate the candidate, create a non-overwriting rollback copy, atomically
  rename the candidate into place, and perform one unload/load cycle.
- If activation fails after plist replacement, restore the rollback plist and
  attempt one bounded rollback load; never rebuild in place.
- Separate `prepare` tests from the privileged/live activation command.

### Submission index

- Add `heartbeat_submissions` plus append-only
  `heartbeat_submission_transitions` tables in SQLite.
- Require a non-empty real Heartbeat submission ID as the primary key.
- Persist only stable IDs/keys, assignment/status metadata, timestamps, hashes,
  Slack root/file IDs, verdict/writeback state, source last-seen state, and
  integer version. Never persist bodies, feedback, URLs, or personal messages.
- Use typed, optimistic transitions with expected version and legal state
  checks. A duplicate observation is idempotent; stale writers fail.
- Heartbeat observations and confirmed writebacks are separate transitions.

### Coordinator

- Pure deterministic planner over indexed rows plus a run snapshot containing
  the current live queue counts and current-run prerequisite observations.
- At most five unresolved posted/processing roots; return all root timestamps
  as one polling batch.
- Phase 1 chooses only Modules 1-5 while live `Complete (no feedback)` is
  non-zero. Module 6 is wholly blocked until it is zero.
- Module 6 requires all eight canonical assignment titles to have current-run,
  Heartbeat-sourced approved observations and no newer unresolved/retry row.
- Contradictory/missing grader markers or failed writeback confirmation hold the
  item; the coordinator never guesses or certificates.

## Required response

Write only:

`docs/reports/NC-20260802-003-CLAUDE-ARCHITECTURE-REVIEW-R1.md`

Include:

1. verdict: `APPROVE DESIGN`, `APPROVE WITH REQUIRED CHANGES`, or
   `REJECT DESIGN`;
2. findings ordered P0/P1/P2 with file/line evidence;
3. corrected authority/state model and explicit invariants;
4. minimal file/API/schema plan for all three slices;
5. focused and negative acceptance tests;
6. whether any owner decision is genuinely required before implementation;
7. elapsed time and unresolved issues.

Do not edit this request, ACTIVE-WORK, or any other file.
