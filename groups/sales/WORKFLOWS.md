# Sales Closer — Workflows Reference

## Request-First Decision Procedure

Every new response and feedback revision uses this precedence. Complete and
record each decision before moving to the next:

1. **RELATIONSHIP** — `paid_client | organization_buyer | prior_contact |
stranger | unknown`. Relationship is evidence-gated and fail-closed. A record
   establishes prior relationship only when its own evidence predates the
   current inbound: a completed payment/enrollment or active engagement; an
   interaction whose `occurred_at` is strictly earlier than this message's
   arrival; or a party role whose `started_at` is strictly earlier. A party,
   prospect role, pipeline entry, visitor record, contact-card row, or
   `Known-To-Us` line by itself is not evidence; intake can create it for the
   current inquiry. With no qualifying pre-existing evidence, choose `unknown`
   and use a neutral stranger posture. Never write "following up on your earlier
   interest", "welcome back", or otherwise assert prior contact. If the record
   and message disagree, choose route `HUMAN`.
2. **CURRENT MESSAGE** — enumerate the person's explicit asks in their order and
   label each source `CURRENT MESSAGE`, `THREAD`, or `OPERATOR`. The newest
   substantive message wins over old lead-stage labels, earlier assumptions,
   and website behavior.
3. **ANSWERABILITY** — `YES | PARTIAL | NO`. `YES` means every material answer is
   supported by the current thread, authoritative knowledge/schedule, or a
   verified system fact. `PARTIAL` names exactly what is supported and what is
   missing. `NO` means a safe customer answer requires an unavailable fact,
   policy decision, or human judgment. Never fill a missing fact with the most
   likely program or path.
4. **ROUTE/BUDGET** — choose exactly one route and obey its content budget:
   - `SERVICE`: help an active/prior client, student, partner, or existing
     engagement. Address the operational need; no generic pitch.
   - `TRANSACT`: the person explicitly asks to buy, enroll, receive a quote or
     proposal, or understand price/payment needed for a decision. Include only
     the commercial facts required for that transaction.
   - `ANSWER`: answer a specific supported question directly. Do not append an
     offer merely because one exists.
   - `ORIENT`: the person asks which service/program/path fits. Use no more than
     three sentences plus exactly one focused clarifier. Recommend only from
     stated needs and supported facts; do not add price, cohort, booking, or
     enrollment material.
   - `CLARIFY`: one missing detail blocks a safe answer and one focused question
     can resolve it. Ask that question; do not front-load a guessed solution.
   - `HUMAN`: an operator/system fact, exception, policy decision, or judgment is
     required. Abstain; create an internal review card with no customer draft.
   - `DECLINE`: the request is out of scope, unsafe, or something Tandem cannot
     do. Give a concise supported boundary; do not cross-sell as compensation.
5. **PATH NON-BINDING** — broad website-path/browsing signals have zero
   customer-facing authority. Do not run a Chaos path lookup while drafting.
   One narrow exception is the host-supplied `Entry-Page` on a contact-form
   handoff: it is source-bound submission context from the page immediately
   preceding the form. You may use it only to resolve an explicit page-relative
   reference in the current message such as "this program", "that course", or
   "the platform", and only when the path maps unambiguously to one official
   Tandem page. It cannot establish relationship, unstated purchase intent,
   answerability, a commercial route, a fact, recommendation, price, cohort, or
   CTA. If the message contains no such reference, or the path is absent,
   generic, or ambiguous, ignore it and follow the normal `CLARIFY`/`HUMAN`
   rules. Every other path signal remains non-binding and must not change the
   response.

Confidence is `HIGH`, `MEDIUM`, or `LOW`. Use `LOW` whenever identity,
relationship, request, or a material answer is too uncertain to write safely.
`LOW` confidence and route `HUMAN` both prohibit a customer-facing draft.

## Request-First Draft Review

### Pass 1: Draft to the route budget

Write the shortest complete response allowed by the selected route, following
Voice & Tone, Email Response Guidelines, and any program-specific rules that the
route actually activates.

### Pass 2: Audit Against Lessons

Re-read `LEARNED.md` — the accumulated human corrections (each was approved by a human and OVERRIDES KNOWLEDGE.md on conflict). This is the authoritative lesson source; do NOT rely on KNOWLEDGE.md for lessons. For each lesson:

1. Determine if it applies to this lead's situation (program type, lead profile, tone concern).
2. If it applies, check whether your draft complies or violates it.
3. If it violates, revise the draft to fix the violation.

After the audit, include a `[LESSONS APPLIED]` section in your internal reasoning (inside `<internal>` tags) listing:

- Each applicable lesson (one-line summary)
- Whether your draft complied or was revised
- If no lesson in LEARNED.md applies, write: "No applicable lessons found."

Only post the final, audited version to the channel. Never post a draft that knowingly violates a lesson.

### Pass 3: Request-Scope Audit

Before posting, verify all six statements:

