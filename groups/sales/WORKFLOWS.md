# Sales Closer — Workflows Reference

## Two-Pass Draft Review

Every draft — whether for a new lead or a feedback revision — goes through this process:

### Pass 0: Chaos Browsing-Intent Lookup (email-driven, best-effort)

A contact-form lead reaches you with only a few words — no browsing history. Before
Pass 1, try to recover what they were actually researching on the site so you can
write a targeted reply instead of asking them to clarify. This is keyed on the
lead's **email** (from the handoff `Email:` line) — do NOT wait for a `visitor_id`
to be handed to you; it almost never is. The whole step is best-effort: on any
failure it prints nothing and you draft from the message alone, exactly as before.

Run this one block. `LEAD_EMAIL` is the handoff email:

```bash
LEAD_EMAIL="<email from handoff>"
chaos_intent() {
  local email="$1" vid lib=/workspace/extra/toolbox-lib base=/workspace/extra/chaos/tools/chaos
  case "$email" in *"'"*|*'"'*|*';'*|*' '*|*'\'*|*'`'*) return 0 ;; esac  # SQL-unsafe → skip
  [[ "$email" == *@*.* ]] || return 0                                      # not an email → skip
  vid=$(TOOLBOX_LIB="$lib" bash "$base/query.sh" --raw \
        --sql "SELECT id FROM wp_chaos_visitors WHERE email = '$email' ORDER BY last_seen DESC LIMIT 1" 2>/dev/null \
        | jq -r '(.rows[0].id) // empty' 2>/dev/null)
  [[ "$vid" =~ ^[0-9]+$ ]] || return 0                                     # no visitor row → skip (NORMAL)
  TOOLBOX_LIB="$lib" bash "$base/get-visitor-journey.sh" --visitor_id "$vid" 2>/dev/null \
    | sed 's/^OK //' \
    | jq -r '(.journey.events // []) as $e
        | ( $e | map(select(.event_type=="page_view" and (.url|type=="string")) | (.url|sub("https?://[^/]+";"")))
              | group_by(.) | map("\(length)x \(.[0])") | sort | reverse | .[:12] ) as $p
        | if ($p|length)>0 then "CHAOS_INTENT pages_viewed: " + ($p|join("  |  ")) else empty end' 2>/dev/null
}
chaos_intent "$LEAD_EMAIL"
```

**If it prints a `CHAOS_INTENT` line**, that is the lead's page-by-page journey
before they contacted you (highest-hit pages first). **If it prints nothing** —
the common, normal case (anonymous visitor, tracker blocked/incognito, or email
never observed) — proceed to Pass 1 with no journey signals. Never post an error,
never mention the lookup, never block the draft on it.

**Using the signal — SILENT enrichment only:**
- **Never reveal the tracking.** Do NOT write "I saw you viewed…", "you spent time
  on our pricing page", or anything that references their browsing. That reads as
  surveillance and destroys trust. The journey is a private hint that shapes the
  SUBSTANCE of your reply — it is never quoted.
- **The written message stays primary.** If it conflicts with the journey, the
  message wins. The journey only fills the gaps a vague message leaves.
- **Program-assumption rule still applies** (Processing Protocol step 3). The
  journey lets you LEAD with a confident program recommendation instead of asking
  the lead to clarify — but frame it as a recommendation they can redirect
  ("the PCC Pathway looks like the best fit for where you are — let me know if you
  had a different program in mind"), never as settled fact, and never cite browsing
  as your reason. You are stating your assumption inline (step 3b), now better-informed.

### Pass 1: Draft
Write the email draft following Voice & Tone, Email Response Guidelines, and program-specific rules.

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

## Draft Format

Post this to `#gru-sales` using `mcp__nanoclaw__send_message`:

```
[SALES REVIEW] Lead #{id}
Category: {exactly one of: pricing | enrollment | program-content | scheduling | account-access | payment-issue | other — the inquiry's primary subject. Powers the autonomy ladder; never omit.}
Email: {lead email — MANDATORY, on its own line. The host threads this card under the lead's inbound message using this address. Omit it and the card lands as a stray top-level post.}

{name} | {company or "(none)"} | {"returning" or "new"}

THEIR ASK: {one or two lines — the question(s) in your own words, e.g. "Four questions on the AAMC→MCS pathway: eligibility, dual-level scope, training others, extra requirements." Do NOT paste the original message; it is the root of this thread, directly above your card.}

PROGRAM MATCH:
- {Program 1}: ${price} — {why this fits}
- {Program 2}: ${price} — {if applicable}

ESTIMATED DEAL: ~${total}

RECOMMENDED NEXT STEP: {what to do — e.g., "Send program info + upcoming cohort dates", "Schedule discovery call", "Clarify credential level"}

DRAFT RESPONSE TO LEAD:
---
{The actual email/message you would send to the lead. Warm, professional, specific to their stated need. Reference the matched program, include relevant details from KNOWLEDGE.md. Sign off as the Tandem Coaching team.}
---

Waiting for approval. Reply "Approved" to send, or reply with changes.
```

