# NC-20260824-009 lifecycle relay correction review R1

## Objective

Review the minimal correction for the production lifecycle error incident.
Decide whether the exact host/workflow change is safe to commit, release, and
deploy disabled-first for direct transport canaries. Report material findings
only. If none exist, end with `NO MATERIAL FINDINGS`.

## Accepted incident facts

- After the four-action Community shadow was activated, `#gru-chief` received
  16 n8n failure alerts. Every retained envelope identifies workflow
  `Student Lifecycle Community - Four Action Shadow`, node
  `Normalize and Sign Community Lifecycle`, error
  `unsupported_heartbeat_action`.
- Real Heartbeat webhook bodies omit the registered action name. The four
  authorized minimal shapes are mutually distinguishable by fields:
  `id+email`, `id`, `userID+groupID`, and `userID+courseID`.
- The reviewed relay intentionally excludes `name` and `courseName`, but the
  host still required both and would have rejected two inferred actions.
- Production is contained: only the four new registrations were deleted, the
  protected 18-row baseline matches exactly, the lifecycle workflow is
  inactive, n8n has zero active executions, and the error-handler count stayed
  fixed after disable. Circle and legacy receivers were untouched.
- Local verification passes: focused 103/103; typecheck/build/format/diff;
  documentation continuity/capabilities; full root 3,213 pass / 19 skip with
  only the unchanged CNPC wrapper failure; runner 43/43.

## Protected invariants

- Community only. Circle, all 18 legacy registrations, and all lifecycle
  consumers remain untouched.
- Infer an action only when exactly one mutually exclusive required-field shape
  matches. Reject ambiguity and explicit-action/shape mismatch.
- Forward only the existing minimized fields. Never add names, course names,
  payload previews, message content, grading, certificates, or payment detail.
- Preserve HMAC/body identity, random relay delivery IDs, stable downstream
  business keys, size limits, retries, no-retention settings, and active false
  in the tracked workflow.
- The host may stop requiring discarded fields, but must retain UUID/email
  validation, privacy minimization, identity hashing, quarantine, idempotency,
  and no-action behavior.
- Release packaging must bind both the human-readable code-node source and the
  exact embedded workflow bytes.
- This review authorizes no deployment or provider write. Reactivation remains
  gated by exact disabled-first release/workflow deployment, four direct
  minimal-payload canaries, and no error-handler increase.

## Allowed artifacts (eight total)

1. This request.
2. `/private/tmp/nc009-lifecycle-correction-review.patch`.
3. `setup/n8n/student-lifecycle-community-shadow-code.txt`.
4. `setup/n8n/student-lifecycle-community-shadow-workflow.json`.
5. `src/student-lifecycle.ts`.
6. `src/student-lifecycle-shadow-n8n-contract.test.ts`.
7. `src/student-lifecycle.test.ts`.
8. `scripts/build-release.mjs`.

Do not read `.env`, credentials, databases, execution payloads, Slack content,
dumps, browser state, unrelated reports, or other repository files. Do not use
Bash, web, MCP, or broad search. Do not edit implementation files.

## Response

Write only
`docs/reports/NC-20260824-009-CLAUDE-CORRECTION-RESPONSE-R1.md`.
Order material findings by consequence with exact file/evidence references and
minimal corrections. Do not propose optional backlog or reopen accepted scope.
