# NC-20260906-004 — bounded implementation review request

## Objective

Review the host-owned Sales factual-consistency control that prevents a current
schedule/catalog analysis from being followed by a contradictory
customer-facing draft. Report only material correctness, safety, false-positive,
false-negative, boundary, or test gaps.

## Incident and accepted facts

- On 2026-09-06 one Sales approval card's `ANSWERABLE` section correctly cited
  Coaching Supervision Mastery cohorts on March 3 and July 7, 2027 at regular
  tuition, while its customer draft said that 2027 dates and pricing had not
  been announced.
- The live operational `SCHEDULE.md` was fresh and contained October 7, 2026,
  March 3, 2027, and July 7, 2027. The immutable catalog carried inaugural
  tuition $3,996 and regular tuition $4,796. This is not a source/mount incident.
- The host accepted the bad card; only a later human correction produced the
  right draft. No customer email was sent from this incident.
- Google Calendar/calendar-debug is schedule authority. The operational Sales
  `SCHEDULE.md` is its generated projection. The immutable Coaching Supervision
  Mastery catalog is price/status authority below provider evidence and owner
  decisions.

## Implemented control

- `src/sales-fact-consistency.ts` parses only marked generated schedule
  sections, resolves one or more known programs from structured `PROGRAM MATCH`
  or the subject, and checks schedule-dependent Sales cards.
- It fails closed on unavailable/stale (>36h) schedules and missing program
  sections; rejects negative schedule claims contradicted by future dates;
  rejects explicit unsupported cohort/start dates; and for Coaching Supervision
  Mastery rejects negative pricing claims when the immutable catalog publishes
  regular tuition.
- A denial naming a later year is rejected only if the schedule contains a date
  in that year, so 2027 authority does not invent a 2028 announcement.
- The check runs before IPC-to-Slack approval, in Slack defense-in-depth, while
  arming approval, before host handoff rescue, and at final Gmail execution.
- Rejections contain no customer content and return to the exact source
  container where that identity is still available.

## Allowed review paths

1. `src/sales-fact-consistency.ts`
2. `src/sales-fact-consistency.test.ts`
3. `src/ipc.ts` and `src/ipc-handoff-echo.test.ts`
4. `src/channels/slack.ts` and `src/channels/slack.test.ts`
5. `src/send-watchdog.ts` and `src/send-watchdog.test.ts`
6. `src/approved-email-execution.ts` and its test
7. `src/approved-send-handoff.ts`
8. `facts/catalogs/coaching-supervision-mastery.json`

You may use Read, Glob, and Grep only on those paths and this request. Write
only the response file named below. Do not inspect `.env`, credentials, auth
stores, runtime databases, customer messages, other worktrees, or unrelated
files. Do not edit implementation.

## Verification already completed

- Focused fact/boundary suite: 215/215 passed.
- Email replay: 13/13 passed.
- Email-critical suite: 767/767 passed; independent agent-runner 45/45 passed.
- Pinned Node 22.23.2 runtime doctor and TypeScript typecheck passed.
- Full root: 3,599 passed / 32 skipped; only the two unchanged predecessor
  failures remained (CNPC wrapper-literal assertion and date-sensitive Trafft
  fixture).
- A local live-shaped check against the current operational schedule rejected
  the incident sentence with `schedule_contradiction` and
  `price_contradiction`.

## Protected invariants and non-objectives

- Do not add an LLM fact checker, network call, database read, calendar write,
  knowledge mutation, customer send, approval, or provider action.
- Preserve exact approved bytes, recipient/content guards, source-container
  rejection routing, host rescue idempotency, and non-Sales approval behavior.
- False-positive avoidance matters: a customer's quoted question is not a Sales
  assertion; a genuinely unannounced later year must remain answerable; policy,
  fit, and natural-language claims outside deterministic evidence stay out of
  scope.
- This release may be deployed after review, but review itself authorizes no
  commit, push, activation, Slack canary, or external action.

## Required response

Write `docs/reports/NC-20260906-004-CLAUDE-REVIEW-RESPONSE-R1.md` with:

1. verdict: `NO MATERIAL FINDINGS` or `MATERIAL FINDINGS`;
2. material findings only, ordered by consequence, with exact file evidence;
3. whether all five enforcement boundaries actually fail closed;
4. whether the exact incident replay and false-positive controls are credible;
5. any required correction and its focused acceptance test.
