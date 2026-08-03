# NC-20260803-001 convergence state

- Topic: Approved email session targeting and one-thread Sales work units
- Status: active
- Current round: R6 review of the rejected-approval claim delta
- Claude project path: `/Users/xbohdpukc/dev/NanoClaw`
- Current Claude session UUID: `74a9751a-7355-4943-b2fe-623f98149b71`
- Prior Claude session UUIDs: none
- Native handoff path: none
- Latest Codex request: `docs/reports/NC-20260803-001-CODEX-REQUEST-R6.md`
- Latest Claude response: `docs/reports/NC-20260803-001-CLAUDE-RESPONSE-R6.md`
  (**`APPROVE`** — the rejected-approval claim delta is correct and
  probe-verified on both halves; no blocker, no duplicate-send, silent-failure,
  listener-ordering or exact-bytes risk; one nonblocking observation R6-1).
  Prior: `…-R5.md` (`APPROVE WITH FOLLOW-UPS`; R4-1 to R4-6 closed, follow-ups
  R5-1 to R5-5), `…-R4.md` (`CHANGES REQUIRED`; blockers R4-1, R4-2), `…-R3.md`
  (`CHANGES REQUIRED`; blocker R3-1), `…-R2.md` (`CHANGES REQUIRED`; B1-B2),
  `…-R1.md` (`CHANGES REQUIRED`; F1-F4)
- Verified agreements: all seven R1 findings (F1-F7) and all eight R2 items
  (B1-B8) are reconciled and independently covered; validation surface now
  equals arming surface via the shared `isApprovalCard`; ephemeral Gmail results
  are targeted and excluded from chat-cursor rollback; the Sales startup
  invariant asserts against reloaded persisted rows and throws; Reply-To and
  approval-card recipient parsing are both confined to the header region; the
  cursor migration replays nothing and skips no newer root; authority-document
  claims now match the code
- R3 reconciliation, Claude-verified in R4: all seven claims are implemented as
  described. The Chief `[SUPPORT-DRAFT]` template now uses `DRAFT RESPONSE:`, a
  `---` fence and an in-fence `Subject:`, with a regression that reads the exact
  marked block from the file; rejection text names the authoring group;
  exit-swept unacknowledged ephemeral payloads warn (`sweepExitedContainerInputs`,
  tested); runner-before-host ordering is an explicit precondition;
  `docs/ARCHITECTURE.md` is now +5/-0; `recordedSalesWorkRoot()` is shared by
  strict binding and divergence logging.
- R4 reconciliation, Claude-verified in R5: all six items closed. Probe
  confirmed `observeApprovalCard` posts exactly one `[APPROVAL CARD REJECTED]`
  for an unparseable card, records zero rows, and cannot loop (the rejection text
  is not itself an approval card). Slack refuses to split an approval card above
  4,000 characters, substitutes one rejection before the split branch — so the
  chunk loop is unreachable and no fragment can reach Slack via the direct,
  disconnect-queue, or retry paths — and `storeOutbound` persists the rejection,
  which also removes the chunked-card half of the R4-1 population. Changed
  operational group instructions are an explicit copy-and-hash gate before or
  atomically with host activation, naming all five files, with the correct
  `GROUPS_DIR` rationale. The malformed quarantine family is group-neutral and
  asserted in two regressions. `groups/chief/SUPPORT-REPLY.md` is staged and
  `git ls-files --error-unmatch` succeeds, so the packager will include it.
- R6 delta, Claude-verified: the Codex-found gap was real — the host listener
  returned `false` unconditionally, and `false` is unclaimed in
  `SlackChannel`'s approval chain (`slack.ts:426-432`), so a rejected approval
  still fell through to the agent injection and told the agent "Approved" for a
  card the host had just refused. R5 missed this. `observeApprovalCard` now
  returns `{ pending, rejected }` and the listener claims only the rejected
  case. Probe matrix: malformed card → `rejected: true`, zero rows, one notice,
  chain claimed; valid card → `rejected: false`, action minted, chain continues
  so the agent path runs unchanged; host proposal follow-up draft → not an
  approval card, untouched. Claim-chain starvation checked against all four
  registered approval listeners: the two registered after the email boundary
  (`handleProposalApproval`, `handleDeclineApproval`) key on host artifacts that
  carry none of the three approval-card markers, and the enclosing
  `card.from_group` guard means human-authored messages (verified `NULL`
  `from_group` in production) can never be claimed.
