# NC-20260827-004 bounded implementation review

## Objective

Review the smallest source correction for a production release-contamination
incident. Report only material correctness, safety, or regression findings.
Do not implement changes.

## Accepted incident facts

- Production release `d11e949bd1c29e8677c6293331db7ec5f93b986d`
  acquired one unlisted `logs/nanoclaw.jsonl` file after activation.
- The file contained one aggregate warning from a Stripe-ingress parity
  diagnostic and was created while that diagnostic used the immutable release
  as its working directory. It contained no credential value or customer data.
- The Plutio reaper verifies the whole bundle before executing, so 26 scheduled
  runs failed before any Plutio call. Six durable pending rows accumulated.
- The contaminant was checksum-preserved outside the release. The unchanged
  release then verified successfully, and the established reaper processed all
  six rows successfully with zero retries or dead letters. The live daemon,
  release identity, Gmail, and Slack remained healthy.
- The dirty primary checkout and unrelated production state are protected.

## Proposed correction

1. Resolve the implicit JSONL path through a pure helper.
2. When the working directory is an inventory-bearing release root or any
   descendant, disable only the implicit structured sink. Pretty stdout/stderr
   remains available.
3. Preserve `NANOCLAW_JSONL_PATH` as an explicit override so an operator can
   route a bounded diagnostic to an operational path outside the release.
4. Rename the verifier's misleading inventory labels from `missing`/`extra` to
   `unlisted`/`absent` and test the exact diagnostic.
5. Record the runtime-write boundary in the release authority and project map.

## Review paths

Read only these implementation/authority files plus this request:

- `src/logger-path.ts`
- `src/logger-path.test.ts`
- `src/logger.ts`
- `scripts/verify-release.mjs`
- `src/release-bundle-verifier.test.ts`
- `docs/RELEASE-INTEGRITY.md`
- `docs/PROJECT-MAP.md`

Do not inspect `.env*`, credentials, auth/session stores, runtime databases,
logs, backups, unrelated worktree changes, or customer/operational content.

## Evidence already run

- Focused logger/verifier tests: 9/9 pass.
- `npm run format:check`: pass.
- `npm run typecheck`: pass under pinned Node 22.23.2.

## Acceptance criteria

- Ordinary operational working directories retain the existing default JSONL
  path.
- An implicit logger initialized from a release root or descendant cannot
  create runtime state inside the release.
- An explicit path override still works.
- Bundle verification remains fail-closed for unlisted, absent, modified,
  unsafe, duplicate, and symlink entries.
- The change grants no new provider, job, payment, communication, credential,
  or customer authority.
- Material findings must cite the exact file and behavior. Do not report style,
  optional refactors, broad backlog, or unrelated issues.

## Required response

Write only
`docs/reports/NC-20260827-004-CLAUDE-IMPLEMENTATION-REVIEW-RESPONSE-R1.md`.
Use either `NO MATERIAL FINDINGS` or a short ordered list of material findings
with evidence and the minimum required correction.