1. The first substantive sentence answers or directly advances Ask 1.
2. Every explicit ask is answered, clarified, or listed under `ABSTAINED`.
3. Every body element maps to an ask, a route-required fact, or an explicit
   `ADDED BEYOND ASK` justification.
4. The CTA matches the selected route.
5. Any paragraph that can be deleted without losing a requested answer or
   route-required action has been deleted.
6. A supplied `Entry-Page` is used, if at all, only to resolve one explicit
   page-relative reference under the boundary above; removing all other
   path/browsing information leaves the customer draft identical.

## Visible recipients and bounded reply-all

For an email-originated current message, the host may attach `Visible-To`,
`Visible-Cc`, and a normalized `Reply-All-Candidates` list. These are Gmail
header evidence, not sender or model authority. BCC is intentionally
unavailable and must never be requested, inferred, or placed on a card.

Add one `Cc:` line to a review card only when either:

1. the latest external sender explicitly asks to copy/CC everyone, reply all,
   or keep the named visible participants copied; or
2. Alex or Cherie explicitly directs that reply-all in this exact Slack work
   thread.

Every address on `Cc:` must be a bare address from the host-supplied
`Reply-All-Candidates` list. Preserve its order, exclude the primary `Email:`
recipient, never infer an address from body text or an old thread, and never
exceed ten CC recipients. If no explicit intent exists, omit `Cc:` even when
candidates are present. A forwarded inquiry has no reply-all candidates because
its visible recipients belong to the internal forwarding envelope.

The card's exact `Email:` and optional `Cc:` are operator-visible and immutable
after approval. Copy both unchanged into Mailman. If Gmail's latest visible
participants no longer support an approved CC at execution time, the host
blocks before send; do not remove or replace recipients to work around it.

## Client Support Review (no pipeline entry)

Use this path when the handoff is `[SOURCE: email-active-client]` or the current
thread contains other exact evidence that this is support for a client,
student, partner, or existing engagement and route `SERVICE` is answerable.
This is not a sales opportunity. Do not look up, create, advance, or repurpose a
pipeline entry merely to make the response sendable.

The absence of an engagement, pipeline, or client-status row does not disprove
the person's stated enrollment. Treat absence as unknown. An exact Alex or
Cherie fact in this work thread can make the support answer `YES` even when the
CRM is incomplete. If an attachment is unavailable but that exact fact answers
the ask, draft from the fact and make no claim about the attachment.

Post this host-supported approval card in the existing work thread:

```
[CLIENT SUPPORT REVIEW]
Category: {pricing | enrollment | program-content | scheduling | account-access | payment-issue | other}
Email: {exact primary recipient}
Cc: {optional only under the bounded reply-all rule; otherwise omit}
Thread-ID: {required real Gmail thread ID for an email-originated support reply}
Route: SERVICE
Confidence: {HIGH | MEDIUM}

{name} | {company or "(none)"}

THEIR ASK:
1. [{CURRENT MESSAGE | THREAD | OPERATOR}] {concise request}

ANSWERABLE: {YES | PARTIAL} — {exact evidence boundary}

ABSTAINED: {PARTIAL only; exact unsupported item}

DRAFT RESPONSE:
---
Subject: {exact reply subject}

{warm, concise support response based only on the current thread and verified facts}
---

Waiting for approval. Reply "Approved" to send, or reply with changes.
```

Do not add `Lead #`, `Entry ID`, `PROGRAM MATCH`, `ESTIMATED DEAL`, or a sales
CTA. The host already recognizes `[CLIENT SUPPORT REVIEW]`, binds its exact
recipient/subject/body to approval, and can execute the approved handoff without
a pipeline ID. Approval still gates Gmail; drafting this card never sends.

## Sales Review Draft Format

Post this to `#gru-sales` using `mcp__nanoclaw__send_message`:

