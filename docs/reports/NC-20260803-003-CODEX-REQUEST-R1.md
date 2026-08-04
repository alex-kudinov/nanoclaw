# NC-20260803-003 Codex request R1 — adversarial email recovery review

## Objective

Independently review the uncommitted NC-20260803-003 repair for the production
failure in which a forwarded customer inquiry was misclassified by sender,
lost its forwarded body and Gmail identity on an early route, and dead-ended
when downstream agents attempted Gmail searches outside their host-assigned
capabilities.

Return either `CONVERGED` or `CHANGES REQUIRED`. Treat this as a C5 review:
look for a concrete counterexample, silent-loss path, duplicate-wake path,
authority widening, or replay hazard rather than merely summarizing the diff.

## Non-objectives and owner boundary

- Do not send email, post Slack messages, deploy, commit, push, restart a
  service, or write production data.
- Do not inspect `.env*`, OAuth/session/auth files, Claude settings, live
  customer content, database dumps, or other secret-bearing sources.
- Do not edit implementation, tests, prompts, or authoritative documentation
  in this round. Write only the response artifact named below.
- Replaying the inbound inquiry is not authorization to send a customer reply.
  The intended outcome is a correctly routed Sales draft that still requires
  the established operator approval and Gmail-confirmed action flow.

## Authoritative sources

Read the repository instructions first, then inspect the complete working-tree
diff and these specific surfaces:

- `CLAUDE.md`
- `docs/PROJECT-MAP.md`
- `docs/ACTIVE-WORK.md` (`NC-20260803-003`)
- `docs/CHANGE-PROTOCOL.md`
- `docs/ENGINEERING-CHANGELOG.md` (`NC-20260803-003`)
- `src/classify-rules-runner.ts` and test
- `src/classify-ipc-handlers.ts` and test
- `src/gmail-parser.ts` and test
- `src/channels/gmail.ts` and test
- `src/host-router.ts` and test
- `src/db.ts`, especially `storeMessageDirect()` and `getNewMessages()`
- `src/gmail-ipc-policy.ts` and its tests
- `src/ipc.ts` handoff resource propagation
- `groups/chief/CLAUDE.md`
- `groups/mailman/CLAUDE.md`
- `groups/sales/CLAUDE.md`
- `docs/ARCHITECTURE.md`

Running code, schemas, and tests govern mechanics; group `CLAUDE.md` files
govern intended behavior/approval boundaries; repository instructions and the
project map govern shared authority. Report discrepancies rather than silently
choosing one.

## Accepted incident facts

These facts were independently established from production logs and read-only
queries; do not reopen them without contradictory repository evidence:

1. The affected inbound subject began `Fwd:` and matched an enabled
   `source='auto'`, `sender_exact` rule targeting
   `MrGru/notification/calendar`.
2. The pre-change body parser stopped at a standard forwarded-message marker.
3. The rules-runner actionable route returned before the normal `onMessage()`
   persistence path, and the affected Gmail message ID was absent from the
   SQLite message ledger.
4. The Chief fallback formatter had the body only as a 500-character summary
   and omitted Thread-ID and Message-ID.
5. Chief's attempted `gmail_search` was denied because Chief has exact-read,
   not search, authority. Sales' later search was denied because it was not an
   exact query for a host-assigned address.
6. The exact message is `multipart/alternative` with inline `text/plain` and
   `text/html` bodies and no MIME attachments; attachment/OCR work is not
   required for this incident.
7. A live aggregate audit found 156 enabled auto-learned sender rules targeting
   non-auto-archive labels, with 428 historical matches. A constrained,
   reversible production update set exactly those rows `enabled=false`; a
   follow-up aggregate count is zero. No rows were deleted and manual, lesson,
   seed, and auto-archive rules were untouched.
8. Fourteen enabled rules currently have a future `probation_until`; before
   this patch the runner did not filter them.

## Proposed repair to review

The diff currently:

1. filters future `probation_until` rules from the runner;
2. suppresses sender-only rules for `Re:`, `Fwd:`, and `Fw:` subjects;
3. creates new automatic sender rules only for high-confidence auto-archive
   classifications;
4. preserves an explicit forwarded-message marker and content below it;
5. before a direct actionable route, writes the fully formatted inbound email
   to SQLite as `is_from_me=false`, `is_bot_message=true`,
   `from_group='mailman'`, and the exact Gmail `thread_ts`, then routes;
6. if that persistence or route block fails, falls through to the ordinary
   Mailman `onMessage()` path;
7. changes Chief fallback handoffs to include full parsed Body, Thread-ID,
   Message-ID, and exact `gmail_read`/no-search recovery guidance;
8. updates Chief's canonical prompt to preserve both IDs and use exact
   `gmail_read` only if the routed body is missing or truncated.

## Required adversarial checks

At minimum, answer each of these with code references and a concrete verdict:

1. Does the probation SQL match the real PostgreSQL schema/type and implement
   the stated maturity semantics without disabling non-probationary rules?
2. Does the human-conversation subject guard cover realistic `Re`, `Fw`, and
   `Fwd` forms without suppressing deliberate subject/header rules?
3. Is limiting auto-created sender rules to auto-archive labels sufficient to
   prevent this class from recurring, including missing/disabled taxonomy?
4. Does the parser preserve the original inquiry in both the observed plain
   MIME shape and plausible quoted-forward variants while retaining bounded
   truncation and ordinary reply-history suppression?
5. Can the durable no-wake row accidentally wake Mailman, hide from
   `getLatestInboundByThread`, corrupt a normal fallthrough row, or duplicate a
   downstream handoff? Analyze `getNewMessages()` with the Gmail JID owner map.
6. Is persistence ordered safely relative to the external routing side effect?
   Analyze both SQLite failure and host-router failure.
7. Will Thread-ID and Message-ID actually propagate from Mailman's existing
   host grant to Chief, and does Chief have `gmail_read` capability for that
   exact assigned ID? Check enforcement, not just prompt text.
8. Does sending the full parsed body through the Chief handoff introduce a
   message-size, splitting, privacy, or parsing failure that recreates the
   dead-end? If so, propose a bounded safer design with an acceptance test.
9. Identify any missing regression that is material to this incident.
10. Define the safest exact inbound replay after deployment, including how to
    avoid duplicate CRM/pipeline work and how to prove no customer email was
    sent without approval.

## Existing independent verification

- Exact Node: 22.23.2.
- Typecheck: pass.
- Focused regression set: 5 files, 120 tests, pass.
- Full repository test suite: pass under Node 22.23.2 with the loopback and
  subprocess permissions required by the existing webhook/skills-engine tests.
- Documentation continuity, formatter, and diff whitespace checks: pass before
  this request artifact was added.

Do not accept these results as proof of semantic correctness; independently
inspect the relevant code and run any bounded tests you need.

## Required response

Write only:

`docs/reports/NC-20260803-003-CLAUDE-RESPONSE-R1.md`

The response must include:

- verdict: `CONVERGED` or `CHANGES REQUIRED`;
- blocking findings first, each with severity, exact file/line evidence,
  reproduction/counterexample, and required acceptance test;
- answers to all ten required checks;
- any non-blocking hardening suggestions clearly separated;
- files inspected and commands/tests run;
- unresolved owner decisions, if any;
- elapsed time and available cost/usage information.