- Nonblocking follow-ups from R5 (none block commit, build, or deployment):
  R5-1 the overlong-card refusal only logs and never notifies the originating
  container, unlike the parse-failure path; R5-2 the same rejection sentence
  names the author three different ways across `ipc.ts`, `index.ts` and
  `slack.ts`, and the `index.ts` source names the channel's group rather than the
  card's author; R5-3 a refused approval no longer leaves any row in the email
  action ledger, so that population is only traceable via Slack and logs; R5-4
  the sibling `sales-review-unroutable` quarantine family is still Sales-named;
  R5-5 a refusal can become the lead's recorded thread anchor when none existed.
  Added in R6: R6-1 the claim is positional — it is safe against today's four
  listeners by inspection, not by construction, and nothing logs when a listener
  short-circuits the chain. The codebase already has the pattern for this
  (`rejectObservers`, `slack.ts:221-228`); either log the claim or split the
  email boundary into an always-run observer plus a narrow claim.
- Codex post-R5 delta: the approval listener previously returned `false` even
  after `observeApprovalCard` rejected a malformed marked card, allowing the
  rejected approval to continue into the agent path. The observation now
  returns `{ pending, rejected }`; the listener claims only `rejected`, while a
  valid armed card remains unclaimed. Exact Node 22.23.2 focused evidence is 4
  files / 180 tests plus typecheck; Claude R6 delta review is pending.
- Owner decisions: owner authorized immediate implementation, Claude review,
  production activation, and completion of the stuck approved email; exact
  content/recipient must not be regenerated or changed
- Last independent checks: production release/Node/PID verified; narrow logs
  prove one confirmed send and one separate quarantined unbound request. Final
  exact Node 22.23.2 gates passed: full 145 files / 1,875 tests (143 sandboxed
  files plus 43/43 across the two permission-dependent files), email-critical
  14 files / 418 tests, typecheck, root build, runner build and 3 files / 22
  tests, continuity, formatting, and whitespace.
- Elapsed/cost notes: Claude R1 ~25 minutes (09:23-09:48 CDT), R2 ~20 minutes
  (09:49-10:09 CDT), R3 ~20 minutes (10:04-10:24 CDT), R4 ~20 minutes
  (10:19-10:39 CDT), R5 ~20 minutes (10:30-10:50 CDT), R6 ~15 minutes
  (10:41-10:56 CDT), ~120 minutes cumulative.
  Claude-side R6 verification ran under Node v26.5.1, not the pinned 22.23.2
  (sandbox blocked the switch): `tsc --noEmit` clean, continuity check passed
  (40 rows / 36 entries), and 12 DB-free email-critical/incident files passed
  (352 tests). `db.test.ts`, `routing.test.ts`, `email-delivery-path.test.ts`
  and `classify-ipc-handlers.test.ts` cannot run on this host —
  `better_sqlite3.node` is built for `NODE_MODULE_VERSION` 127 against this
  runtime's 147 — so Codex's pinned-runtime run (14 files / 417 tests) remains
  authoritative for those. The broad gates still owe a pinned-runtime run on the
  converged snapshot before commit.
- Owner decisions: the owner authorized exact recovery of the held reply. The
  recovery will use a newly posted corrected card and a fresh operator approval
  through the normal path, preserving the stored recipient/body and binding the
  existing Gmail-thread subject — this matches Claude's recommendation across
  R1-R4 and is treated as agreed. R3-1 is fixed in this ticket via the tracked
  template. Root divergence continues to refuse and log; non-Sales lead fields
  remain display-only.
- R4-5 owner disposition: refuse an approval card exceeding
  `MAX_MESSAGE_LENGTH` at post time as one visible rejection. This fails closed
  and avoids inventing a cross-message exact-byte approval contract mid-incident.