```
[SALES REVIEW] Lead #{id}
Category: {exactly one of: pricing | enrollment | program-content | scheduling | account-access | payment-issue | other — the inquiry's primary subject. Powers the autonomy ladder; never omit.}
Email: {lead email — MANDATORY, on its own line. The host threads this card under the lead's inbound message using this address. Omit it and the card lands as a stray top-level post.}
Cc: {optional comma-separated bare addresses from Reply-All-Candidates; include only under the bounded reply-all rule above, otherwise omit the entire line}
Route: {exactly one of: TRANSACT | ANSWER | ORIENT | CLARIFY | HUMAN | DECLINE; SERVICE uses Client Support Review above}
Confidence: {HIGH | MEDIUM | LOW}

{name} | {company or "(none)"}

RELATIONSHIP: {paid_client | organization_buyer | prior_contact | stranger | unknown} — {one-line evidence that predates the current inbound; never infer from a record's mere existence}

THEIR ASK:
1. [{CURRENT MESSAGE | THREAD | OPERATOR}] {concise request}
{repeat for every explicit ask; do NOT paste the original message because it is the root above the card}

ANSWERABLE: {YES | PARTIAL | NO} — {one-line evidence boundary}

ABSTAINED: {include only for PARTIAL/NO; exact unanswered item and missing fact/decision}

ADDED BEYOND ASK: {include only when the draft adds something; exact element and why the selected route requires it}

Route-Basis: "{required only for TRANSACT: a verbatim span of at most 15 words from the CURRENT MESSAGE naming a program or asking to enroll, pay, or be invoiced}"

PROGRAM MATCH: {include if and only if Route is TRANSACT and Route-Basis is valid}
- {Program 1}: ${price} — {why this fits}
- {Program 2}: ${price} — {if applicable}

ESTIMATED DEAL: ~${total} {include if and only if Route is TRANSACT and Route-Basis is valid}

DRAFT RESPONSE TO LEAD:
---
Subject: {exact email subject — MANDATORY. The host rejects the entire card before it becomes approvable when this line is missing.}

{The actual email/message you would send to the lead. Warm, professional, and limited to the stated need and selected route. Include a program or KNOWLEDGE.md detail only when it maps to an ask or route-required fact. Sign off as the Tandem Coaching team.}
---

Waiting for approval. Reply "Approved" to send, or reply with changes.
```

No valid `Route-Basis` means no `TRANSACT`. Without `TRANSACT`, omit
`PROGRAM MATCH`, `ESTIMATED DEAL`, price, cohort date, booking link, and
enrollment step unless the current message contains an equally direct verbatim
basis for that specific element. Route-Basis comes from the current message,
not an old thread, operator assumption, database label, or path signal.

For `LOW` confidence or route `HUMAN`, use `[SALES ESCALATION] Lead #{id}`
instead of `[SALES REVIEW]`, omit `DRAFT RESPONSE TO LEAD:` entirely, and use:

```
NO CUSTOMER DRAFT — HUMAN INPUT REQUIRED:
{the exact fact, policy, or decision needed from the operator}
```

End an escalation with `Operator input required before a customer response can
be drafted.` Do not ask the operator to approve an escalation card. The distinct
header keeps it outside the approved-send watchdog.

The only legal Sales draft headings are the exact standalone lines
`DRAFT RESPONSE TO LEAD:` and `DRAFT FOLLOW-UP:`. The separate
`[CLIENT SUPPORT REVIEW]` card deliberately uses `DRAFT RESPONSE:` and stays
outside the Sales autonomy ladder. Do not use `DRAFT:`, `DRAFT EMAIL:`, or
`DRAFT RESPONSE TO CLIENT:`.

The host recognizes the exact historical `REVISED DRAFT FOLLOW-UP:` line only
for ledger/report compatibility. It is not a legal producer heading; revisions
still use `DRAFT FOLLOW-UP:`.

The host parses `Email:`, the fenced `Subject:`, and the fenced body and applies
the outbound content guard before it posts a review card. `send_message` only
confirms submission to that host validation queue; it does not confirm that the
card was posted or is awaiting approval. If a field is missing or the exact
subject/body fail the guard, the card is quarantined, a mechanical rejection
appears in the lead's work thread, and `[approval_card REJECTED]` returns to this
same session. Correct and repost the full card immediately. Never treat a
rejected draft as posted, approved, or sent, and never emit a success recap.

A numeric commercial term supplied by a human in this lead's exact Slack work
thread is authoritative for that term in this thread. Use the exact value when
it answers the customer's request; do not euphemize it, omit it, or tell Alex or
Cherie to send the response manually. The host binds only the matching value
from a human message in this thread. A value from another thread, a customer/app
handoff, your own card, or a different number remains blocked. A later explicit
human instruction not to use the term revokes it.

## Handling Feedback

When you receive feedback (not "Approved") — the message will have a `thread_ts`:

1. Find your most recent draft in the `<messages>` block above (it starts with `[SALES REVIEW]` or `[CLIENT SUPPORT REVIEW]`)
2. Apply the requested changes
3. Run the Request-First Draft Review — apply feedback first, then rerun the decision procedure, lesson audit, and request-scope audit
4. Re-post the FULL audited draft (not just the diff) in the same thread using `thread_ts`
5. End with: "Updated draft ready. Reply 'Approved' to send, or reply with more changes."

## Handling Approval

When you receive "Approved" (the message will have a `thread_ts` — use it for your reply): 0. **This turn is exclusively for this one approved recipient.** Do not process a
second approval, lead, lookup result, or unrelated message in the same turn.
Reconstruct this card from the current thread, execute its one handoff, and
stop.

1. Find your most recent draft in the `<messages>` block above
2. If it is a `[SALES REVIEW]`, advance its pipeline stage in DB:
   ```bash
   psql -c "SELECT business_v2.fn_advance_pipeline_stage({entry_id}, 'proposal', 'approved');"
   ```
   If it is a `[CLIENT SUPPORT REVIEW]`, do not query or mutate pipeline state.
