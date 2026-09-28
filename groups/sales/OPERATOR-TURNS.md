# Sales — operator turns and approval

Loaded with `CLAUDE.md`. Covers every turn where Alex or Cherie writes in a
Sales work thread: revisions, answers to escalations, and approvals.

### 2. Operator reply in a pending-draft thread

Any operator message that lands in a thread where you have a draft awaiting approval is DIRECTION ON THAT DRAFT — never a status update to file away and go quiet on. Treat it as either:

- a revision instruction ("change pricing", "shorten", "wrong program"), OR
- content or a decision to fold into the reply to the lead ("Alex isn't taking new engagements", "offer the July cohort", "he's traveling — tell them").

Either way: apply it, re-post the revised draft, and wait for approval. The ONLY replies you do NOT act on are an explicit approval (see #4) or an explicit hold ("wait", "stop", "ignore", "leave it"). If a reply reads like an aside or an out-of-office note, it is STILL about this lead — put it in the draft; do not go silent. Silence on an operator reply is a failure (Travis Rose, 2026-07-06: two operator replies dropped as "status updates", lead left hanging for hours).

### 3. Operator answer to support escalation or pending draft

**Operator-answer fast path:** this rule is independent of whether the thread
currently holds a pending `[CLIENT SUPPORT REVIEW]` draft, a prior
`[SALES ESCALATION]` card with no draft, or a "No reply needed" notice. When
the current work root is `[SOURCE: email-support]` and an exact message from
Alex or Cherie in this same Slack thread supplies the fact or decision that
makes every material ask answerable (when the customer asked nothing — a
thanks/resolved turn — any non-hold Alex/Cherie message qualifies), and the
response stays within route `SERVICE`, produce one `[CLIENT SUPPORT REVIEW]`
immediately in this same turn. Call only `mcp__nanoclaw__send_message` for
that card. Do not acknowledge, search, inspect attachments, query any database
or context tool, call another minion, re-escalate, or post a recap first. Do
not read KNOWLEDGE, SCHEDULE, or LEARNED when the complete answer is already
in the thread. Preserve the root's exact Email and Thread-ID. This shortcut
drafts only; it never approves or sends. If the operator message does not
actually answer every material ask, stay on the ordinary answerability/HUMAN
path and never fill the gap yourself.

An imperative troubleshooting instruction such as "try another browser",
"use an incognito/private window", or "request a fresh link" is normally the
customer step Alex or Cherie wants drafted. Treat it as answer authority even
when they omit "tell the customer to". Only perform a diagnostic yourself when
the operator explicitly addresses Gru and asks Gru to test, open, inspect, or
verify something; the support-browser prohibition in `CLAUDE.md` still applies
unless that explicit request grants a safe, relevant diagnostic path.

For a host-scheduled `[FOLLOW-UP]` or `[COLD]` card, an explicit named-human
rejection (including "decline" or "drop") is terminal for that exact proposed
follow-up. Do not revise it, repost it, or create a replacement on a later run.
The host owns the durable decision receipt and pipeline transition; never claim
the lead is `lost` until the host confirms the bound entry was updated and read
back. Silence, an ignored card, or approval expiry is not rejection, but it also
does not authorize a duplicate card.

Your own prior draft appears in the thread as a message from you — that IS the draft to revise. The thread you are given already contains the lead's request, your draft, and the Thread-ID/Entry ID; read it before answering. Never ask the operator to re-supply the lead's name, email, or question when the thread already holds them — reconstruct from the thread and the DB, then re-post.

### 4. Approval

A ✅/👍 reaction on the card, or a whole message that is exactly "Approved",
"approve", "send", or "send it" (case-insensitive, optional punctuation) in the
draft thread, authorizes the final action. Free-form text that merely contains
one of those words is feedback, not approval.

**One approval turn = one recipient, one thread.** Process only the approved
card in the current Slack thread. Do not combine another lead, another
approval, a Gmail lookup, or unrelated queued work into this execution turn.

The host arms the exact approved card, posts `[EMAIL ACTION] Action-ID: ...`,
and **sends that card itself** after a 30-second cancel window, then posts
`✅ [EMAIL SENT] … Receipt …` in this thread (NC-20260927-001). Do not emit a
`[HANDOFF: sales→mailman]` for an approved card and never claim the email was
sent. Follow `WORKFLOWS.md → Handling Approval` for the pipeline update, then
end the turn with exactly `<internal>NO_ACTION</internal>`.

An owner can type `force send: <reason>` in the thread to send a blocked or
held card as approved; that command is handled by the host, not by you.
