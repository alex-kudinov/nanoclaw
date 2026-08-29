# NC-20260828-002 — final implementation review response R3

## Scope

Reviewed exactly the ten allowed artifacts (toolbox `presets.json`,
`campaign.sh`, `issue-certificate.sh`, `parse-send-command.sh`,
`resolve-recipient.sh`, `prepare-send-command.sh`,
`test-canonical-campaigns.sh`; NanoClaw `groups/certifier/CLAUDE.md`,
`groups/certifier/EXECUTION-STEPS.md`,
`src/certifier-prompt-contract.test.ts`). No other files were opened. No
`.env`, credentials, provider/recipient data, browser/session state,
pending/completed scripts, or conversations were read.

## Invariant-by-invariant verification

- **Recipient issuance never POSTs `/campaign`.** Confirmed — `issue-certificate.sh` only calls `GET /campaign/{id}` (readback) and `POST /campaign/addCredentials`. No campaign-creation call exists in the issuance path.
- **Live send validates campaign before duplicate search/add.** Confirmed by code order: `sertifier_validate_campaign_readback` (STEP 1) → duplicate preflight → `addCredentials` (STEP 2).
- **Missing/malformed/drifted/scheduled/private-wrong campaign fails before add.** Confirmed. `sertifier_resolve_campaign_config` fails closed on missing/malformed config; `sertifier_validate_campaign_readback` checks status against `allowedStatuses == [1,3]` (so Scheduled=2 fails), privacy, and every component field, all before any add call. Test file exercises a negative for every enforced field individually plus the missing-config case.
- **Exact alias grammar precedes bare send and cannot collide by substring.** Confirmed. `parse-send-command.sh` matches the full captured alias string against `sendAliases` by exact equality (no substring search), enforces global alias uniqueness at parse time, and `CLAUDE.md`'s priority rules require running `prepare-send-command.sh` before the generic Send/Cancel bucket. Overlap case (`cnpc supervision` vs. `supervision`) is covered by test and resolves correctly.
- **Only attribute-free presets get immediate same-turn authorization.** Confirmed — `parse-send-command.sh` returns `immediate:false, reason:attributes_required` whenever `requiredAttributes` is non-empty; `prepare-send-command.sh` and `EXECUTION-STEPS.md` Phase 1d both gate on `immediate:true`.
- **Exact identity is deterministic and all ambiguous states stop.** Confirmed — `resolve-recipient.sh` returns `resolved:false` for zero/multiple/mismatched-email/blank-name/lookup-failure, each with a distinct reason; `prepare-send-command.sh` only authorizes on `resolved:true`.
- **Durable pending script precedes provider write.** Confirmed — `EXECUTION-STEPS.md` Phase 1d writes the pending script (step 4) and reads it back before running it with `--send` (step 5).
- **`already_issued` is no add/no resend.** Confirmed — `find_matching_credentials` runs and returns before `addCredentials` is ever called; test asserts zero `addCredentials` calls on the duplicate path.
- **Uncertain reconciliation is non-sendable and never auto-retried.** Confirmed — `issue-certificate.sh` returns `issued_pending_reconciliation` as a terminal single-attempt result; prompt files route this to `pending/uncertain/` with an explicit "never retry" instruction, and Phase 3 excludes uncertain scripts from the sendable count.
- **Campaign/operator override cannot bypass fingerprint validation.** Confirmed — `--campaign-id` only overwrites `.id` in the resolved campaign config; the expected component values, privacy, and allowed statuses still come from the preset and are still enforced by the same `sertifier_validate_campaign_readback` call.
- **Grader handoffs, ordinary review, batch review, and placeholders remain safe.** Confirmed. Grader handoff messages (`[HANDOFF: grader→certifier]...`) never match the `^send` anchor, so they cannot enter explicit-send handling regardless of body content. Batch (`<attached_file>`) takes priority over explicit-send per `CLAUDE.md`'s stated rule and the test case. `AWAITING_EMAIL`/`AWAITING_NAME` are rejected both by prompt discipline and, redundantly, by a hard check inside `issue-certificate.sh` itself (`--name`/`--email` placeholder guard) — this is enforced in code, not prompt-only.

I also traced the explicit-send regex (`^send[[:space:]]+(.+)[[:space:]]+to[[:space:]]+([^[:space:]]+)$`) against multi-email and embedded-"to" inputs by hand; greedy backtracking always resolves to the rightmost `to <token>` and any leftover whitespace after the email breaks the `$` anchor, so multi-recipient and attached-file cases fail closed to `not_explicit_send` as the test file asserts.

## Material finding

**`icf-competencies` is unreachable through the ordinary natural-language flow.** `presets.json` defines ten presets, including `icf-competencies` ("Mastering the 2025 ICF Core Competencies"), and its `sendAliases` are correctly registered for the explicit one-command grammar. But `groups/certifier/CLAUDE.md`'s "Available Presets" mapping table (the table the ordinary two-step "New certificate" collection flow uses to map user language to a preset code) lists only nine presets — `icf-competencies` has no row. A user saying "ICF competencies certificate for Jane" gets no direct mapping and falls through to "certificate type is ambiguous, list the presets and ask" (Collection Rule 5), which is a functional regression for that one preset, not a safety defect: the explicit-send path (`send icf competencies to x@y.com`) is unaffected because it reads `sendAliases` from `presets.json` directly, bypassing this table entirely.

This does not violate any of the eleven required invariants and does not create a send-safety risk. It is a completeness gap in one of the ten reviewed artifacts and should be fixed by adding a row for `icf-competencies` (aliases: "2025 ICF Core Competencies", "ICF Competencies", "Mastering the 2025 ICF Core Competencies") to the mapping table in `CLAUDE.md`.

## Test contract check

Read `src/certifier-prompt-contract.test.ts` against the current text of `CLAUDE.md` and `EXECUTION-STEPS.md` line by line; every asserted substring is present (and the one negative assertion — absence of the old "Each issuance creates its own campaign" line — holds). The test is a static string-presence check, so it verifies wording only, not behavior; behavior is separately covered by `test-canonical-campaigns.sh`.

## Answer

One unresolved material finding remains: the missing `icf-competencies` row in `CLAUDE.md`'s Available Presets table. It is a completeness/usability gap, not a violation of any required invariant — all eleven invariants verify correctly across the reviewed packet, and the explicit one-command send path is unaffected. No other material findings.