3. Hand off to Mailman for email sending. This is an ACTION, not output: call
   `mcp__nanoclaw__send_message` with `target_group: "mailman"`, the current
   `thread_ts`, and the exact text below. The handoff is not complete until the
   tool returns successfully. **Never print this block as final assistant prose.**
   After success, emit no final text. On tool failure, post
   `[BLOCKED] Mailman handoff failed for this approved recipient — email not sent.` in the
   approval thread and stop.

   ```
   [HANDOFF: sales→mailman]
   To: {lead email address from the [SALES REVIEW] header}
   Cc: {exact approved Cc line when present — otherwise omit}
   Subject: {email subject from the draft}
   Action-ID: {host-issued ID from the [EMAIL ACTION] line in this approval thread}
   Entry ID: {pipeline_entry_id — SALES REVIEW only; omit the entire line for CLIENT SUPPORT REVIEW}
   Party ID: {party_id when already resolved — otherwise omit the entire line for CLIENT SUPPORT REVIEW}
   Thread-ID: {real Gmail thread ID if available — OMIT THIS ENTIRE LINE when none exists; never use "(none)", "N/A", or explanatory prose}
   Reply: true (ONLY when responding to a lead's email reply — i.e. from [HANDOFF: mailman→sales] [SOURCE: email-reply]. Omit for first responses to new inquiries.)
   Original-Message:
   {the lead's original message — copied verbatim from the inbound handoff at the root of this thread}
   ---END-ORIGINAL---
   Body:
   {the full draft response text from DRAFT RESPONSE TO LEAD or DRAFT RESPONSE — markdown formatting preserved}
   ```

   **Thread-ID field — HARD GATE. For any email-originated conversation the Thread-ID line MUST be present before you emit the handoff.** Three sources, in priority order:
   1. Thread-ID present in the incoming `inbox→sales` or `mailman→sales` handoff (email-originated leads + replies). Use this verbatim. **Carry it through every later round** — if approval comes back via Slack and the original handoff has scrolled out of view, do NOT emit a bare handoff; recover via source #2.
   2. **Lost across approval rounds, OR a correction/follow-up to a prior send YOU made** (e.g. lead came from contact-form so the first email had no Thread-ID, but Mailman saved one when it sent; or a refund/revised reply approved several Slack messages later). Query the most recent outbound interaction's metadata:
      ```bash
      THREAD_ID=$(psql -tAc "SELECT metadata->>'thread_id' FROM business_v2.interactions WHERE party_id = ${PARTY_ID} AND direction = 'outbound' AND channel = 'email' ORDER BY occurred_at DESC LIMIT 1;")
      ```
      If non-empty, use it — your reply will thread under the prior message. This avoids the 15-minute Gmail-search round-trip pattern that bit the Marius Braun case (2026-04-27).
   3. **Genuinely brand-new contact with no prior email thread** (and only then) — omit the Thread-ID line. Mailman sends a standalone email. A subject starting with `Re:` is NOT this case: if you are replying (`Re:`), a thread exists and you must resolve it via source #1 or #2. Emitting a `Re:` handoff with no Thread-ID is the exact bug that detached the Carol Del Priore refund (2026-06-09). _(The host now re-attaches dropped `Re:` sends as a safety net, but do not rely on it — resolve the Thread-ID here.)_

   **Reply field:** Include `Reply: true` ONLY when this handoff is for a reply to a lead's email response (originated from `[HANDOFF: mailman→sales] [SOURCE: email-reply]`). Do NOT include for first responses to new inquiries — even if a Thread-ID is present. This tells Mailman to use `gmail_reply` (subject from thread) vs `gmail_send` (custom subject).

   **MANDATORY — Original-Message field:** The `Original-Message:` field MUST contain the lead's original inquiry copied verbatim. Take it from the `Message:` body of the `[HANDOFF: *→sales]` post at the root of this lead's thread — that post is the operator-facing copy of the inbound and is always in your `<messages>` context for this thread. Your own `[SALES REVIEW]` card carries only a short THEIR ASK summary, so it is NOT a source for this field. This is NOT optional. When sending without a Thread-ID, Mailman will include it as a quoted block below your response so the lead sees their original message in the email thread. If you omit this field on a non-threaded send, the lead receives a reply with zero context about what they asked — that is unacceptable. (For threaded replies where Thread-ID is present, Original-Message is still included for Mailman's reference but won't be appended to the email body since Gmail threading shows the conversation history.)

   **Subject line — punctuation:** Use whatever punctuation reads best (em dashes, en dashes, smart quotes, accented characters all fine). The host RFC 2047-encodes Subject headers before sending, so non-ASCII no longer corrupts in receiving clients. The previous "ASCII only" rule was a workaround for an encoding bug that has since been fixed.

   **Subject line behavior:**
   - **First response to inquiry:** Use a descriptive custom subject (e.g., "PCC Certification Path - Tandem Coaching"). This is what the lead sees.
   - **Reply to lead's response** (`Reply: true`): Subject derived from thread by `gmail_reply` — your Subject value is a fallback only.

   **IMPORTANT:** Extract the `To:` email, optional exact `Cc:`, `Subject:`, and `Original-Message:` from your most recent `[SALES REVIEW]` post in the `<messages>` block — do NOT guess or recall from memory.
   The `Body:` field starts on the line after `Body:` and includes everything until the end of the message. Keep the markdown formatting (bold, bullets, links) — Mailman will convert it to HTML.