## Handling Feedback

When you receive feedback (not "Approved") — the message will have a `thread_ts`:
1. Find your most recent draft in the `<messages>` block above (it's the message from you that starts with `[SALES REVIEW]`)
2. Apply the requested changes
3. Run the Two-Pass Draft Review process — apply feedback first, then audit against KNOWLEDGE.md lessons
4. Re-post the FULL audited draft (not just the diff) in the same thread using `thread_ts`
5. End with: "Updated draft ready. Reply 'Approved' to send, or reply with more changes."

## Handling Approval

When you receive "Approved" (the message will have a `thread_ts` — use it for your reply):
1. Find your most recent draft in the `<messages>` block above
2. Advance pipeline stage in DB:
   ```bash
   psql -c "SELECT business_v2.fn_advance_pipeline_stage({entry_id}, 'proposal', 'approved');"
   ```
3. Hand off to Mailman for email sending. Post a message using `send_message` **in the same thread using `thread_ts`** with this exact format:
   ```
   [HANDOFF: sales→mailman]
   To: {lead email address from the [SALES REVIEW] header}
   Subject: {email subject from the draft}
   Entry ID: {pipeline_entry_id}
   Party ID: {party_id}
   Thread-ID: {Gmail thread ID if available — from the inbox→sales handoff or from a mailman→sales handoff}
   Reply: true (ONLY when responding to a lead's email reply — i.e. from [HANDOFF: mailman→sales] [SOURCE: email-reply]. Omit for first responses to new inquiries.)
   Original-Message:
   {the lead's original message — copied verbatim from the inbound handoff at the root of this thread}
   ---END-ORIGINAL---
   Body:
   {the full draft response text from your DRAFT RESPONSE TO LEAD section — markdown formatting preserved}
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

   **IMPORTANT:** Extract the `To:` email, `Subject:`, and `Original-Message:` from your most recent `[SALES REVIEW]` post in the `<messages>` block — do NOT guess or recall from memory.
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

When anyone asks what is **pending, outstanding, awaiting approval, still open, or not yet sent** — or when you would otherwise carry forward a running "still pending" list — you MUST answer from the database, never from memory, never from your own prior Slack messages, and never from any `pending-*.md` file. Those sources are stale by construction: an approval that arrived in a *thread* was handled by a different run and never updated your conversational memory, so a memory-derived list re-reports work that was already sent. This is exactly what produced the 2026-07-20 false "5 drafts awaiting approval" (3 of which were already emailed).

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

### Step 2 — Build the context honestly. NEVER fabricate.

- `inquiry_source = email` / `contact-form` → ground the draft in the fetched thread; use `inquiry_text` as the original ask.
- `inquiry_source = webform` → there is **no written message**. Reference what they signed up for (`program_name` / `interest_page`) and the email we already sent them (from the thread). You may enrich with browsing intent — run the email-driven `chaos_intent` block from Pass 0 (same silent-enrichment rules apply).
- **Never** write "[original message not accessible…]" or invent an inquiry. The view only surfaces leads with real context (a prior email + an origin signal). State what you DO know; do not paper over a gap.

### Follow-Up #1 (`follow_up_count = 0`)

This must read as a follow-up to YOUR previous email, not a cold outreach. Open by referencing what you sent them — e.g., "I sent over some details about the PCC program a few days ago" or "Following up on the ACC information I shared." Then add value: answer a likely follow-up question, mention a detail that might help them decide, or share a relevant upcoming date. 2-3 short paragraphs. Tone: helpful, not pushy.

### Follow-Up #2 (`follow_up_count = 1`)

Again, explicitly reference the conversation — "I reached out a couple of times about {topic}." Add new value: mention an upcoming cohort, a free module, a relevant detail they didn't ask about. Give them a concrete reason to re-engage. 2-3 paragraphs.

### Cold (`follow_up_count = 2`)

Do NOT draft another email — FU#1 and FU#2 already went out. Instead:
1. Post: `[COLD] Lead #{pipeline_entry_id} — {display_name} — no response after {follow_up_count} follow-ups. Last contact {last_interaction_at}.`
2. Update DB: `psql -c "SELECT business_v2.fn_advance_pipeline_stage({pipeline_entry_id}, 'lost', 'cold — no response after follow-ups');"`
3. **Read it back before you post that it happened:** `psql -c "SELECT stage FROM business_v2.pipeline_entries WHERE id = {pipeline_entry_id};"` must return `lost`. If it does not, say the lead is still queued — do not post `[COLD] … marked lost` on the strength of having run the command.

### Dropping a lead from follow-ups (operator "drop / skip / stop following up")

**The host now does this, not you.** A 👎 on a `[FOLLOW-UP …] Lead #N` card *and* a typed instruction in this channel ("drop renee carr", "#283 drop", "stop following up #354") are both handled host-side: it calls `fn_drop_followups`, then posts a confirmation naming the exact entries the database parked. You do not need to act, and you must not post a competing claim.

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

### Follow-Up Draft Format

Post each follow-up as a separate top-level message (one thread per lead):

```
[FOLLOW-UP #{follow_up_count + 1}] Lead #{pipeline_entry_id}
Category: followup

{display_name} | {primary_email}

CONTEXT ({inquiry_source}):
{inquiry_text if present; else "Submitted the {program_name} {interest_page} form — no written message"}

THREAD SO FAR:
{2-3 line summary of the Gmail thread you just read — our last email + their last reply, if any}

DRAFT FOLLOW-UP:
---
{the follow-up email draft}
---

Waiting for approval. Reply "Approved" to send, or reply with changes.
```

### Follow-Up Subject Line

Use `Re: {original subject}` for follow-ups. When a Thread-ID is available, Mailman uses `gmail_reply` which threads the email in the same Gmail conversation automatically (proper In-Reply-To/References headers). The Subject is derived from the thread, so your Subject value is a fallback.

### Follow-Up Approval Flow

When human replies "Approved" to a follow-up draft:
1. Do NOT update DB status. There is no `follow-up-sent` stage transition — `follow_up_count` is derived from `business_v2.interactions` (count of outbound emails per party), and the host auto-logs the outbound interaction when mailman sends. Pipeline stage stays where it is until a reply or `cold` triggers it.
2. Hand off to mailman with:
   ```
   [HANDOFF: sales→mailman]
   To: {lead email}
   Subject: Re: {original subject}
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

`Entry ID` (the `business_v2.pipeline_entries` row id) MUST be present in every `[HANDOFF: sales→mailman]` message. Without it, mailman cannot run `fn_advance_pipeline_stage` and the lead's pipeline state never moves — even though the email goes out. This is the cause of `Note: Handoff had Entry ID: (none) — pipeline stage could not be advanced. No DB write performed.` in mailman's confirmation.

If your incoming handoff (from inbox, chief, mailman→sales reply, or anywhere) does NOT include an `Entry ID:` line, resolve one yourself before handing off to mailman. Run these in order, stopping as soon as one returns a value:

1. **Resolve party from email.** The handoff almost always has the lead's email. Get the canonical party_id:
   ```bash
   PARTY_ID=$(psql -tAc "SELECT business_v2.best_party_by_email('${LEAD_EMAIL}'::citext);")
   ```
   If `PARTY_ID` is empty, the contact is brand-new with no party record yet — escalate to chief with `[ESCALATION] No party for ${LEAD_EMAIL} — sales cannot create entry without party. Inbox or contador needs to onboard.` Stop here; do not invent IDs.

2. **Find an existing open entry.** Some entries fall outside the host matcher's 60-day window or sit in stages the matcher excludes. Check the table directly — the PK column is `id` (not `entry_id`):
   ```bash
   ENTRY_ID=$(psql -tAc "SELECT id FROM business_v2.pipeline_entries WHERE party_id = ${PARTY_ID} AND stage NOT IN ('won','lost') ORDER BY created_at DESC LIMIT 1;")
   ```
   If non-empty, use this `ENTRY_ID` in the handoff and skip step 3.

3. **Create a new entry.** Only if steps 1 and 2 returned a party but no entry. `pipeline_entries` has a `program_id` FK (not a `program_slug` column) and a unique `(party_id, program_id)` constraint for any entry not in `won`/`lost`. First resolve the program id from your matched slug:
   ```bash
   PROGRAM_ID=$(psql -tAc "SELECT id FROM business_v2.programs WHERE slug = '${PROGRAM_SLUG}';")
   ENTRY_ID=$(psql -tAc "INSERT INTO business_v2.pipeline_entries (party_id, program_id, stage, last_updated_by) VALUES (${PARTY_ID}, ${PROGRAM_ID}, 'qualifying', 'sales') RETURNING id;")
   ```
   `PROGRAM_SLUG` is the slug from the program-matching table (e.g. `mentor-coaching-foundations`, `acc`, `pcc`). If you can't pin a specific program from the inquiry, use `coaching-inquiry` as a generic placeholder; sales/inbox can re-classify later.

4. **Use the resolved `ENTRY_ID`** as the `entry_id` argument to `fn_advance_pipeline_stage(p_entry_id bigint, p_new_stage text, p_reason text)` (Processing Protocol step 6) AND in the `Entry ID:` field of the `[HANDOFF: sales→mailman]` message.

If any step fails (psql error, schema drift), do NOT silently proceed. Post `[BLOCKED] Entry ID resolution failed for ${LEAD_EMAIL} — ${error}. Email not sent.` to chief and stop. Sending without an Entry ID leaves an orphan in the pipeline that nobody will follow up on.

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

**Do:** Open by referencing your previous email and what you shared. Then add new value.
**Don't:** Use generic openers like "just following up" or "checking in." Don't reintroduce yourself or the company as if they've never heard from you.
**Don't:** Repeat the same information from the first email. Each follow-up should offer something new.

### Batch Cap

If more than 5 leads qualify in a single cron run, process the 5 oldest first (by `last_interaction_at ASC`). Post: `{remaining} more leads need follow-up — will process next business day.` Remaining leads are picked up on the next cron run.
