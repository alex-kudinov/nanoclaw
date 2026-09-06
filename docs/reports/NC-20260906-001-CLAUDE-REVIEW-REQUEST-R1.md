# NC-20260906-001 — graduate announcement bounded review

## Objective

Review the shared post-issuance contract that adds one verified, image-bearing
congratulations thread to Heartbeat's exact `Our Graduates` channel after a
newly issued public certificate. Report material correctness, privacy,
idempotency, and authorization defects only.

## Accepted provider facts

- A live active Sertifier credential exposed a token-free
  `certificateImageLink`; Codex downloaded a valid 1584x1224 PNG. The provider
  also returned a temporary PDF link.
- Heartbeat's documented `GET /channels` returns channel ID/name/type.
- Heartbeat's documented `PUT /threads` accepts `text`, `channelID`, and
  optional iframe `embeds`. It does not document a native image/file field in
  the create request. The implementation deliberately uses the documented
  iframe embed rather than an undocumented upload endpoint.
- Live read-only preflight resolved exactly one channel:
  `Our Graduates`, ID `845b7ebb-d7b9-47de-be58-119de3614ab7`, type `POSTS`.
- A live dry run against one existing public credential downloaded and
  validated its 2.1 MB PNG, derived its Detail title and branded registrar URL,
  checked the live channel/recent threads, and returned `willPost:false`.
- Do not request or perform a live canary post with an existing graduate. The
  first natural authorized issuance is the outcome proof.

## Required invariants

1. Announce only after `status:issued`, `created:true`,
   `emailConfirmed:true`, and `credential.isPublic:true`.
2. Never announce private partial-completion records or automatically announce
   `already_issued` credentials.
3. Resolve recipient/title/image/campaign from the exact Sertifier credential,
   not caller prose. Reconcile the exact campaign by credential ID when the
   single-get response omits `campaignId`.
4. Require the exact Heartbeat channel ID, exact name, and `POSTS` type.
5. Validate the certificate PNG before posting. Permit only the established
   public Sertifier certificate host/path and a 10 MB maximum.
6. Dry-run by default. Live requires `--execute --confirm ANNOUNCE-GRADUATE`.
7. Prevent duplicate posts by the branded registrar URL. An uncertain live
   result gets one read-only dry-run reconciliation, never a blind repost.
8. Direct recipient delivery and the community post remain separate receipts.
   Announcement failure never rolls back or falsifies the issued certificate.
9. The Heartbeat grading skill preserves its direct recipient message and
   records announcement receipts/exceptions in the validated run ledger.
10. No raw customer email, API key, token-bearing URL, undocumented provider
    endpoint, test post, credential issuance, or historical backfill.

## Review paths

Read only this request and these eight artifacts:

1. `/private/tmp/toolbox-graduate-announcements/shared/sertifier/tools/sertifier/announce-graduate.sh`
2. `/private/tmp/toolbox-graduate-announcements/shared/sertifier/tests/test-announce-graduate.sh`
3. `/private/tmp/toolbox-graduate-announcements/shared/sertifier/registry.json`
4. `/private/tmp/nanoclaw-graduate-announcements/groups/certifier/CLAUDE.md`
5. `/private/tmp/nanoclaw-graduate-announcements/groups/certifier/EXECUTION-STEPS.md`
6. `/private/tmp/nanoclaw-graduate-announcements/src/certifier-prompt-contract.test.ts`
7. `/Users/xbohdpukc/.codex/skills/heartbeat-grade-submissions/SKILL.md`
8. `/Users/xbohdpukc/.codex/skills/heartbeat-grade-submissions/scripts/validate-ledger.py`

The ledger template addition is two empty arrays named
`graduate_announcements_sent` and `graduate_announcement_exceptions`. The
read-only `heartbeat/list-channels` helper is mechanically covered and outside
the load-bearing write review.

Do not inspect `.env`, credentials, authentication stores, provider/customer
records, unrelated worktrees, Slack, Heartbeat UI, or browser/session history.
Do not edit implementation files.

## Verification already run

- Toolbox announcement regression suite: pass, including dry-run, exact
  channel/type, payload embed, confirmation gate, readback, duplicate recovery,
  private credential refusal, invalid PNG refusal, and chat-channel refusal.
- Existing Sertifier component/canonical suites: pass.
- Both toolbox registries validate; framework suite 65/65.
- Live `list-channels` and announcement dry run: pass; no post.
- NanoClaw prompt contract 6/6, typecheck, and continuity: pass.
- NanoClaw full suite: 3,369 passed/31 skipped with only the two unchanged CNPC
  wrapper and date-stale Trafft baseline failures.
- Heartbeat skill quick validation, course-variant validation, existing 11
  attachment tests, and new 3 announcement-ledger tests: pass.

## Response

Write only to:
`/private/tmp/nanoclaw-graduate-announcements/docs/reports/NC-20260906-001-CLAUDE-REVIEW-RESPONSE-R1.md`

Report material findings with exact file/evidence references. If none remain,
say `NO MATERIAL FINDINGS` and briefly name the contracts checked.