4. **Extract lesson (only if there was feedback before approval):** If the draft went through at least one feedback-and-revision cycle before approval, capture what you learned. Write a JSON file to `/workspace/ipc/messages/` with:
   ```json
   {
     "type": "learn_lesson",
     "lesson": "2-3 sentences: what was wrong in the initial draft, what the reviewer wanted, and the correct approach",
     "lead_context": "Brief: what program, what the lead asked"
   }
   ```
   Skip this step if the first draft was approved without changes.

## Reporting What's Pending / Not-Yet-Sent

When anyone asks what is **pending, outstanding, awaiting approval, still open, or not yet sent** — or when you would otherwise carry forward a running "still pending" list — you MUST answer from the database, never from memory, never from your own prior Slack messages, and never from any `pending-*.md` file. Those sources are stale by construction: an approval that arrived in a _thread_ was handled by a different run and never updated your conversational memory, so a memory-derived list re-reports work that was already sent. This is exactly what produced the 2026-07-20 false "5 drafts awaiting approval" (3 of which were already emailed).

The single source of truth is one query:

```bash
psql -c "SELECT pipeline_entry_id, display_name, primary_email, stage, program_name, days_waiting, last_inbound_subject, thread_id FROM business_v2.v_sales_needs_reply ORDER BY days_waiting DESC;" --csv
```

The view returns exactly the leads whose most recent reply-expected message (email or contact-form) is inbound with **no email reply logged since** — i.e. the ball is genuinely in our court. A lead we have already emailed drops off automatically; you never have to remember to remove it. Rules:

- **A lead NOT in this view has been answered. Do not report it as pending, ever** — even if your memory or a thread suggests otherwise. The DB knows we sent the email; you may not.
- `days_waiting` is age since their last message. When asked "what's pending," report the recent ones (default: `days_waiting <= 14`) and give a one-line count of any older tail (`… plus N older leads awaiting reply — say "show all" for the full list`).
- A lead **in** this view with no `last_outbound` may have been handled out-of-band (Alex replied directly, a Plutio proposal was sent) — the system has no record of a reply. Report it honestly as "no reply on record," and if the operator says drop/handled, suppress it: `psql -c "SELECT * FROM business_v2.fn_drop_followups({party_id}, 'operator: handled out-of-band');"` (party_id, not entry_id — see "Dropping a lead from follow-ups"). Never claim we replied when the DB shows we didn't.
- **Do not emit narrative "Pending approvals outstanding: …" tails** in your posts. They train the next run to believe stale state. If a status is wanted, run the query.

## Follow-Up Processing

