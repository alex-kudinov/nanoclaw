# NC-20260803-003 Codex request R3 — final bounded convergence check

## Objective

Return `CONVERGED` or `CHANGES REQUIRED` for the current NC-20260803-003 diff.
This round is deliberately narrow: R2 completed a broad independent traversal
but its response emission stalled. Its live probes exposed three more shapes,
which are now covered by code and tests.

## Safety boundaries

- Do not send email, post Slack messages, deploy, commit, restart services, or
  touch production data.
- Do not inspect secrets, auth/session files, database dumps, or live customer
  content.
- Write only the response artifact below.
- Replaying an inbound inquiry may recover Sales work, but cannot approve or
  send a customer reply.

## Read and verify

Read the complete current diff plus:

- `docs/reports/NC-20260803-003-CODEX-REQUEST-R2.md`
- `src/classify-rules-runner.ts` and its test
- `src/gmail-parser.ts` and its test
- `src/host-router.ts` and its test
- `src/channels/gmail.ts` and its test
- `src/classify-ipc-handlers.ts` and its test
- `src/db.ts` functions `storeMessageDirect`, `getNewMessages`, and
  `getLatestInboundMessage`

R2's independent probes found that `[EXTERNAL] Fwd:`, `Re[2]:`, Apple Mail's
`Begin forwarded message:` with quoted content, and a quoted forwarded marker
below `On ... wrote:` were not all preserved. The current diff now recognizes
tagged/repeated/counted Re/Fw/Fwd prefixes and preserves explicit Gmail, Apple
Mail, and Outlook forward markers even when quoted or nested below reply
history. The five focused files pass 125/125 tests on exact Node 22.23.2.

Chief's pre-delivery grant was also narrowed to only the exact Gmail
`messageId`; no thread or email-address search authority is granted.

## Required verdict checks

1. The subject guard cannot apply sender-only rules to the realistic Re/Fw/Fwd
   forms covered by the regression set.
2. Explicit Gmail, Apple Mail, Outlook, nested forwarded-reply, and quoted
   forward-marker bodies retain the original inquiry while ordinary quoted
   reply history remains suppressed.
3. The direct-route durable row is stored before routing, cannot wake Mailman,
   remains latest-inbound-readable, and is safely replaced on fallthrough.
4. Route/persistence failure paths do not lose or duplicate the handoff.
5. Every Chief fallback grants only the exact message before delivery and
   stays within one Slack-sized handoff with exact-read/no-search guidance.
6. Replay after deployment must be one exact inbound replay, must rely on
   existing CRM deduplication, and cannot send email without the separate
   approval guard and Gmail receipt.
7. Identify any remaining deployment blocker.

## Required response

Write only `docs/reports/NC-20260803-003-CLAUDE-RESPONSE-R3.md` with:

- verdict;
- blocking findings first;
- concise answers to checks 1-7 with file/line evidence;
- replay recommendation;
- commands/files inspected.
