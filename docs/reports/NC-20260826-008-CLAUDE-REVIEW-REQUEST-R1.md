# NC-20260826-008 bounded operator-answer fast-path review R1

## Objective

Review the narrow Sales support fast path prompted by the owner's requirement
that a one-fact email response take seconds rather than expanding into hours of
CRM, Gmail, attachment, context, and escalation work.

When an active-client support root already contains the customer request and
Alex or Cherie supplies the missing fact/decision in that exact Slack thread,
Sales should create one approval draft in the same model turn with no tool or
lookup detour.

## Accepted boundaries

1. The fast path applies only to `[SOURCE: email-active-client]` work and only
   when the exact Alex/Cherie message answers every material ask.
2. It produces one `[CLIENT SUPPORT REVIEW]` using the root's exact Email and
   Thread-ID. The only tool call is `send_message` for that card.
3. Before the card, it performs no knowledge-file read, psql/CRM, Gmail or
   attachment call, Party Context, Chaos, Plutio, other-minion handoff,
   acknowledgment, recap, re-escalation, or pipeline mutation.
4. The shortcut ends at a draft. Approval, Action-ID binding, Gmail execution,
   exact-recipient/thread checks, and NC-007 semantic host enforcement remain
   unchanged.
5. If any material ask is still unsupported, ordinary HUMAN/abstention behavior
   wins; the fast path may not infer or manufacture the answer.
6. Complex Sales work and scheduled follow-ups are unchanged.

## Review files

- `groups/sales/CLAUDE.md`
- `groups/sales/CLAUDE-MAIN.md`
- `groups/sales/WORKFLOWS.md`
- `src/sales-prompt-contract.test.ts`
- `docs/PROJECT-MAP.md` section `Sales request-first behavior`

Do not inspect customer/runtime data, `.env*`, credentials, auth/session stores,
or unrelated repository files.

## Material questions

1. Is qualification narrow and unambiguous enough to prevent unsupported
   answers or accidental use for prospects/transactions?
2. Do any existing instructions still require a read, lookup, re-escalation, or
   pipeline operation before this qualified draft?
3. Does the same-turn/one-tool instruction preserve approval and no-send safety?
4. Does the static contract pin the load-bearing invariants without weakening
   ordinary HUMAN behavior?

## Verification

The updated Sales prompt contract passes 11/11 under pinned Node 22.23.2.
Broader gates follow review.

## Response contract

Write only
`docs/reports/NC-20260826-008-CLAUDE-REVIEW-RESPONSE-R1.md`.
Report material findings only with exact file/section evidence and concrete
corrections. If no material findings remain, state `NO MATERIAL FINDINGS` and
name the checked invariants. Do not edit implementation, tests, prompts, or
other documentation.
