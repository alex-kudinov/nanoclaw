# NC-20260903-001 — Claude design response R1

Reviewed against the allowed packet only: `src/host-router.ts`,
`src/classify-ipc-handlers.ts`, `src/ipc.ts`,
`container/agent-runner/src/ipc-mcp-stdio.ts`,
`groups/mailman/CLAUDE.md`, `groups/chief/CLAUDE.md`,
`groups/sales/CLAUDE.md`, `src/gmail-ipc-policy.ts`.

## Material finding 1 — Item D's trigger condition ("an inbound Mailman turn") is not observable at the host boundary today

Evidence:

- `groups/mailman/CLAUDE.md` "Tools Available" lists `gmail_reply`/`gmail_send`
  unconditionally; nothing in the Inbound Email Processing steps (Step 1–3)
  instructs calling them, but nothing prevents it either — the tool surface is
  static per incident finding 7 ("the same static tool surface exposes Gmail
  send/reply" during classification turns).
- `container/agent-runner/src/ipc-mcp-stdio.ts:29-30` shows the host already
  mints a per-turn identity (`NANOCLAW_RUN_ID` → `runId`, "outside the
  model-writable tool schema") and attaches it to `send_message` and
  `party_context_get` IPC payloads. The `gmail_reply`/`gmail_send`/`gmail_search`/
  `gmail_read` tool handlers (lines 596-771) do **not** attach `run_id` to their
  IPC payloads.
- `src/ipc.ts:1310-1331` is the exact branch incident 4 hit: `isMailmanSendAction
  && !approvedAction?.actionId` → quarantine, `writeDeniedGmailInput(...,
  'no exact host-approved email action is available', ...)`, and
  `postBoundaryFailure` with `🚫 [EMAIL BLOCKED] ... Approve the exact draft in
  its Slack thread before retrying.` This same branch fires for **any**
  unbound Mailman send/reply attempt — one during an inbound classification
  turn (incident 4) and one where Mailman calls `gmail_reply`/`gmail_send`
  outside classification without a resolvable approval (e.g. a stale/expired
  pending action, a lookup miss) — a genuine integrity problem acceptance
  test 5 requires to "behave exactly as before."
- `writeDeniedGmailInput` (`src/ipc.ts:248-295`) is one generic function whose
  text ends "Do not retry with a different ID or address; escalate." It has no
  parameter carrying turn context and is called from every Gmail-IPC denial
  path in the file (invalid Action-ID, ambiguous match, unknown action,
  unbound action, post-match authorization denial, action-safety hold).

Consequence: the host cannot currently tell "this unbound send/reply attempt
happened during an inbound classification turn" apart from "this unbound
send/reply attempt happened because an approval genuinely failed to bind."
Both hit the identical branch, reason string, and generic denial text.
Implementing item D by rewording that branch's message universally would
silence the exact class of denial acceptance test 5 requires to stay
visible — reintroducing a different split-brain (a real approval-binding
failure now reads as "expected, classify only" and never reaches Chief).

Required change: thread `run_id` (and its host-known trigger type — spawned
by a new inbound Gmail message vs. spawned by a `[HANDOFF: *→mailman]`) through
the `gmail_reply`/`gmail_send` IPC payloads in
`container/agent-runner/src/ipc-mcp-stdio.ts`, and have the host branch at
`src/ipc.ts:1310-1331` use that trigger type — not just "no approvedAction" —
to decide between the new "expected, classify only" text and the existing
Chief-visible `[EMAIL BLOCKED]` text. Without this, item D cannot be
implemented safely by wording alone.

## Material finding 2 — Item C's reaper closes incident 2/3 (missing classification) but not incident 5's second half (classified, never routed)

Evidence:

- Incident finding 5: "Twenty-one additional valid, actionable classifications
  have `routed_at IS NULL`" — this is a **different** failure mode than "no
  classification exists." A row exists with a valid label but routing never
  completed (crash between the taxonomy-gated `routeAfterClassify` call and
  `markClassificationRouted`, or an IPC-write failure inside `safeWrite` in
  `src/host-router.ts:299-311`).
- `src/classify-ipc-handlers.ts:374-408` already contains the correct pattern
  for closing this exact gap — the `retryClaim` query keys off `routed_at IS
  NULL AND classified_at < NOW() - INTERVAL '30 seconds'` — but it only runs
  when Mailman re-emits a same-`gmail_message_id`/same-`classifier_version`
  IPC. Nothing sweeps rows that are stuck in this state with no further
  Mailman activity.
- Item C's text ("If no classification exists, record one idempotent
  `MrGru/other` host-fallback classification and route the complete exact
  source") only tests for a **missing row**. Acceptance test 3 mirrors that
  same scope ("a Mailman turn that posts text but omits classification").
  Neither the design nor the acceptance tests cover the `routed_at IS NULL`
  backlog, so it recurs unchanged under the new architecture.

Required change: extend the item C reaper (or add a sibling sweep using the
existing `retryClaim` pattern) to also close valid classifications with
`routed_at IS NULL` past the grace period, and add an acceptance test for it
distinct from test 3.

## Material finding 3 (lower severity, real given the exact code path) — a late-arriving real classification can supersede and re-route a reaper fallback, producing a second handoff

Evidence:

- `src/classify-ipc-handlers.ts:348-360`: the upsert's `WHERE
  email_classifications.classifier_version <> EXCLUDED.classifier_version`
  clause means a classification write from a **different**
  `classifier_version` than what's currently stored will overwrite the row and
  reset `routed_at = NULL`, then re-run `routeAfterClassify` with the new
  label (lines 419-467).
- If the item C reaper stores its fallback under its own `classifier_version`
  (e.g. `host-reaper-v1`) and a delayed/retried Mailman turn later completes
  classification for the same `gmail_message_id` under `mailman-v2`, the
  existing upsert path will accept it as a legitimate correction and route it
  again — producing two handoffs (the reaper's `MrGru/other`→Chief and the
  late real label→Sales/Chief/etc.) for the one source message. Acceptance
  test 3 does not exercise this ordering (reaper-fires-first,
  Mailman-completes-late).

This is consistent with "one canonical classification" as a target state but
is a real race given the reviewed upsert semantics, not a hypothetical. Flag
for an explicit acceptance test (reaper fallback recorded, then a late genuine
classification arrives for the same message ID — verify it supersedes cleanly
with at most one additional Sales/Chief delivery, or is rejected once the
reaper's row is routed).

## Confirmed correct, no flaw found

- **Item A's taxonomy-validation diagnosis is accurate.**
  `handleClassifyLabelWrite` (`src/classify-ipc-handlers.ts:348-372`) performs
  the `INSERT ... ON CONFLICT` unconditionally, before any taxonomy lookup
  (`loadTaxonomyRow` runs after, at line 419, only to fetch
  `auto_archive`/`hive_share_target` metadata). `routeClassifiedEmail`
  (`src/host-router.ts:347-374`) treats a Chief fallback as `routed: true`
  regardless of whether the label exists in the taxonomy, and
  `markClassificationRouted` then stamps `routed_at`. This exactly reproduces
  incident 1 and incident 5's "61 rows with absent labels, all marked
  routed." The required fix (validate before persisting, rewrite an
  unknown/disabled label to `MrGru/other` before the row is written) is
  correctly scoped by the design; it does require reordering validation
  ahead of the current unconditional insert, which the design text does not
  spell out as an ordering constraint — worth stating explicitly to Codex so
  the insert isn't left unconditional with only a later corrective UPDATE.

- **Item E / acceptance test 6 (Thread-ID reuse across senders) is already
  architecturally sound.** `routeLead` (`src/host-router.ts:378-382`) matches
  by `params.senderEmail`, not by thread; `fmtLeadSales` always prefers
  `p.threadId` (the inbound message's own thread) over any DB-derived thread.
  `groups/sales/CLAUDE.md:19`: "The host derives the thread anchor for you
  from the lead's email address" — Sales's own Slack-thread identity is
  already sender-scoped, not Thread-ID-scoped. `gmail-ipc-policy.ts` grants
  are per-group resource sets, not per-work-item, so authorizing
  `gmail_get_thread` for a shared Thread-ID across two different senders'
  Sales work items is consistent with existing behavior and does not itself
  create collision risk. No design change needed here beyond what's proposed.

## Answers to the four questions

1. **Split-brain removal:** Item B (single `classify_email` tool, host-owned
   dispatch) correctly closes the specific non-atomicity in incident 7 (visible
   escalation vs. classification write as two separate, independently-failing
   steps). It does **not** close the path where Mailman calls
   `gmail_reply`/`gmail_send` directly during an inbound turn (incident 4) —
   that tool remains on the same static surface and item D's fix for it is
   underspecified per Finding 1. A visible-but-non-durable completion is still
   possible via that path unless Finding 1's required change lands.
2. **Thread-ID/identity safety:** Yes, given the reviewed files — see
   "Confirmed correct" above. `gmail-ipc-policy.ts`'s resource grants and
   `host-router.ts`'s sender-keyed `matchLead` already treat Thread-ID as
   non-identifying, consistent with item E.
3. **Reaper idempotency/restart-safety:** Restart-safe and idempotent for the
   "classification never written" case (source message ID as key is sound and
   matches the existing `ON CONFLICT (gmail_message_id)` upsert). Not
   idempotent-complete against the full incident set — see Finding 2
   (`routed_at IS NULL` backlog untouched) and Finding 3 (late-arriving real
   classification can re-fire routing after a reaper fallback). Neither
   converts uncertainty into *unauthorized* Sales work (both failure modes
   still route through the existing Chief/Sales dispatch, never bypass
   approval) — the risk is duplicate/delayed delivery, not an unauthorized
   send.
4. **Sequencing:** Land Item A (validation-before-persist + migration) and
   Item B (single classify tool, host dispatch) first — they are
   self-contained and directly close incidents 1, 2, 3, 5, 6, 7 with the
   ordering caveat above. Land Finding 1's `run_id`/trigger-type plumbing
   *before* Item D's wording change, since D is unsafe without it. Item C's
   reaper should ship only after Finding 2's `routed_at IS NULL` sweep is
   folded in, or as two visibly separate reapers with two separate acceptance
   tests — bundling an incomplete reaper under one acceptance test (test 3)
   risks it being called "done" while the 21-row backlog class persists.

## Verdict

GO WITH REQUIRED CHANGES

1. Add host-observable turn-type context (reuse the existing `run_id`
   per-turn proof, currently unwired for Gmail tools) to the Gmail IPC
   payloads, and make item D's "expected approval-boundary denial" wording
   conditional on that context — not on the mere absence of an
   `approvedAction`, which also covers genuine approval-binding failures
   acceptance test 5 requires to stay Chief-visible.
2. Extend item C's reaper (or add a named sibling reaper) to also close valid
   classifications with `routed_at IS NULL` past grace, reusing the existing
   `retryClaim` pattern in `classify-ipc-handlers.ts`; add an acceptance test
   for it separate from test 3.
3. Add an acceptance test for the late-real-classification-after-reaper-fallback
   ordering (Finding 3) so the upsert's `classifier_version <>` supersede path
   is verified not to produce a duplicate Sales/Chief delivery.
4. State explicitly in the migration/implementation task that taxonomy
   validation must run **before** the `email_classifications` insert, not as
   a post-hoc correction — the current code path is insert-first,
   validate-after.
