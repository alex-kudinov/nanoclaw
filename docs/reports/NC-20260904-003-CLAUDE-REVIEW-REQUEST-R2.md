# NC-20260904-003 — bounded correction review R2

## Objective

Verify that the R1 material finding is closed and that the two new MCS
Practicum presets are safe to register for later recipient issuance. Report
only material defects; do not reopen accepted visual, wording, provider, or
program decisions.

## Accepted facts and boundaries

- `mcs-foundation`, `mcs-practicum`, and `mcs-practicum-partial` are three
  materially different credential families.
- Bare `MCS` and bare `Mentor Coaching Specialization` must be treated as
  ambiguous by the ordinary collection flow.
- Full Practicum graduation has no custom recipient attributes and may use the
  exact-command fast path only after the existing identity and duplicate gates.
- Partial completion is private, has no badge, requires exactly three dynamic
  attributes, and must remain in the normal collection/review/send path.
- No recipient issuance, email, Heartbeat write, or provider deletion is in
  scope. Provider component IDs are accepted readback facts for this review.
- The partial campaign ID currently points to an existing empty provider draft
  that will be repurposed and read back before deployment. Do not treat its
  current UI state as source-correct yet.

## Review paths

Read only these implementation artifacts plus this request:

1. `/private/tmp/nanoclaw-mcs-sertifier-packages/groups/certifier/CLAUDE.md`
2. `/private/tmp/nanoclaw-mcs-sertifier-packages/src/certifier-prompt-contract.test.ts`
3. `/private/tmp/toolbox-mcs-sertifier-packages/shared/sertifier/lib/presets.json`
4. `/private/tmp/toolbox-mcs-sertifier-packages/shared/sertifier/tools/sertifier/issue-certificate.sh`
5. `/private/tmp/toolbox-mcs-sertifier-packages/shared/sertifier/registry.json`
6. `/private/tmp/toolbox-mcs-sertifier-packages/shared/sertifier/tests/test-canonical-campaigns.sh`
7. `/private/tmp/toolbox-mcs-sertifier-packages/shared/sertifier/tests/test-component-tools.sh`
8. `/private/tmp/nanoclaw-mcs-sertifier-packages/docs/reports/NC-20260904-003-CLAUDE-REVIEW-RESPONSE-R1.md`

Do not inspect `.env`, credentials, auth/session stores, unrelated worktree
state, or provider/customer data.

## Verification already run by Codex

- Toolbox component and canonical-campaign suites: pass.
- Toolbox core suite: 65 passed, 0 failed.
- Toolbox registry validation: pass.
- NanoClaw focused prompt contract: 5 passed.
- NanoClaw TypeScript typecheck: pass on pinned Node 22.23.2.
- NanoClaw full suite: 3368 passed, 31 skipped, with two unrelated pre-existing
  failures in CNPC prompt contract and Trafft shadow; neither changed path is
  involved.

## Review questions

1. Does the prompt resolve the R1 finding without silently mapping bare MCS to
   the wrong preset?
2. Are aliases unique and do full versus partial requests enter the intended
   fast-path/normal-review routes?
3. Do the partial named flags map exactly to the three registered provider
   attribute IDs and reject missing or malformed number/date values?
4. Do privacy, badge absence, campaign keys, component fingerprints, and
   sender/subject fields remain fail-closed?
5. Is there any material regression to existing preset issuance?

Write the response only to:
`/private/tmp/nanoclaw-mcs-sertifier-packages/docs/reports/NC-20260904-003-CLAUDE-REVIEW-RESPONSE-R2.md`

If no material issue remains, say `NO MATERIAL FINDINGS` and briefly identify
the contracts checked. Do not edit any implementation file.
