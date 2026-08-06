# NC-20260804-003 — Codex request to Claude R2

## Mission

Review the post-R1 implementation in this exact worktree and decide whether the
approved-email repair is safe to commit and activate. This is a focused
convergence round, not a fresh redesign.

Write your response only to:

`docs/reports/NC-20260804-003-CLAUDE-RESPONSE-R2.md`

Do not edit source, tests, other documentation, runtime data, credentials,
Slack, Gmail, PostgreSQL, launchd, or production. Do not send any message or
email. You may run local read-only checks and tests. This worktree has no
`.env`, `store/`, or production database. Its `node_modules` symlink points at
the primary checkout and local Node may have a native SQLite ABI mismatch; if
that occurs, classify it as an environment limitation rather than a product
failure. Codex has supplied pinned-Node-22 evidence below.

## Prior verdict and required response

Your R1 verdict was `CHANGES REQUIRED`. You independently proved B1: host
rehydration made the claim hash tautological after action selection, while a
missing Action-ID plus a shared Gmail thread silently selected the oldest
nonterminal action; a stale copied Action-ID could similarly execute an older
approved card.

Review the implementation, not this summary. For every R1 finding B1 and
N1-N8, state `fixed`, `accepted bounded`, `rejected with evidence`, or `still
open`. Identify any newly introduced safety or delivery defect. End with one
verdict: `CONVERGED`, `CHANGES REQUIRED`, or `OWNER DECISION REQUIRED`.

## Post-R1 implementation

### B1 — durable action identity and supersession

- `recordPendingSend` now transactionally blocks older pre-Gmail actions in the
  same exact `(group_folder, chat_jid, thread_ts)` when a newer approval is
  recorded. It records `superseded_by_newer_approval` in both the row and the
  append-only event ledger. It never supersedes `executing`, `uncertain`, or
  `confirmed` actions.
- `getPendingSendByGmailThread` now returns the newest candidate plus the first
  two candidates and an explicit `ambiguous` flag. It never silently selects
  one when multiple active approvals share a Gmail thread.
- With no Action-ID, raw request bytes are retained only as corroborating
  evidence. When a Gmail thread is ambiguous they may select exactly one
  approved candidate; otherwise the request is held. The raw bytes are never
  executed.
- A stale explicit Action-ID from the same work thread is terminally blocked by
  the durable supersession rule before card rehydration or Gmail.
- Regression tests cover same-work-thread supersession and cross-work-thread
  Gmail-thread ambiguity.

Challenge whether this fully closes the exact B1 mechanisms. In particular,
distinguish the incident's stale-revision case from a hypothetical actor copying
an Action-ID from an unrelated approval thread. The latter still executes the
durable card named by that explicit ID; recipient, subject, body, Party checks,
card hash, one-time claim, and receipt remain host-owned. Say clearly if you
believe additional source-work-unit binding is required before activation.

### Accepted R1 non-blocking repairs

- N1: claim-held wording treats only executing/uncertain state or a Gmail ID as
  evidence of a prior Gmail attempt; deterministic blocked actions say Gmail
  was not called.
- N3: the durable approved-action thread authorizes rehydrated `gmail_send` as
  well as `gmail_reply` after restart. A bound action authorization denial now
  terminalizes the action and posts to its originating approval thread.
- N4/N5: approval markers are case-sensitive and anchored to a line start;
  email type is derived only from the card header. Tests cover quoted markers
  and ordinary chatter.
- N6: terminal state is evaluated before stored-card rehydration, so confirmed
  replay reports the existing receipt and blocked/superseded replay never calls
  Gmail.
- N8: proposal execution receives the global test-routing value and blocks
  before claim or Gmail when it is active.
- URL-host parsing: links are parsed with WHATWG `URL` and `.hostname`; invalid,
  userinfo-lookalike, suffix-lookalike, and backslash-authority inputs fail.

### Deliberate decisions and bounded residuals

- N2 rejected: `leadId` remains removed from model control. The canonical
  `business_v2.best_party_by_email` definition joins every normalized address
  in `business_v2.party_emails`, not only a primary email. The approval record
  stores no trusted Party ID, and production Sales `lead_id` has often been a
  pipeline Entry ID rather than a Party ID. Re-admitting that model field would
  weaken recipient authority. Host email resolution plus durable thread
  history remains the fail-closed source.
- N7 accepted bounded for this release: proposal actions share the ledger, but
  an overlap can only produce an ambiguity hold or watchdog noise; it cannot
  select or send the proposal card through the Sales-Mailman path. A separate
  action namespace would be cleanup, not necessary to close this incident.
- `tco.ac` is accepted as a human/company-controlled transactional redirector
  already present in canonical Sales material. Any `*.zoom.us` host is accepted
  as a Zoom-owned destination. Both still pass exact parsed-host/suffix checks;
  arbitrary domains remain blocked.
- The request's choice between `gmail_send` and `gmail_reply` remains a bounded
  residual noted in R1. The executed recipient, body, approved subject used by
  content policy, Party identity, Gmail thread, footer classification, and
  receipt identity remain host-derived. Decide whether this residual is safe
  for this release or requires a durable action-type field before activation.

## Independent verification after the R1 repairs

On the isolated Mac Mini validation tree using production Node 22.23.2:

- TypeScript typecheck: pass.
- Focused repaired subset: 6 files / 115 tests pass.
- Repository `npm run test:email-critical`: 18 files / 497 tests pass, serial,
  exit zero.
- No production initializer, database, Gmail send, Slack post, service
  activation, or external business write occurred.

Claude should still run any local non-production checks it finds useful. Do not
discount the pinned-Node evidence merely because the local Claude process uses
a different Node ABI.

## Required response structure

1. Verdict.
2. B1 closure analysis, including same-thread supersession, ambiguous Gmail
   thread, missing Action-ID, stale explicit Action-ID, and unrelated copied
   Action-ID.
3. R1 finding reconciliation table for B1 and N1-N8.
4. Security/delivery invariant matrix.
5. New blocking findings, if any, with exact file/line evidence and a reachable
   reproduction.
6. Bounded residuals and owner decisions.
7. Mechanical checks and results.
8. Files written, elapsed time, and approximate cost if available.

If the implementation is safe, say `CONVERGED`; do not invent cleanup work as a
release blocker. If it is unsafe, identify the exact reachable customer-impact
path and the smallest repair.
