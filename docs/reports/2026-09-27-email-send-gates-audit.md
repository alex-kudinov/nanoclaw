# Email send gates audit, 2026-09-27

Live: release `729979b2` (Mini) = `.worktrees/regular-email-path-20260925`; prompts byte-identical.

**Result:**
- 314 approvals from 08-03 to 09-27: 295 sent, 17 blocked, 2 uncertain.
- Blocked and uncertain are final; no code reopens them (`db.ts:2031`).
- No traced block stopped a wrong email (09-17 recipient mismatch unverified).

## 1. Gates between ✅ and Gmail

| # | Gate · file:line | Stops | Human sees |
|---|---|---|---|
| 1 | Approval form · `channels/slack.ts:390-415`, `index.ts:3167` | anything but ✅/👍 on the card, or bare "Approved" when the card is the latest bot post | nothing |
| 2 | Card checks at post and ✅ · `ipc.ts:657-857`, `send-watchdog.ts:198-221` | Lead/Route, format, length, content, schedule | "[APPROVAL CARD REJECTED]" |
| 3 | Supersede · `db.ts:2080` | older approval in thread | nothing |
| 4 | L2 auto-approve · `autonomy-hold.ts:143-178` | never arms an action (latent; all categories level 1) | "⏳ Autonomy L2" |
| 5 | Cancel window · `ipc.ts:974-1034` | 30 s hold; `[CANCEL]` drops all held handoffs | nothing |
| 6 | Watchdog · `send-watchdog.ts:536-672` | at 5 min, `executing` becomes final `uncertain` | "[SEND NOT OBSERVED]" |
| 7 | Action binding · `ipc.ts:1211-1411` | Action-ID missing, unknown, ambiguous | "[EMAIL ACTION HELD]", #gru-chief only |
| 8 | Terminal state · `ipc.ts:1437` | already blocked/uncertain | "[EMAIL BLOCKED]… Gmail was not called" |
| 9 | Card rebuild · `approved-email-execution.ts:39-123`, `sales-fact-consistency.ts:6` | hash/recipient/CC mismatch, missing thread, schedule >36 h | same |
| 10 | Safety brake, test routing · `ipc.ts:1557-1624` | env switches; final despite "not consumed" wording | "[EMAIL HELD]" |
| 11 | Content · `gmail-ipc-handlers.ts:416,748` | link allowlist, discount no human typed, placeholders, banned phrases, "MCT" | "…content_guard" |
| 12 | Party/recipient · `gmail-ipc-handlers.ts:207-272,468,711` | new email with no CRM Party; reply target ≠ approved Email; reserved domain | "…recipient_guard" |
| 13 | CC equality · `gmail-ipc-handlers.ts:297-347` | executed ≠ approved CC | same |
| 14 | CC strip · `gmail-api.ts:246-259` | pixel silently drops approved tandemcoach.co CC/BCC | nothing |
| 15 | Sales prompt · `groups/sales/WORKFLOWS.md:464-475,702-748` | Thread-ID "hard gate", Entry ID, no-Party-no-draft; approval words contradict (`CLAUDE.md:126` vs `:170`) | "[BLOCKED] Entry ID resolution failed" |

Host doesn't enforce 15 (`approved-send-handoff.ts:339`). No rate limits or quiet hours; `parties.dnd_at` unread.

## 2. Firings, 07-29 → 09-27

**Ledger**
- `recipient_guard` 10: 7 no Party, 1 CC, 1 mismatch, 1 other.
- Missing thread 2, superseded 2, unparseable 1, content 1, cancelled 1.
- Uncertain 2: Gmail "Invalid thread_id".

**Logs**
- Cards rejected before approval: 60.
- Content guard at send: 4 (zoom.us, "happy to help" ×2, "thank you for reaching out").
- Unbound Mailman sends 7; unconfirmed alerts 13; watchdog rescues 18; L2, safety brake, Entry ID 0.

**Forced by hand**
- **07-30, #962:** Claude hand-patched production `dist/` and edited `messages.db`.
- **07-31, #871:** Claude's send hit the test inbox, logged as delivered; patch caused a 5.5-min outage.
- **08-04, #1003 (`&amp;` hash) and c4bdc122 (zoom.us):** Codex scripts after "SEND IT NOW". Ledger rows hand-written, one backdated.
- **08-04/05:** six Codex recovery sends.
- **08-16, 30a42d6d (team CC):** Codex recovery.
- **08-03, 08-06, 08-11, 09-18, 09-25 ×2:** hotfix, redeploy, fresh ✅. Eight commits loosened guards.

**Never delivered: 11.** 5 no Party, 2 thread errors, 1 missing thread, 1 content, 1 mismatch, and the 07-31 test-inbox send. Gmail-web replies untraceable.

## 3. Real catches vs false positives

**Earned by incidents**
- Reserved domain: 06-29, invented `example.com` recipient.
- Reply target: 06-13, replies to info@.
- Action-ID, exact bytes, supersede: 07-21 stale email, 07-22 wrong thread, 07-23 reverted edits.
- Cancel window: 04-27.
- "MCT": 07-23.

**Plausible, unverified:** 7 unbound sends (one a 09-07 possible duplicate), 2 supersedes.

**Only legitimate mail:** Party 7 (+2 bugs), CC 2, banned phrases 3, links 1, owner's own 5% discount, `&amp;` hash, parser 2.

## 4. Proposal

**Keep:** exact bytes, Action-ID, final "confirmed", supersede, reserved domain, cancel window, CC equality, and the safety brake (as a hold, not a block).

**Merge**
- **Mailman hop (gates 5-8):** host sends the stored card after 30 s; it already rewrites every field. *Risk:* largest change; `send-watchdog.ts:16-19` objection moot since `2e625f0d`.
- **Content, link, discount, schedule (2, 9, 11):** run once at post, as card warnings. *Risk:* approver misses a slip.

**Delete**
- **Party requirement (12):** keep reserved-domain and approved-Email checks. *Risk:* an approved typo goes out.
- **CC strip (14):** drop the pixel instead (`gmail-ipc-handlers.ts:289`). *Risk:* fewer open signals.
- **L2 (4):** remove until it arms actions. *Risk:* none; never fired.
- **Sales prompt gates (15):** remove; fix approval words. *Risk:* drafts lack Entry ID (host already allows).
- **`dnd_at`:** enforce or drop. *Risk:* unsubscribes ignored.

**Force send**
- **Trigger:** an allow-listed owner (`EMAIL_FORCE_SEND_USERS`) types `force send: <reason>` in the card thread. Reason ≥10 characters.
- **Target:** the thread's one `blocked`, `attention_required` or `uncertain` action. None: arm one from the card.
- **Record:** an `email_send_events` row, `force_approved/owner_force`, with actor and reason.
- **Uncertain actions:** check the Gmail thread first; if already sent, mark confirmed.
- **Send:** stored bytes via the normal Gmail call and receipts. Skips Party, content, link, discount, schedule, CC; never exact bytes, already-confirmed, reserved domain, safety brake.
- **Reply:** "📤 [FORCE SENT] by X: reason". Weekly count goes to #gru-chief.
- **Risk:** overuse. Avoids past forcing failures (06-29 duplicate, 07-23 regenerated text, 07-31 test inbox).
