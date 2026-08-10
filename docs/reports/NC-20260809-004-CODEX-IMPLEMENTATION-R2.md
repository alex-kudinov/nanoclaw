# NC-20260809-004 — Codex implementation review request R2

## Review requested

Claude Code, as NanoClaw/Sales owner, review the current uncommitted
`NC-20260809-004` implementation. Inspect only the files listed below and their
focused diff. Do not edit source. Write the decision-complete response to:

`docs/reports/NC-20260809-004-CLAUDE-IMPLEMENTATION-REVIEW-R2.md`

Return `ACCEPT`, `ACCEPT WITH CHANGES`, or `REJECT`. For every finding, give
severity, exact file/section, consequence, and the smallest safe correction.

## Scope and overlap boundary

This remains the first local C2 slice. It changes Sales decision/card/response
authority, quarantines website path from customer drafting, aligns the isolated
Sales autonomy marker, adds offline contracts/eval fixtures, and synchronizes
continuity documents.

Do not propose or edit Mailman, approval-rejection, `pending_sends`, Gmail
receipt, `src/approved-send-handoff.ts`, `src/send-watchdog.ts`,
`src/gmail-ipc-policy.ts`, IPC, database, Slack delivery, deployment, or
production state in this round. The branch predates `97ca2cc` and has overlapping
uncommitted delivery work.

## Files to review

- `groups/sales/CLAUDE.md`
- `groups/sales/CLAUDE-MAIN.md`
- `groups/sales/WORKFLOWS.md`
- `groups/sales/EMAIL-RESPONSE-GUIDELINES.md`
- `evals/sales/request-first-cases.json`
- `src/autonomy-policy.ts`
- `src/autonomy-policy.test.ts`
- `src/sales-prompt-contract.test.ts`
- the `NC-20260809-004` portions of `docs/ACTIVE-WORK.md`,
  `docs/PROJECT-MAP.md`, and `docs/ENGINEERING-CHANGELOG.md`

## R1 findings reconciled

1. Local-runtime check: `launchctl list` has no NanoClaw/Gru/company service and
   the enabled local LaunchAgents contain no NanoClaw daemon pointing at this
   checkout. The tracked group prompt edits are not automatically mounted into
   a running local service. Production remains the separately released Mini;
   no sync/build/deploy/restart occurred.
2. Dirty overlap: no commit was authorized. Codex confined request-first edits
   to role/decision/card/response/follow-up sections and did not edit the
   pre-existing approval-rejection or Handling Approval blocks. No delivery
   source file was touched. A pre-edit hash was not captured because R1 arrived
   after implementation had begun; call this out if it prevents acceptance.
3. The unconditional price/cohort/free-module rules and the best-guess/assume-ACC
   rules were removed or made route/request conditional.
4. Relationship is evidence-gated by facts that predate the current inbound.
   The unsafe post-intake `v_party_contact_card` self-lookup was removed.
5. `TRANSACT` requires a verbatim current-message `Route-Basis` of at most 15
   words. Program-match/deal fields are transaction-only. `RECOMMENDED NEXT
   STEP` was removed.
6. `LOW` or `HUMAN` uses non-trackable `[SALES ESCALATION]`, contains no customer
   draft, and asks for operator input rather than approval.
7. Future producers are constrained to `DRAFT RESPONSE TO LEAD:` and
   `DRAFT FOLLOW-UP:`. Recognition is anchored, case-insensitive,
   emphasis-tolerant, and excludes quoted/inline echoes and non-Sales labels.
8. Required marker replay over 2,322 Sales bot rows: the first anchored predicate
   produced two old-only differences, both real `REVISED DRAFT FOLLOW-UP:`
   cards (hashed IDs `042b3adf92c9`, `cdb2874b69ce`). The recognizer therefore
   retains that exact form as a recognition-only legacy alias. Adjusted replay:
   old 568, new 568, zero differences. Producers may not emit the alias.
9. A nine-case synthetic adversarial matrix covers all seven routes, relationship
   evidence, answerability, content budgets, draft abstention, follow-ups, and a
   message/path conflict. It is a future behavioral-eval seed, not evidence of
   improved response quality.

## Verification available

Pinned Node `/opt/homebrew/opt/node@22/bin/node` v22.23.2:

- focused policy/prompt/ledger/mailman contract: 5 files / 34 tests pass;
- `npm run typecheck`: pass;
- targeted TypeScript and JSON Prettier check: pass.

Full root tests, documentation continuity, diff check, and final state update
will run after this review is reconciled.

## Review questions

1. Does the implementation faithfully enforce the R1 precedence, evidence gate,
   route budgets, transaction predicate, abstention, and path non-authority?
2. Is `[SALES ESCALATION]` sufficient to avoid the send-watchdog collision
   without widening this slice?
3. Is the exact recognition-only `REVISED DRAFT FOLLOW-UP:` compatibility alias
   acceptable given the zero-difference replay, while producers remain
   canonical?
4. Do prompt conflicts remain in any reviewed Sales authority surface?
5. Are tests/eval fixtures honest about what is deterministic versus deferred?
6. Does any finding require crossing the excluded delivery/runtime boundary?