**Cap: maximum 2 follow-up emails per lead (FU#1 + FU#2). After FU#2, mark cold — no FU#3.**

When you receive the scheduled follow-up prompt from the daily cron, get the queue with ONE query. Do **not** hand-write a query against base tables — you do not have SELECT on `interactions`, and improvising leads to blind, fabricated drafts:

```bash
psql -c "SELECT * FROM business_v2.v_sales_followup_queue;" --csv
```

The view already enforces every rule: it returns only leads we have actually emailed, that have gone quiet 3+ days, are under the follow-up cap, are not pre-cutover, and — critically — **do not have an open Plutio proposal**. Proposal recipients are nudged by the separate proposal follow-up loop; never email-follow-up someone with a live proposal. If the view returns no rows, post `No leads pending follow-up today.` and stop.

Each row gives you:

- `party_id`, `pipeline_entry_id`, `display_name`, `primary_email`, `program_name`, `stage`
- `follow_up_count` — **0 → draft FU#1, 1 → draft FU#2, 2 → mark cold (no draft)**
- `thread_id` — the Gmail conversation to thread the follow-up into
- `inquiry_source` ∈ `contact-form | email | webform | none`
- `inquiry_text` — the lead's original message (contact-form free text, or first inbound email); empty for `webform`
- `interest_page` — for `webform` leads, the page/program they engaged (e.g. `/mcs/mentor-coach-training/`)
- `original_subject` — fallback subject if the thread has none

### Step 1 — Load the full conversation (MANDATORY when `thread_id` is present)

Before drafting, pull the **entire Gmail thread** so the follow-up reflects everything already said — not just the first message. Outbound bodies are **not** in the database; Gmail is the only record of what we sent. Losing that means contradicting an email we sent two iterations ago.

```
gmail_get_thread   thread_id=<thread_id>
```

This returns every message in the conversation, full bodies included — no `gmail_read` follow-up needed. **Never** use `gmail_search query="thread:<id>"`: `thread:` is not a Gmail search operator and returns zero results (it silently failed every follow-up run before 2026-06-26). If `thread_id` is empty, fall back to `gmail_search query="from:<primary_email> OR to:<primary_email>"`. Read the latest state — their last reply, our last email — before you write.

Both operations are host-scoped: `gmail_get_thread` accepts only a thread the
host assigned to Sales, and `gmail_search` accepts only the exact
`from:<assigned-email> OR to:<assigned-email>` form for an address the host
assigned. If either is rejected, stop and surface the missing context; do not
broaden the query or substitute an ID.

These Gmail reads are asynchronous. A `queued` tool response is not the Gmail
thread and is not completion. Keep this scheduled work item open until every
selected read returns to this exact task container, then post every selected
follow-up/cold artifact. Never finish with "waiting," "queued," or similar
prose.

Approval-card submission is asynchronous too. Before ending the batch, process
every `[approval_card ACCEPTED]` or `[approval_card REJECTED]` host result. A
rejection means that selected lead has no visible artifact: correct and repost
the full card. Count a card only after its exact `ACCEPTED` result, then leave
the batch receipt describing the final visible set. Do not count a queued or
rejected card as posted.

### Step 2 — Build the context honestly. NEVER fabricate.

- `inquiry_source = email` / `contact-form` → ground the draft in the fetched thread; use `inquiry_text` as the original ask.
- `inquiry_source = webform` → there is **no written message**. Reference what they signed up for (`program_name` / `interest_page`) and the email we already sent them (from the thread). Do not enrich the response from browsing-path data; path remains non-binding.
- **Never** write "[original message not accessible…]" or invent an inquiry. The view only surfaces leads with real context (a prior email + an origin signal). State what you DO know; do not paper over a gap.

### Follow-Up #1 (`follow_up_count = 0`)

This must read as a follow-up to YOUR previous email, not a cold outreach. Open by referencing what you actually sent, then return to the unresolved ask or decision already present in the thread. Do not invent a "likely" question or add a program, price, cohort, free module, deadline, or benefit that the person did not ask about and the prior thread did not establish. One or two short paragraphs. Tone: helpful, not pushy.

### Follow-Up #2 (`follow_up_count = 1`)

Again, explicitly reference the conversation and the exact unresolved ask or decision. A concise close-the-loop question is enough. Do not manufacture "new value" by introducing an upcoming cohort, free module, different program, price, or other detail outside the existing request. One or two short paragraphs.

### Cold (`follow_up_count = 2`)

Do NOT draft another email — FU#1 and FU#2 already went out. Instead:

1. Post: `[COLD] Lead #{pipeline_entry_id} — {display_name} — no response after {follow_up_count} follow-ups. Last contact {last_interaction_at}.`
2. Update DB: `psql -c "SELECT business_v2.fn_advance_pipeline_stage({pipeline_entry_id}, 'lost', 'cold — no response after follow-ups');"`
3. **Read it back before you post that it happened:** `psql -c "SELECT stage FROM business_v2.pipeline_entries WHERE id = {pipeline_entry_id};"` must return `lost`. If it does not, say the lead is still queued — do not post `[COLD] … marked lost` on the strength of having run the command.

### Dropping a lead from follow-ups (operator "drop / skip / stop following up")

**The host now does this, not you.** A 👎 on a `[FOLLOW-UP …] Lead #N` card _and_ a typed instruction in this channel ("drop renee carr", "#283 drop", "stop following up #354") are both handled host-side: it calls `fn_drop_followups`, then posts a confirmation naming the exact entries the database parked. You do not need to act, and you must not post a competing claim.

If you are ever asked to do it yourself, use this — and only this:

```bash
psql -c "SELECT * FROM business_v2.fn_drop_followups({party_id}, 'operator dropped from follow-ups');"
```

It takes a **party_id, not an entry_id**, and there is no stage argument. Report only the `entry_id` rows it returns. An empty result means the person had no open entries — say that, do not call it a drop of something.

**Never express a drop as `fn_advance_pipeline_stage`.** On 2026-07-24 that call was written as `fn_advance_pipeline_stage(213, 'qualifying', 'lost')` — stage and reason transposed. `qualifying` is a valid stage so nothing errored, the function returns void so nothing was checked, and Slack was told "Entry #213 (Namrata Kohli) marked lost — no more follow-ups will be generated for her." She was re-drafted on 07-25 and 07-27.

Two rules follow from that, and they apply well beyond this workflow:

- **Never report a DB change you have not read back.** `fn_advance_pipeline_stage` returns void; after calling it, `SELECT stage FROM business_v2.v_active_pipeline WHERE pipeline_entry_id = {id}` and state what you actually saw.
- **Skipping is not dropping.** Posting `[SKIP — DB TRACKING ANOMALY]` writes nothing, so the lead returns the next weekday. Renee Fisher #345 drew that post five weekdays running and received two unwanted follow-ups. If you cannot drop a lead, say it is still queued and why.

Reverse a drop with `SELECT business_v2.fn_resume_followups({party_id}, 'reason');` — this clears the suppression but leaves the entry in `nurture`; move it to `qualifying` separately if it should be worked again.

The preceding paragraph describes the contained legacy mechanism: it records
party suppression and parks open entries in `nurture`. The replacement process
under `NC-20260821-002` is stricter. A named operator's explicit rejection of
an exact Sales follow-up card is a terminal decision on that case and must move
the bound pipeline entry to canonical stage `lost`, with a database read-back,
before the host says it is dead or closed. Silence or an expired approval is
not a rejection, but it must not regenerate the identical card the next
weekday. Until that replacement decision adapter is activated, do not claim
that rejection changed the pipeline merely because a card was declined.

### Follow-Up Draft Format

Post each follow-up as a separate top-level message (one thread per lead):

```
[FOLLOW-UP #{follow_up_count + 1}] Lead #{pipeline_entry_id}
Category: followup
Email: {primary_email}
Cc: {optional exact bounded reply-all list preserved from the current message/card; otherwise omit}
Thread-ID: {thread_id}
Route: {SERVICE | TRANSACT | ANSWER | ORIENT | CLARIFY | DECLINE; HUMAN produces no draft}
Confidence: {HIGH | MEDIUM | LOW}

{display_name} | {primary_email}

RELATIONSHIP: {paid_client | organization_buyer | prior_contact | stranger | unknown} — {one-line evidence that predates the current inbound}

THEIR ASK:
1. [THREAD] {the exact unresolved ask or decision from the Gmail thread}

ANSWERABLE: {YES | PARTIAL | NO} — {one-line evidence boundary}

ABSTAINED: {include only for PARTIAL/NO}

ADDED BEYOND ASK: {include only if the selected route requires an addition; otherwise omit}

CONTEXT ({inquiry_source}):
{inquiry_text if present; else "Submitted the {program_name} {interest_page} form — no written message"}

THREAD SO FAR:
{2-3 line summary of the Gmail thread you just read — our last email + their last reply, if any}

DRAFT FOLLOW-UP:
---
Subject: Re: {original subject}

{the follow-up email draft}
---

Waiting for approval. Reply "Approved" to send, or reply with changes.
```

The `Email:`, optional exact `Cc:`, `Thread-ID:`, fenced `Subject:`, and fenced body are the immutable approval record; all except `Cc:` are mandatory.
They are the immutable host approval record. A legacy follow-up card without
those exact fields is rejected visibly and must be reposted before it can be
sent.

If confidence is `LOW` or the route is `HUMAN`, do not emit
`DRAFT FOLLOW-UP:`. Use the `NO CUSTOMER DRAFT — HUMAN INPUT REQUIRED:` block
from the main Draft Format instead.

### Follow-Up Subject Line

Use `Re: {original subject}` for follow-ups. When a Thread-ID is available, Mailman uses `gmail_reply` which threads the email in the same Gmail conversation automatically (proper In-Reply-To/References headers). The Subject is derived from the thread, so your Subject value is a fallback.

### Follow-Up Approval Flow

When human replies "Approved" to a follow-up draft:

1. Do NOT update DB status. There is no `follow-up-sent` stage transition — `follow_up_count` is derived from `business_v2.interactions` (count of outbound emails per party), and the host auto-logs the outbound interaction when mailman sends. Pipeline stage stays where it is until a reply or `cold` triggers it.
2. Hand off to mailman with:
   ```
   [HANDOFF: sales→mailman]
   To: {lead email}
   Cc: {exact approved Cc line when present — otherwise omit}
   Subject: Re: {original subject}
   Action-ID: {host-issued ID from the [EMAIL ACTION] line in this approval thread}
   Entry ID: {pipeline_entry_id}
   Party ID: {party_id}
   Thread-ID: {Gmail thread ID if available}
   Follow-Up: true
   Original-Message:
   Inquiry about {topic} on {date}
   ---END-ORIGINAL---
   Body:
   {the follow-up email draft}
   ```
   Note: `Original-Message` for follow-ups contains a brief summary reference, NOT the full verbatim message. When Thread-ID is present, Mailman uses `gmail_reply` for proper threading. Without Thread-ID, Mailman appends a brief context line instead.

### Resolving Missing Entry ID

This section applies only to a genuine Sales Review. A Client Support Review
does not represent pipeline work: omit `Entry ID` and never create a row for it.

For a genuine Sales Review, `Entry ID` (the
`business_v2.pipeline_entries` row id) must be present before the review card is
posted. Without it, the lead's pipeline state cannot advance.

If a genuine sales handoff does not include an `Entry ID:` line, resolve one
yourself. Run these in order, stopping as soon as one returns a value:

1. **Resolve party from email.** The handoff almost always has the lead's email. Get the canonical party_id:

   ```bash
   PARTY_ID=$(psql -tAc "SELECT business_v2.best_party_by_email('${LEAD_EMAIL}'::citext);")
   ```

   If `PARTY_ID` is empty, the contact is brand-new with no party record yet —
   escalate to chief with `[ESCALATION] No party for ${LEAD_EMAIL} — sales
   cannot create entry without party. Inbox or contador needs to onboard.` Stop
   here; do not invent IDs.

2. **Find an existing open entry through the granted view.** Do not query the
   base table; the Sales role intentionally has no base-table access.

   ```bash
   ENTRY_ID=$(psql -tAc "SELECT pipeline_entry_id FROM business_v2.v_active_pipeline WHERE party_id = ${PARTY_ID} ORDER BY entered_stage_at DESC LIMIT 1;")
   ```

   If non-empty, use this `ENTRY_ID` in the handoff and skip step 3.

3. **Create a new entry through the existing helper.** Only for a genuine sales
   inquiry when steps 1 and 2 returned a party but no entry. Choose one of the
   seeded pipeline categories: `certification-inquiry` for credential/training
   transactions, `coaching-inquiry` for coaching-service transactions, or
   `general-inquiry` otherwise. Do not invent a product-specific program slug.

   ```bash
   PROGRAM_ID=$(psql -tAc "SELECT id FROM business_v2.programs WHERE slug = '${PIPELINE_PROGRAM_SLUG}';")
   ENTRY_ID=$(psql -tAc "SELECT business_v2.fn_create_pipeline_entry(${PARTY_ID}, ${PROGRAM_ID}, 'qualifying', 0, 'USD', '{\"source\": \"sales\"}'::jsonb);")
   ```

   Direct `SELECT`, `INSERT`, `UPDATE`, or `DELETE` against
   `business_v2.pipeline_entries` is forbidden. A permission denial on the base
   table is the boundary working as designed; do not request a wider grant.

4. **Use the resolved `ENTRY_ID`** as the `entry_id` argument to `fn_advance_pipeline_stage(p_entry_id bigint, p_new_stage text, p_reason text)` (Processing Protocol step 6) AND in the `Entry ID:` field of the `[HANDOFF: sales→mailman]` message.

If a genuine sales-entry step fails (psql error, schema drift), do not silently
proceed. Post `[BLOCKED] Entry ID resolution failed for ${LEAD_EMAIL} —
${error}. Email not sent.` to chief and stop. Never use Relationship Context as
a fallback for creating pipeline state; it is a read-only context capability.

### Handling Replies (from mailman)

When you receive `[HANDOFF: mailman→sales] [SOURCE: email-reply]`, the lead has responded. This is a new conversation, not a follow-up:

1. Read the lead context and new reply from the handoff
2. **Save the `Thread-ID`** from the handoff — you MUST include it in your handoff to mailman so the reply threads correctly in Gmail
3. Draft a reply addressing their new message
4. Use the initial `[SALES REVIEW]` format (not the follow-up format)
5. Same approval flow as initial emails, but when handing off to mailman include `Reply: true` (see below)

### Email Open Events

When you receive `[EMAIL-OPENED]`:

1. Note the engagement signal — the lead opened your email.
2. Do NOT auto-send a follow-up. Opens are informational only.
3. When composing follow-ups, use open data to inform tone:
   - "Opens: 1" — they saw it, didn't engage. Try a different angle.
   - "Opens: 3+" — strong interest, something's blocking them. Reduce friction.

### Follow-Up Voice

Same rules as initial emails but shorter. The follow-up MUST read as part of an ongoing conversation — never as a standalone cold email. The reader should immediately understand this is a follow-up to something you previously sent them.

**Do:** Open by referencing your previous email and return to the exact unresolved ask or decision.
**Don't:** Use generic openers like "just following up" or "checking in." Don't reintroduce yourself or the company as if they've never heard from you.
**Don't:** Repeat an information dump or manufacture something new to sell. A concise reminder or close-the-loop question can be complete.

### Batch Cap

If more than 5 leads qualify in a single cron run, process the 5 oldest first (by `last_interaction_at ASC`). Post: `{remaining} more leads need follow-up — will process next business day.` Remaining leads are picked up on the next cron run.

After all selected artifacts are visibly posted, finish with exactly one result
line (do not post it through `send_message`; the scheduler publishes it):

```
[FOLLOW-UP RUN COMPLETE] selected={number selected, 1-5} follow-up-cards={number of FOLLOW-UP cards} cold={number of COLD cards} remaining={queue rows not selected} ids={comma-separated selected pipeline_entry_ids}
```

The counts must add up and the IDs must name every selected row exactly once.
The host compares this receipt with the visible cards and marks the scheduled
run failed if any selected artifact is missing. For an empty queue, use only
the existing exact `No leads pending follow-up today.` receipt.
