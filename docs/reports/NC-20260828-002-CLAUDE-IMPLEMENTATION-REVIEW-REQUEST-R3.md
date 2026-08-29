# NC-20260828-002 — final implementation review R3

## Objective

Review the completed canonical-campaign and exact one-command Gru
implementation. Report material findings only and write:

`/Users/xbohdpukc/dev/NanoClaw-sertifier-campaigns-20260828/docs/reports/NC-20260828-002-CLAUDE-IMPLEMENTATION-REVIEW-RESPONSE-R3.md`

This third round is owner-approved. It is the repository-mandated final
implementation review after the two strategy rounds.

## Accepted design

`docs/SERTIFIER-CAMPAIGN-STRATEGY.md` passed correction review R2 with all eight
R1 findings closed. Do not reopen the owner decision to support exact
`send ai for coaches to EMAIL` as same-turn authorization when deterministic
grammar and exact Heartbeat identity pass.

## External state already created and verified

Ten empty canonical campaigns exist, one per current preset. Each was created
without recipients and read back with exact design, Detail, badge, email
template, sender, subject, public privacy, and Draft status. Historical
campaigns are untouched. No recipient, credential, certificate email, Slack
message, or Heartbeat write occurred.

## Implementation to review

Toolbox:

- `/Users/xbohdpukc/dev/toolbox-sertifier-campaigns-20260828/shared/sertifier/lib/presets.json`
- `/Users/xbohdpukc/dev/toolbox-sertifier-campaigns-20260828/shared/sertifier/lib/campaign.sh`
- `/Users/xbohdpukc/dev/toolbox-sertifier-campaigns-20260828/shared/sertifier/tools/sertifier/issue-certificate.sh`
- `/Users/xbohdpukc/dev/toolbox-sertifier-campaigns-20260828/shared/sertifier/tools/sertifier/parse-send-command.sh`
- `/Users/xbohdpukc/dev/toolbox-sertifier-campaigns-20260828/shared/sertifier/tools/sertifier/resolve-recipient.sh`
- `/Users/xbohdpukc/dev/toolbox-sertifier-campaigns-20260828/shared/sertifier/tools/sertifier/prepare-send-command.sh`
- `/Users/xbohdpukc/dev/toolbox-sertifier-campaigns-20260828/shared/sertifier/tests/test-canonical-campaigns.sh`

NanoClaw:

- `/Users/xbohdpukc/dev/NanoClaw-sertifier-campaigns-20260828/groups/certifier/CLAUDE.md`
- `/Users/xbohdpukc/dev/NanoClaw-sertifier-campaigns-20260828/groups/certifier/EXECUTION-STEPS.md`
- `/Users/xbohdpukc/dev/NanoClaw-sertifier-campaigns-20260828/src/certifier-prompt-contract.test.ts`

Ten artifacts are necessary because the load-bearing boundary spans campaign
configuration/validation, deterministic command/identity preparation, the
issuer, and the prompt procedure. Do not inspect unrelated files.

## Verification already passed

- canonical campaign/parser/identity/issue mock integration test;
- component test;
- registry validation;
- toolbox framework 65/65;
- live read-only 10/10 campaign validation;
- live content-minimized mixed-case Heartbeat command preparation;
- AI canonical `.invalid` dry run with `willSend:true` but no provider call;
- NanoClaw prompt contract 4/4, typecheck, continuity/capability checks.

## Required invariants

- recipient issuance never POSTs `/campaign`;
- live send validates campaign before duplicate search/add;
- missing/malformed/drifted/scheduled/private-wrong campaign fails before add;
- exact alias grammar precedes bare send and cannot collide by substring;
- only attribute-free presets get immediate same-turn authorization;
- exact identity is deterministic and all ambiguous states stop;
- durable pending script precedes provider write;
- `already_issued` is no add/no resend;
- uncertain reconciliation is non-sendable and never auto-retried;
- campaign/operator override cannot bypass fingerprint validation;
- grader handoffs, ordinary review, batch review, and placeholders remain safe.

Do not read `.env`, credentials, provider/recipient data, browser/session state,
pending/completed scripts, conversations, or unrelated files. Do not edit any
implementation. State explicitly whether any unresolved material finding
remains.
